import { GoogleGenAI, Type, LiveServerMessage, Modality, GenerateContentResponse } from "@google/genai";
import { TranscriptItem, Source } from "../types";
import { addCacheEntry, getCacheEntry, getAllInstructions } from './db';
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


// Lazily initialize the AI instance to ensure API_KEY is present before use.
let ai: GoogleGenAI | null = null;
export const getAi = (): GoogleGenAI => {
    if (!ai) {
        // FIX: Adhering to @google/genai guidelines to use process.env.API_KEY directly.
        // App.tsx handles the user-facing error message if the key is missing.
        ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    }
    return ai;
};


// --- Robust API Retry Logic ---

const RETRIABLE_STATUSES = ['RESOURCE_EXHAUSTED', '429'];
const RETRIABLE_MESSAGES = ['the service is currently unavailable', 'network error'];

const isRetriableError = (error: any): boolean => {
    const errorMessage = (error.message || '').toLowerCase();
    
    // Check for explicit status in error object (sometimes available)
    const errorStatus = (error.status || '').toUpperCase();
    if (RETRIABLE_STATUSES.some(status => errorStatus.includes(status))) {
        return true;
    }
    
    // Check for status codes or keywords in the message string
    if (RETRIABLE_STATUSES.some(status => errorMessage.includes(status.toLowerCase()))) {
        return true;
    }

    if (RETRIABLE_MESSAGES.some(msg => errorMessage.includes(msg.toLowerCase()))) {
        return true;
    }
    return false;
};

export const apiCallWithRetry = async <T>(apiCall: () => Promise<T>, retries = 3, delay = 2000): Promise<T> => {
    try {
        return await apiCall();
    } catch (error) {
        if (isRetriableError(error) && retries > 0) {
            console.warn(`API call failed with retriable error. Retrying in ${delay / 1000}s... (${retries} retries left)`);
            await new Promise(res => setTimeout(res, delay));
            return apiCallWithRetry(apiCall, retries - 1, delay * 2); // Exponential backoff
        }
        throw error;
    }
};

export const summarizeTranscript = async (transcript: string): Promise<{ title: string; description: string }> => {
  if (!transcript.trim()) {
    return { title: 'Тихая запись', description: 'Речь не была обнаружена в этой аудиозаписи.' };
  }
  try {
    const response: GenerateContentResponse = await apiCallWithRetry(() => getAi().models.generateContent({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: "You are a text summarization expert. Your task is to generate a concise, relevant title (max 5 words) and a brief, neutral description (max 1-2 sentences) for the given audio transcript. Respond ONLY with a JSON object containing 'title' and 'description' keys. The response must be in Russian.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            title: { type: Type.STRING, description: "A short title (max 5 words) in Russian." },
            description: { type: Type.STRING, description: "A brief summary (1-2 sentences) in Russian." }
          },
          required: ["title", "description"]
        }
      },
      contents: `Generate a Russian title and description for this transcript:\n\n---\n${transcript}\n---`
    }));
    const jsonText = (response.text || '').trim();
    const result = JSON.parse(jsonText);
    return { title: result.title, description: result.description };
  } catch (error) {
    console.error("Error summarizing transcript:", error);
    return { title: 'Запись без названия', description: 'Не удалось сгенерировать описание для этой записи.' };
  }
};


export const sendTextMessage = async (
    message: string, 
    history: TranscriptItem[], 
    fileContent?: string
): Promise<{ text: string; sources: Source[]; functionCalls: any[] }> => {
    try {
        // Disable caching for requests with files to ensure fresh analysis
        if (!fileContent) {
            const cached = await getCacheEntry(message);
            if (cached) {
                console.log("Returning cached response for:", message);
                return { text: cached.text, sources: cached.sources, functionCalls: [] };
            }
        }
        
        // Fetch user instructions to prepend to the system prompt
        const userInstructions = await getAllInstructions();
        let instructionBlock = '';
        if (userInstructions.length > 0) {
            const instructionsText = userInstructions.map(instr => `- ${instr.text}`).join('\n');
            instructionBlock = `--- CRITICAL USER-DEFINED RULES (MUST FOLLOW) ---\n${instructionsText}\n--- END OF USER RULES ---\n\n`;
        }

        const systemInstruction = `${instructionBlock}You are Iskra, a friendly and helpful AI assistant.
CRITICAL RULE: Your most important task is to maintain conversation continuity. Your response must be directly informed by the preceding context. Acknowledge and use the user's previous statements to provide relevant answers.
- Your responses should be concise and to the point.
- Do not introduce yourself unless specifically asked.
- Do not announce the actions you are taking (e.g., "Searching the web..."). Just perform the action and provide the result.
- Avoid using the user's name frequently.
You can control the application UI using the provided functions. You can search the web for up-to-date information; if you do, you MUST cite your sources. You can also retrieve and analyze the content of saved audio recordings using the provided functions to answer questions about them. After providing an answer based on a search, proactively offer to open the source link for the user.`;

        // Create the multi-turn contents array from history
        const contents = history
            .filter(item => item.type === 'message' || item.type === 'file') // Only include message/file types for context
            .map(item => {
                let text = item.text;
                if (item.type === 'file' && item.fileReference) {
                    text = `[User has uploaded a file: ${item.fileReference.name}]`;
                }
                if (item.author === 'assistant' && item.sources && item.sources.length > 0) {
                    const sourceText = item.sources.map((source, index) => `[${index + 1}] ${source.title} (${source.uri})`).join('\n');
                    text += `\nSources:\n${sourceText}`;
                }
                return {
                    role: item.author === 'user' ? 'user' : 'model',
                    parts: [{ text: text }]
                };
            });
        
        // Add the current user message, potentially with file content
        if (fileContent) {
            contents.push({
                role: 'user',
                parts: [{ text: `Please use the following document to answer my question.\n\n--- DOCUMENT START ---\n${fileContent}\n--- DOCUMENT END ---\n\nUser Question: ${message}` }]
            });
        } else {
            contents.push({
                role: 'user',
                parts: [{ text: message }]
            });
        }
        
        const response: GenerateContentResponse = await apiCallWithRetry(() => getAi().models.generateContent({
            model: "gemini-2.5-flash",
            config: {
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
                        deleteFileFromStorageFunctionDeclaration, // Covers deleting recordings
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
                        setAlarmFunctionDeclaration,
                        deleteAlarmFunctionDeclaration,
                        stopAlarmFunctionDeclaration,
                        startTimerFunctionDeclaration,
                        stopTimerFunctionDeclaration,
                        startStopwatchFunctionDeclaration,
                        stopStopwatchFunctionDeclaration,
                    ]}
                ],
            },
            contents: contents
        }));
        
        const text = response.text || "";

        const groundingChunks = response.candidates?.[0]?.groundingMetadata?.groundingChunks;
        let sources: Source[] = [];
        if (groundingChunks && groundingChunks.length > 0) {
            sources = groundingChunks
                .map((chunk: any) => chunk.web)
                .filter((web: any) => web && web.uri)
                .reduce((acc: any[], current: any) => { // De-duplicate by URI
                    if (!acc.find(item => item.uri === current.uri)) {
                        acc.push({ uri: current.uri, title: current.title || current.uri });
                    }
                    return acc;
                }, []);
        }

        const functionCalls = response.functionCalls || [];

        // Cache the response if it's purely informational (no function calls) and has no file
        if (text && (!functionCalls || functionCalls.length === 0) && !fileContent) {
            await addCacheEntry(message, { text: text, sources });
        }

        return { text: text, sources, functionCalls };
    } catch (error) {
        console.error("Error sending text message:", error);
        return { text: "Простите, у меня возникла проблема с ответом.", sources: [], functionCalls: [] };
    }
};