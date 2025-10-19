import React, { useState, useRef, useCallback, useEffect } from 'react';
import { LiveServerMessage, Modality, GenerateContentResponse } from '@google/genai';
import { getAi, apiCallWithRetry } from '../services/geminiService';
import { createPcmBlob, synthesizeSpeech, playAudioBlob, createWavBlob } from '../services/audioService';

const LANGUAGES = [
  { code: 'ru', name: 'Русский' },
  { code: 'en', name: 'Английский' },
  { code: 'es', name: 'Испанский' },
  { code: 'fr', name: 'Французский' },
  { code: 'de', name: 'Немецкий' },
  { code: 'zh-CN', name: 'Китайский (упр.)' },
  { code: 'ja', name: 'Японский' },
];

const langCodeToName: { [key: string]: string } = {
    'ru': 'Russian',
    'en': 'English',
    'es': 'Spanish',
    'fr': 'French',
    'de': 'German',
    'zh-CN': 'Chinese',
    'ja': 'Japanese'
};

interface ConversationTurn {
    id: number;
    original: string;
    translated: string;
    direction: 'AtoB' | 'BtoA';
}

const Translator: React.FC = () => {
    const [langA, setLangA] = useState('ru'); // My language
    const [langB, setLangB] = useState('en'); // Interlocutor's language
    const [conversationLog, setConversationLog] = useState<ConversationTurn[]>([]);
    const [status, setStatus] = useState<'idle' | 'listening' | 'processing' | 'speaking'>('idle');
    const [error, setError] = useState<string | null>(null);
    const [currentTranscription, setCurrentTranscription] = useState('');

    const sessionPromiseRef = useRef<Promise<any> | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const inputAudioContextRef = useRef<AudioContext | null>(null);
    const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
    const currentTranscriptionRef = useRef('');
    const conversationEndRef = useRef<HTMLDivElement | null>(null);

    useEffect(() => {
        conversationEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }, [conversationLog]);

    const detectLanguage = async (text: string): Promise<string> => {
        if (!text.trim()) return '';
        try {
            const response: GenerateContentResponse = await apiCallWithRetry(() => getAi().models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Detect the language of the following text. Respond with only the ISO 639-1 language code (e.g., "ru", "en", "es"). Text: "${text}"`
            }));
            return response.text?.trim() || '';
        } catch (e) {
            console.error("Language detection failed:", e);
            setError("Ошибка определения языка.");
            return '';
        }
    };

    const translateText = async (text: string, sourceLangName: string, targetLangName: string) => {
        try {
            const response: GenerateContentResponse = await apiCallWithRetry(() => getAi().models.generateContent({
                model: 'gemini-2.5-flash',
                contents: `Translate the following text from ${sourceLangName} to ${targetLangName}. Provide only one single, natural, conversational translation. Do not provide alternatives or explanations. Text to translate: "${text}"`
            }));
            return response.text || '[Перевод не удался]';
        } catch (e) {
            console.error("Translation API call failed:", e);
            setError("Ошибка при переводе текста.");
            return '[Ошибка перевода]';
        }
    };

    const disconnect = useCallback(async () => {
        mediaStreamRef.current?.getTracks().forEach(track => track.stop());
        mediaStreamRef.current = null;

        if (sessionPromiseRef.current) {
            try {
                const session = await sessionPromiseRef.current;
                session.close();
            } catch (e) {
                console.error("Error closing translator session:", e);
            }
        }
        sessionPromiseRef.current = null;

        scriptProcessorRef.current?.disconnect();
        if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
            await inputAudioContextRef.current.close().catch(console.error);
        }
        inputAudioContextRef.current = null;
        
        setStatus('idle');
        setCurrentTranscription('');
    }, []);

    const connect = useCallback(async () => {
        if (langA === langB) {
            setError("Пожалуйста, выберите два разных языка.");
            return;
        }
        setError(null);
        setStatus('listening');
        setConversationLog([]);
        setCurrentTranscription('');

        try {
            const WebkitAudioContext = (window as any).webkitAudioContext;
            inputAudioContextRef.current = new (window.AudioContext || WebkitAudioContext)({ sampleRate: 16000 });
            await inputAudioContextRef.current.resume();

            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaStreamRef.current = stream;

            const ai = getAi();
            sessionPromiseRef.current = ai.live.connect({
                model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                config: {
                    responseModalities: [Modality.AUDIO],
                    inputAudioTranscription: {},
                    systemInstruction: "You are a real-time transcription service. Transcribe the user's audio accurately and quickly in the language they are speaking. Do not add any conversational elements or punctuation unless spoken.",
                },
                callbacks: {
                    onopen: () => {
                        const source = inputAudioContextRef.current!.createMediaStreamSource(stream);
                        scriptProcessorRef.current = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                        scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                            if (!sessionPromiseRef.current) return;
                            const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                            const pcmBlob = createPcmBlob(inputData);
                            sessionPromiseRef.current?.then(session => session.sendRealtimeInput({ media: pcmBlob }));
                        };
                        const muteNode = inputAudioContextRef.current!.createGain();
                        muteNode.gain.value = 0;
                        source.connect(scriptProcessorRef.current);
                        scriptProcessorRef.current.connect(muteNode);
                        muteNode.connect(inputAudioContextRef.current!.destination);
                    },
                    onmessage: async (message: LiveServerMessage) => {
                        if (message.serverContent?.inputTranscription?.text) {
                            currentTranscriptionRef.current += message.serverContent.inputTranscription.text;
                            setCurrentTranscription(currentTranscriptionRef.current);
                        }

                        if (message.serverContent?.turnComplete) {
                            const finalTranscription = currentTranscriptionRef.current.trim();
                            currentTranscriptionRef.current = '';
                            setCurrentTranscription('');

                            if (finalTranscription) {
                                setStatus('processing');
                                
                                const detectedCode = await detectLanguage(finalTranscription);
                                
                                let sourceCode = '';
                                let targetCode = '';
                                let direction: 'AtoB' | 'BtoA' | null = null;

                                if (detectedCode.startsWith(langA)) {
                                    sourceCode = langA;
                                    targetCode = langB;
                                    direction = 'AtoB';
                                } else if (detectedCode.startsWith(langB)) {
                                    sourceCode = langB;
                                    targetCode = langA;
                                    direction = 'BtoA';
                                } else {
                                    console.warn(`Detected language "${detectedCode}" is not part of the conversation (${langA}, ${langB}).`);
                                    setStatus('listening'); // Go back to listening
                                    return;
                                }

                                const sourceName = langCodeToName[sourceCode];
                                const targetName = langCodeToName[targetCode];

                                const translation = await translateText(finalTranscription, sourceName, targetName);
                                
                                setConversationLog(prev => [...prev, {
                                    id: Date.now(),
                                    original: finalTranscription,
                                    translated: translation,
                                    direction: direction!,
                                }]);

                                setStatus('speaking');
                                const audioBytes = await synthesizeSpeech(translation);
                                const { speakingPromise } = await playAudioBlob(createWavBlob(audioBytes));
                                await speakingPromise;
                                setStatus('listening');
                            }
                        }
                    },
                    onerror: (e: ErrorEvent) => {
                        console.error("Translator session error:", e);
                        setError("Произошла ошибка соединения. Попробуйте снова.");
                        disconnect();
                    },
                    onclose: () => {
                        console.log('Translator session closed.');
                        if (status !== 'idle') {
                            disconnect();
                        }
                    },
                }
            });

            await sessionPromiseRef.current;
        } catch (err) {
            console.error("Failed to start translator:", err);
            setError("Не удалось получить доступ к микрофону.");
            setStatus('idle');
        }
    }, [disconnect, langA, langB, status]);

    const handleMicClick = () => {
        if (status === 'idle') {
            connect();
        } else {
            disconnect();
        }
    };
    
    const getStatusText = () => {
        switch (status) {
            case 'idle': return 'Нажмите, чтобы начать перевод';
            case 'listening': return 'Слушаю...';
            case 'processing': return 'Перевожу...';
            case 'speaking': return 'Воспроизвожу перевод...';
            default: return '';
        }
    }

    return (
        <div className="h-full p-4 sm:p-6 flex flex-col text-white gap-4">
            <div className="flex-shrink-0 grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex flex-col gap-2">
                    <label htmlFor="lang-a" className="text-sm font-medium text-gray-400">Я говорю на</label>
                     <select 
                        id="lang-a" 
                        value={langA}
                        onChange={(e) => setLangA(e.target.value)}
                        className="w-full h-10 px-3 bg-black/30 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                        {LANGUAGES.map(lang => (
                            <option key={lang.code} value={lang.code}>{lang.name}</option>
                        ))}
                    </select>
                </div>
                <div className="flex flex-col gap-2">
                    <label htmlFor="lang-b" className="text-sm font-medium text-gray-400">Собеседник говорит на</label>
                     <select 
                        id="lang-b" 
                        value={langB}
                        onChange={(e) => setLangB(e.target.value)}
                        className="w-full h-10 px-3 bg-black/30 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-cyan-500"
                    >
                        {LANGUAGES.map(lang => (
                            <option key={lang.code} value={lang.code}>{lang.name}</option>
                        ))}
                    </select>
                </div>
            </div>

            <div className="flex-1 bg-black/20 border border-white/10 rounded-lg p-3 overflow-y-auto space-y-4">
                {conversationLog.length === 0 && status === 'idle' &&
                    <div className="h-full flex items-center justify-center text-gray-400">
                        <p>История диалога будет здесь</p>
                    </div>
                }
                {conversationLog.map(turn => (
                    <div key={turn.id} className={`flex flex-col ${turn.direction === 'AtoB' ? 'items-start' : 'items-end'}`}>
                        <div className={`max-w-xl p-3 rounded-lg ${turn.direction === 'AtoB' ? 'bg-gray-700/80' : 'bg-cyan-700/80'}`}>
                           <p className="text-gray-300 text-sm">{turn.original}</p>
                           <p className="text-white font-medium mt-1">{turn.translated}</p>
                        </div>
                    </div>
                ))}
                {currentTranscription && (
                     <div className="flex flex-col items-start">
                        <div className="max-w-xl p-3 rounded-lg bg-gray-700/50">
                           <p className="text-gray-400 text-sm animate-pulse">{currentTranscription}</p>
                        </div>
                    </div>
                )}
                 <div ref={conversationEndRef} />
            </div>
            
            <div className="flex-shrink-0 flex flex-col items-center justify-center gap-2">
                <button
                    onClick={handleMicClick}
                    className={`w-16 h-16 rounded-full flex items-center justify-center transition-colors duration-200 focus:outline-none ring-offset-4 ring-offset-gray-800 focus:ring-2
                        ${status !== 'idle' ? 'bg-red-600 hover:bg-red-500 ring-red-500' : 'bg-cyan-600 hover:bg-cyan-500 ring-cyan-500'}`
                    }
                    aria-label={status === 'idle' ? 'Начать перевод' : 'Остановить перевод'}
                >
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-8 w-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                        {status !== 'idle'
                            ? <path d="M6 6h12v12H6z"/>
                            : <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/>
                        }
                     </svg>
                </button>
                <p className="text-gray-400 text-sm h-5 text-center">{error || getStatusText()}</p>
            </div>
        </div>
    );
};

export default Translator;