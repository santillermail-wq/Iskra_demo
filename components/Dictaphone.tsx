import React, { useState, useEffect, useRef, forwardRef, useImperativeHandle, useCallback } from 'react';
import { StoredFile } from '../types';
import { GenerateContentResponse } from '@google/genai';
import { summarizeTranscript, apiCallWithRetry, getAi } from '../services/geminiService';
import StatefulButton from './StatefulButton';

// Helper to convert blob to base64
const blobToBase64 = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
            if (typeof reader.result === 'string') {
                // remove the `data:...;base64,` prefix
                resolve(reader.result.split(',')[1]);
            } else {
                reject(new Error("Failed to convert blob to base64 string."));
            }
        };
        reader.onerror = (error) => reject(error);
        reader.readAsDataURL(blob);
    });
};

export interface DictaphoneHandles {
  deleteAllRecordings: () => Promise<void>;
  startRecording: () => Promise<boolean>;
  stopRecording: () => void;
  playRecordingByFileName: (filename: string) => Promise<void>;
  getTranscriptByFileName: (filename: string) => Promise<string | null>;
  pausePlayback: () => void;
  stopPlayback: () => void;
  deleteRecordingByFileName: (filename: string) => Promise<void>;
  setPlaybackSpeed: (speed: number) => void;
  setSearchTerm: (query: string) => void;
}

interface DictaphoneProps {
    onRecordingStateChange: (isRecording: boolean) => void;
    audioFiles: StoredFile[];
    onAddFile: (file: Omit<StoredFile, 'id'>) => Promise<void>;
    onDeleteFile: (id: number) => Promise<void>;
    onClearAudioFiles: () => Promise<void>;
}

const formatTime = (timeInSeconds: number) => {
    if (!Number.isFinite(timeInSeconds) || timeInSeconds < 0) {
        return '00:00';
    }
    const totalSeconds = Math.floor(timeInSeconds);
    const minutes = Math.floor(totalSeconds / 60);
    const seconds = totalSeconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const Dictaphone: React.ForwardRefRenderFunction<DictaphoneHandles, DictaphoneProps> = ({ onRecordingStateChange, audioFiles, onAddFile, onDeleteFile, onClearAudioFiles }, ref) => {
    const [searchTerm, setSearchTerm] = useState('');
    const [filteredRecordings, setFilteredRecordings] = useState<StoredFile[]>([]);
    const [buttonStatus, setButtonStatus] = useState<'idle' | 'recording' | 'processing'>('idle');
    const [processingMessage, setProcessingMessage] = useState<string | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [playbackState, setPlaybackState] = useState<{ id: number | null; status: 'playing' | 'paused' }>({ id: null, status: 'paused' });
    const [playbackRate, setPlaybackRate] = useState(1);
    const [playbackProgress, setPlaybackProgress] = useState<{ currentTime: number; duration: number; id: number | null }>({ currentTime: 0, duration: 0, id: null });

    const mediaRecorderRef = useRef<MediaRecorder | null>(null);
    const recordingStreamRef = useRef<MediaStream | null>(null);
    const audioChunksRef = useRef<Blob[]>([]);
    const recordingStartTimeRef = useRef<number>(0);
    const audioRef = useRef<HTMLAudioElement | null>(null);
    const audioCtxRef = useRef<AudioContext | null>(null);


    const playSound = useCallback((type: 'start' | 'stop') => {
        if (!audioCtxRef.current) {
            const WebkitAudioContext = (window as any).webkitAudioContext;
            audioCtxRef.current = new (window.AudioContext || WebkitAudioContext)();
        }
        const audioCtx = audioCtxRef.current;
        if (audioCtx.state === 'suspended') audioCtx.resume();
        
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);
    
        gainNode.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.1);
        oscillator.type = 'sine';
        oscillator.frequency.value = type === 'start' ? 1200 : 800;
        
        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + 0.1);
    }, []);

    const cleanupAudio = useCallback(() => {
        if (audioRef.current) {
            const url = audioRef.current.src;
            audioRef.current.pause();
            audioRef.current.onplay = null;
            audioRef.current.onpause = null;
            audioRef.current.onended = null;
            audioRef.current.onerror = null;
            audioRef.current.onloadedmetadata = null;
            audioRef.current.ontimeupdate = null;
            audioRef.current = null;
            if (url && url.startsWith('blob:')) {
                URL.revokeObjectURL(url);
            }
        }
        setPlaybackState({ id: null, status: 'paused' });
        setPlaybackProgress({ currentTime: 0, duration: 0, id: null });
    }, []);

    useEffect(() => {
        return () => {
            cleanupAudio();
            recordingStreamRef.current?.getTracks().forEach(track => track.stop());
        };
    }, [cleanupAudio]);

    useEffect(() => {
        const lowercasedTerm = searchTerm.toLowerCase();
        if (!lowercasedTerm) {
            setFilteredRecordings(audioFiles);
            return;
        }

        const filtered = audioFiles.filter(rec =>
            rec.title?.toLowerCase().includes(lowercasedTerm) ||
            rec.description?.toLowerCase().includes(lowercasedTerm) ||
            rec.transcript?.toLowerCase().includes(lowercasedTerm)
        );
        setFilteredRecordings(filtered);
    }, [searchTerm, audioFiles]);

    useEffect(() => {
        if (audioRef.current) {
            audioRef.current.playbackRate = playbackRate;
        }
    }, [playbackRate]);

    const transcribeAudio = useCallback(async (audioBlob: Blob): Promise<string> => {
        try {
            const base64Audio = await blobToBase64(audioBlob);
            const audioPart = {
              inlineData: {
                mimeType: audioBlob.type || 'audio/webm',
                data: base64Audio,
              },
            };
            const textPart = {
              text: 'Transcribe the following audio recording into Russian text. If there is no speech, return an empty string.'
            };
    
            const response: GenerateContentResponse = await apiCallWithRetry(() => 
                getAi().models.generateContent({
                    model: 'gemini-2.5-flash',
                    contents: { parts: [audioPart, textPart] },
                })
            );

            return response.text || '';
        } catch (err: any) {
            console.error("Transcription error (after retries):", err);
            let userErrorMessage = "Транскрипция не удалась.";
            const errorMessage = (err.message || '').toLowerCase();
            if (errorMessage.includes('resource_exhausted') || errorMessage.includes('429')) {
                userErrorMessage = "Слишком много запросов. Пожалуйста, подождите минуту и попробуйте снова.";
            } else if (errorMessage.includes('api_key')) {
                 userErrorMessage = "Транскрипция не удалась из-за проблемы с API-ключом.";
            }
            setError(userErrorMessage);
            return `[${userErrorMessage}]`;
        }
    }, []);

    const startRecording = useCallback(async (): Promise<boolean> => {
        setError(null);
        if (buttonStatus !== 'idle') return false;

        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            playSound('start');
            recordingStreamRef.current = stream;
            mediaRecorderRef.current = new MediaRecorder(stream, { mimeType: 'audio/webm' });
            audioChunksRef.current = [];

            mediaRecorderRef.current.ondataavailable = (event) => {
                audioChunksRef.current.push(event.data);
            };

            mediaRecorderRef.current.onstop = async () => {
                playSound('stop');
                recordingStreamRef.current?.getTracks().forEach(track => track.stop());
                recordingStreamRef.current = null;
                const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
                const durationInSeconds = (Date.now() - recordingStartTimeRef.current) / 1000;
                
                setButtonStatus('processing');
                
                setProcessingMessage('Транскрипция...');
                const transcript = await transcribeAudio(audioBlob);

                setProcessingMessage('Генерация описания...');
                const { title, description } = await summarizeTranscript(transcript);

                const now = new Date();
                const dateString = now.toISOString().slice(0, 10);
                const timeString = now.toTimeString().slice(0, 5).replace(':', '-');
                const filename = `${title.replace(/[^a-z0-9а-яё]/gi, '_').toLowerCase()}_${dateString}_${timeString}.webm`;
                
                const newFile: Omit<StoredFile, 'id'> = {
                    date: Date.now(),
                    size: audioBlob.size,
                    content: audioBlob,
                    transcript,
                    title,
                    description,
                    name: filename,
                    type: 'audio',
                    duration: durationInSeconds,
                };
                
                setProcessingMessage('Сохранение...');
                try {
                    await onAddFile(newFile);
                } catch (err) {
                     console.error("Error saving recording:", err);
                     setError("Не удалось сохранить запись.");
                } finally {
                    setButtonStatus('idle');
                    setProcessingMessage(null);
                }
            };

            mediaRecorderRef.current.start();
            recordingStartTimeRef.current = Date.now();
            onRecordingStateChange(true);
            setButtonStatus('recording');
            return true;
        } catch (err) {
            console.error("Error starting recording:", err);
            setError("Не удалось получить доступ к микрофону. Проверьте разрешения.");
            setButtonStatus('idle');
            return false;
        }
    }, [buttonStatus, onRecordingStateChange, transcribeAudio, playSound, onAddFile]);

    const stopRecording = useCallback(() => {
        if (mediaRecorderRef.current && buttonStatus === 'recording') {
            mediaRecorderRef.current.stop();
            onRecordingStateChange(false);
            // onstop handler will do the rest
        }
    }, [buttonStatus, onRecordingStateChange]);

    const handleDelete = async (id: number) => {
        if (playbackState.id === id) {
            cleanupAudio();
        }
        try {
            await onDeleteFile(id);
        } catch (err) {
             console.error("Error deleting recording:", err);
             setError("Не удалось удалить запись.");
        }
    };
    
    const handlePlayPause = useCallback((rec: StoredFile) => {
        if (playbackState.id === rec.id) {
            if (playbackState.status === 'playing') {
                audioRef.current?.pause();
            } else {
                audioRef.current?.play();
            }
            return;
        }

        cleanupAudio();
        const url = URL.createObjectURL(rec.content);
        const audio = new Audio(url);
        audio.playbackRate = playbackRate;
        audioRef.current = audio;

        const doPlay = () => {
            audio.play().catch(e => {
                console.error("Audio play() failed:", e);
                if (e.name === 'NotAllowedError') {
                     setError("Воспроизведение заблокировано браузером. Нажмите на экран, чтобы разрешить.");
                }
                cleanupAudio();
            });
        }

        audio.onplay = () => setPlaybackState({ id: rec.id, status: 'playing' });
        audio.onpause = () => setPlaybackState({ id: rec.id, status: 'paused' });
        audio.onended = () => cleanupAudio();
        audio.onerror = (e) => {
            console.error("Audio playback error", e);
            setError("Не удалось воспроизвести аудиофайл.");
            cleanupAudio();
        };
        audio.onloadedmetadata = () => {
            const duration = isFinite(audio.duration) ? audio.duration : 0;
            setPlaybackProgress({ currentTime: audio.currentTime, duration, id: rec.id });
            doPlay();
        };
        audio.ontimeupdate = () => {
            if (audioRef.current) {
                const duration = isFinite(audioRef.current.duration) ? audioRef.current.duration : 0;
                setPlaybackProgress(prev => ({ 
                    ...prev, 
                    id: rec.id,
                    currentTime: audioRef.current.currentTime, 
                    duration: duration || prev.duration
                }));
            }
        };

        if (audio.readyState >= 1) { // Fallback for cached metadata
            const duration = isFinite(audio.duration) ? audio.duration : 0;
            setPlaybackProgress({ currentTime: audio.currentTime, duration, id: rec.id });
            doPlay();
        }
    }, [playbackState, cleanupAudio, playbackRate]);

    const handleStopPlayback = useCallback(() => {
        cleanupAudio();
    }, [cleanupAudio]);

    const handleSeek = (event: React.ChangeEvent<HTMLInputElement>, rec: StoredFile) => {
        const newTime = parseFloat(event.target.value);
        
        if (playbackState.id !== rec.id) {
            handlePlayPause(rec);
            if (audioRef.current) {
                 audioRef.current.onloadedmetadata = () => {
                     audioRef.current!.currentTime = newTime;
                     const duration = isFinite(audioRef.current!.duration) ? audioRef.current!.duration : 0;
                     setPlaybackProgress({ currentTime: newTime, duration, id: rec.id });
                 }
            }
        } else if (audioRef.current) {
            audioRef.current.currentTime = newTime;
            setPlaybackProgress(prev => ({ ...prev, currentTime: newTime }));
        }
    };


    const handleClearAll = useCallback(async () => {
        cleanupAudio();
        try {
            await onClearAudioFiles();
        } catch (err) {
            console.error("Error clearing all recordings:", err);
            setError("Не удалось удалить все записи.");
        }
    }, [onClearAudioFiles, cleanupAudio]);

    const handleDownloadTranscript = (rec: StoredFile) => {
        const blob = new Blob([rec.transcript || ''], { type: 'text/plain;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        const filename = (rec.title || `transcript-${rec.id}`).replace(/[^a-z0-9а-яё]/gi, '_').toLowerCase();
        a.download = `${filename}.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    useImperativeHandle(ref, () => ({
        deleteAllRecordings: handleClearAll,
        startRecording: startRecording,
        stopRecording: stopRecording,
        getTranscriptByFileName: async (filename: string) => {
            const targetRecording = audioFiles.find(f => f.name === filename);
            return targetRecording ? targetRecording.transcript || null : null;
        },
        playRecordingByFileName: async (filename: string) => {
            const targetRecording = audioFiles.find(f => f.name === filename);
            if (targetRecording) {
              handlePlayPause(targetRecording);
            } else {
              console.warn(`Attempted to play recording with name ${filename}, but it was not found.`);
            }
        },
        pausePlayback: () => {
            if (playbackState.status === 'playing') {
                audioRef.current?.pause();
            }
        },
        stopPlayback: handleStopPlayback,
        deleteRecordingByFileName: async (filename: string) => {
            const targetRecording = audioFiles.find(f => f.name === filename);
            if (targetRecording) {
                await handleDelete(targetRecording.id);
            } else {
                console.warn(`Attempted to delete recording with name ${filename}, but it was not found.`);
            }
        },
        setPlaybackSpeed: (speed: number) => {
            const clampedSpeed = Math.max(0.5, Math.min(2, speed));
            setPlaybackRate(clampedSpeed);
        },
        setSearchTerm: (query: string) => {
            setSearchTerm(query);
        },
    }));

    const handleButtonClick = () => {
        if (buttonStatus === 'recording') {
            stopRecording();
        } else if (buttonStatus === 'idle') {
            startRecording();
        }
    };

    const getAriaLabel = () => {
        switch(buttonStatus) {
            case 'idle': return 'Начать запись';
            case 'recording': return 'Остановить запись';
            case 'processing': return `Обработка: ${processingMessage || ''}`;
        }
    }


    return (
        <div className="h-full p-4 sm:p-6 flex flex-col text-white">
            {error && <p className="text-red-400 text-center mb-2">{error}</p>}

            <div className="flex-shrink-0 mb-4">
                <input
                    type="search"
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    placeholder="Поиск по названию, описанию или транскрипции..."
                    className="w-full h-10 px-4 bg-black/30 border border-white/20 rounded-full text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-shadow duration-300"
                />
            </div>
            
            <div className="overflow-y-auto flex-1 pr-2 space-y-4">
                {audioFiles.length === 0 && buttonStatus !== 'processing' && (
                    <div className="h-full flex items-center justify-center">
                        <p className="text-gray-400 text-center">Нет записей.</p>
                    </div>
                )}
                {buttonStatus === 'processing' && (
                    <div className="h-full flex items-center justify-center">
                        <p className="text-gray-400 text-center animate-pulse">{processingMessage}</p>
                    </div>
                )}
                {filteredRecordings.length === 0 && audioFiles.length > 0 && searchTerm && (
                     <div className="h-full flex items-center justify-center">
                        <p className="text-gray-400 text-center">Записи не найдены.</p>
                    </div>
                )}

                {filteredRecordings.map((rec) => {
                    const isCurrentTrack = playbackState.id === rec.id;
                    const currentTime = isCurrentTrack ? playbackProgress.currentTime : 0;
                    const totalDuration = (isCurrentTrack && playbackProgress.duration > 0)
                        ? playbackProgress.duration
                        : rec.duration || 0;
                    
                    return (
                        <div key={rec.id} className="bg-white/5 p-4 rounded-lg flex flex-col gap-3">
                            <div className="flex items-start justify-between gap-4">
                                <div className="flex-1">
                                    <h3 className="font-semibold text-gray-100">{rec.title || 'Запись без названия'}</h3>
                                    <p className="text-xs text-gray-400 mt-1">{new Date(rec.date).toLocaleString('ru-RU')}</p>
                                </div>
                                <div className="flex items-center gap-2 flex-shrink-0">
                                    <button onClick={() => handleDownloadTranscript(rec)} title="Создать и скачать текстовый файл транскрипции" className="text-gray-400 hover:text-white transition-colors p-1.5 rounded-full hover:bg-white/10">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                                            <path d="M 5 3 L 15 3 L 19 7 L 19 21 L 5 21 Z" fill="#E5E7EB" stroke="#9CA3AF" />
                                            <path d="M 15 3 L 15 7 L 19 7" fill="none" stroke="#9CA3AF" />
                                            <text x="12" y="17" fontFamily="sans-serif" fontSize="12" fontWeight="bold" textAnchor="middle" fill="#1F2937" stroke="none">T</text>
                                        </svg>
                                    </button>
                                     <button onClick={() => handleDelete(rec.id)} title="Удалить запись" className="text-gray-400 hover:text-red-400 transition-colors p-1.5 rounded-full hover:bg-white/10">
                                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                                    </button>
                                </div>
                            </div>
                            <div className="text-sm text-gray-300">
                                <p>{rec.description}</p>
                            </div>
                            <div className="flex items-center gap-3 mt-1">
                                <button
                                    onClick={handleStopPlayback}
                                    disabled={!isCurrentTrack}
                                    title="Stop"
                                    className="p-2 rounded-full hover:bg-white/10 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                                        <path d="M6 6h12v12H6z"/>
                                    </svg>
                                </button>
                                <button onClick={() => handlePlayPause(rec)} className="p-2 rounded-full hover:bg-white/10 transition-colors">
                                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                                        {isCurrentTrack && playbackState.status === 'playing' ? (
                                            <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z"/>
                                        ) : (
                                            <path d="M8 5v14l11-7z"/>
                                        )}
                                    </svg>
                                </button>
                                <div className="flex-1 flex items-center gap-2 group">
                                    <span className="text-xs font-mono w-10 text-center">{formatTime(currentTime)}</span>
                                     <input
                                        type="range"
                                        min="0"
                                        max={totalDuration || 1}
                                        step="0.1"
                                        value={currentTime}
                                        onChange={(e) => handleSeek(e, rec)}
                                        className="w-full h-1.5 bg-white/20 rounded-full appearance-none cursor-pointer group-hover:h-2 transition-all duration-200"
                                        style={{ accentColor: '#0891b2' }}
                                    />
                                    <span className="text-xs font-mono w-10 text-center">{formatTime(totalDuration)}</span>
                                </div>
                            </div>
                        </div>
                    )
                })}
            </div>
            
            <div className="flex-shrink-0 pt-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                     <label htmlFor="playback-speed" className="text-sm text-gray-400">Скорость:</label>
                     <div className="flex items-center gap-2 w-32">
                         <input
                            id="playback-speed"
                            type="range"
                            min="0.5"
                            max="2"
                            step="0.1"
                            value={playbackRate}
                            onChange={(e) => setPlaybackRate(Number(e.target.value))}
                            className="w-full h-1.5 bg-white/20 rounded-lg appearance-none cursor-pointer"
                            style={{
                                accentColor: '#0891b2', // cyan-600
                            }}
                        />
                        <span className="text-xs font-mono w-8 text-center">{playbackRate.toFixed(1)}x</span>
                     </div>
                </div>
                 <StatefulButton 
                    status={buttonStatus}
                    onClick={handleButtonClick}
                    ariaLabel={getAriaLabel()}
                />
                <button 
                    onClick={handleClearAll}
                    disabled={audioFiles.length === 0}
                    className="text-gray-400 hover:text-red-400 text-sm disabled:opacity-50 disabled:hover:text-gray-400 transition-colors"
                >
                    Удалить все
                </button>
            </div>
        </div>
    );
};

export default forwardRef(Dictaphone);