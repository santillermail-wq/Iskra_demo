import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TranscriptItem, Source, FinanceData, Transaction, PlannerItem, NoteItem, ContactItem, CalendarEventItem, UserInstruction, VoiceSettings, StoredFile, Alarm, TimerState, StopwatchState } from '../types';
// FIX: `apiCallWithRetry` is a separate export, not a property of `sendTextMessage`. It has been added to the import list.
import { sendTextMessage, getAi, apiCallWithRetry } from '../services/geminiService';
import { formatCurrency } from '../services/financeService';
import { initDB, getAllInstructions, addInstruction, deleteInstructionById, getLatestChatLogForToday, saveChatLog, addFile, getAllFiles, getFileById, deleteFile, updateFile } from '../services/db';
import { Modality, LiveServerMessage } from '@google/genai';
import Dictaphone, { DictaphoneHandles } from './Dictaphone';
import Finance from './Finance';
import Organizer from './Organizer';
import FileStorage from './FileStorage';
import Toolbox from './Toolbox';
import AssistantConfig from './AssistantConfig';
import { 
    setPanelStateFunctionDeclaration, 
    clearChatHistoryFunctionDeclaration, 
    clearAllRecordingsFunctionDeclaration,
    startDictaphoneRecordingFunctionDeclaration,
    stopDictaphoneRecordingFunctionDeclaration,
    playDictaphoneRecordingFunctionDeclaration,
    pauseDictaphonePlaybackFunctionDeclaration,
    stopDictaphonePlaybackFunctionDeclaration,
    setPlaybackSpeedFunctionDeclaration,
    searchDictaphoneRecordingsFunctionDeclaration,
    navigateToLinkFunctionDeclaration,
    getInformationFromUrlFunctionDeclaration,
    stopConversationFunctionDeclaration,
    endSessionFunctionDeclaration,
    addTransactionFunctionDeclaration,
    searchTransactionsFunctionDeclaration,
    generateStatementFunctionDeclaration,
    calculateDailySpendingAllowanceFunctionDeclaration,
    editTransactionFunctionDeclaration,
    deleteTransactionFunctionDeclaration,
    replaceTransactionFunctionDeclaration,
    readDictaphoneTranscriptFunctionDeclaration,
    getDictaphoneTranscriptContentFunctionDeclaration,
    addPlannerEntryFunctionDeclaration,
    getPlannerContentFunctionDeclaration,
    clearPlannerContentFunctionDeclaration,
    generateDailySummaryFunctionDeclaration,
    getTodaysAccomplishmentsFunctionDeclaration,
    addNoteFunctionDeclaration,
    getNotesFunctionDeclaration,
    updateNoteFunctionDeclaration,
    deleteNoteFunctionDeclaration,
    clearNotesFunctionDeclaration,
    addContactFunctionDeclaration,
    getContactsFunctionDeclaration,
    updateContactFunctionDeclaration,
    deleteContactFunctionDeclaration,
    clearContactsFunctionDeclaration,
    addCalendarEventFunctionDeclaration,
    getCalendarEventsFunctionDeclaration,
    updateCalendarEventFunctionDeclaration,
    deleteCalendarEventFunctionDeclaration,
    clearCalendarEventsFunctionDeclaration,
    saveUserInstructionFunctionDeclaration,
    getUserInstructionsFunctionDeclaration,
    deleteUserInstructionFunctionDeclaration,
    getCurrentTimeAndDateFunctionDeclaration,
    setVoiceSettingsFunctionDeclaration,
    createAndDownloadFileFunctionDeclaration,
    saveFileToStorageFunctionDeclaration,
    getFilesFromStorageFunctionDeclaration,
    readFileFromStorageFunctionDeclaration,
    updateFileInStorageFunctionDeclaration,
    deleteFileFromStorageFunctionDeclaration,
    setAlarmFunctionDeclaration,
    deleteAlarmFunctionDeclaration,
    stopAlarmFunctionDeclaration,
    startTimerFunctionDeclaration,
    stopTimerFunctionDeclaration,
    startStopwatchFunctionDeclaration,
    stopStopwatchFunctionDeclaration,
} from '../types';
import { useLocalStorage } from '../hooks/useLocalStorage';

declare var mammoth: any;
declare var docx: any;
declare var pdfjsLib: any;
declare var jspdf: any;


// --- Helper Functions for Audio Processing ---
function decode(base64: string) {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

function encode(bytes: Uint8Array) {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

async function decodeAudioData(
  data: Uint8Array,
  ctx: AudioContext,
  sampleRate: number,
  numChannels: number,
): Promise<AudioBuffer> {
  const dataInt16 = new Int16Array(data.buffer);
  const frameCount = dataInt16.length / numChannels;
  const buffer = ctx.createBuffer(numChannels, frameCount, sampleRate);

  for (let channel = 0; channel < numChannels; channel++) {
    const channelData = buffer.getChannelData(channel);
    for (let i = 0; i < frameCount; i++) {
      channelData[i] = dataInt16[i * numChannels + channel] / 32768.0;
    }
  }
  return buffer;
}

/**
 * Safely converts a Float32Array from the Web Audio API into a base64-encoded
 * 16-bit PCM audio blob, which is the format required by the Gemini Live API.
 * @param data The raw Float32Array audio data.
 * @returns An object containing the base64-encoded data and the correct MIME type.
 */
function createPcmBlob(data: Float32Array): { data: string; mimeType: string; } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    // Clamp the value to the [-1, 1] range to prevent clipping issues, then scale to the 16-bit integer range.
    int16[i] = Math.max(-1, Math.min(1, data[i])) * 32767;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}


// Helper to find the last index of an element in an array that satisfies a condition.
function findLastIndex<T>(array: T[], predicate: (value: T, index: number, obj: T[]) => unknown): number {
    let l = array.length;
    while (l--) {
        if (predicate(array[l], l, array)) return l;
    }
    return -1;
}

const mapErrorToUserMessage = (rawError: string): string => {
    if (!rawError) return 'Произошла неизвестная ошибка.';
    const lowerError = rawError.toLowerCase();
    if (lowerError.includes('service is currently unavailable')) {
        return 'Сервис временно недоступен. Пожалуйста, подождите, я пытаюсь восстановить соединение.';
    }
    if (lowerError.includes('does not have permission')) {
        return 'Ошибка разрешений. Убедитесь, что ваш API-ключ имеет доступ к Gemini API.';
    }
    if (lowerError.includes('api_key') || lowerError.includes('authentication credential')) {
        return 'Ошибка аутентификации. Пожалуйста, убедитесь, что ваш API-ключ правильно настроен.';
    }
    if (lowerError.includes('network error') || lowerError.includes('failed to fetch')) {
        return 'Ошибка сети. Проверьте ваше интернет-соединение.';
    }
    if (lowerError.includes('closed unexpectedly')) {
        return 'Соединение было неожиданно прервано.';
    }
    if (lowerError.includes('resource_exhausted') || lowerError.includes('429')) {
        return 'Сервер перегружен. Повторная попытка через некоторое время.';
    }
    // Default message for less common errors
    return `Произошла ошибка: ${rawError}.`;
};

// --- One-time Data Migration for Planner ---
const migratePlannerData = () => {
    const key = 'plannerContent';
    const rawData = localStorage.getItem(key);
    if (rawData) {
        try {
            const parsed = JSON.parse(rawData);
            // If it parses but it's a string, it's the old format stored incorrectly.
            if (typeof parsed === 'string') {
                 throw new Error("Old format detected");
            }
        } catch (e) {
            // This catches both JSON parsing errors (for the old raw string format)
            // and the explicitly thrown error for the string-in-JSON format.
            const today = new Date().toISOString().slice(0, 10);
            const migratedItems: PlannerItem[] = rawData
                .split('\n')
                .map(line => line.trim())
                .filter(line => line.startsWith('- '))
                .map((line, index) => ({
                    id: Date.now() + index,
                    text: line.substring(2),
                    date: today,
                    completed: false,
                }));
            localStorage.setItem(key, JSON.stringify(migratedItems));
        }
    }
};

migratePlannerData();


interface DashboardProps {
  onSessionEnd: () => void;
  isChatCollapsed: boolean;
  onCollapseChat: () => void;
  onExpandChat: () => void;
}

type View = 'chat' | 'dictaphone' | 'finance' | 'organizer' | 'storage' | 'toolbox' | 'assistant-config';

const TABS: { view: View; title: string; icon: React.ReactNode }[] = [
    {
        view: 'assistant-config',
        title: 'Конфигурация',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2C9.25 2 7 4.25 7 7C7 9.31 8.56 11.26 10.74 11.83C10.5 12.55 10.05 13.2 9.5 13.75C8.82 14.43 8.35 15.22 8.16 16.07C7.26 16.05 6.4 15.71 5.66 15.11C4.58 14.22 4 12.92 4 11.5C4 9.16 5.69 7.23 7.82 7.06C8.32 5.29 9.97 4 12 4S15.68 5.29 16.18 7.06C18.31 7.23 20 9.16 20 11.5C20 12.92 19.42 14.22 18.34 15.11C17.6 15.71 16.74 16.05 15.84 16.07C15.65 15.22 15.18 14.43 14.5 13.75C13.95 13.2 13.5 12.55 13.26 11.83C15.44 11.26 17 9.31 17 7C17 4.25 14.75 2 12 2M12 17C12.55 17 13 17.45 13 18C13 18.27 13.11 18.52 13.29 18.71L13.5 19L14.29 18.71C14.48 18.52 14.73 18.4 15 18.4C15.55 18.4 16 18.85 16 19.4V22H8V19.4C8 18.85 8.45 18.4 9 18.4C9.27 18.4 9.52 18.52 9.71 18.71L10.5 19L10.71 18.71C10.89 18.52 11 18.27 11 18C11 17.45 11.45 17 12 17Z" /></svg>
    },
    {
        view: 'toolbox',
        title: 'Инструменты',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M20.71,7.04C21.1,6.65,21.1,6,20.71,5.63L18.37,3.29C18.17,3.09,17.92,3,17.66,3C17.41,3,17.15,3.1,16.96,3.29L15.13,5.12L18.88,8.87L20.71,7.04M3,17.25V21H6.75L17.81,9.94L14.06,6.19L3,17.25M12,2L16.5,6.5L12,11L7.5,6.5L12,2M6.5,7.5L11,12L6.5,16.5L2,12L6.5,7.5Z"/></svg>
    },
    {
        view: 'storage',
        title: 'Хранилище',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M2,20H22V18H2V20M20,4H4A2,2 0 0,0 2,6V16H4V6H20V16H22V6A2,2 0 0,0 20,4Z" /></svg>
    },
    {
        view: 'organizer',
        title: 'Органайзер',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M19,3H5A2,2 0 0,0 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5A2,2 0 0,0 19,3M19,5V19H5V5H19M11,7H17V9H11V7M11,11H17V13H11V11M11,15H17V17H11V15M7,7H9V9H7V7M7,11H9V13H7V11M7,15H9V17H7V15Z" /></svg>
    },
    {
        view: 'finance',
        title: 'Финансы',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M11.8,10.9c-2.27-.59-3-1.2-3-2.15,0-1.09,1.01-1.85,2.7-1.85,1.78,0,2.44.85,2.5,2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5,1.68-3.5,3.61,0,2.31,1.91,3.46,4.7,4.13,2.5.6,3,1.48,3,2.41,0,1.07-.9,1.8-2.7,1.8-1.7,0-2.8-.8-2.8-2.03H5.2c.08,2.11,1.69,3.5,3.8,4.02V21h3v-2.15c2.05-.46,3.5-1.78,3.5-3.85,0-2.34-1.9-3.5-4.7-4.1Z"/></svg>
    },
    {
        view: 'dictaphone',
        title: 'Диктофон',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path d="M12,2A10,10,0,1,0,22,12,10,10,0,0,0,12,2Zm0,18a8,8,0,1,1,8-8A8,8,0,0,1,12,20Z" /><path d="M12,7a5,5,0,1,0,5,5A5,5,0,0,0,12,7Z" /></svg>
    },
    {
        view: 'chat',
        title: 'Чат',
        icon: <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6 text-white" viewBox="0 0 24 24" fill="currentColor"><path fillRule="evenodd" d="M19.35 10.04C18.67 6.59 15.64 4 12 4C9.11 4 6.6 5.64 5.35 8.04C2.34 8.36 0 10.91 0 14c0 3.31 2.69 6 6 6h2l2 3 2-3h7c2.76 0 5-2.24 5-5C24 12.36 21.95 10.22 19.35 10.04z M7 11h10v2H7v-2zm0 3h6v2H7v-2z" clipRule="evenodd"/></svg>
    }
];

const getTodayDateKey = () => new Date().toISOString().slice(0, 10);

const truncateFileName = (name: string, maxLength: number = 30) => {
    if (name.length <= maxLength) {
        return name;
    }
    const extensionIndex = name.lastIndexOf('.');
    const extension = extensionIndex > 0 ? name.substring(extensionIndex) : '';
    const nameWithoutExt = extension ? name.substring(0, extensionIndex) : name;
    
    const charsToShow = maxLength - extension.length - 3; // 3 for "..."
    if (charsToShow <= 0) {
        return name.slice(0, maxLength - 3) + '...';
    }
    const frontChars = Math.ceil(charsToShow / 2);
    const backChars = Math.floor(charsToShow / 2);
    
    return `${nameWithoutExt.substring(0, frontChars)}...${nameWithoutExt.substring(nameWithoutExt.length - backChars)}${extension}`;
};

// --- Dashboard Component ---

const Dashboard: React.FC<DashboardProps> = ({ onSessionEnd, isChatCollapsed, onCollapseChat, onExpandChat }) => {
  // --- State Management ---
  const [transcriptHistory, setTranscriptHistory] = useState<TranscriptItem[]>([]);
  const [financeData, setFinanceData] = useLocalStorage<FinanceData>('financeData', {
    transactions: [],
    totalBalance: 0,
    creditCardBalance: 0,
    cashBalance: 0,
  });
  const [plannerContent, setPlannerContent] = useLocalStorage<PlannerItem[]>('plannerContent', []);
  const [notes, setNotes] = useLocalStorage<NoteItem[]>('notes', []);
  const [contacts, setContacts] = useLocalStorage<ContactItem[]>('contacts', []);
  const [calendarEvents, setCalendarEvents] = useLocalStorage<CalendarEventItem[]>('calendarEvents', []);
  const [userInstructions, setUserInstructions] = useState<UserInstruction[]>([]);
  const [storedFiles, setStoredFiles] = useState<StoredFile[]>([]);
  const [voiceSettings, setVoiceSettings] = useLocalStorage<VoiceSettings>('voiceSettings', {
    pitch: 0.0,
    speakingRate: 1.0,
    volumeGainDb: 0.0,
  });
  const [alarms, setAlarms] = useLocalStorage<Alarm[]>('alarms', []);
  
  const [financeSearchTerm, setFinanceSearchTerm] = useState('');
  const [dailySpendingAllowance, setDailySpendingAllowance] = useState<number | null>(null);
  
  const [status, setStatus] = useState('Нажмите на микрофон или введите сообщение');
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [userSpeaking, setUserSpeaking] = useState(false);
  const [inputText, setInputText] = useState('');
  const [activeView, setActiveView] = useState<View>('chat');
  const [isDictaphoneRecording, setIsDictaphoneRecording] = useState(false);
  const [attachedFile, setAttachedFile] = useState<File | null>(null);
  const [attachedFileContent, setAttachedFileContent] = useState<string>('');
  const [isClosing, setIsClosing] = useState(false);
  const [organizerInitialState, setOrganizerInitialState] = useState<string | null>(null);
  const [isDbReady, setIsDbReady] = useState(false);
  const [highlightedFileId, setHighlightedFileId] = useState<number | null>(null);
  const [activeAlarm, setActiveAlarm] = useState<Alarm | null>(null);

  const internalTimersRef = useRef<Map<string, TimerState>>(new Map());
  const internalStopwatchesRef = useRef<Map<string, StopwatchState>>(new Map());
  
  // --- Refs for Audio and API ---
  const sessionPromiseRef = useRef<Promise<any> | null>(null);
  const inputAudioContextRef = useRef<AudioContext | null>(null);
  const outputAudioContextRef = useRef<AudioContext | null>(null);
  const scriptProcessorRef = useRef<ScriptProcessorNode | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);
  const chatEndRef = useRef<HTMLDivElement | null>(null);
  const activeAudioSourcesRef = useRef(new Set<AudioBufferSourceNode>());
  const dictaphoneRef = useRef<DictaphoneHandles | null>(null);
  const isIntentionalDisconnectRef = useRef(false);
  const alarmAudioSourceRef = useRef<AudioBufferSourceNode | null>(null);
  const triggeredAlarmsThisMinuteRef = useRef<Set<number>>(new Set());
  const wakeLockSentinelRef = useRef<any | null>(null);
  
  const currentUserTranscriptionRef = useRef('');
  const currentAssistantTranscriptionRef = useRef('');
  const executeFunctionCallRef = useRef<((fc: { name: string, args: any }) => Promise<string>) | null>(null);
  const isDictaphoneRecordingRef = useRef(isDictaphoneRecording);

  // --- Refs for New Features ---
  const retryAttemptRef = useRef(0);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const chatContainerRef = useRef<HTMLDivElement | null>(null);
  const userScrolledUpRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const currentChatLogIdRef = useRef<number | null>(null);
  const connectRef = useRef<() => Promise<void>>(async () => {});
  
  const loadInstructions = useCallback(async () => {
    if (isDbReady) {
        try {
            const instructions = await getAllInstructions();
            setUserInstructions(instructions);
        } catch (e) {
            console.error("Failed to load user instructions", e);
        }
    }
  }, [isDbReady]);

  const loadFiles = useCallback(async () => {
    if (isDbReady) {
        try {
            const files = await getAllFiles();
            setStoredFiles(files);
        } catch (e) {
            console.error("Failed to load stored files", e);
        }
    }
  }, [isDbReady]);

  // Initialize DB and load all data on mount
  useEffect(() => {
    initDB().then(async (ready) => {
        if (ready) {
            setIsDbReady(true);
            // Load instructions
            const instructions = await getAllInstructions();
            setUserInstructions(instructions);
            // Load files
            await loadFiles();
            // Load today's latest chat session
            const todayKey = getTodayDateKey();
            const latestLog = await getLatestChatLogForToday(todayKey);
            if (latestLog) {
                setTranscriptHistory(latestLog.history);
                currentChatLogIdRef.current = latestLog.id;
            }
        }
    });
  }, [loadFiles]);

  // Persist chat history to DB whenever it changes
  useEffect(() => {
    // This effect now handles both creating new sessions and updating existing ones.
    const saveCurrentChat = async () => {
        if (isDbReady && transcriptHistory.length > 0) {
            const todayKey = getTodayDateKey();
            try {
                const savedId = await saveChatLog({
                    id: currentChatLogIdRef.current,
                    date: todayKey,
                    history: transcriptHistory,
                });
                currentChatLogIdRef.current = savedId;
            } catch (error) {
                console.error("Failed to save chat log:", error);
            }
        }
    };
    saveCurrentChat();
  }, [transcriptHistory, isDbReady]);

  useEffect(() => {
    isDictaphoneRecordingRef.current = isDictaphoneRecording;
    if (isDictaphoneRecording) {
      setStatus('Запись диктофона... Нажмите стоп в диктофоне для завершения.');
    } else {
       if (!isConnected && !isConnecting) {
          setStatus('Нажмите на микрофон или введите сообщение');
       }
    }
  }, [isDictaphoneRecording, isConnected, isConnecting]);


  // Effect for handling online/offline status
  useEffect(() => {
    const handleOnline = () => {
        setStatus('Сеть восстановлена. Нажмите на микрофон для подключения.');
    };
    const handleOffline = () => {
        setStatus('Вы оффлайн. Функциональность ограничена.');
        setTranscriptHistory(prev => {
            const lastMessageIsOfflineError = prev.length > 0 && prev[prev.length - 1].text.includes('оффлайн');
            if (lastMessageIsOfflineError) return prev; // Avoid duplicate messages
            return [...prev, {
                id: Date.now().toString(),
                author: 'assistant',
                text: 'Соединение потеряно, вы оффлайн. Некоторые функции могут быть недоступны.',
                type: 'error',
                timestamp: Date.now()
            }];
        });
    };

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial check
    if (!navigator.onLine) {
        handleOffline();
    }

    return () => {
        window.removeEventListener('online', handleOnline);
        window.removeEventListener('offline', handleOffline);
    };
  }, []);


  // --- Core Logic ---
  const playPageTurnSound = useCallback(async (reverse = false) => {
    if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
        const WebkitAudioContext = (window as any).webkitAudioContext;
        outputAudioContextRef.current = new (window.AudioContext || WebkitAudioContext)({ sampleRate: 44100 });
    }
    const audioCtx = outputAudioContextRef.current;
    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }

    const duration = 0.4; // Softer: slightly longer duration
    const bufferSize = audioCtx.sampleRate * duration;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const output = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        output[i] = Math.random() * 2 - 1; // White noise
    }

    const source = audioCtx.createBufferSource();
    source.buffer = buffer;

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';

    const gainNode = audioCtx.createGain();
    const peakGain = 0.08; // Quieter: reduced peak volume

    if (reverse) {
        // SWAPPED & SOFTER "Closing" sound: quick attack, fades out, frequency sweeps down
        filter.frequency.setValueAtTime(2500, audioCtx.currentTime); // Start lower
        filter.frequency.exponentialRampToValueAtTime(300, audioCtx.currentTime + duration * 0.7); // End lower

        gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
        gainNode.gain.linearRampToValueAtTime(peakGain, audioCtx.currentTime + 0.02); // Quick attack
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration); // Fade out
    } else {
        // SWAPPED & SOFTER "Opening" sound: fades in, frequency sweeps up
        filter.frequency.setValueAtTime(300, audioCtx.currentTime); // Start lower
        filter.frequency.exponentialRampToValueAtTime(2500, audioCtx.currentTime + duration * 0.8); // End lower

        gainNode.gain.setValueAtTime(0.001, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(peakGain, audioCtx.currentTime + duration - 0.05); // Fade in
        gainNode.gain.linearRampToValueAtTime(0, audioCtx.currentTime + duration); // Cut off sharply
    }

    source.connect(filter);
    filter.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    source.start(audioCtx.currentTime);
    source.stop(audioCtx.currentTime + duration);
  }, []);

  const handleCollapse = useCallback(() => {
    if (isChatCollapsed || isClosing) return;
    playPageTurnSound(true); // Play reverse sound on collapse
    setIsClosing(true);
    onCollapseChat(); // This will trigger the panel animation simultaneously
  }, [onCollapseChat, isChatCollapsed, isClosing, playPageTurnSound]);

  useEffect(() => {
      if (!isChatCollapsed) {
          setIsClosing(false);
      }
  }, [isChatCollapsed]);

  const playDisconnectSound = useCallback(async () => {
    if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
      return;
    }
    const audioCtx = outputAudioContextRef.current;
    if (audioCtx.state === 'suspended') {
      await audioCtx.resume();
    }
    return new Promise<void>(resolve => {
      const osc = audioCtx.createOscillator();
      const gainNode = audioCtx.createGain();
      osc.connect(gainNode);
      gainNode.connect(audioCtx.destination);

      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, audioCtx.currentTime); // A4 note

      gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.15);

      osc.onended = () => resolve();
      osc.start(audioCtx.currentTime);
      osc.stop(audioCtx.currentTime + 0.15);
    });
  }, []);

  const disconnect = useCallback(async (isSilent = false) => {
    if (!isSilent) {
        await playDisconnectSound();
    }
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);

    if (wakeLockSentinelRef.current) {
        try {
            await wakeLockSentinelRef.current.release();
            wakeLockSentinelRef.current = null;
            console.log('Screen Wake Lock released.');
        } catch (err: any) {
            console.error(`Failed to release Wake Lock: ${err.name}, ${err.message}`);
        }
    }

    if (sessionPromiseRef.current) {
        try {
            const session = await sessionPromiseRef.current;
            session.close();
        } catch (e) {
            console.error("Error getting session to close", e);
        }
    }
    sessionPromiseRef.current = null;

    mediaStreamRef.current?.getTracks().forEach(track => track.stop());
    mediaStreamRef.current = null;
    scriptProcessorRef.current?.disconnect();
    analyserRef.current?.disconnect();

    const closePromises: Promise<void>[] = [];
    if (inputAudioContextRef.current && inputAudioContextRef.current.state !== 'closed') {
        closePromises.push(inputAudioContextRef.current.close().catch(console.error));
    }
    if (outputAudioContextRef.current && outputAudioContextRef.current.state !== 'closed') {
        closePromises.push(outputAudioContextRef.current.close().catch(console.error));
    }
    
    if (closePromises.length > 0) {
        await Promise.all(closePromises);
    }

    if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
        animationFrameRef.current = null;
    }

    setIsConnected(false);
    setUserSpeaking(false);
    if (!isSilent && !isDictaphoneRecordingRef.current) {
      setStatus('Нажмите на микрофон или введите сообщение');
    }
  }, [playDisconnectSound]);

    const scheduleRetry = useCallback((errorReason: string) => {
        if (isIntentionalDisconnectRef.current) return;
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);

        if (!navigator.onLine) {
            setStatus('Не удалось подключиться: вы оффлайн.');
            retryAttemptRef.current = 0;
            return;
        }

        const userFriendlyError = mapErrorToUserMessage(errorReason);

        setTranscriptHistory(prev => {
            const lastMessageIsError = prev.length > 0 && prev[prev.length - 1].type === 'error';
            const newError = {
                id: Date.now().toString(),
                author: 'assistant' as const,
                text: `${userFriendlyError} Пытаюсь переподключиться...`,
                type: 'error' as const,
                timestamp: Date.now()
            };
            return lastMessageIsError ? [...prev.slice(0, -1), newError] : [...prev, newError];
        });

        retryAttemptRef.current++;

        if (retryAttemptRef.current > 5) {
            setStatus('Не удалось подключиться. Пожалуйста, попробуйте вручную.');
            setTranscriptHistory(prev => [...prev, {
                id: Date.now().toString(),
                author: 'assistant' as const,
                text: 'Не удалось восстановить соединение. Нажмите на микрофон, чтобы попробовать снова.',
                type: 'error' as const,
                timestamp: Date.now()
            }]);
            retryAttemptRef.current = 0; // Reset for next manual attempt
            return;
        }

        const delay = Math.pow(2, retryAttemptRef.current) * 1000; // Exponential backoff: 2s, 4s, 8s, 16s, 32s
        setStatus(`Переподключение через ${delay / 1000} сек...`);
        retryTimeoutRef.current = setTimeout(() => connectRef.current(), delay);
    }, []);

  const connect = useCallback(async () => {
    // Already connecting or connected, do nothing.
    if (isConnecting || isConnected) return;

    if (!navigator.onLine) {
        setStatus('Вы оффлайн. Для подключения к ассистенту нужен интернет.');
        setTranscriptHistory(prev => [...prev, { id: Date.now().toString(), author: 'assistant', text: 'Невозможно подключиться в оффлайн-режиме.', type: 'error', timestamp: Date.now() }]);
        setIsConnecting(false);
        return;
    }

    setStatus('Подключение...');
    setIsConnecting(true);
    isIntentionalDisconnectRef.current = false;
    
    try {
        // CRITICAL: Check for microphone permissions BEFORE trying to connect.
        // This prevents infinite loops if permissions are denied.
        if (navigator.permissions) {
             try {
                const permission = await navigator.permissions.query({ name: 'microphone' as PermissionName });
                if (permission.state === 'denied') {
                    setStatus('Доступ к микрофону запрещен.');
                    setTranscriptHistory(prev => [...prev, { id: Date.now().toString(), author: 'assistant', text: 'Не могу подключиться, так как доступ к микрофону запрещен. Пожалуйста, измените настройки разрешений для этого сайта в вашем браузере.', type: 'error', timestamp: Date.now() }]);
                    setIsConnecting(false);
                    return;
                }
            } catch (e) {
                console.warn("Permission Query API not supported, proceeding with connection attempt.", e);
            }
        }
       

        // ALWAYS fetch the latest instructions and chat history from the DB before connecting.
        // This prevents issues with stale closures during retries.
        const currentInstructions = await getAllInstructions();
        const todayKey = getTodayDateKey();
        const latestLog = await getLatestChatLogForToday(todayKey);
        
        const currentChatLog = latestLog ? latestLog.history : [];
        currentChatLogIdRef.current = latestLog ? latestLog.id : null;
        
        // Also ensure the UI state is synchronized with the latest from the DB.
        setTranscriptHistory(currentChatLog);

        let instructionBlock = '';
        if (currentInstructions.length > 0) {
            const instructionsText = currentInstructions.map(instr => `- ${instr.text}`).join('\n');
            instructionBlock = `--- CRITICAL USER-DEFINED RULES (MUST FOLLOW) ---\n${instructionsText}\n--- END OF USER RULES ---\n\n`;
        }
        
        const formattedHistory = currentChatLog.length > 0 ?
          currentChatLog
            .filter(item => item.type !== 'error') // Exclude error messages
            .map(item => {
              let historyLine = `${item.author === 'user' ? 'User' : 'Assistant'}: ${item.text}`;
              if (item.author === 'assistant' && item.sources && item.sources.length > 0) {
                const sourceText = item.sources.map((source, index) => `[${index + 1}] ${source.title} (${source.uri})`).join('\n');
                historyLine += `\nSources:\n${sourceText}`;
              }
              return historyLine;
            }).join('\n\n')
          : 'No previous conversation history.';

        let systemInstruction = `${instructionBlock}You are Iskra, a friendly and helpful AI assistant.
ATTENTION: You may be reconnecting to an ongoing conversation after a network interruption. It is CRITICAL that you re-read the entire chat history provided below to regain context. Failure to do so will lead to irrelevant responses. Upon reconnecting, your first response MUST be a direct and relevant continuation of the last user message in the history.

CRITICAL RULE: Your most important task is to maintain conversation continuity. You MUST first silently review the ENTIRE conversation history provided below. This is not optional. Your response must be directly informed by the preceding context.
- Your responses should be concise and to the point.
- Do not introduce yourself unless specifically asked.
- Do not announce the actions you are taking (e.g., "Searching the web..."). Just perform the action and provide the result.
- Avoid using the user's name frequently.
You can control the application UI using the provided functions. You can search the web for up-to-date information; if you do, you MUST cite your sources. You can also retrieve and analyze the content of saved audio recordings using the provided functions to answer questions about them. After providing an answer based on a search, proactively offer to open the source link for the user.

CRITICAL INSTRUCTION: Transcribe all user audio into Russian text ONLY.

Here is the complete conversation history for your mandatory review:
--- CONVERSATION START ---
${formattedHistory}
--- CONVERSATION END ---
`;

        const ai = getAi();
        let nextStartTime = 0;

        const WebkitAudioContext = (window as any).webkitAudioContext;
        inputAudioContextRef.current = new (window.AudioContext || WebkitAudioContext)({ sampleRate: 16000 });
        if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
          outputAudioContextRef.current = new (window.AudioContext || WebkitAudioContext)({ sampleRate: 24000 });
        }

        const outputNode = outputAudioContextRef.current.createGain();
        outputNode.connect(outputAudioContextRef.current.destination);

        sessionPromiseRef.current = ai.live.connect({
            model: 'gemini-2.5-flash-native-audio-preview-09-2025',
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: { 
                        prebuiltVoiceConfig: { voiceName: 'Zephyr' },
                        ...voiceSettings
                    },
                },
                inputAudioTranscription: {},
                outputAudioTranscription: {},
                systemInstruction: systemInstruction,
                tools: [
                  { googleSearch: {} },
                  { functionDeclarations: [
                        setPanelStateFunctionDeclaration,
                        addTransactionFunctionDeclaration,
                        searchTransactionsFunctionDeclaration,
                        editTransactionFunctionDeclaration,
                        deleteTransactionFunctionDeclaration,
                        replaceTransactionFunctionDeclaration,
                        generateStatementFunctionDeclaration,
                        calculateDailySpendingAllowanceFunctionDeclaration,
                        clearChatHistoryFunctionDeclaration, 
                        clearAllRecordingsFunctionDeclaration,
                        startDictaphoneRecordingFunctionDeclaration,
                        stopDictaphoneRecordingFunctionDeclaration,
                        playDictaphoneRecordingFunctionDeclaration,
                        readDictaphoneTranscriptFunctionDeclaration,
                        getDictaphoneTranscriptContentFunctionDeclaration,
                        pauseDictaphonePlaybackFunctionDeclaration,
                        stopDictaphonePlaybackFunctionDeclaration,
                        setPlaybackSpeedFunctionDeclaration,
                        searchDictaphoneRecordingsFunctionDeclaration,
                        navigateToLinkFunctionDeclaration,
                        getInformationFromUrlFunctionDeclaration,
                        stopConversationFunctionDeclaration,
                        endSessionFunctionDeclaration,
                        addPlannerEntryFunctionDeclaration,
                        getPlannerContentFunctionDeclaration,
                        clearPlannerContentFunctionDeclaration,
                        generateDailySummaryFunctionDeclaration,
                        getTodaysAccomplishmentsFunctionDeclaration,
                        addNoteFunctionDeclaration,
                        getNotesFunctionDeclaration,
                        updateNoteFunctionDeclaration,
                        deleteNoteFunctionDeclaration,
                        clearNotesFunctionDeclaration,
                        addContactFunctionDeclaration,
                        getContactsFunctionDeclaration,
                        updateContactFunctionDeclaration,
                        deleteContactFunctionDeclaration,
                        clearContactsFunctionDeclaration,
                        addCalendarEventFunctionDeclaration,
                        getCalendarEventsFunctionDeclaration,
                        updateCalendarEventFunctionDeclaration,
                        deleteCalendarEventFunctionDeclaration,
                        clearCalendarEventsFunctionDeclaration,
                        saveUserInstructionFunctionDeclaration,
                        getUserInstructionsFunctionDeclaration,
                        deleteUserInstructionFunctionDeclaration,
                        getCurrentTimeAndDateFunctionDeclaration,
                        setVoiceSettingsFunctionDeclaration,
                        createAndDownloadFileFunctionDeclaration,
                        saveFileToStorageFunctionDeclaration,
                        getFilesFromStorageFunctionDeclaration,
                        readFileFromStorageFunctionDeclaration,
                        updateFileInStorageFunctionDeclaration,
                        deleteFileFromStorageFunctionDeclaration,
                        setAlarmFunctionDeclaration,
                        deleteAlarmFunctionDeclaration,
                        stopAlarmFunctionDeclaration,
                        startTimerFunctionDeclaration,
                        stopTimerFunctionDeclaration,
                        startStopwatchFunctionDeclaration,
                        stopStopwatchFunctionDeclaration,
                  ] }
                ],
            },
            callbacks: {
                onopen: async () => {
                    playConnectionSound();
                    setIsConnecting(false);
                    setStatus('Микрофон включен. Говорите.');
                    setIsConnected(true);

                    // Reset retry logic on successful connection
                    retryAttemptRef.current = 0;
                    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);


                    if ('wakeLock' in navigator) {
                        try {
                            wakeLockSentinelRef.current = await navigator.wakeLock.request('screen');
                            wakeLockSentinelRef.current.onrelease = () => {
                                console.log('Wake Lock was released by the system.');
                                wakeLockSentinelRef.current = null;
                                if (isConnected) {
                                    setTranscriptHistory(prev => [...prev, {
                                        id: Date.now().toString(),
                                        author: 'assistant',
                                        text: 'Фоновый режим был прерван. Для стабильной работы держите приложение на экране.',
                                        type: 'error',
                                        timestamp: Date.now()
                                    }]);
                                }
                            };
                            console.log('Screen Wake Lock is active.');
                        } catch (err: any) {
                            console.error(`Wake Lock request failed: ${err.name}, ${err.message}`);
                        }
                    }


                    mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ 
                        audio: { 
                            echoCancellation: true, 
                            noiseSuppression: true, 
                            autoGainControl: true 
                        } 
                    });
                    const source = inputAudioContextRef.current!.createMediaStreamSource(mediaStreamRef.current);
                    scriptProcessorRef.current = inputAudioContextRef.current!.createScriptProcessor(4096, 1, 1);
                    
                    const compressor = inputAudioContextRef.current!.createDynamicsCompressor();
                    compressor.threshold.setValueAtTime(-50, inputAudioContextRef.current!.currentTime);
                    compressor.knee.setValueAtTime(10, inputAudioContextRef.current!.currentTime);
                    compressor.ratio.setValueAtTime(12, inputAudioContextRef.current!.currentTime);
                    compressor.attack.setValueAtTime(0.001, inputAudioContextRef.current!.currentTime);
                    compressor.release.setValueAtTime(0.25, inputAudioContextRef.current!.currentTime);

                    analyserRef.current = inputAudioContextRef.current!.createAnalyser();
                    analyserRef.current.fftSize = 512;
                    const dataArray = new Uint8Array(analyserRef.current.frequencyBinCount);

                    const draw = () => {
                        animationFrameRef.current = requestAnimationFrame(draw);
                        if (analyserRef.current) {
                            analyserRef.current.getByteTimeDomainData(dataArray);
                            const sum = dataArray.reduce((acc, val) => acc + Math.abs(val - 128), 0);
                            const avg = sum / dataArray.length;
                            setUserSpeaking(avg > 1.5);
                        }
                    };
                    draw();

                    scriptProcessorRef.current.onaudioprocess = (audioProcessingEvent) => {
                        if (!sessionPromiseRef.current) return;
                        const inputData = audioProcessingEvent.inputBuffer.getChannelData(0);
                        const pcmBlob = createPcmBlob(inputData);
                        sessionPromiseRef.current?.then(session => session.sendRealtimeInput({ media: pcmBlob }));
                    };

                    const muteNode = inputAudioContextRef.current!.createGain();
                    muteNode.gain.value = 0;

                    source.connect(compressor);
                    compressor.connect(analyserRef.current);
                    analyserRef.current.connect(scriptProcessorRef.current);
                    scriptProcessorRef.current.connect(muteNode);
                    muteNode.connect(inputAudioContextRef.current!.destination);
                },
                onmessage: async (message: LiveServerMessage) => {
                    if (message.toolCall) {
                        for (const fc of message.toolCall.functionCalls) {
                            if (executeFunctionCallRef.current) {
                                const result = await executeFunctionCallRef.current(fc);
                                sessionPromiseRef.current?.then(session => {
                                    session.sendToolResponse({
                                        functionResponses: {
                                            id: fc.id,
                                            name: fc.name,
                                            response: { result },
                                        }
                                    });
                                });
                            }
                        }
                    }

                    if (message.serverContent?.interrupted) {
                        activeAudioSourcesRef.current.forEach(source => {
                            try { source.stop(); } catch (e) { console.warn("Could not stop audio source", e); }
                        });
                        activeAudioSourcesRef.current.clear();
                        setIsSpeaking(false);
                        nextStartTime = 0;
                    }

                    if (message.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
                        if (isDictaphoneRecordingRef.current) {
                           console.log("Assistant speech suppressed while dictaphone is recording.");
                           return;
                        }
                        
                        setIsSpeaking(true);
                        const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
                        const audioBytes = decode(base64Audio);
                        const audioBuffer = await decodeAudioData(audioBytes, outputAudioContextRef.current!, 24000, 1);
                        
                        const source = outputAudioContextRef.current!.createBufferSource();
                        source.buffer = audioBuffer;
                        source.connect(outputNode);
                        
                        activeAudioSourcesRef.current.add(source);
                        source.onended = () => {
                            activeAudioSourcesRef.current.delete(source);
                            if (activeAudioSourcesRef.current.size === 0) {
                                setIsSpeaking(false);
                            }
                        };
                        
                        const now = outputAudioContextRef.current!.currentTime;
                        nextStartTime = Math.max(now, nextStartTime);
                        source.start(nextStartTime);
                        nextStartTime += audioBuffer.duration;
                    }
                    
                    const updateTranscript = (text: string, author: 'user' | 'assistant', newTurn: boolean = false) => {
                        setTranscriptHistory(prev => {
                            const last = prev[prev.length - 1];
                            if (last?.author === author && !newTurn && last.type === 'message') {
                                return [...prev.slice(0, -1), { ...last, text: text }];
                            } else {
                                const newId = Date.now().toString() + Math.random();
                                return [...prev, { id: newId, author, text, type: 'message', timestamp: Date.now() }];
                            }
                        });
                    };

                    if (message.serverContent?.outputTranscription?.text) {
                        const newText = message.serverContent.outputTranscription.text;
                        currentAssistantTranscriptionRef.current += newText;
                        setTranscriptHistory(prev => {
                            const last = prev[prev.length - 1];
                            // If the last message was from the assistant and not an error, update it.
                            if (last?.author === 'assistant' && last.type === 'message') {
                                return [...prev.slice(0, -1), { ...last, text: currentAssistantTranscriptionRef.current }];
                            }
                            // Otherwise, add a new message.
                            return [...prev, { id: Date.now().toString() + Math.random(), author: 'assistant', text: currentAssistantTranscriptionRef.current, type: 'message', timestamp: Date.now() }];
                        });
                    }
                    
                    if(message.serverContent?.inputTranscription?.text){
                        const newTurn = currentUserTranscriptionRef.current === '';
                        currentUserTranscriptionRef.current += message.serverContent.inputTranscription.text;
                        updateTranscript(currentUserTranscriptionRef.current, 'user', newTurn);
                    }

                    if (message.serverContent?.turnComplete) {
                       currentUserTranscriptionRef.current = '';
                       currentAssistantTranscriptionRef.current = '';

                       const groundingChunks = message.serverContent?.groundingMetadata?.groundingChunks;
                       let sources: Source[] = [];
                       if (groundingChunks && groundingChunks.length > 0) {
                           sources = groundingChunks
                               .map((chunk: any) => chunk.web)
                               .filter((web: any) => web && web.uri)
                               .reduce((acc: any[], current: any) => {
                                   if (!acc.find(item => item.uri === current.uri)) {
                                       acc.push({ uri: current.uri, title: current.title || current.uri });
                                   }
                                   return acc;
                               }, []);
                       }

                       if (sources.length > 0) {
                           setTranscriptHistory(prev => {
                               const lastAssistantMessageIndex = findLastIndex(prev, (item: TranscriptItem) => item.author === 'assistant');

                               if (lastAssistantMessageIndex !== -1) {
                                   const updatedHistory = [...prev];
                                   const messageToUpdate = updatedHistory[lastAssistantMessageIndex];
                                   
                                   const existingSources = messageToUpdate.sources || [];
                                   const newSources = sources.filter(
                                       (source) => !existingSources.some((s) => s.uri === source.uri)
                                   );

                                   if (newSources.length > 0) {
                                       updatedHistory[lastAssistantMessageIndex] = {
                                           ...messageToUpdate,
                                           sources: [...existingSources, ...newSources],
                                       };
                                       return updatedHistory;
                                   }
                               }
                               return prev;
                           });
                       }
                    }
                },
                onerror: (e: any) => {
                    console.error('Session error:', e);
                    const errorMessage = e.message || 'An unknown error occurred.';
                    setIsConnecting(false);
                    disconnect(true);
                    if (!isIntentionalDisconnectRef.current) {
                        scheduleRetry(errorMessage);
                    }
                },
                onclose: () => {
                    console.log('Session closed.');
                    setIsConnecting(false);
                    disconnect(true);
                    if (!isIntentionalDisconnectRef.current) {
                        scheduleRetry("Connection closed unexpectedly.");
                    }
                },
            }
        });
        await sessionPromiseRef.current;
    } catch (error) {
        setIsConnecting(false);
        console.error(`Failed to connect:`, error);
        if (!isIntentionalDisconnectRef.current) {
          const errorMessage = (error as Error).message || "Failed to initialize connection.";
          scheduleRetry(errorMessage);
        }
    }
  }, [disconnect, isConnected, isConnecting, setTranscriptHistory, voiceSettings, scheduleRetry]);
  
  useEffect(() => {
    connectRef.current = connect;
  }, [connect]);


  const playConnectionSound = useCallback(async () => {
    if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
        const WebkitAudioContext = (window as any).webkitAudioContext;
        outputAudioContextRef.current = new (window.AudioContext || WebkitAudioContext)({ sampleRate: 24000 });
    }
    const audioCtx = outputAudioContextRef.current;
    if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }

    const oscillator = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioCtx.destination);
    
    // "Bamboo" or "Wooden" bell sound
    oscillator.type = 'sine';
    oscillator.frequency.setValueAtTime(659.25, audioCtx.currentTime); // E5 note
    
    gainNode.gain.setValueAtTime(0, audioCtx.currentTime);
    gainNode.gain.linearRampToValueAtTime(0.7, audioCtx.currentTime + 0.01);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.3);

    oscillator.start(audioCtx.currentTime);
    oscillator.stop(audioCtx.currentTime + 0.35);
  }, []);

    const findTransaction = useCallback((query: string): Transaction | null => {
        const transactions = financeData.transactions;
        if (transactions.length === 0) return null;

        const lowerQuery = query.toLowerCase();

        // Handle direct "last/latest" keywords first
        if (lowerQuery.includes('last') || lowerQuery.includes('latest') || lowerQuery.includes('последн')) {
            const sorted = [...transactions].sort((a, b) => Number(b.id) - Number(a.id));
            return sorted[0] || null;
        }

        const stopWords = ['the', 'a', 'an', 'is', 'at', 'on', 'in', 'транзакцию', 'транзакция', 'расход', 'доход', 'покупку', 'запись', 'из', 'с', 'в', 'для'];
        const queryParts = lowerQuery.split(/\s+/);

        const keywords = queryParts.filter(part => isNaN(parseFloat(part)) && part.length > 2 && !stopWords.includes(part));
        const numbers = queryParts.map(parseFloat).filter(num => !isNaN(num));
        
        // Date handling
        let dateFilter: string | null = null;
        if (lowerQuery.includes('yesterday') || lowerQuery.includes('вчера')) {
            const yesterday = new Date();
            yesterday.setDate(yesterday.getDate() - 1);
            dateFilter = yesterday.toISOString().slice(0, 10);
        }

        let bestMatch: Transaction | null = null;
        let highestScore = -1;

        // Prioritize recent transactions by sorting them
        const sortedTransactions = [...transactions].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime() || Number(b.id) - Number(a.id));

        for (const tx of sortedTransactions) {
            let currentScore = 0;
            const txDescription = tx.description.toLowerCase();

            // Score based on keyword matches in description
            for (const keyword of keywords) {
                if (txDescription.includes(keyword)) {
                    currentScore += 2; 
                }
            }
            
            // Score based on number match (amount)
            for (const num of numbers) {
                if (Math.abs(tx.amount - num) < 0.01) { // Floating point safety
                    currentScore += 5; // High score for an exact amount match
                }
            }

            // Score based on date match
            if (dateFilter && tx.date === dateFilter) {
                currentScore += 3; // Bonus score for date match
            }

            // If query is just a single phrase without numbers, do a simple substring search as a fallback
            if (keywords.length > 0 && numbers.length === 0 && dateFilter === null) {
                if (txDescription.includes(lowerQuery)) {
                    currentScore += 1; // Lower score for a full phrase match
                }
            }

            if (currentScore > highestScore) {
                highestScore = currentScore;
                bestMatch = tx;
            }
        }

        return highestScore > 0 ? bestMatch : null;
    }, [financeData.transactions]);

    const recalculateBalances = useCallback((transactions: Transaction[]): Omit<FinanceData, 'transactions'> => {
        let totalBalance = 0;
        let creditCardBalance = 0;
        let cashBalance = 0;

        for (const tx of transactions) {
            const amount = tx.amount;
            if (tx.type === 'income') {
                totalBalance += amount;
                if (tx.paymentMethod === 'cash') {
                    cashBalance += amount;
                } else if (tx.paymentMethod === 'creditCard') {
                    creditCardBalance += amount;
                }
            } else { // expense
                totalBalance -= amount;
                if (tx.paymentMethod === 'cash') {
                    cashBalance -= amount;
                } else if (tx.paymentMethod === 'creditCard') {
                    creditCardBalance -= amount;
                }
            }
        }
        return { totalBalance, creditCardBalance, cashBalance };
    }, []);

    // FIX: Moved `synthesizeSpeech` and `playAudio` before `executeFunctionCall`
    // to resolve "used before declaration" errors as they are dependencies.
    const synthesizeSpeech = useCallback(async (text: string): Promise<Uint8Array> => {
        const speechTask = () => new Promise<Uint8Array>((resolve, reject) => {
            const audioChunks: Uint8Array[] = [];
            try {
                const sessionPromise = getAi().live.connect({
                    model: 'gemini-2.5-flash-native-audio-preview-09-2025',
                    config: {
                        responseModalities: [Modality.AUDIO],
                        speechConfig: {
                            voiceConfig: { 
                                prebuiltVoiceConfig: { voiceName: 'Zephyr' },
                                ...voiceSettings
                            },
                        },
                        systemInstruction: `You are a text-to-speech engine. Your only task is to say the following text exactly as it is written, without any additions or conversational filler. After you have said the text, do not say anything else. The text is: "${text}"`,
                    },
                    callbacks: {
                        onopen: async () => {
                            try {
                                const session = await sessionPromise;
                                const silentFrame = new Uint8Array(320); // 10ms of 16-bit PCM silence
                                const pcmBlob = {
                                    data: encode(silentFrame),
                                    mimeType: 'audio/pcm;rate=16000',
                                };
                                session.sendRealtimeInput({ media: pcmBlob });
                            } catch (e) {
                                console.error("Error triggering TTS response", e);
                                reject(new Error('Failed to initiate speech synthesis.'));
                            }
                        },
                        onmessage: (message: LiveServerMessage) => {
                            if (message.serverContent?.modelTurn?.parts[0]?.inlineData?.data) {
                                const base64Audio = message.serverContent.modelTurn.parts[0].inlineData.data;
                                audioChunks.push(decode(base64Audio));
                            }
                            if (message.serverContent?.turnComplete) {
                                sessionPromise.then(s => s.close()).catch(console.error);
                            }
                        },
                        onerror: (e: any) => {
                            console.error('TTS Session error:', e);
                            reject(e);
                        },
                        onclose: () => {
                            if (audioChunks.length === 0) {
                                console.warn("Speech synthesis resulted in no audio data.");
                            }
                            const totalLength = audioChunks.reduce((acc, chunk) => acc + chunk.length, 0);
                            const combined = new Uint8Array(totalLength);
                            let offset = 0;
                            for (const chunk of audioChunks) {
                                combined.set(chunk, offset);
                                offset += chunk.length;
                            }
                            resolve(combined);
                        },
                    }
                });
                sessionPromise.catch(reject);
            } catch(e) {
                reject(e);
            }
        });
        // FIX: `apiCallWithRetry` is a standalone function, not a method on `sendTextMessage`.
        return apiCallWithRetry(speechTask, 3, 1000);
    }, [voiceSettings]);

  const playAudio = useCallback(async (audioBytes: Uint8Array) => {
    if (audioBytes.length === 0) return;
    const WebkitAudioContext = (window as any).webkitAudioContext;
    if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
        outputAudioContextRef.current = new (window.AudioContext || WebkitAudioContext)({ sampleRate: 24000 });
    }
    if (outputAudioContextRef.current.state === 'suspended') {
        await outputAudioContextRef.current.resume();
    }

    try {
        const audioBuffer = await decodeAudioData(audioBytes, outputAudioContextRef.current, 24000, 1);
        const source = outputAudioContextRef.current.createBufferSource();
        source.buffer = audioBuffer;
        
        const outputNode = outputAudioContextRef.current.createGain();
        outputNode.connect(outputAudioContextRef.current.destination);
        source.connect(outputNode);

        return new Promise<void>(resolve => {
            source.start();
            setIsSpeaking(true);
            source.onended = () => {
                setIsSpeaking(false);
                resolve();
            };
        });
    } catch(e) {
        console.error("Error playing synthesized audio:", e);
    }
  }, []);

    // FIX: `handleRemoveFile` is used by `executeFunctionCall`, so it must be declared before it.
    const handleRemoveFile = useCallback(() => {
        setAttachedFile(null);
        setAttachedFileContent('');
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }, []);

  const executeFunctionCall = useCallback(async (fc: { name: string, args: any }) => {
        console.log(`Executing function call: ${fc.name}`, fc.args);
        let resultText = 'ok'; // Default success response
        try {
            switch (fc.name) {
                case 'setAlarm': {
                    const { time, label } = fc.args;
                    // Basic validation
                    if (/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/.test(time) && label) {
                        const newAlarm: Alarm = {
                            id: Date.now(),
                            time,
                            label,
                            enabled: true,
                        };
                        setAlarms(prev => [...prev.filter(a => a.time !== time), newAlarm].sort((a,b) => a.time.localeCompare(b.time)));
                        resultText = `Будильник "${label}" установлен на ${time}.`;
                    } else {
                        resultText = 'Неверный формат времени или отсутствует метка. Используйте формат ЧЧ:ММ.';
                    }
                    setActiveView('toolbox');
                    if(isChatCollapsed) onExpandChat();
                    break;
                }
                case 'deleteAlarm': {
                    const query = fc.args.query.toLowerCase();
                    const initialLength = alarms.length;
                    setAlarms(prev => prev.filter(a => !a.time.includes(query) && !a.label.toLowerCase().includes(query)));
                    resultText = alarms.length < initialLength ? `Будильник по запросу "${query}" удален.` : `Будильник по запросу "${query}" не найден.`;
                    setActiveView('toolbox');
                    if(isChatCollapsed) onExpandChat();
                    break;
                }
                case 'stopAlarm': {
                    if (activeAlarm) {
                        if (alarmAudioSourceRef.current) {
                            alarmAudioSourceRef.current.stop();
                            alarmAudioSourceRef.current = null;
                        }
                        resultText = `Будильник "${activeAlarm.label}" выключен.`;
                        setActiveAlarm(null);
                    } else {
                        resultText = 'Нет активных будильников.';
                    }
                    break;
                }
                case 'startTimer': {
                    const { durationInSeconds, label } = fc.args;
                    const id = `timer_${Date.now()}`;
                    const endTime = Date.now() + durationInSeconds * 1000;

                    const timeoutId = setTimeout(() => {
                        const message = `Таймер "${label}" завершен.`;
                        setTranscriptHistory(prev => [...prev, { id: Date.now().toString(), author: 'assistant', text: message, type: 'message', timestamp: Date.now() }]);
                        synthesizeSpeech(message).then(playAudio);
                        internalTimersRef.current.delete(id);
                    }, durationInSeconds * 1000);

                    const newTimer: TimerState = { id, label, endTime, duration: durationInSeconds, timeoutId };
                    internalTimersRef.current.set(id, newTimer);
                    resultText = `Таймер "${label}" запущен на ${durationInSeconds} секунд.`;
                    break;
                }
                 case 'stopTimer': {
                    const { label } = fc.args;
                    let found = false;
                    for (const [id, timer] of internalTimersRef.current.entries()) {
                        if (timer.label.toLowerCase() === label.toLowerCase()) {
                            clearTimeout(timer.timeoutId);
                            internalTimersRef.current.delete(id);
                            found = true;
                            break;
                        }
                    }
                    resultText = found ? `Таймер "${label}" остановлен.` : `Таймер с меткой "${label}" не найден.`;
                    break;
                }
                 case 'startStopwatch': {
                    const { label } = fc.args;
                    const id = `stopwatch_${Date.now()}`;
                    const newStopwatch: StopwatchState = { id, label, startTime: Date.now() };
                    internalStopwatchesRef.current.set(id, newStopwatch);
                    resultText = `Секундомер "${label}" запущен.`;
                    break;
                }
                 case 'stopStopwatch': {
                    const { label } = fc.args;
                    let foundAndStopped = false;
                    for (const [id, stopwatch] of internalStopwatchesRef.current.entries()) {
                        if (stopwatch.label.toLowerCase() === label.toLowerCase()) {
                            const elapsedMs = Date.now() - stopwatch.startTime;
                            const elapsedSec = (elapsedMs / 1000).toFixed(2);
                            internalStopwatchesRef.current.delete(id);
                            resultText = `Секундомер "${label}" остановлен. Прошло ${elapsedSec} секунд.`;
                            foundAndStopped = true;
                            break;
                        }
                    }
                    if (!foundAndStopped) {
                        resultText = `Секундомер с меткой "${label}" не найден или уже остановлен.`;
                    }
                    break;
                }
                case 'getTodaysAccomplishments': {
                    const today = new Date().toISOString().slice(0, 10);
                    let summaryParts: string[] = [];

                    // 1. Planner Summary
                    const newTasksToday = plannerContent.filter(task => task.date === today && !task.completed);
                    const completedTasksToday = plannerContent.filter(task => task.completed && task.date === today);

                    if (newTasksToday.length > 0 || completedTasksToday.length > 0) {
                        let plannerSummary = 'Планировщик:';
                        if (newTasksToday.length > 0) {
                            plannerSummary += `\n- Добавлено ${newTasksToday.length} новых задач: ${newTasksToday.slice(0, 2).map(t => `"${t.text}"`).join(', ')}${newTasksToday.length > 2 ? '...' : ''}.`;
                        }
                        if (completedTasksToday.length > 0) {
                            plannerSummary += `\n- Завершено ${completedTasksToday.length} задач: ${completedTasksToday.slice(0, 2).map(t => `"${t.text}"`).join(', ')}${completedTasksToday.length > 2 ? '...' : ''}.`;
                        }
                        summaryParts.push(plannerSummary);
                    } else {
                        summaryParts.push('Планировщик: Сегодня не было добавлено или завершено ни одной задачи.');
                    }

                    // 2. Calendar Summary
                    const calendarEventsToday = calendarEvents.filter(event => event.date === today);
                    if (calendarEventsToday.length > 0) {
                        const eventTitles = calendarEventsToday.map(e => `${e.time ? e.time + ' - ' : ''}"${e.title}"`).join(', ');
                        summaryParts.push(`Календарь: На сегодня запланировано ${calendarEventsToday.length} событий: ${eventTitles}.`);
                    } else {
                        summaryParts.push('Календарь: На сегодня нет запланированных событий.');
                    }

                    // 3. Audio Recordings Summary
                    const audioRecordingsToday = storedFiles.filter(file => file.type === 'audio' && new Date(file.date).toISOString().slice(0, 10) === today);
                    if (audioRecordingsToday.length > 0) {
                        const recordingTitles = audioRecordingsToday.map(r => `"${r.title || r.name}"`).join(', ');
                        summaryParts.push(`Аудиозаписи: Сегодня создано ${audioRecordingsToday.length} записей: ${recordingTitles}.`);
                    } else {
                        summaryParts.push('Аудиозаписи: Сегодня не было создано новых записей.');
                    }

                    resultText = `Вот отчет о проделанной работе за сегодня:\n\n${summaryParts.join('\n\n')}`;
                    break;
                }
                case 'createAndDownloadFile': {
                    const { filename, content } = fc.args;
                    if (!filename || typeof content !== 'string') {
                        resultText = 'Не удалось создать файл: отсутствуют имя файла или содержимое.';
                        break;
                    }
                    
                    setStatus('Создаю и сохраняю файл...');
                    try {
                        const extension = filename.split('.').pop()?.toLowerCase();
                        let blob;
                        let mimeType = 'application/octet-stream';

                        if (extension === 'pdf') {
                            mimeType = 'application/pdf';
                            const { jsPDF } = jspdf;
                            const doc = new jsPDF();
                            doc.text(content, 10, 10);
                            blob = doc.output('blob');
                        } else if (extension === 'docx') {
                            mimeType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
                            const paragraphs = content.split('\n').map(textLine => 
                                new docx.Paragraph({
                                    children: [new docx.TextRun(textLine)]
                                })
                            );
                            const doc = new docx.Document({
                                sections: [{ children: paragraphs }]
                            });
                            blob = await docx.Packer.toBlob(doc);
                        } else {
                             if (extension === 'txt') mimeType = 'text/plain';
                             if (extension === 'md') mimeType = 'text/markdown';
                             if (extension === 'csv') mimeType = 'text/csv';
                             blob = new Blob([content], { type: mimeType });
                        }
                        
                        // Save the created file to storage
                        const fileTypeMap: Record<string, StoredFile['type']> = {
                            'txt': 'text', 'md': 'text', 'csv': 'text',
                            'docx': 'docx', 'doc': 'docx',
                            'pdf': 'pdf',
                            'mp3': 'audio', 'wav': 'audio',
                            'mp4': 'video', 'mov': 'video', 'webm': 'video'
                        };
                        const newFileForStorage: Omit<StoredFile, 'id'> = {
                            name: filename,
                            type: fileTypeMap[extension || ''] || 'other',
                            size: blob.size,
                            date: Date.now(),
                            content: blob,
                        };

                        try {
                            await addFile(newFileForStorage);
                            await loadFiles();
                            resultText = `Файл "${filename}" создан, сохранен в хранилище и загружается.`;
                        } catch (e: any) {
                            console.warn("Could not save created file (might exist already):", e.message);
                            resultText = `Файл "${filename}" создан и загружается. Он уже существует в хранилище.`;
                        }


                        // Trigger download
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = filename;
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
                        URL.revokeObjectURL(url);

                    } catch (e) {
                        console.error('Error creating file:', e);
                        resultText = `Не удалось создать файл "${filename}". Произошла ошибка: ${(e as Error).message}`;
                    }
                    setStatus('Нажмите на микрофон или введите сообщение');
                    break;
                }
                case 'saveFileToStorage': {
                    if (!attachedFile) {
                        resultText = 'Нет прикрепленного файла для сохранения.';
                        break;
                    }
                    const alreadyExists = storedFiles.some(f => f.name === attachedFile.name && f.size === attachedFile.size);
                    if (alreadyExists) {
                        resultText = `Файл "${attachedFile.name}" уже сохранен в хранилище.`;
                    } else {
                        // This is a fallback in case the automatic save failed.
                        try {
                            const extension = attachedFile.name.split('.').pop()?.toLowerCase() ?? 'other';
                            const fileTypeMap: Record<string, StoredFile['type']> = {
                                'txt': 'text', 'md': 'text', 'csv': 'text', 'docx': 'docx', 'pdf': 'pdf', 
                                'mp3': 'audio', 'wav': 'audio', 'webm': 'audio',
                                'mp4': 'video', 'mov': 'video'
                            };
                            const newFile: Omit<StoredFile, 'id'> = {
                                name: attachedFile.name,
                                type: fileTypeMap[extension] || 'other',
                                size: attachedFile.size,
                                date: Date.now(),
                                content: attachedFile,
                            };
                            await addFile(newFile);
                            await loadFiles();
                            resultText = `Файл "${attachedFile.name}" успешно сохранен в хранилище.`;
                        } catch (e: any) {
                            resultText = `Не удалось сохранить файл: ${e.message}`;
                        }
                    }
                    break;
                }
                case 'getFilesFromStorage': {
                    let files = storedFiles;
                    if (fc.args.fileType) {
                        files = files.filter(f => f.type === fc.args.fileType);
                    }
                    if (files.length > 0) {
                        const fileList = files.map(f => `- ${f.name} (${f.type}, ${new Date(f.date).toLocaleDateString()})`).join('\n');
                        resultText = `[CONTEXT] Вот список файлов в хранилище:\n${fileList}`;
                    } else {
                        resultText = "[CONTEXT] В хранилище нет файлов, соответствующих вашему запросу.";
                    }
                    setActiveView('storage');
                    if (isChatCollapsed) onExpandChat();
                    break;
                }
                 case 'readFileFromStorage': {
                    const { filename } = fc.args;
                    const fileToRead = storedFiles.find(f => f.name === filename);
                    if (!fileToRead) {
                        resultText = `[CONTEXT] Файл с именем "${filename}" не найден в хранилище.`;
                        break;
                    }
                    try {
                        const textContent = await fileToRead.content.text();
                        resultText = `[CONTEXT] Содержимое файла "${filename}":\n\n${textContent}`;
                    } catch (e) {
                        console.error('Error reading file from storage:', e);
                        resultText = `[CONTEXT] Не удалось прочитать текстовое содержимое файла "${filename}".`;
                    }
                    break;
                }
                case 'updateFileInStorage': {
                    const { filename, newContent, newFilename } = fc.args;
                    const fileToUpdate = storedFiles.find(f => f.name === filename);
                    if (!fileToUpdate) {
                        resultText = `Файл с именем "${filename}" не найден в хранилище.`;
                        break;
                    }

                    try {
                        const updates: Partial<Pick<StoredFile, 'name' | 'content'>> = {};
                        if (newFilename) {
                            updates.name = newFilename;
                        }
                        if (newContent) {
                            // Create a new blob with the same type as the original
                            const newBlob = new Blob([newContent], { type: fileToUpdate.content.type });
                            updates.content = newBlob;
                        }
                        
                        if (Object.keys(updates).length === 0) {
                            resultText = "Не указаны изменения для файла.";
                            break;
                        }

                        await updateFile(fileToUpdate.id, updates);
                        await loadFiles();
                        resultText = `Файл "${filename}" успешно обновлен.`;

                    } catch(e) {
                         console.error("Error updating file:", e);
                         resultText = `Не удалось обновить файл: ${(e as Error).message}`;
                    }
                    break;
                }
                case 'deleteFileFromStorage': {
                    const { filename } = fc.args;
                    const fileToDelete = storedFiles.find(f => f.name === filename);
                     if (!fileToDelete) {
                        resultText = `Файл с именем "${filename}" не найден в хранилище.`;
                        break;
                    }
                    try {
                        await deleteFile(fileToDelete.id);
                        await loadFiles();
                        resultText = `Файл "${filename}" был удален из хранилища.`;
                    } catch (e) {
                        console.error('Error deleting file from storage:', e);
                        resultText = `Не удалось удалить файл "${filename}".`;
                    }
                    break;
                }
                case 'setVoiceSettings': {
                    const { pitch, speakingRate, volumeGainDb } = fc.args;
                    setVoiceSettings(prev => ({
                        pitch: typeof pitch === 'number' ? Math.max(-20.0, Math.min(20.0, pitch)) : prev.pitch,
                        speakingRate: typeof speakingRate === 'number' ? Math.max(0.25, Math.min(4.0, speakingRate)) : prev.speakingRate,
                        volumeGainDb: typeof volumeGainDb === 'number' ? Math.max(-96.0, Math.min(16.0, volumeGainDb)) : prev.volumeGainDb
                    }));
                    resultText = "Настройки голоса обновлены.";
                    break;
                }
                case 'getCurrentTimeAndDate': {
                    const now = new Date();
                    const time = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                    const date = now.toLocaleDateString('ru-RU', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
                    resultText = `Сейчас ${time}, ${date}.`;
                    break;
                }
                case 'saveUserInstruction':
                    const newInstruction = { text: fc.args.text, creationDate: Date.now() };
                    await addInstruction(newInstruction);
                    await loadInstructions();
                    resultText = `Хорошо, я запомнил правило: "${fc.args.text}"`;
                    break;
                case 'getUserInstructions':
                    const instructions = await getAllInstructions();
                    if (instructions.length > 0) {
                        const instructionsList = instructions.map((instr, i) => `${i + 1}. ${instr.text}`).join('\n');
                        resultText = `[CONTEXT] Вот список инструкций, которые вы мне дали:\n${instructionsList}`;
                    } else {
                        resultText = "[CONTEXT] У вас пока нет сохраненных инструкций для меня.";
                    }
                    break;
                case 'deleteUserInstruction': {
                    const allInstructions = await getAllInstructions();
                    const query = fc.args.query.toLowerCase();
                    let instructionToDelete: UserInstruction | undefined;
                    
                    const index = parseInt(query, 10);
                    if (!isNaN(index) && index > 0 && index <= allInstructions.length) {
                        instructionToDelete = allInstructions[index - 1];
                    } else {
                        instructionToDelete = allInstructions.find(instr => instr.text.toLowerCase().includes(query));
                    }
                    
                    if (instructionToDelete) {
                        await deleteInstructionById(instructionToDelete.id);
                        await loadInstructions();
                        resultText = `Я удалил инструкцию: "${instructionToDelete.text}"`;
                    } else {
                        resultText = `Не удалось найти инструкцию по вашему запросу: "${fc.args.query}"`;
                    }
                    break;
                }
                case 'setPanelState': {
                    const { open, view, subViewState } = fc.args;

                    if (open === false) {
                        handleCollapse();
                        break;
                    }
                    
                    const needsPanelOpen = open === true || view || subViewState;
                    const panelWasCollapsed = isChatCollapsed;
                    
                    if (needsPanelOpen && panelWasCollapsed) {
                        playPageTurnSound();
                        onExpandChat();
                    }
                    
                    if (view && ['chat', 'dictaphone', 'finance', 'organizer', 'storage', 'toolbox', 'assistant-config'].includes(view)) {
                        if (activeView !== view && !panelWasCollapsed) {
                            playPageTurnSound();
                        }
                        setActiveView(view as View);
                    }
                    
                    if (subViewState) {
                        setActiveView('organizer');
                        setOrganizerInitialState(subViewState);
                    }
                    break;
                }
                case 'addNote':
                    setNotes(prev => [{ id: Date.now(), text: fc.args.text, date: new Date().toISOString().slice(0, 10) }, ...prev]);
                    resultText = `Заметка добавлена: "${fc.args.text}"`;
                    break;
                case 'getNotes':
                    resultText = notes.length > 0 ? `[CONTEXT] Вот ваши заметки:\n${notes.map(n => `- ${n.text}`).join('\n')}` : "[CONTEXT] У вас пока нет заметок.";
                    break;
                case 'updateNote': {
                    let found = false;
                    setNotes(prev => prev.map(note => {
                        if (note.text.toLowerCase().includes(fc.args.query.toLowerCase())) {
                            found = true;
                            return { ...note, text: fc.args.newText };
                        }
                        return note;
                    }));
                    resultText = found ? `Заметка обновлена на "${fc.args.newText}".` : `Заметка со словами "${fc.args.query}" не найдена.`;
                    break;
                }
                case 'deleteNote': {
                    const initialLength = notes.length;
                    setNotes(prev => prev.filter(note => !note.text.toLowerCase().includes(fc.args.query.toLowerCase())));
                    resultText = notes.length < initialLength ? `Заметка, содержащая "${fc.args.query}", удалена.` : `Заметка со словами "${fc.args.query}" не найдена.`;
                    break;
                }
                case 'clearNotes':
                    setNotes([]);
                    resultText = "Все заметки удалены.";
                    break;

                case 'addContact':
                    setContacts(prev => [{ id: Date.now(), ...fc.args }, ...prev]);
                    resultText = `Контакт "${fc.args.name}" добавлен.`;
                    break;
                case 'getContacts':
                    resultText = contacts.length > 0 ? `[CONTEXT] Вот ваш список контактов:\n${contacts.map(c => `- ${c.name} (${c.phone || 'нет номера'})`).join('\n')}` : "[CONTEXT] Ваш список контактов пуст.";
                    break;
                case 'updateContact': {
                    let found = false;
                    const { query, newName, newPhone, newEmail, newNotes } = fc.args;
                    setContacts(prev => prev.map(contact => {
                        if (contact.name.toLowerCase() === query.toLowerCase()) {
                            found = true;
                            return {
                                ...contact,
                                name: newName || contact.name,
                                phone: newPhone || contact.phone,
                                email: newEmail || contact.email,
                                notes: newNotes || contact.notes
                            };
                        }
                        return contact;
                    }));
                    resultText = found ? `Контакт "${query}" обновлен.` : `Контакт с именем "${query}" не найден.`;
                    break;
                }
                case 'deleteContact': {
                    const initialLength = contacts.length;
                    setContacts(prev => prev.filter(c => c.name.toLowerCase() !== fc.args.query.toLowerCase()));
                    resultText = contacts.length < initialLength ? `Контакт "${fc.args.query}" удален.` : `Контакт с именем "${fc.args.query}" не найден.`;
                    break;
                }
                case 'clearContacts':
                    setContacts([]);
                    resultText = "Все контакты удалены.";
                    break;

                case 'addCalendarEvent':
                    setCalendarEvents(prev => [{ id: Date.now(), ...fc.args }, ...prev].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
                    resultText = `Событие "${fc.args.title}" добавлено в календарь на ${fc.args.date}.`;
                    break;
                case 'getCalendarEvents': {
                    const query = fc.args.dateQuery?.toLowerCase();
                    let targetDate = new Date();
                    if (query === 'tomorrow' || query === 'завтра') {
                        targetDate.setDate(targetDate.getDate() + 1);
                    } else if (query && /^\d{4}-\d{2}-\d{2}$/.test(query)) {
                        targetDate = new Date(query + "T00:00:00");
                    }
                    const dateStr = targetDate.toISOString().slice(0, 10);
                    const events = calendarEvents.filter(e => e.date === dateStr);
                    resultText = events.length > 0 ? `[CONTEXT] События на ${dateStr}:\n${events.map(e => `- ${e.time || ''} ${e.title}`).join('\n')}` : `[CONTEXT] На ${dateStr} событий не запланировано.`;
                    break;
                }
                case 'updateCalendarEvent': {
                    let found = false;
                    const { query, date, newTitle, newDate, newTime, newDescription } = fc.args;
                    setCalendarEvents(prev => prev.map(event => {
                        if (event.title.toLowerCase() === query.toLowerCase() && event.date === date) {
                            found = true;
                            return {
                                ...event,
                                title: newTitle || event.title,
                                date: newDate || event.date,
                                time: newTime || event.time,
                                description: newDescription || event.description,
                            };
                        }
                        return event;
                    }));
                    resultText = found ? `Событие "${query}" на ${date} обновлено.` : `Событие "${query}" на ${date} не найдено.`;
                    break;
                }
                case 'deleteCalendarEvent': {
                    const initialLength = calendarEvents.length;
                    const { query, date } = fc.args;
                    setCalendarEvents(prev => prev.filter(e => !(e.title.toLowerCase() === query.toLowerCase() && e.date === date)));
                    resultText = calendarEvents.length < initialLength ? `Событие "${query}" на ${date} удалено.` : `Событие "${query}" на ${date} не найдено.`;
                    break;
                }
                case 'clearCalendarEvents':
                    setCalendarEvents([]);
                    resultText = "Все события календаря удалены.";
                    break;
                case 'addTransaction': {
                    const { type, amount, description, paymentMethod, date } = fc.args;
                    if ((type === 'income' || type === 'expense') && typeof amount === 'number' && typeof description === 'string' && (paymentMethod === 'cash' || paymentMethod === 'creditCard')) {
                        
                        const isValidDate = (dateString: string) => {
                            if (!dateString) return false;
                            return /^\d{4}-\d{2}-\d{2}$/.test(dateString);
                        };

                        const transactionDate = (date && typeof date === 'string' && isValidDate(date))
                            ? date
                            : new Date().toISOString().slice(0, 10);

                        const newTransaction: Transaction = {
                            id: Date.now().toString(),
                            date: transactionDate,
                            description,
                            amount,
                            type,
                            paymentMethod,
                        };
                        
                        setFinanceData(prevData => {
                            const updatedTransactions = [...prevData.transactions, newTransaction];
                            const newBalances = recalculateBalances(updatedTransactions);
                            return {
                                transactions: updatedTransactions,
                                ...newBalances,
                            };
                        });
                        
                        const dateForMessage = new Date(transactionDate + 'T00:00:00').toLocaleDateString('ru-RU');
                        resultText = `${type === 'income' ? 'Доход' : 'Расход'} на сумму ${formatCurrency(amount)} (${paymentMethod === 'cash' ? 'наличными' : 'картой'}) с описанием "${description}" успешно добавлен на ${dateForMessage}.`;
                    } else {
                        resultText = 'Не удалось добавить транзакцию: неверные параметры.';
                    }
                    break;
                }
                case 'searchTransactions': {
                    const { query } = fc.args;
                    if (typeof query !== 'string' || query.trim() === '') {
                        resultText = 'Не удалось выполнить поиск: не указан поисковый запрос.';
                        break;
                    }

                    const lowerTerm = query.toLowerCase();
                    let filteredTransactions;

                    // A simple date normalization for "вчера"
                    if (lowerTerm === 'вчера') {
                        const yesterday = new Date();
                        yesterday.setDate(yesterday.getDate() - 1);
                        const yesterdayStr = yesterday.toISOString().slice(0, 10);
                        filteredTransactions = financeData.transactions.filter(tx => tx.date === yesterdayStr);
                    } else {
                            filteredTransactions = financeData.transactions.filter(tx =>
                            tx.description.toLowerCase().includes(lowerTerm) ||
                            tx.date.includes(lowerTerm) ||
                            new Date(tx.date).toLocaleString('ru-RU', { month: 'long' }).toLowerCase().includes(lowerTerm)
                        );
                    }

                    setFinanceSearchTerm(query);
                    setActiveView('finance');
                    if (isChatCollapsed) onExpandChat();
                    
                    if (filteredTransactions.length > 0) {
                        const totalIncome = filteredTransactions
                            .filter(tx => tx.type === 'income')
                            .reduce((sum, tx) => sum + tx.amount, 0);
                        
                        const totalExpense = filteredTransactions
                            .filter(tx => tx.type === 'expense')
                            .reduce((sum, tx) => sum + tx.amount, 0);

                        const transactionList = filteredTransactions
                            .slice(0, 5) // Limit for chat brevity
                            .map(tx => {
                                const date = new Date(tx.date + 'T00:00:00').toLocaleDateString('ru-RU');
                                const sign = tx.type === 'expense' ? '-' : '+';
                                return `- ${date}: ${tx.description} (${sign}${formatCurrency(tx.amount)})`;
                            })
                            .join('\n');
                        
                        const moreCount = filteredTransactions.length > 5 ? filteredTransactions.length - 5 : 0;
                        
                        let summary = `Я нашел ${filteredTransactions.length} транзакций по запросу "${query}".`;
                        if(totalIncome > 0) summary += `\nОбщий доход: ${formatCurrency(totalIncome)}.`;
                        if(totalExpense > 0) summary += `\nОбщий расход: ${formatCurrency(totalExpense)}.`;
                        summary += `\n\nВот последние из них:\n${transactionList}`;

                        if (moreCount > 0) {
                            summary += `\n... и еще ${moreCount}. Все результаты показаны на панели финансов.`;
                        }
                        
                        resultText = summary;

                    } else {
                        resultText = `Транзакции по запросу "${query}" не найдены.`;
                    }
                    break;
                }
                case 'editTransaction': {
                    const { query, newAmount, newDescription, newPaymentMethod } = fc.args;
                    const transactionToEdit = findTransaction(query);

                    if (!transactionToEdit) {
                        resultText = `Не удалось найти транзакцию по запросу "${query}". Попробуйте быть точнее, указав сумму или дату.`;
                        break;
                    }

                    const updatedTransaction = { ...transactionToEdit };
                    let changesMade = false;

                    if (typeof newAmount === 'number') {
                        updatedTransaction.amount = newAmount;
                        changesMade = true;
                    }
                    if (typeof newDescription === 'string') {
                        updatedTransaction.description = newDescription;
                        changesMade = true;
                    }
                    if (['cash', 'creditCard'].includes(newPaymentMethod)) {
                        updatedTransaction.paymentMethod = newPaymentMethod;
                        changesMade = true;
                    }

                    if (!changesMade) {
                        resultText = "Не указано, какие изменения нужно внести в транзакцию.";
                        break;
                    }

                    setFinanceData(prevData => {
                        const updatedTransactions = prevData.transactions.map(tx =>
                            tx.id === updatedTransaction.id ? updatedTransaction : tx
                        );
                        const newBalances = recalculateBalances(updatedTransactions);
                        return {
                            transactions: updatedTransactions,
                            ...newBalances,
                        };
                    });

                    resultText = `Транзакция "${transactionToEdit.description}" успешно изменена.`;
                    break;
                }
                case 'deleteTransaction': {
                    const { query } = fc.args;
                    const transactionToDelete = findTransaction(query);
                    if (!transactionToDelete) {
                        resultText = `Не удалось найти транзакцию для удаления по запросу "${query}". Попробуйте быть точнее.`;
                        break;
                    }
                    
                    setFinanceData(prevData => {
                        const updatedTransactions = prevData.transactions.filter(tx => tx.id !== transactionToDelete.id);
                        const newBalances = recalculateBalances(updatedTransactions);
                        return {
                            transactions: updatedTransactions,
                            ...newBalances
                        };
                    });

                    resultText = `Транзакция "${transactionToDelete.description}" на сумму ${formatCurrency(transactionToDelete.amount)} была удалена.`;
                    break;
                }
                case 'replaceTransaction': {
                    const { query, newTransactions } = fc.args;
                    if (!query || !Array.isArray(newTransactions) || newTransactions.length === 0) {
                        resultText = "Не удалось заменить транзакцию: неверные параметры.";
                        break;
                    }

                    const transactionToReplace = findTransaction(query);

                    if (!transactionToReplace) {
                        resultText = `Не удалось найти транзакцию для замены по запросу "${query}". Попробуйте быть точнее.`;
                        break;
                    }

                    const replacementTransactions: Transaction[] = newTransactions.map((tx: any) => ({
                        id: Date.now().toString() + Math.random(),
                        date: transactionToReplace.date,
                        description: tx.description,
                        amount: tx.amount,
                        type: tx.type,
                        paymentMethod: tx.paymentMethod,
                    }));
                    
                    setFinanceData(prevData => {
                        const filteredTransactions = prevData.transactions.filter(tx => tx.id !== transactionToReplace.id);
                        const updatedTransactions = [...filteredTransactions, ...replacementTransactions];
                        const newBalances = recalculateBalances(updatedTransactions);
                        return {
                            transactions: updatedTransactions,
                            ...newBalances
                        };
                    });

                    resultText = `Транзакция "${transactionToReplace.description}" была успешно заменена на ${replacementTransactions.length} новых.`;
                    break;
                }
                case 'generateStatement': {
                    const { filter } = fc.args;
                    let transactionsToExport = financeData.transactions;

                    if (filter && typeof filter === 'string') {
                        const lowerFilter = filter.toLowerCase();
                        transactionsToExport = financeData.transactions.filter(tx =>
                            tx.description.toLowerCase().includes(lowerFilter) ||
                            tx.date.includes(lowerFilter) ||
                            new Date(tx.date).toLocaleString('ru-RU', { month: 'long' }).toLowerCase().includes(lowerFilter)
                        );
                    }

                    if (transactionsToExport.length === 0) {
                        resultText = `Не найдено транзакций для создания выписки по фильтру: "${filter}".`;
                        break;
                    }

                    const header = `Выписка по счету\nСгенерировано: ${new Date().toLocaleString('ru-RU')}\n\n`;
                    const transactionLines = transactionsToExport
                        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
                        .map(tx => {
                            const type = tx.type === 'income' ? 'Доход' : 'Расход';
                            const formattedAmount = (tx.type === 'income' ? '+' : '-') + formatCurrency(tx.amount);
                            const date = new Date(tx.date + 'T00:00:00').toLocaleDateString('ru-RU');
                            return `${date}; ${tx.description}; ${formattedAmount}`;
                        })
                        .join('\n');

                    const totalIncome = transactionsToExport.filter(t => t.type === 'income').reduce((sum, t) => sum + t.amount, 0);
                    const totalExpense = transactionsToExport.filter(t => t.type === 'expense').reduce((sum, t) => sum + t.amount, 0);
                    const netTotal = totalIncome - totalExpense;

                    const footer = `\n\n--- Итоги ---\nВсего доходов: ${formatCurrency(totalIncome)}\nВсего расходов: ${formatCurrency(totalExpense)}\nИтог: ${formatCurrency(netTotal)}`;

                    const fileContent = header + transactionLines + footer;

                    const blob = new Blob([fileContent], { type: 'text/plain;charset=utf-8' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = `statement_${new Date().toISOString().slice(0, 10)}.txt`;
                    document.body.appendChild(a);
                    a.click();
                    document.body.removeChild(a);
                    URL.revokeObjectURL(url);

                    resultText = `Выписка с ${transactionsToExport.length} транзакциями создана и готова к загрузке.`;
                    break;
                }
                case 'calculateDailySpendingAllowance': {
                    const now = new Date();
                    const year = now.getFullYear();
                    const month = now.getMonth(); // 0-indexed
                    const dayOfMonth = now.getDate();

                    const daysInMonth = new Date(year, month + 1, 0).getDate();
                    const remainingDays = daysInMonth - dayOfMonth + 1;

                    if (remainingDays <= 0) {
                        resultText = "Текущий месяц уже закончился. Расчет невозможен.";
                        setDailySpendingAllowance(0);
                        break;
                    }

                    const firstDayOfMonth = new Date(year, month, 1);
                    const transactionsThisMonth = financeData.transactions.filter(tx => {
                        const txDate = new Date(tx.date + 'T00:00:00');
                        return txDate >= firstDayOfMonth && txDate <= now;
                    });

                    const incomeThisMonth = transactionsThisMonth
                        .filter(tx => tx.type === 'income')
                        .reduce((sum, tx) => sum + tx.amount, 0);

                    const expensesThisMonth = transactionsThisMonth
                        .filter(tx => tx.type === 'expense')
                        .reduce((sum, tx) => sum + tx.amount, 0);
                    
                    const balanceThisMonth = incomeThisMonth - expensesThisMonth;
                    const allowance = balanceThisMonth > 0 ? balanceThisMonth / remainingDays : 0;
                    
                    setDailySpendingAllowance(allowance);
                    
                    if (balanceThisMonth < 0) {
                        resultText = `В этом месяце вы уже потратили на ${formatCurrency(Math.abs(balanceThisMonth))} больше, чем заработали. Рекомендуется сократить расходы.`;
                    } else {
                        resultText = `Исходя из ваших доходов и расходов в этом месяце, вы можете тратить примерно по ${formatCurrency(allowance)} в день до конца месяца.`;
                    }
                    setActiveView('finance');
                    if (isChatCollapsed) onExpandChat();
                    break;
                }
                case 'addPlannerEntry': {
                    const { text } = fc.args;
                    if (typeof text === 'string' && text.trim()) {
                        const newItem: PlannerItem = {
                            id: Date.now(),
                            text: text.trim(),
                            date: new Date().toISOString().slice(0, 10),
                            completed: false,
                        };
                        setPlannerContent(prev => [newItem, ...prev].sort((a,b) => new Date(b.date).getTime() - new Date(a.date).getTime() || b.id - a.id));
                        resultText = `Задача добавлена в планировщик: "${text}"`;
                    } else {
                        resultText = "Не удалось добавить запись: неверные параметры.";
                    }
                    break;
                }
                case 'getPlannerContent': {
                    const uncompletedTasks = plannerContent.filter(item => !item.completed);
                    if (uncompletedTasks.length > 0) {
                        const taskList = uncompletedTasks.map(task => `- ${task.text} (срок: ${task.date})`).join('\n');
                        resultText = `[CONTEXT] Вот незавершенные задачи в планировщике:\n${taskList}`;
                    } else {
                        resultText = "[CONTEXT] В планировщике нет незавершенных задач.";
                    }
                    break;
                }
                case 'clearPlannerContent': {
                    setPlannerContent([]);
                    resultText = "Все задачи в органайзере удалены.";
                    setActiveView('organizer');
                    if (isChatCollapsed) onExpandChat();
                    break;
                }
                case 'generateDailySummary': {
                    const today = new Date().toISOString().slice(0, 10);
                    let summaryParts: string[] = [];
                    resultText = "Начинаю подводить итоги дня...";

                    // 1. Finance Summary
                    try {
                        const todayTransactions = financeData.transactions.filter(tx => tx.date === today);
                        if (todayTransactions.length > 0) {
                            const todayIncome = todayTransactions.filter(tx => tx.type === 'income').reduce((sum, tx) => sum + tx.amount, 0);
                            const todayExpense = todayTransactions.filter(tx => tx.type === 'expense').reduce((sum, tx) => sum + tx.amount, 0);
                            summaryParts.push(`Финансы: Доход за сегодня: ${formatCurrency(todayIncome)}. Расход: ${formatCurrency(todayExpense)}.`);
                        } else {
                            summaryParts.push("Финансы: Сегодня не было транзакций.");
                        }
                    } catch (e) { console.error("Error summarizing finances:", e); }

                    // 2. Planner Summary
                    try {
                        const uncompletedTasks = plannerContent.filter(task => !task.completed);
                        if (uncompletedTasks.length > 0) {
                            const taskTitles = uncompletedTasks.slice(0, 3).map(t => `"${t.text}"`).join(', ');
                            const more = uncompletedTasks.length > 3 ? ` и еще ${uncompletedTasks.length - 3}` : '';
                            summaryParts.push(`Планировщик: Остались невыполненные задачи: ${taskTitles}${more}.`);
                        } else {
                            summaryParts.push("Планировщик: Все задачи на сегодня выполнены или отсутствуют!");
                        }
                    } catch (e) { console.error("Error summarizing planner:", e); }

                    // 3. Dictaphone Summary
                    try {
                        const todayRecordings = storedFiles.filter(f => f.type === 'audio' && new Date(f.date).toISOString().slice(0, 10) === today);
                        if (todayRecordings.length > 0) {
                            const recordingTitles = todayRecordings.map(r => `"${r.title}"`).join(', ');
                            summaryParts.push(`Диктофон: Сегодня сделано ${todayRecordings.length} записей. Темы: ${recordingTitles}.`);
                        } else {
                            summaryParts.push("Диктофон: Сегодня не было записей.");
                        }
                    } catch (e) { console.error("Error summarizing dictaphone:", e); }

                    // 4. Chat Summary
                    try {
                        const todayMessages = transcriptHistory.filter(msg => msg.timestamp && new Date(msg.timestamp).toISOString().slice(0, 10) === today && msg.type !== 'error');
                        if (todayMessages.length > 1) { // Only summarize if there's a conversation
                            const chatTextForSummary = todayMessages.map(msg => `${msg.author}: ${msg.text}`).join('\n');
                            const summaryPrompt = `Кратко, в одном-двух предложениях на русском языке, подведи итог этого диалога:\n\n---\n${chatTextForSummary}\n---`;
                            // Call Gemini to summarize, using an empty history to not pollute the context
                            const summaryResponse = await sendTextMessage(summaryPrompt, []);
                            if (summaryResponse.text) {
                                summaryParts.push(`Общение: ${summaryResponse.text}`);
                            }
                        } else {
                            summaryParts.push("Общение: Сегодня мы почти не общались.");
                        }
                    } catch (e) { console.error("Error summarizing chat:", e); }

                    if (summaryParts.length > 0) {
                        resultText = `Вот итоги сегодняшнего дня:\n\n- ${summaryParts.join('\n- ')}`;
                    } else {
                        resultText = "Не удалось собрать информацию для подведения итогов дня.";
                    }
                    break;
                }
                case 'clearChatHistory':
                    setTranscriptHistory([]);
                    currentChatLogIdRef.current = null; // Next message will start a new session
                    resultText = 'Начинаем новый чат. Предыдущая беседа сохранена.';
                    break;
                case 'clearAllRecordings': {
                    const audioFiles = storedFiles.filter(f => f.type === 'audio');
                    for (const file of audioFiles) {
                        await deleteFile(file.id);
                    }
                    await loadFiles();
                    resultText = 'Все аудиозаписи были удалены.';
                    break;
                }
                case 'startDictaphoneRecording':
                    setActiveView('dictaphone');
                    if (isChatCollapsed) {
                        onExpandChat();
                    }
                    // Disconnect the main assistant microphone to prevent interference
                    isIntentionalDisconnectRef.current = true;
                    await disconnect(true); 
                    
                    const success = await dictaphoneRef.current?.startRecording();
                    if (success) {
                        resultText = 'Запись начата. Ассистент в режиме тишины. Используйте диктофон, чтобы остановить.';
                    } else {
                        resultText = "Не удалось начать запись. Микрофон может быть недоступен.";
                    }
                    break;
                case 'stopDictaphoneRecording':
                    if (isDictaphoneRecordingRef.current) {
                        dictaphoneRef.current?.stopRecording();
                        resultText = 'Запись остановлена.';
                    } else {
                        resultText = 'Никакая запись в данный момент не ведется.';
                    }
                    break;
                case 'readDictaphoneTranscript': {
                    const file = storedFiles.find(f => f.name === fc.args.filename);
                    if (file?.transcript) {
                        resultText = `Транскрипция записи: ${file.transcript}`;
                    } else {
                        resultText = `Не удалось найти транскрипцию для файла "${fc.args.filename}".`;
                    }
                    break;
                }
                 case 'getDictaphoneTranscriptContent': {
                    const file = storedFiles.find(f => f.name === fc.args.filename);
                    if (file?.transcript) {
                        resultText = `[CONTEXT] The content of the requested recording is: "${file.transcript}"`;
                    } else {
                        resultText = `[CONTEXT] I could not find a recording with the filename "${fc.args.filename}".`;
                    }
                    break;
                }
                case 'playDictaphoneRecording':
                    setActiveView('dictaphone');
                    if (isChatCollapsed) onExpandChat();
                    await dictaphoneRef.current?.playRecordingByFileName(fc.args.filename);
                    resultText = 'Воспроизвожу запись.';
                    break;
                case 'pauseDictaphonePlayback':
                    dictaphoneRef.current?.pausePlayback();
                    resultText = 'Воспроизведение приостановлено.';
                    break;
                case 'stopDictaphonePlayback':
                    dictaphoneRef.current?.stopPlayback();
                    resultText = 'Воспроизведение остановлено.';
                    break;
                case 'setPlaybackSpeed':
                    const speed = fc.args.speed;
                    if (typeof speed === 'number') {
                        dictaphoneRef.current?.setPlaybackSpeed(speed);
                        resultText = `Скорость воспроизведения установлена на ${speed}x.`;
                    } else {
                        resultText = `Указана неверная скорость.`;
                    }
                    break;
                case 'searchDictaphoneRecordings':
                    const query = fc.args.query;
                    if (typeof query === 'string') {
                        setActiveView('dictaphone');
                        if (isChatCollapsed) onExpandChat();
                        dictaphoneRef.current?.setSearchTerm(query);
                        resultText = `Результаты поиска для "${query}" отображены в диктофоне.`;
                    } else {
                        resultText = 'Не удалось выполнить поиск: не указан поисковый запрос.';
                    }
                    break;
                case 'getInformationFromUrl':
                    const url = fc.args.url;
                    if (typeof url === 'string' && url) {
                        const response = await sendTextMessage(`Please provide a concise summary of the content at: ${url}`, transcriptHistory);
                        resultText = response.text || "I was unable to retrieve information from that URL.";
                    } else {
                        resultText = "Failed: A valid URL was not provided.";
                    }
                    break;
                case 'navigateToLink':
                    const navUrl = fc.args.url;
                    if (typeof navUrl === 'string' && navUrl) {
                        if (navUrl.startsWith('http://') || navUrl.startsWith('https://')) {
                            new URL(navUrl); // Validate URL
                            window.open(navUrl, '_blank', 'noopener,noreferrer');
                            resultText = `Successfully opened ${navUrl}.`;
                        } else {
                            resultText = `Failed: The URL "${navUrl}" must start with http:// or https://.`;
                        }
                    } else {
                        resultText = 'Failed: URL was not provided or invalid.';
                    }
                    break;
                case 'stopConversation':
                    resultText = "Микрофон выключен.";
                    isIntentionalDisconnectRef.current = true;
                    await synthesizeSpeech("Отключаюсь.");
                    await disconnect();
                    break;
                case 'endSession':
                    resultText = "Завершаю сеанс.";
                    isIntentionalDisconnectRef.current = true;
                    handleCollapse();
                    await synthesizeSpeech("До свидания.");
                    await disconnect();
                    break;
                default:
                    console.warn(`Unknown function call received: ${fc.name}`);
                    resultText = `Unknown function: ${fc.name}`;
            }
        } catch (e) {
            console.error(`Error executing function call ${fc.name}:`, e);
            resultText = `Error executing function ${fc.name}.`;
        }
        return resultText;
    }, [onExpandChat, handleCollapse, disconnect, transcriptHistory, isChatCollapsed, financeData, setFinanceData, findTransaction, recalculateBalances, plannerContent, setPlannerContent, playPageTurnSound, activeView, notes, setNotes, contacts, setContacts, calendarEvents, setCalendarEvents, setOrganizerInitialState, loadInstructions, setVoiceSettings, attachedFile, loadFiles, storedFiles, handleRemoveFile, setAlarms, alarms, activeAlarm, synthesizeSpeech, playAudio]);

    useEffect(() => {
        executeFunctionCallRef.current = executeFunctionCall;
    }, [executeFunctionCall]);
  
  const handleMicClick = async () => {
     if (isConnected) {
        isIntentionalDisconnectRef.current = true;
        await disconnect();
     } else if (!isDictaphoneRecording) {
        if(outputAudioContextRef.current?.state === 'suspended') {
            await outputAudioContextRef.current.resume();
        }
        retryAttemptRef.current = 0;
        if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
        connect();
     }
  };

  const playAlarmSound = useCallback(async () => {
    if (alarmAudioSourceRef.current) return;
    if (!outputAudioContextRef.current || outputAudioContextRef.current.state === 'closed') {
        const WebkitAudioContext = (window as any).webkitAudioContext;
        outputAudioContextRef.current = new (window.AudioContext || WebkitAudioContext)({ sampleRate: 44100 });
    }
    const audioCtx = outputAudioContextRef.current;
     if (audioCtx.state === 'suspended') {
        await audioCtx.resume();
    }
    
    const osc = audioCtx.createOscillator();
    const gainNode = audioCtx.createGain();
    osc.connect(gainNode);
    gainNode.connect(audioCtx.destination);

    osc.type = 'sine';
    osc.frequency.setValueAtTime(880, audioCtx.currentTime); // A5
    osc.frequency.setValueAtTime(1046.50, audioCtx.currentTime + 0.1); // C6
    
    gainNode.gain.setValueAtTime(0.3, audioCtx.currentTime);
    gainNode.gain.exponentialRampToValueAtTime(0.0001, audioCtx.currentTime + 0.4);

    osc.loop = true;
    osc.start();
    alarmAudioSourceRef.current = osc;
  }, []);

  // Effect for checking alarms
  useEffect(() => {
    const interval = setInterval(() => {
        if (activeAlarm) return; // Don't check for new alarms if one is already ringing

        const now = new Date();
        const currentTime = now.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
        
        // Reset the triggered list every new minute
        if (now.getSeconds() === 0) {
            triggeredAlarmsThisMinuteRef.current.clear();
        }

        const dueAlarms = alarms.filter(alarm => 
            alarm.enabled && 
            alarm.time === currentTime &&
            !triggeredAlarmsThisMinuteRef.current.has(alarm.id)
        );

        if (dueAlarms.length > 0) {
            const alarmToTrigger = dueAlarms[0];
            setActiveAlarm(alarmToTrigger);
            triggeredAlarmsThisMinuteRef.current.add(alarmToTrigger.id);

            const message = `Ваш будильник на ${alarmToTrigger.time} сработал: "${alarmToTrigger.label}"`;
            setTranscriptHistory(prev => [...prev, { id: Date.now().toString(), author: 'assistant', text: message, type: 'alarm', timestamp: Date.now() }]);
            
            playAlarmSound();
            synthesizeSpeech(message).then(playAudio);
        }

    }, 1000); // Check every second

    return () => clearInterval(interval);
  }, [alarms, activeAlarm, playAlarmSound, synthesizeSpeech, playAudio]);

  const handleSendText = async (messageOverride?: string) => {
    const textToSend = messageOverride || inputText.trim();
    const fileContentToSend = attachedFileContent;

    if (!textToSend && !fileContentToSend) return;
    
    if (!navigator.onLine) {
        setTranscriptHistory(prev => [...prev, {
            id: Date.now().toString(),
            author: 'assistant',
            text: 'Вы оффлайн. Не могу отправить сообщение.',
            type: 'error',
            timestamp: Date.now()
        }]);
        setStatus('Вы оффлайн. Проверьте интернет-соединение.');
        return;
    }

    // Add user message to history only if it's not a file action
    if (!messageOverride) {
        setTranscriptHistory(prev => [
            ...prev, 
            { id: Date.now().toString(), author: 'user', text: textToSend, type: 'message', timestamp: Date.now() }
        ]);
    }
    
    setInputText('');
    userScrolledUpRef.current = false;
    
    setStatus('Искра думает...');

    try {
        const messageForApi = textToSend.trim();
        const response = await sendTextMessage(messageForApi, transcriptHistory, fileContentToSend);
        
        // After getting a response that uses the file, clear it from the input.
        if (fileContentToSend) {
            handleRemoveFile();
        }

        if (response.text) {
             setTranscriptHistory(prev => {
                const newItem = { 
                    id: Date.now().toString() + 'a', 
                    author: 'assistant' as const, 
                    text: response.text,
                    sources: response.sources,
                    type: 'message' as const,
                    timestamp: Date.now()
                };
                return [...prev, newItem];
             });

            setStatus('Синтез речи...');
            const audioBytes = await synthesizeSpeech(response.text);
            await playAudio(audioBytes);
        }
        
        if (response.functionCalls && response.functionCalls.length > 0) {
            setStatus('Выполнение команды...');
            for (const fc of response.functionCalls) {
                const resultText = await executeFunctionCall(fc);
                // Optionally add function call results to transcript for clarity
                 if (resultText !== 'ok' && resultText && !resultText.startsWith('[CONTEXT]')) {
                     setTranscriptHistory(prev => [
                         ...prev, 
                         { 
                             id: Date.now().toString() + 'fc', 
                             author: 'assistant', 
                             text: resultText,
                             type: 'message',
                             timestamp: Date.now()
                         }
                     ]);
                     const audioBytes = await synthesizeSpeech(resultText);
                     await playAudio(audioBytes);
                 }
            }
        }
        
        setStatus('Нажмите на микрофон или введите сообщение');

    } catch (error) {
        console.error('Error in text-to-speech flow:', error);
        setStatus('Ошибка при отправке или озвучивании сообщения.');
    }
  };

  const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      handleSendText();
    }
  };

  const handleScroll = () => {
    const container = chatContainerRef.current;
    if (container) {
      const { scrollTop, scrollHeight, clientHeight } = container;
      const isAtBottom = scrollHeight - scrollTop - clientHeight < 10;
      userScrolledUpRef.current = !isAtBottom;
    }
  };
  
  const handleAttachFileClick = () => {
    fileInputRef.current?.click();
  };
  
  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    handleRemoveFile(); 
    setStatus('Читаю и сохраняю файл...');

    try {
        const extension = file.name.split('.').pop()?.toLowerCase();
        let textContent = '';
        
        const isReadableText = ['txt', 'md', 'csv'].includes(extension || '');
        const isDocx = extension === 'docx';
        const isPdf = extension === 'pdf';
        
        if (isPdf) {
            const arrayBuffer = await file.arrayBuffer();
            const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
            let fullText = '';
            for (let i = 1; i <= pdf.numPages; i++) {
                const page = await pdf.getPage(i);
                const text = await page.getTextContent();
                fullText += text.items.map((item: any) => item.str).join(' ');
            }
            textContent = fullText;
        } else if (isDocx) {
            const arrayBuffer = await file.arrayBuffer();
            const result = await mammoth.extractRawText({ arrayBuffer });
            textContent = result.value;
        } else if (isReadableText) {
            textContent = await file.text();
        } 
        
        // --- AUTO-SAVE LOGIC ---
        let fileType: StoredFile['type'] = 'other';
        if (isReadableText || isDocx) fileType = 'text';
        if (isPdf) fileType = 'pdf';
        if (file.type.startsWith('audio/')) fileType = 'audio';
        if (file.type.startsWith('video/')) fileType = 'video';
        if (isDocx) fileType = 'docx';

        const newFileToSave: Omit<StoredFile, 'id'> = {
            name: file.name,
            type: fileType,
            size: file.size,
            date: Date.now(),
            content: file,
        };

        let savedFileId: number;
        try {
            savedFileId = await addFile(newFileToSave);
            await loadFiles();
        } catch(e: any) {
             if (e.message.includes("уже существует")) {
                const existingFile = storedFiles.find(f => f.name === newFileToSave.name);
                savedFileId = existingFile!.id;
            } else {
                throw e; // Re-throw other errors
            }
        }

        // Set file state for sending with next message
        setAttachedFile(file);
        setAttachedFileContent(textContent);
        
        // Add file reference to chat
        setTranscriptHistory(prev => [...prev, {
            id: Date.now().toString(),
            author: 'user',
            text: `Uploaded file: ${file.name}`,
            type: 'file',
            timestamp: Date.now(),
            fileReference: {
                id: savedFileId,
                name: file.name,
                type: fileType,
            }
        }]);

        const question = `Вы загрузили файл «${file.name}». Что это за документ и что мне с ним сделать?`;
        setTranscriptHistory(prev => [...prev, {
             id: Date.now().toString() + 'q',
             author: 'assistant',
             text: question,
             type: 'message',
             timestamp: Date.now()
        }]);
        synthesizeSpeech(question).then(playAudio);

    } catch (error) {
        console.error("Error processing file:", error);
        const errorMessage = error instanceof Error ? error.message : 'Не удалось прочитать файл.';
        setTranscriptHistory(prev => [...prev, {
            id: Date.now().toString(),
            author: 'assistant',
            text: errorMessage,
            type: 'error',
            timestamp: Date.now()
        }]);
        handleRemoveFile();
        setStatus('Ошибка при чтении файла. Попробуйте еще раз.');
    } finally {
        if (fileInputRef.current) {
            fileInputRef.current.value = '';
        }
    }
  };

  useEffect(() => {
    if (!userScrolledUpRef.current && !isChatCollapsed && activeView === 'chat') {
        chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }
  }, [transcriptHistory, isChatCollapsed, activeView]);
  
  const handleTabClick = (view: View) => {
    if (isChatCollapsed) {
      playPageTurnSound();
      setActiveView(view);
      onExpandChat();
    } else {
      if (activeView === view) {
        handleCollapse();
      } else {
        playPageTurnSound();
        setActiveView(view);
      }
    }
     setHighlightedFileId(null); // Clear highlight when switching tabs
  };

  const CONTROLS_AREA_HEIGHT_NUM = 11;
  const TAB_BAR_HEIGHT_NUM = 3.5; 
  
  const CONTROLS_AREA_HEIGHT = `${CONTROLS_AREA_HEIGHT_NUM}rem`;
  const EXPANDED_TOP_OFFSET = '8rem';
  const PANEL_BOTTOM_OFFSET = `calc(1.5rem + ${CONTROLS_AREA_HEIGHT})`;
  // Calculate how much the panel needs to move down to be "collapsed"
  const panelHeightStyle = `calc(100vh - ${EXPANDED_TOP_OFFSET} - ${PANEL_BOTTOM_OFFSET})`;
  const collapsedTransformY = `calc(${panelHeightStyle} - ${TAB_BAR_HEIGHT_NUM}rem)`;


  return (
    <>
      {/* --- CHAT/TOOL PANEL (ANIMATED) --- */}
      <div 
        className={`fixed left-6 right-6 transition-transform duration-700 ease-in-out`}
        style={{ 
            top: EXPANDED_TOP_OFFSET, 
            bottom: PANEL_BOTTOM_OFFSET,
            transform: isChatCollapsed ? `translateY(${collapsedTransformY})` : 'translateY(0)',
        }}
        aria-hidden={isChatCollapsed}
      >
        <div className="h-full w-full flex flex-col">
            {/* --- TAB BAR (ICONS) --- */}
            <div className="flex-shrink-0 h-12 flex justify-end items-center px-4">
                {TABS.map((tab) => (
                    <button
                      key={tab.view}
                      onClick={() => handleTabClick(tab.view)}
                      title={tab.title}
                      className={`relative h-10 w-14 flex items-center justify-center cursor-pointer group transition-all duration-300 text-white ${
                        activeView === tab.view && !isChatCollapsed
                          ? 'opacity-100' // Make active tab fully visible
                          : 'opacity-60 hover:opacity-100'
                      }`}
                       style={{ 
                          clipPath: isChatCollapsed ? 'none' : 'polygon(0 100%, 0 0, 100% 0, 100% 100%, 80% 100%, 70% 90%, 30% 90%, 20% 100%)'
                       }}
                    >
                      {tab.icon}
                    </button>
                ))}
            </div>

            {/* --- CONTENT WINDOW --- */}
            <div className={`
              flex-1 bg-black/30 backdrop-blur-sm shadow-xl border border-white/10 rounded-xl overflow-hidden
            `}>
                <div className={`
                  h-full w-full
                  transition-[clip-path,opacity] ease-in-out
                  ${isChatCollapsed || isClosing 
                      ? 'duration-500 [clip-path:inset(0_0_100%_0)] opacity-0' 
                      : 'duration-300 delay-200 [clip-path:inset(0_0_0_0)] opacity-100'
                  }`
                }>
                  <div key={activeView} className="h-full flex flex-col animate-fade-in">
                    {activeView === 'chat' && (
                      <div className="h-full p-4 sm:p-6 flex flex-col">
                        <div ref={chatContainerRef} onScroll={handleScroll} className="overflow-y-auto pr-2 space-y-2 flex-1 pb-4">
                          {(() => {
                            let lastDateString: string | null = null;
                            return transcriptHistory.map((item) => {
                              let dateSeparator: React.ReactNode = null;
                              if (item.timestamp) {
                                  const messageDate = new Date(item.timestamp);
                                  const currentDateString = messageDate.toLocaleDateString('ru-RU', {
                                      day: '2-digit',
                                      month: '2-digit',
                                      year: 'numeric'
                                  });
                                  if (currentDateString !== lastDateString) {
                                      dateSeparator = (
                                          <div key={`sep-${item.id}`} className="flex items-center justify-center my-4">
                                              <span className="px-3 py-1 bg-gray-700/80 text-gray-300 text-xs font-semibold rounded-full">
                                                  {currentDateString}
                                              </span>
                                          </div>
                                      );
                                      lastDateString = currentDateString;
                                  }
                              }
                              
                              let messageContent;
                              if (item.type === 'error' || item.type === 'alarm') {
                                  const isAlarm = item.type === 'alarm';
                                  messageContent = (
                                      <div className={`bg-black/80 border ${isAlarm ? 'border-blue-500' : 'border-yellow-500'} rounded-lg p-3 flex items-start gap-3 my-2 text-sm text-gray-200`}>
                                          <div className="flex-shrink-0 w-5 h-5 bg-black rounded-sm flex items-center justify-center mt-0.5">
                                             {isAlarm ? (
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm1-12a1 1 0 10-2 0v4a1 1 0 00.293.707l2.828 2.829a1 1 0 101.414-1.415L11 9.586V6z" clipRule="evenodd" /></svg>
                                             ) : (
                                              <svg viewBox="0 0 24 24" className="w-5 h-5" aria-hidden="true">
                                                  <path fill="#EF4444" d="M12 2L1 21h22L12 2z"></path>
                                                  <path fill="white" d="M13 16h-2v-6h2v6zm0 4h-2v-2h2v2z" transform="translate(0 -2)"></path>
                                              </svg>
                                             )}
                                          </div>
                                          <p className="flex-1">{item.text}</p>
                                          {isAlarm && (
                                            <button 
                                                onClick={() => executeFunctionCall({ name: 'stopAlarm', args: {} })}
                                                className="bg-blue-600 hover:bg-blue-500 text-white px-3 py-1 rounded-md text-xs font-semibold"
                                            >
                                                Выключить
                                            </button>
                                          )}
                                      </div>
                                  );
                              } else if (item.type === 'file' && item.fileReference) {
                                messageContent = (
                                    <div className="flex flex-col w-full items-start">
                                        <button 
                                            onClick={() => {
                                                setActiveView('storage');
                                                setHighlightedFileId(item.fileReference!.id);
                                            }}
                                            className="max-w-lg w-auto bg-gray-700/80 p-2.5 rounded-xl flex items-center gap-3 hover:bg-gray-600/80 transition-colors"
                                        >
                                            {/* File Icon */}
                                            <div className="flex-shrink-0 w-6 h-6 text-cyan-300">
                                                {item.fileReference.type === 'pdf' ? <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0 -1.1-.9-2-2-2z"/></svg> :
                                                 item.fileReference.type === 'audio' ? <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/></svg> :
                                                 item.fileReference.type === 'video' ? <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg> :
                                                 <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6z"/></svg>
                                                }
                                            </div>
                                            <span className="font-medium text-gray-200" title={item.fileReference.name}>
                                                {truncateFileName(item.fileReference.name)}
                                            </span>
                                        </button>
                                    </div>
                                );
                              } else { // 'message'
                                  messageContent = (
                                    <div className={`flex flex-col w-full ${item.author === 'user' ? 'items-end' : 'items-start'}`}>
                                        <div className="max-w-lg">
                                            <div className={`p-3 rounded-xl flex flex-col ${item.author === 'user' ? 'bg-cyan-600/80' : 'bg-gray-700/80'}`}>
                                                <p className="whitespace-pre-wrap">{item.text}</p>
                                                {item.timestamp && (
                                                    <div className={`text-xs text-gray-200/70 mt-1.5 ${item.author === 'user' ? 'text-right' : 'text-left'}`}>
                                                        {new Date(item.timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                                    </div>
                                                )}
                                            </div>
            
                                            {item.author === 'assistant' && item.sources && item.sources.length > 0 && (
                                                <div className="mt-2 flex items-center gap-x-4 gap-y-2 flex-wrap max-w-lg">
                                                    <span className="text-xs text-gray-400">Источники:</span>
                                                    {item.sources.map((source, index) => {
                                                        let siteName = source.title || source.uri;
                                                        try {
                                                            const hostname = new URL(source.uri).hostname.replace(/^www\./, '');
                                                            siteName = source.title && source.title.length < 60 ? source.title : hostname;
                                                        } catch (e) {
                                                            siteName = source.uri.length > 30 ? source.uri.substring(0, 27) + '...' : source.uri;
                                                        }
                                                        return (
                                                            <a
                                                                key={index}
                                                                href={source.uri}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="text-cyan-400 hover:text-cyan-300 text-xs underline decoration-dotted underline-offset-2 transition-colors duration-200"
                                                                title={source.uri}
                                                            >
                                                                {siteName}
                                                            </a>
                                                        );
                                                    })}
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                  );
                              }
                              
                              return (
                                <React.Fragment key={item.id}>
                                  {dateSeparator}
                                  {messageContent}
                                </React.Fragment>
                              );
                            });
                          })()}
                          <div ref={chatEndRef} />
                        </div>
                      </div>
                    )}
                    {activeView === 'dictaphone' && (
                      <Dictaphone 
                        ref={dictaphoneRef} 
                        onRecordingStateChange={setIsDictaphoneRecording}
                        audioFiles={storedFiles.filter(f => f.type === 'audio')}
                        onAddFile={async (file) => {
                            await addFile(file);
                            await loadFiles();
                        }}
                        onDeleteFile={async (id) => {
                            await deleteFile(id);
                            await loadFiles();
                        }}
                        onClearAudioFiles={async () => {
                            const audioFiles = storedFiles.filter(f => f.type === 'audio');
                            for (const file of audioFiles) {
                                await deleteFile(file.id);
                            }
                            await loadFiles();
                        }}
                      />
                    )}
                     {activeView === 'finance' && (
                      <Finance 
                        financeData={financeData}
                        setFinanceData={setFinanceData}
                        searchTerm={financeSearchTerm}
                        setSearchTerm={setFinanceSearchTerm}
                        dailySpendingAllowance={dailySpendingAllowance}
                        setDailySpendingAllowance={setDailySpendingAllowance}
                      />
                    )}
                    {activeView === 'organizer' && (
                      <Organizer
                        plannerContent={plannerContent}
                        setPlannerContent={setPlannerContent}
                        notes={notes}
                        setNotes={setNotes}
                        contacts={contacts}
                        setContacts={setContacts}
                        calendarEvents={calendarEvents}
                        setCalendarEvents={setCalendarEvents}
                        userInstructions={userInstructions}
                        onAddInstruction={async (text) => {
                            await addInstruction({ text, creationDate: Date.now() });
                            await loadInstructions();
                        }}
                        onDeleteInstruction={async (id) => {
                            await deleteInstructionById(id);
                            await loadInstructions();
                        }}
                        playPageTurnSound={playPageTurnSound}
                        organizerInitialState={organizerInitialState}
                        onStateHandled={() => setOrganizerInitialState(null)}
                      />
                    )}
                    {activeView === 'storage' && (
                        <FileStorage
                            files={storedFiles}
                            highlightedFileId={highlightedFileId}
                            onReadFile={async (file) => {
                                try {
                                    const content = await file.content.text();
                                    handleRemoveFile(); // Clear any previous file
                                    setAttachedFile(new File([file.content], file.name, { type: file.content.type }));
                                    setAttachedFileContent(content);
                                    setActiveView('chat');
                                     // Give a moment for the view to switch
                                    setTimeout(() => {
                                        handleSendText(`Прочитай и кратко перескажи содержимое файла ${file.name}`);
                                    }, 100);
                                } catch (e) {
                                    console.error("Failed to read file for chat:", e);
                                    setStatus('Не удалось прочитать этот файл.');
                                }
                            }}
                            onDeleteFile={async (id) => {
                                await deleteFile(id);
                                await loadFiles();
                            }}
                        />
                    )}
                    {activeView === 'toolbox' && (
                        <Toolbox
                            alarms={alarms}
                            setAlarms={setAlarms}
                        />
                    )}
                    {activeView === 'assistant-config' && <AssistantConfig />}
                  </div>
                </div>
            </div>
        </div>
      </div>
      
      {/* --- CONTROLS (FIXED, ON TOP) --- */}
      <div 
        className="fixed bottom-6 left-6 right-6 z-30"
        style={{ height: CONTROLS_AREA_HEIGHT }}
      >
        <div className="w-full h-full flex flex-col justify-end items-center">
        
            {attachedFile && (
                <div className="w-full max-w-lg animate-fade-in mb-6">
                    <div className="bg-gray-800/60 border border-white/10 rounded-lg p-2 flex items-center justify-between text-sm">
                        <div className="flex items-center gap-2 text-gray-300 truncate">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 flex-shrink-0 text-cyan-400" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4 4a2 2 0 012-2h4.586A2 2 0 0112 2.586L15.414 6A2 2 0 0116 7.414V16a2 2 0 01-2-2H6a2 2 0 01-2-2V4zm2 6a1 1 0 011-1h6a1 1 0 110 2H7a1 1 0 01-1-1zm1 3a1 1 0 100 2h6a1 1 0 100-2H7z" clipRule="evenodd" />
                            </svg>
                            <span className="truncate" title={attachedFile.name}>{attachedFile.name}</span>
                        </div>
                        <button onClick={handleRemoveFile} className="p-1 rounded-full text-gray-400 hover:bg-white/10 hover:text-white transition-colors">
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.607a1 1 0 010-1.414z" clipRule="evenodd" />
                            </svg>
                        </button>
                    </div>
                </div>
            )}

            <div className="w-full flex items-center space-x-2 h-14 mb-6">
              <button
                  onClick={handleMicClick}
                  disabled={isConnecting || isDictaphoneRecording}
                  className={`flex-shrink-0 w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ease-in-out shadow-lg focus:outline-none disabled:cursor-not-allowed`}
                  aria-label={isConnecting ? 'Connecting...' : !isConnected ? 'Start conversation' : 'Stop conversation'}
              >
                  <div className={`w-full h-full p-0.5 rounded-full transition-colors duration-300
                      ${isConnecting ? 'bg-yellow-500 animate-subtle-pulse' : ''}
                      ${isDictaphoneRecording ? 'bg-gray-700' : ''}
                      ${isConnected ? 'bg-cyan-600' : 'bg-gray-600 hover:bg-gray-500'}
                  `}>
                      <div className="w-full h-full rounded-full flex items-center justify-center bg-gray-800">
                          {isConnecting ? (
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-yellow-200" viewBox="0 0 24 24" fill="currentColor">
                                 <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/>
                             </svg>
                          ) : isConnected ? (
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-cyan-400" viewBox="0 0 24 24" fill="currentColor">
                                 <path d="M12 14c1.66 0 2.99-1.34 2.99-3L15 5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm5.3-3c0 3-2.54 5.1-5.3 5.1S6.7 14 6.7 11H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c3.28-.49 6-3.31 6-6.72h-1.7z"/>
                             </svg>
                          ) : (
                             <svg xmlns="http://www.w3.org/2000/svg" className="h-7 w-7 text-gray-400" viewBox="0 0 24 24" fill="currentColor">
                                 <path d="M19 11h-1.7c0 .74-.16 1.43-.43 2.05l1.23 1.23c.56-.98.9-2.09.9-3.28zm-4.02.17c0-.06.02-.11.02-.17V5c0-1.66-1.34-3-3-3S9 3.34 9 5v.18l5.98 5.99zM4.27 3L3 4.27l6.01 6.01V11c0 1.66 1.33 3 2.99 3 .22 0 .44-.03.65-.08l1.66 1.66c-.71.33-1.5.52-2.31.52-2.76 0-5.3-2.1-5.3-5.1H5c0 3.41 2.72 6.23 6 6.72V21h2v-3.28c.91-.13 1.77-.45 2.55-.9l4.2 4.2L21 21.73 4.27 3z"/>
                             </svg>
                          )}
                      </div>
                  </div>
              </button>
              <div className="relative flex-grow h-full">
                <input type="file" ref={fileInputRef} onChange={handleFileChange} className="hidden" accept=".txt,.md,.csv,.docx,.pdf,video/mp4,video/webm,video/quicktime,audio/*"/>
                <input 
                    type="text"
                    value={inputText}
                    onChange={(e) => setInputText(e.target.value)}
                    onKeyDown={handleInputKeyDown}
                    placeholder={isDictaphoneRecording ? "Запись диктофона активна..." : "Спросите что-нибудь..."}
                    disabled={isDictaphoneRecording}
                    className="w-full h-full pl-5 pr-14 bg-black/30 border border-white/20 rounded-full text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-shadow duration-300 disabled:opacity-50"
                />
                 <button
                    onClick={handleAttachFileClick}
                    disabled={isDictaphoneRecording}
                    className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 hover:text-white transition-colors disabled:opacity-50"
                    aria-label="Прикрепить файл"
                    title="Прикрепить файл"
                >
                    <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                    </svg>
                </button>
              </div>
              {(inputText || attachedFile) && (
                  <button 
                      onClick={() => handleSendText()}
                      className="flex-shrink-0 w-14 h-14 bg-cyan-500 hover:bg-cyan-600 text-white rounded-full flex items-center justify-center transition-colors duration-300"
                      aria-label="Send message"
                  >
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 24 24" fill="currentColor"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
                  </button>
              )}
            </div>
            
            <p className="text-gray-400 text-sm h-5 text-center">{status}</p>

        </div>
      </div>
    </>
  );
};

export default Dashboard;