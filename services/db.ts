import { Recording, Source, UserInstruction, TranscriptItem, StoredFile } from '../types';

let db: IDBDatabase;
const DB_NAME = 'DictaphoneDB';
const DB_VERSION = 7; // Incremented version for file storage
const RECORDINGS_STORE_NAME = 'recordings';
const CACHE_STORE_NAME = 'chatCache';
const INSTRUCTIONS_STORE_NAME = 'userInstructions';
const CHAT_HISTORY_STORE_NAME = 'chatHistoryStore';
const FILE_STORAGE_STORE_NAME = 'fileStorage';


export interface CachedResponse {
    text: string;
    sources: Source[];
}

export interface ChatLog {
    id: number;
    date: string; // YYYY-MM-DD
    history: TranscriptItem[];
}

export const initDB = (): Promise<boolean> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);

    request.onerror = () => {
      console.error('Error opening IndexedDB:', request.error);
      reject(false);
    };

    request.onsuccess = () => {
      db = request.result;
      resolve(true);
    };

    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (event.oldVersion < 2) {
         if (!db.objectStoreNames.contains(RECORDINGS_STORE_NAME)) {
            const store = db.createObjectStore(RECORDINGS_STORE_NAME, { keyPath: 'id', autoIncrement: true });
            store.createIndex('date', 'date', { unique: false });
        }
      }
      if (event.oldVersion < 3) {
        if (!db.objectStoreNames.contains(CACHE_STORE_NAME)) {
            db.createObjectStore(CACHE_STORE_NAME, { keyPath: 'prompt' });
        }
      }
      if (event.oldVersion < 4) {
        if (!db.objectStoreNames.contains(INSTRUCTIONS_STORE_NAME)) {
            const store = db.createObjectStore(INSTRUCTIONS_STORE_NAME, { keyPath: 'id', autoIncrement: true });
            store.createIndex('creationDate', 'creationDate', { unique: false });
        }
      }
      if (event.oldVersion < 5) {
        if (!db.objectStoreNames.contains(CHAT_HISTORY_STORE_NAME)) {
            db.createObjectStore(CHAT_HISTORY_STORE_NAME, { keyPath: 'date' });
        }
      }
      if (event.oldVersion < 6) {
          if (db.objectStoreNames.contains(CHAT_HISTORY_STORE_NAME)) {
              db.deleteObjectStore(CHAT_HISTORY_STORE_NAME);
          }
          const store = db.createObjectStore(CHAT_HISTORY_STORE_NAME, { keyPath: 'id', autoIncrement: true });
          store.createIndex('date', 'date', { unique: false });
      }
      if (event.oldVersion < 7) {
        if (!db.objectStoreNames.contains(FILE_STORAGE_STORE_NAME)) {
            const store = db.createObjectStore(FILE_STORAGE_STORE_NAME, { keyPath: 'id', autoIncrement: true });
            store.createIndex('name', 'name', { unique: false });
            store.createIndex('type', 'type', { unique: false });
            store.createIndex('date', 'date', { unique: false });
        }
      }
    };
  });
};

// --- Chat History Session Functions ---

export const saveChatLog = (log: { id?: number | null; date: string; history: TranscriptItem[] }): Promise<number> => {
    return new Promise((resolve, reject) => {
        if (!db) return reject("Database not initialized.");
        const transaction = db.transaction([CHAT_HISTORY_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(CHAT_HISTORY_STORE_NAME);
        
        // Remove id from the object if it's null/undefined for auto-increment to work on add
        const logToSave: any = { date: log.date, history: log.history };
        if (log.id) {
            logToSave.id = log.id;
        }

        const request = store.put(logToSave);
        request.onsuccess = () => resolve(request.result as number);
        request.onerror = (e) => reject(e);
    });
};

export const getLatestChatLogForToday = (dateKey: string): Promise<ChatLog | null> => {
    return new Promise((resolve, reject) => {
        if (!db) return reject("Database not initialized.");
        const transaction = db.transaction([CHAT_HISTORY_STORE_NAME], 'readonly');
        const store = transaction.objectStore(CHAT_HISTORY_STORE_NAME);
        const index = store.index('date');
        const request = index.getAll(dateKey);

        request.onsuccess = () => {
            const logs = request.result;
            if (logs && logs.length > 0) {
                // Sort by ID descending to get the latest session
                logs.sort((a, b) => b.id - a.id);
                resolve(logs[0]);
            } else {
                resolve(null);
            }
        };
        request.onerror = (e) => reject(e);
    });
};


// --- Recordings Functions ---

export const addRecording = (recording: Omit<Recording, 'id'>): Promise<number> => {
  return new Promise((resolve, reject) => {
    if (!db) {
        return reject("Database not initialized.");
    }
    const transaction = db.transaction([RECORDINGS_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(RECORDINGS_STORE_NAME);
    const request = store.add(recording);

    request.onsuccess = () => {
      resolve(request.result as number);
    };

    request.onerror = () => {
      console.error('Error adding recording:', request.error);
      reject(request.error);
    };
  });
};

export const getAllRecordings = (): Promise<Recording[]> => {
    return new Promise((resolve, reject) => {
        if (!db) {
            return reject("Database not initialized.");
        }
        const transaction = db.transaction([RECORDINGS_STORE_NAME], 'readonly');
        const store = transaction.objectStore(RECORDINGS_STORE_NAME);
        const request = store.getAll();

        request.onsuccess = () => {
            // Sort by date descending (newest first)
            const sorted = request.result.sort((a, b) => b.date - a.date);
            resolve(sorted);
        };

        request.onerror = () => {
            console.error('Error getting all recordings:', request.error);
            reject(request.error);
        };
    });
};


export const deleteRecording = (id: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
        return reject("Database not initialized.");
    }
    const transaction = db.transaction([RECORDINGS_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(RECORDINGS_STORE_NAME);
    const request = store.delete(id);

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      console.error('Error deleting recording:', request.error);
      reject(request.error);
    };
  });
};

export const clearAllRecordings = (): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) {
        return reject("Database not initialized.");
    }
    const transaction = db.transaction([RECORDINGS_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(RECORDINGS_STORE_NAME);
    const request = store.clear(); // This clears the entire object store

    request.onsuccess = () => {
      resolve();
    };

    request.onerror = () => {
      console.error('Error deleting all recordings:', request.error);
      reject(request.error);
    };
  });
};

// --- File Storage Functions ---

export const addFile = (file: Omit<StoredFile, 'id'>): Promise<number> => {
  return new Promise((resolve, reject) => {
    if (!db) return reject("Database not initialized.");
    const transaction = db.transaction([FILE_STORAGE_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(FILE_STORAGE_STORE_NAME);
    // Check if a file with the same name already exists
    const nameIndex = store.index('name');
    const getRequest = nameIndex.get(file.name);
    
    getRequest.onsuccess = () => {
        if (getRequest.result) {
            // File with this name already exists
            reject(new Error(`Файл с именем "${file.name}" уже существует.`));
        } else {
            // No file with this name, proceed to add
            const addRequest = store.add(file);
            addRequest.onsuccess = () => resolve(addRequest.result as number);
            addRequest.onerror = (e) => reject(e);
        }
    };
    getRequest.onerror = (e) => reject(e);
  });
};

export const updateFile = (id: number, updates: Partial<Pick<StoredFile, 'name' | 'content'>>): Promise<void> => {
    return new Promise((resolve, reject) => {
        if (!db) return reject("Database not initialized.");
        const transaction = db.transaction([FILE_STORAGE_STORE_NAME], 'readwrite');
        const store = transaction.objectStore(FILE_STORAGE_STORE_NAME);
        const getRequest = store.get(id);

        getRequest.onsuccess = () => {
            const fileToUpdate: StoredFile = getRequest.result;
            if (!fileToUpdate) {
                return reject(new Error(`File with id ${id} not found.`));
            }

            // Apply updates
            if (updates.name) fileToUpdate.name = updates.name;
            if (updates.content) {
                fileToUpdate.content = updates.content;
                fileToUpdate.size = updates.content.size;
            }
            fileToUpdate.date = Date.now(); // Always update the modification date

            const putRequest = store.put(fileToUpdate);
            putRequest.onsuccess = () => resolve();
            putRequest.onerror = (e) => reject(e);
        };
        getRequest.onerror = (e) => reject(e);
    });
};

export const getAllFiles = (): Promise<StoredFile[]> => {
  return new Promise((resolve, reject) => {
    if (!db) return reject("Database not initialized.");
    const transaction = db.transaction([FILE_STORAGE_STORE_NAME], 'readonly');
    const store = transaction.objectStore(FILE_STORAGE_STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => b.date - a.date)); // Newest first
    request.onerror = (e) => reject(e);
  });
};

export const getFileById = (id: number): Promise<StoredFile | undefined> => {
    return new Promise((resolve, reject) => {
        if (!db) return reject("Database not initialized.");
        const transaction = db.transaction([FILE_STORAGE_STORE_NAME], 'readonly');
        const store = transaction.objectStore(FILE_STORAGE_STORE_NAME);
        const request = store.get(id);
        request.onsuccess = () => resolve(request.result);
        request.onerror = (e) => reject(e);
    });
};

export const deleteFile = (id: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) return reject("Database not initialized.");
    const transaction = db.transaction([FILE_STORAGE_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(FILE_STORAGE_STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e);
  });
};


// --- User Instructions Functions ---

export const addInstruction = (instruction: Omit<UserInstruction, 'id'>): Promise<number> => {
  return new Promise((resolve, reject) => {
    if (!db) return reject("Database not initialized.");
    const transaction = db.transaction([INSTRUCTIONS_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(INSTRUCTIONS_STORE_NAME);
    const request = store.add(instruction);
    request.onsuccess = () => resolve(request.result as number);
    request.onerror = (e) => reject(e);
  });
};

export const getAllInstructions = (): Promise<UserInstruction[]> => {
  return new Promise((resolve, reject) => {
    if (!db) return reject("Database not initialized.");
    const transaction = db.transaction([INSTRUCTIONS_STORE_NAME], 'readonly');
    const store = transaction.objectStore(INSTRUCTIONS_STORE_NAME);
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result.sort((a, b) => a.creationDate - b.creationDate));
    request.onerror = (e) => reject(e);
  });
};

export const deleteInstructionById = (id: number): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) return reject("Database not initialized.");
    const transaction = db.transaction([INSTRUCTIONS_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(INSTRUCTIONS_STORE_NAME);
    const request = store.delete(id);
    request.onsuccess = () => resolve();
    request.onerror = (e) => reject(e);
  });
};


// --- Cache Functions ---

export const addCacheEntry = (prompt: string, response: CachedResponse): Promise<void> => {
  return new Promise((resolve, reject) => {
    if (!db) return reject("Database not initialized.");
    const transaction = db.transaction([CACHE_STORE_NAME], 'readwrite');
    const store = transaction.objectStore(CACHE_STORE_NAME);
    const request = store.put({ prompt, ...response });
    request.onsuccess = () => resolve();
    request.onerror = () => {
      console.error('Error adding cache entry:', request.error);
      reject(request.error);
    };
  });
};

export const getCacheEntry = (prompt: string): Promise<CachedResponse | undefined> => {
  return new Promise((resolve, reject) => {
    if (!db) return reject("Database not initialized.");
    const transaction = db.transaction([CACHE_STORE_NAME], 'readonly');
    const store = transaction.objectStore(CACHE_STORE_NAME);
    const request = store.get(prompt);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => {
      console.error('Error getting cache entry:', request.error);
      reject(request.error);
    };
  });
};
