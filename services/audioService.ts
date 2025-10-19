import { getAi, apiCallWithRetry } from './geminiService';
import { Modality } from '@google/genai';

// --- Encoding/Decoding Helpers ---

export function decode(base64: string): Uint8Array {
  const binaryString = atob(base64);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

export function encode(bytes: Uint8Array): string {
  let binary = '';
  const len = bytes.byteLength;
  for (let i = 0; i < len; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

export function createWavBlob(pcmData: Uint8Array, sampleRate = 24000): Blob {
    const numChannels = 1;
    const bitsPerSample = 16;
    const byteRate = sampleRate * numChannels * (bitsPerSample / 8);
    const blockAlign = numChannels * (bitsPerSample / 8);
    const dataSize = pcmData.length;
    const fileSize = 36 + dataSize;

    const buffer = new ArrayBuffer(44);
    const view = new DataView(buffer);

    view.setUint32(0, 0x52494646, false); // "RIFF"
    view.setUint32(4, fileSize, true);
    view.setUint32(8, 0x57415645, false); // "WAVE"
    view.setUint32(12, 0x666d7420, false); // "fmt "
    view.setUint32(16, 16, true); // Sub-chunk size (16 for PCM)
    view.setUint16(20, 1, true); // Audio format (1 for PCM)
    view.setUint16(22, numChannels, true);
    view.setUint32(24, sampleRate, true);
    view.setUint32(28, byteRate, true);
    view.setUint16(32, blockAlign, true);
    view.setUint16(34, bitsPerSample, true);
    view.setUint32(36, 0x64617461, false); // "data"
    view.setUint32(40, dataSize, true);

    return new Blob([view, pcmData], { type: 'audio/wav' });
}

export async function decodeAudioData(
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

export function createPcmBlob(data: Float32Array): { data: string; mimeType: string; } {
  const l = data.length;
  const int16 = new Int16Array(l);
  for (let i = 0; i < l; i++) {
    int16[i] = Math.max(-1, Math.min(1, data[i])) * 32767;
  }
  return {
    data: encode(new Uint8Array(int16.buffer)),
    mimeType: 'audio/pcm;rate=16000',
  };
}

// --- AudioContext Management ---

let outputAudioContext: AudioContext | null = null;

export const getOutputAudioContext = async (): Promise<AudioContext | null> => {
    try {
        if (outputAudioContext && outputAudioContext.state !== 'closed') {
            if (outputAudioContext.state === 'suspended') {
                await outputAudioContext.resume();
            }
            return outputAudioContext;
        }
        const WebkitAudioContext = (window as any).webkitAudioContext;
        const newCtx = new (window.AudioContext || WebkitAudioContext)({ sampleRate: 24000 });
        outputAudioContext = newCtx;
        if (newCtx.state === 'suspended') {
            await newCtx.resume();
        }
        return newCtx;
    } catch (e) {
        console.error("Could not create or resume AudioContext:", e);
        return null;
    }
};

// --- Core Audio Functions ---

export const synthesizeSpeech = async (text: string): Promise<Uint8Array> => {
    const speechTask = async () => {
        const ai = getAi();
        const response = await ai.models.generateContent({
            model: 'gemini-2.5-flash-preview-tts',
            contents: [{ parts: [{ text: text }] }],
            config: {
                responseModalities: [Modality.AUDIO],
                speechConfig: {
                    voiceConfig: {
                        prebuiltVoiceConfig: { voiceName: 'Zephyr' },
                    },
                },
            },
        });

        const base64Audio = response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;
        if (base64Audio) {
            return decode(base64Audio);
        } else {
            const blockReason = response.candidates?.[0]?.finishReason;
            console.error("Speech synthesis failed.", { blockReason });
            throw new Error(`Speech synthesis returned no audio data. Reason: ${blockReason || 'Unknown'}`);
        }
    };
    return apiCallWithRetry(speechTask, 3, 1000);
};

export const playAudioBlob = async (blob: Blob): Promise<{ success: boolean, speakingPromise: Promise<void> }> => {
    let resolveSpeaking: () => void;
    let rejectSpeaking: (reason?: any) => void;
    const speakingPromise = new Promise<void>((resolve, reject) => {
        resolveSpeaking = resolve;
        rejectSpeaking = reject;
    });

    if (!blob || blob.size < 44) {
        rejectSpeaking(new Error("Invalid audio blob provided."));
        return { success: false, speakingPromise };
    }
    
    try {
        const audioCtx = await getOutputAudioContext();
        if (!audioCtx) {
            throw new Error("Audio context is not available.");
        }
        const arrayBuffer = await blob.arrayBuffer();
        const audioBuffer = await audioCtx.decodeAudioData(arrayBuffer);

        const source = audioCtx.createBufferSource();
        source.buffer = audioBuffer;
        source.connect(audioCtx.destination);
        
        source.onended = () => {
            resolveSpeaking();
        };
        source.start();
        return { success: true, speakingPromise };
    } catch (e) {
        console.error("Audio playback failed with Web Audio API:", e);
        rejectSpeaking(e);
        return { success: false, speakingPromise };
    }
};