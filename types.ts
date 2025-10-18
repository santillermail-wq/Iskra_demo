import { FunctionDeclaration, Type } from '@google/genai';

export interface Source {
  uri: string;
  title: string;
}

export interface StoredFile {
  id: number;
  name: string;
  type: 'audio' | 'text' | 'pdf' | 'docx' | 'video' | 'other';
  size: number;
  date: number; // timestamp
  content: Blob; // Store file content as a Blob for versatility
  // Optional metadata, primarily for audio files from dictaphone
  transcript?: string;
  title?: string;
  description?: string;
  duration?: number; // Duration in seconds for audio/video
}

export interface TranscriptItem {
  id: string;
  author: 'user' | 'assistant';
  text: string;
  sources?: Source[];
  type?: 'message' | 'error' | 'file' | 'alarm';
  fileReference?: {
      id: number;
      name: string;
      type: StoredFile['type'];
  };
  timestamp?: number;
}


export interface Recording {
    id: number;
    date: number;
    duration: number;
    audioBlob: Blob;
    transcript: string;
    title: string;
    description:string;
}

export interface Transaction {
    id: string;
    date: string; // YYYY-MM-DD
    description: string;
    amount: number;
    type: 'income' | 'expense';
    category?: string; // e.g., 'Groceries', 'Salary'
    paymentMethod?: 'cash' | 'creditCard';
}

export interface FinanceData {
    transactions: Transaction[];
    // Balances can be calculated from transactions, but storing them can be useful for performance or manual adjustments.
    totalBalance: number;
    creditCardBalance: number;
    cashBalance: number;
}

export interface PlannerItem {
    id: number;
    text: string;
    date: string; // YYYY-MM-DD
    time?: string | null; // HH:MM
    completed: boolean;
    creationDate: number;
}

export interface NoteItem {
    id: number;
    text: string;
    date: string; // YYYY-MM-DD
}

export interface ContactItem {
    id: number;
    name: string;
    phone?: string;
    email?: string;
    notes?: string;
}

export interface CalendarEventItem {
    id: number;
    title: string;
    date: string; // YYYY-MM-DD
    time?: string; // HH:MM
    description?: string;
    completed?: boolean;
}

export interface UserInstruction {
    id: number;
    text: string;
    creationDate: number;
}

export interface VoiceSettings {
    pitch: number;
    speakingRate: number;
    volumeGainDb: number;
}

export interface Alarm {
    id: number;
    time: string; // HH:MM
    label: string;
    enabled: boolean;
}

export interface TimerState {
    id: string;
    label: string;
    endTime: number;
    duration: number; // in seconds
    timeoutId: ReturnType<typeof setTimeout>;
}

export interface StopwatchState {
    id: string;
    label: string;
    startTime: number;
}


// --- Function Declarations for Voice & Text Control ---

export const setVoiceSettingsFunctionDeclaration: FunctionDeclaration = {
    name: 'setVoiceSettings',
    description: "Adjusts the assistant's voice characteristics. Use this for commands like 'speak higher', 'talk faster', 'increase volume'. All parameters are optional.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            pitch: {
                type: Type.NUMBER,
                description: 'The pitch of the voice. Valid range: [-20.0, 20.0]. 0 is the default.'
            },
            speakingRate: {
                type: Type.NUMBER,
                description: 'The speaking rate. Valid range: [0.25, 4.0]. 1.0 is the default.'
            },
            volumeGainDb: {
                type: Type.NUMBER,
                description: 'The volume gain in decibels. Valid range: [-96.0, 16.0]. 0 is the default.'
            }
        },
        required: []
    }
};

export const getCurrentTimeAndDateFunctionDeclaration: FunctionDeclaration = {
    name: 'getCurrentTimeAndDate',
    description: 'Gets the current local time and date of the user. Use this when the user asks "what time is it?", "what is today\'s date?", etc.',
    parameters: {
        type: Type.OBJECT,
        properties: {},
    }
};

export const setPanelStateFunctionDeclaration: FunctionDeclaration = {
    name: 'setPanelState',
    description: "Opens, closes, or switches tabs on the main UI panel. Use this for commands like 'open chat', 'close the organizer', or 'show me finances'.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            open: {
                type: Type.BOOLEAN,
                description: "Set to `true` to open the panel, `false` to close the entire panel. If you are only switching views or controlling a sub-view, this parameter can be omitted."
            },
            view: {
                type: Type.STRING,
                description: "Optional. The view to switch to. Can be 'chat', 'dictaphone', 'finance', 'organizer', 'storage', 'toolbox', or 'assistant-config'."
            },
            subViewState: {
                type: Type.STRING,
                description: "Optional. Controls a sub-component within the 'organizer' view. Use one of ['planner', 'calendar', 'contacts', 'notes', 'instructions'] to open the respective tool. Use 'close' to collapse the currently open tool. CRITICAL: If the user asks to open the 'planner', you MUST set `view: 'organizer'` and `subViewState: 'planner'`. The same applies to other tools. If the user asks to close a tool inside the organizer (but not the whole panel), set `view: 'organizer'` and `subViewState: 'close'`."
            }
        },
        required: []
    }
};

// --- User Instruction Functions ---
export const saveUserInstructionFunctionDeclaration: FunctionDeclaration = {
  name: 'saveUserInstruction',
  description: 'Saves a new permanent instruction or rule from the user that the assistant must follow in all future interactions. Use for commands like "Remember that...", "Save this rule...", "New instruction:...".',
  parameters: {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING, description: 'The content of the instruction to save.' },
    },
    required: ['text'],
  },
};

export const getUserInstructionsFunctionDeclaration: FunctionDeclaration = {
  name: 'getUserInstructions',
  description: 'Reads and returns all permanent instructions the user has saved. Use for commands like "Show my rules", "What instructions have I given you?".',
  parameters: { type: Type.OBJECT, properties: {} },
};

export const deleteUserInstructionFunctionDeclaration: FunctionDeclaration = {
  name: 'deleteUserInstruction',
  description: 'Finds and deletes a specific user instruction based on its content or index. Ask the user for clarification if the query is ambiguous.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'The text content or 1-based index of the instruction to delete.' },
    },
    required: ['query'],
  },
};


// --- Notes Functions ---
export const addNoteFunctionDeclaration: FunctionDeclaration = {
  name: 'addNote',
  description: 'Adds a new note to the notes tool in the organizer.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      text: { type: Type.STRING, description: 'The content of the note.' },
    },
    required: ['text'],
  },
};

export const getNotesFunctionDeclaration: FunctionDeclaration = {
  name: 'getNotes',
  description: 'Reads and returns all saved notes from the organizer.',
  parameters: { type: Type.OBJECT, properties: {} },
};

export const updateNoteFunctionDeclaration: FunctionDeclaration = {
  name: 'updateNote',
  description: 'Finds a note by its content and updates it with new text.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'The original text of the note to find.' },
      newText: { type: Type.STRING, description: 'The new text to replace the old note content.' },
    },
    required: ['query', 'newText'],
  },
};

export const deleteNoteFunctionDeclaration: FunctionDeclaration = {
  name: 'deleteNote',
  description: 'Finds and deletes a specific note based on its content.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'The text content of the note to delete (e.g., "buy milk").' },
    },
    required: ['query'],
  },
};

export const clearNotesFunctionDeclaration: FunctionDeclaration = {
  name: 'clearNotes',
  description: 'Deletes all notes. Requires user confirmation.',
  parameters: { type: Type.OBJECT, properties: {} },
};


// --- Contacts Functions ---
export const addContactFunctionDeclaration: FunctionDeclaration = {
  name: 'addContact',
  description: 'Adds a new contact to the contacts list in the organizer.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      name: { type: Type.STRING, description: 'The full name of the contact.' },
      phone: { type: Type.STRING, description: 'Optional. The contact\'s phone number.' },
      email: { type: Type.STRING, description: 'Optional. The contact\'s email address.' },
      notes: { type: Type.STRING, description: 'Optional. Any additional notes about the contact.' },
    },
    required: ['name'],
  },
};

export const getContactsFunctionDeclaration: FunctionDeclaration = {
  name: 'getContacts',
  description: 'Reads and returns all saved contacts from the organizer.',
  parameters: { type: Type.OBJECT, properties: {} },
};

export const updateContactFunctionDeclaration: FunctionDeclaration = {
  name: 'updateContact',
  description: 'Finds a contact by name and updates their information.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'The name of the contact to update.' },
      newName: { type: Type.STRING, description: 'Optional. The new name for the contact.' },
      newPhone: { type: Type.STRING, description: 'Optional. The new phone number.' },
      newEmail: { type: Type.STRING, description: 'Optional. The new email address.' },
      newNotes: { type: Type.STRING, description: 'Optional. New notes to add or replace existing ones.' },
    },
    required: ['query'],
  },
};

export const deleteContactFunctionDeclaration: FunctionDeclaration = {
  name: 'deleteContact',
  description: 'Finds and deletes a specific contact by name.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'The name of the contact to delete (e.g., "John Doe").' },
    },
    required: ['query'],
  },
};

export const clearContactsFunctionDeclaration: FunctionDeclaration = {
  name: 'clearContacts',
  description: 'Deletes all contacts. Requires user confirmation.',
  parameters: { type: Type.OBJECT, properties: {} },
};


// --- Calendar Functions ---
export const addCalendarEventFunctionDeclaration: FunctionDeclaration = {
  name: 'addCalendarEvent',
  description: 'Adds a new event to the calendar in the organizer. The model must convert relative dates like "tomorrow" to YYYY-MM-DD format.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      title: { type: Type.STRING, description: 'The title of the event.' },
      date: { type: Type.STRING, description: 'The date of the event in YYYY-MM-DD format.' },
      time: { type: Type.STRING, description: 'Optional. The time of the event in HH:MM format.' },
      description: { type: Type.STRING, description: 'Optional. A description for the event.' },
    },
    required: ['title', 'date'],
  },
};

export const getCalendarEventsFunctionDeclaration: FunctionDeclaration = {
  name: 'getCalendarEvents',
  description: 'Reads and returns all saved calendar events for a specific date or period.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      dateQuery: { type: Type.STRING, description: "Optional. A date in YYYY-MM-DD format or a relative term like 'today' or 'tomorrow' to filter events." },
    },
  },
};

export const updateCalendarEventFunctionDeclaration: FunctionDeclaration = {
  name: 'updateCalendarEvent',
  description: 'Finds a calendar event by its title and date, and updates its details.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'The title of the event to update.' },
      date: { type: Type.STRING, description: 'The date of the event to find, in YYYY-MM-DD format. This helps distinguish events with the same title.' },
      newTitle: { type: Type.STRING, description: 'Optional. The new title for the event.' },
      newDate: { type: Type.STRING, description: 'Optional. The new date in YYYY-MM-DD format.' },
      newTime: { type: Type.STRING, description: 'Optional. The new time in HH:MM format.' },
      newDescription: { type: Type.STRING, description: 'Optional. The new description.' },
    },
    required: ['query', 'date'],
  },
};

export const deleteCalendarEventFunctionDeclaration: FunctionDeclaration = {
  name: 'deleteCalendarEvent',
  description: 'Finds and deletes a specific calendar event by its title and date.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'The title of the event to delete.' },
      date: { type: Type.STRING, description: 'The date of the event in YYYY-MM-DD format to ensure the correct event is deleted.' },
    },
    required: ['query', 'date'],
  },
};

export const clearCalendarEventsFunctionDeclaration: FunctionDeclaration = {
  name: 'clearCalendarEvents',
  description: 'Deletes all calendar events. Requires user confirmation.',
  parameters: { type: Type.OBJECT, properties: {} },
};

export const addTransactionFunctionDeclaration: FunctionDeclaration = {
    name: 'addTransaction',
    description: 'Adds a new income or expense transaction to the finance records. If the user specifies a past date (e.g., "yesterday," "last Friday," "on December 25th"), use the "date" parameter. Otherwise, the date automatically defaults to today. You must also ask for the payment method (cash or credit card) if the user does not specify it.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            type: {
                type: Type.STRING,
                description: "The type of transaction, must be either 'income' or 'expense'."
            },
            amount: {
                type: Type.NUMBER,
                description: 'The numerical amount of the transaction.'
            },
            description: {
                type: Type.STRING,
                description: 'A brief description of the transaction (e.g., "Groceries", "Salary").'
            },
            paymentMethod: {
                type: Type.STRING,
                description: "The payment method used for the transaction. Must be either 'cash' or 'creditCard'."
            },
            date: {
                type: Type.STRING,
                description: 'Optional. The date of the transaction in YYYY-MM-DD format. Use this if the user specifies a date other than today (e.g., "yesterday", "last week"). The model should convert relative dates into this format.'
            }
        },
        required: ['type', 'amount', 'description', 'paymentMethod']
    }
};

export const searchTransactionsFunctionDeclaration: FunctionDeclaration = {
    name: 'searchTransactions',
    description: 'Use this function to find and list financial transactions. The user can search by a time period (like "last month", "yesterday", "in December") or by a comment/keyword (like "coffee", "salary"). The function will display the full results on the finance panel and provide a summary in the chat.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            query: {
                type: Type.STRING,
                description: 'The date (e.g., "yesterday", "2023-12-25") or keyword (e.g., "taxi", "groceries") to search for.'
            }
        },
        required: ['query']
    }
};

export const editTransactionFunctionDeclaration: FunctionDeclaration = {
    name: 'editTransaction',
    description: "Finds and modifies an existing financial transaction. You MUST use the conversation history to understand which transaction the user is referring to, especially for vague requests like 'change the last one' or 'edit it'. Combine details from the conversation (description, date, amount) to form a specific query. You must confirm the details of the change with the user before calling this function.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            query: {
                type: Type.STRING,
                description: "Keywords to identify the transaction, derived from the conversation context. Combine details from the user's current and previous messages. For example, if the user said 'I spent 500 on groceries' and then says 'change that to 550', the query should be 'groceries 500'. Use keywords from the description, date, and amount to be as specific as possible. Examples: 'last', 'coffee yesterday', 'salary Friday 50000'."
            },
            newAmount: {
                type: Type.NUMBER,
                description: "Optional. The new monetary value for the transaction."
            },
            newDescription: {
                type: Type.STRING,
                description: "Optional. The new text description for the transaction."
            },
            newPaymentMethod: {
                type: Type.STRING,
                description: "Optional. The new payment method. Must be either 'cash' or 'creditCard'."
            }
        },
        required: ['query']
    }
};

export const deleteTransactionFunctionDeclaration: FunctionDeclaration = {
    name: 'deleteTransaction',
    description: "Finds and deletes a specific financial transaction. You MUST use the conversation history to understand which transaction the user is referring to. Combine details from the conversation (description, date, amount) to form a specific query. You must ask for user confirmation before calling this function to remove a record.",
    parameters: {
        type: Type.OBJECT,
        properties: {
            query: {
                type: Type.STRING,
                description: "Keywords to identify the transaction, derived from the conversation context. Combine details from the user's current and previous messages to be as specific as possible. Examples: 'last transaction', 'coffee yesterday', 'salary Friday 50000'."
            }
        },
        required: ['query']
    }
};

export const replaceTransactionFunctionDeclaration: FunctionDeclaration = {
    name: 'replaceTransaction',
    description: 'Replaces a single existing transaction with one or more new transactions. You MUST use the conversation history to understand which transaction the user is referring to. For example, use this to split a grocery bill into "food" and "household items". You must ask for confirmation before calling this function.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            query: {
                type: Type.STRING,
                description: "Keywords to identify the transaction, derived from the conversation context. Combine details from the user's current and previous messages to be as specific as possible. Examples: 'last transaction', 'grocery bill yesterday 1500'."
            },
            newTransactions: {
                type: Type.ARRAY,
                description: 'An array of one or more new transaction objects that will replace the old one.',
                items: {
                    type: Type.OBJECT,
                    properties: {
                        type: {
                            type: Type.STRING,
                            description: "The type of transaction, must be either 'income' or 'expense'."
                        },
                        amount: {
                            type: Type.NUMBER,
                            description: 'The numerical amount of the transaction.'
                        },
                        description: {
                            type: Type.STRING,
                            description: 'A brief description of the new transaction (e.g., "Groceries", "Household supplies").'
                        },
                        paymentMethod: {
                            type: Type.STRING,
                            description: "The payment method used for the new transaction. Must be either 'cash' or 'creditCard'."
                        }
                    },
                    required: ['type', 'amount', 'description', 'paymentMethod']
                }
            }
        },
        required: ['query', 'newTransactions']
    }
};


export const generateStatementFunctionDeclaration: FunctionDeclaration = {
    name: 'generateStatement',
    description: 'Generates and downloads a text file (.txt) statement of financial transactions. Can be filtered by a keyword or a date component.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            filter: {
                type: Type.STRING,
                description: "Optional. A keyword, a month (e.g., 'декабрь'), year, or a specific date to filter the statement."
            }
        },
    }
};

export const calculateDailySpendingAllowanceFunctionDeclaration: FunctionDeclaration = {
    name: 'calculateDailySpendingAllowance',
    description: 'Calculates the recommended daily spending amount for the rest of the current month based on income and expenses to date.',
    parameters: {
        type: Type.OBJECT,
        properties: {},
    }
};


export const clearChatHistoryFunctionDeclaration: FunctionDeclaration = {
  name: 'clearChatHistory',
  description: "Archives the current conversation session and starts a new, clean chat screen for the day. This is a non-destructive action that preserves the old chat history. The user must be asked for confirmation before this function is called.",
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

export const clearAllRecordingsFunctionDeclaration: FunctionDeclaration = {
  name: 'clearAllRecordings',
  description: "Permanently deletes all saved audio recordings from the file storage. This is a highly destructive action; the user must be asked for confirmation before this function is called.",
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

export const startDictaphoneRecordingFunctionDeclaration: FunctionDeclaration = {
  name: 'startDictaphoneRecording',
  description: 'Starts a new audio recording in the dictaphone. Use this when the user asks to start recording, begin dictation, or take a voice note.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

export const stopDictaphoneRecordingFunctionDeclaration: FunctionDeclaration = {
  name: 'stopDictaphoneRecording',
  description: 'Stops the currently active audio recording in the dictaphone. Use this when the user asks to stop recording.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

export const readDictaphoneTranscriptFunctionDeclaration: FunctionDeclaration = {
  name: 'readDictaphoneTranscript',
  description: "Reads the FULL, UNABRIDGED transcript of a specific recording out loud. CRITICAL: You MUST use 'getFilesFromStorage' with fileType 'audio' first to determine the correct filename of the recording the user is asking about. This function reads the text verbatim and does NOT summarize.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: {
        type: Type.STRING,
        description: 'The full filename of the recording to read, obtained from getFilesFromStorage.',
      },
    },
    required: ['filename'],
  },
};

export const getDictaphoneTranscriptContentFunctionDeclaration: FunctionDeclaration = {
  name: 'getDictaphoneTranscriptContent',
  description: "Fetches the full text transcript of a specific audio recording FOR ANALYSIS. Use this function to get the content needed for summarizing, finding specific information, or answering questions *about* the recording's content. CRITICAL: You MUST use 'getFilesFromStorage' with fileType 'audio' first to find the correct filename for the recording the user is referring to. DO NOT use this to read the transcript out loud.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: {
        type: Type.STRING,
        description: 'The full filename of the recording to analyze, obtained from getFilesFromStorage.',
      },
    },
    required: ['filename'],
  },
};

export const playDictaphoneRecordingFunctionDeclaration: FunctionDeclaration = {
  name: 'playDictaphoneRecording',
  description: 'Plays a specific audio recording. CRITICAL: You MUST use \'getFilesFromStorage\' with fileType \'audio\' first to determine the correct filename of the recording the user is asking about.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: {
        type: Type.STRING,
        description: 'The full filename of the recording to play, obtained from getFilesFromStorage.',
      },
    },
    required: ['filename'],
  },
};

export const pauseDictaphonePlaybackFunctionDeclaration: FunctionDeclaration = {
  name: 'pauseDictaphonePlayback',
  description: 'Pauses the currently playing audio recording in the dictaphone.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

export const stopDictaphonePlaybackFunctionDeclaration: FunctionDeclaration = {
  name: 'stopDictaphonePlayback',
  description: 'Stops the currently playing audio recording in the dictaphone and resets it to the beginning.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

export const setPlaybackSpeedFunctionDeclaration: FunctionDeclaration = {
  name: 'setPlaybackSpeed',
  description: 'Sets the playback speed for dictaphone recordings. Use values like 0.5 for half-speed, 1 for normal, 2 for double-speed.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      speed: {
        type: Type.NUMBER,
        description: 'The playback speed. e.g., 1.5 for 1.5x speed. Must be between 0.5 and 2.',
      },
    },
    required: ['speed'],
  },
};

export const searchDictaphoneRecordingsFunctionDeclaration: FunctionDeclaration = {
    name: 'searchDictaphoneRecordings',
    description: 'Searches audio recordings by a keyword or phrase in their title, description, or transcript. Displays results in the UI.',
    parameters: {
        type: Type.OBJECT,
        properties: {
            query: {
                type: Type.STRING,
                description: 'The text to search for within the recordings.'
            }
        },
        required: ['query']
    }
};

export const navigateToLinkFunctionDeclaration: FunctionDeclaration = {
  name: 'navigateToLink',
  description: 'Navigates the web browser to a specific URL. Use this when the user explicitly asks to open a link, go to a website, or navigate to a URL.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      url: {
        type: Type.STRING,
        description: 'The full URL to navigate to, e.g., "https://www.example.com".',
      },
    },
    required: ['url'],
  },
};

export const getInformationFromUrlFunctionDeclaration: FunctionDeclaration = {
  name: 'getInformationFromUrl',
  description: 'Fetches, analyzes, and summarizes the content of a specific URL to answer user questions about it.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      url: {
        type: Type.STRING,
        description: 'The full URL of the webpage to get information from.',
      },
    },
    required: ['url'],
  },
};

export const stopConversationFunctionDeclaration: FunctionDeclaration = {
  name: 'stopConversation',
  description: 'Turns off the microphone and ends the current voice conversation. Use this when the user asks to stop, be quiet, hang up, or disconnect.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

export const endSessionFunctionDeclaration: FunctionDeclaration = {
  name: 'endSession',
  description: 'Collapses the chat interface and disconnects the microphone. Use this when the user says goodbye, signs off, or indicates the conversation is over.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

export const addPlannerEntryFunctionDeclaration: FunctionDeclaration = {
  name: 'addPlannerEntry',
  description: 'Adds a task with a VISIBLE countdown timer to the planner. This is the ONLY function for setting one-time, user-facing reminders. When the user asks for a reminder (e.g., "remind me in 15 minutes to call Mom" or "remind me tomorrow at 9 AM to check email"), you MUST perform three actions: 1. Format the task text as "Напомнить о [action]" (e.g., "Напомнить о звонке маме"). 2. CRITICALLY: You MUST calculate the exact future time and provide it in the "time" parameter in strict HH:MM format. Convert all relative times (e.g., "in 10 minutes") to an absolute HH:MM time. 3. CRITICALLY: You MUST determine the correct date and provide it in the "date" parameter in strict YYYY-MM-DD format. If the user doesn\'t specify a date, assume today.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      text: {
        type: Type.STRING,
        description: 'The content of the task. For reminders, it MUST start with "Напомнить о ...".',
      },
      time: {
        type: Type.STRING,
        description: "CRITICAL AND MANDATORY for reminders. The absolute time for the task in strict HH:MM format (e.g., '17:30'). You MUST calculate this from the user's request."
      },
      date: {
        type: Type.STRING,
        description: "Optional. The date for the task in YYYY-MM-DD format. If not specified by the user, you must default to today's date."
      }
    },
    required: ['text', 'time'],
  },
};

export const markPlannerEntryAsCompletedFunctionDeclaration: FunctionDeclaration = {
  name: 'markPlannerEntryAsCompleted',
  description: 'Marks a specific task in the planner as completed. Use the task text to identify it.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'The text content of the task to mark as completed (e.g., "buy milk").' },
    },
    required: ['query'],
  },
};

export const getPlannerContentFunctionDeclaration: FunctionDeclaration = {
  name: 'getPlannerContent',
  description: 'Reads and returns all uncompleted tasks from the organizer/planner. Use this to answer questions about what is planned, or to check the content before adding a new item.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

export const clearPlannerContentFunctionDeclaration: FunctionDeclaration = {
  name: 'clearPlannerContent',
  description: 'Deletes all tasks and notes from the organizer/planner. This is a destructive action, so the user must be asked for confirmation before this function is called.',
  parameters: {
    type: Type.OBJECT,
    properties: {},
  },
};

export const generateDailySummaryFunctionDeclaration: FunctionDeclaration = {
    name: 'generateDailySummary',
    description: "Generates and presents a summary of the current day's activities. This includes an overview of financial transactions, a list of uncompleted tasks from the organizer, a summary of audio recordings made, and a brief synopsis of the day's conversation.",
    parameters: {
        type: Type.OBJECT,
        properties: {},
    },
};

export const getTodaysAccomplishmentsFunctionDeclaration: FunctionDeclaration = {
    name: 'getTodaysAccomplishments',
    description: 'Generates a summary of all work and activities completed today. This includes newly added and completed tasks in the planner, calendar events for today, and any audio recordings created today.',
    parameters: {
        type: Type.OBJECT,
        properties: {},
    },
};

export const createAndDownloadFileFunctionDeclaration: FunctionDeclaration = {
  name: 'createAndDownloadFile',
  description: 'Creates a new text-based file with the given content, saves it to storage, and initiates a download for the user. Use this when the user asks to create a document, generate a report, or save information to a file. Supported extensions are .txt, .md, .csv, .docx, and .pdf.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: { type: Type.STRING, description: 'The desired filename, including the extension (e.g., "report.pdf", "notes.txt"). The extension determines the file format.' },
      content: { type: Type.STRING, description: 'The full text content to be placed inside the file.' },
    },
    required: ['filename', 'content'],
  },
};

// --- File Storage Functions ---
export const saveFileToStorageFunctionDeclaration: FunctionDeclaration = {
  name: 'saveFileToStorage',
  description: 'Saves the currently attached file from the chat to the permanent file storage. This is now mostly automatic, so this function can be used to confirm the file has been saved.',
  parameters: { type: Type.OBJECT, properties: {} },
};

export const getFilesFromStorageFunctionDeclaration: FunctionDeclaration = {
  name: 'getFilesFromStorage',
  description: "Lists files available in the storage. Can be filtered by file type. CRITICAL: Use this to get filenames for audio recordings before calling other dictaphone functions like 'play' or 'read'.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      fileType: { type: Type.STRING, description: "Optional. Filter the list by type: 'audio', 'text', 'pdf', 'docx', 'video', 'other'." },
    },
  },
};

export const readFileFromStorageFunctionDeclaration: FunctionDeclaration = {
  name: 'readFileFromStorage',
  description: 'Reads the text content of a specific file from storage, identified by its name. Use this to answer questions about a stored file.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: { type: Type.STRING, description: 'The full name of the file to read from storage.' },
    },
    required: ['filename'],
  },
};

export const updateFileInStorageFunctionDeclaration: FunctionDeclaration = {
  name: 'updateFileInStorage',
  description: 'Modifies an existing file in storage. Can be used to change its content or rename it.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: { type: Type.STRING, description: 'The current full name of the file to modify.' },
      newContent: { type: Type.STRING, description: 'Optional. The new text content to replace the file\'s current content.' },
      newFilename: { type: Type.STRING, description: 'Optional. The new filename, including extension.' },
    },
    required: ['filename'],
  },
};

export const deleteFileFromStorageFunctionDeclaration: FunctionDeclaration = {
  name: 'deleteFileFromStorage',
  description: 'Deletes a specific file from storage by its name. Ask for confirmation before using.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      filename: { type: Type.STRING, description: 'The full name of the file to delete from storage.' },
    },
    required: ['filename'],
  },
};

// --- Toolbox (Timer/Alarm) Functions ---
export const setAlarmFunctionDeclaration: FunctionDeclaration = {
  name: 'setAlarm',
  description: 'Sets a new daily, recurring alarm (like a wake-up clock). Always opens the Toolbox panel to show the result. CRITICAL: Do NOT use for one-time task reminders. Use `addPlannerEntry` for that.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      time: { type: Type.STRING, description: 'The time for the alarm in HH:MM (24-hour) format.' },
      label: { type: Type.STRING, description: 'A descriptive label for the alarm (e.g., "Wake up", "Take medication").' },
    },
    required: ['time', 'label'],
  },
};

export const deleteAlarmFunctionDeclaration: FunctionDeclaration = {
  name: 'deleteAlarm',
  description: 'Deletes an alarm based on its time or label. Always opens the Toolbox panel to show the result.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      query: { type: Type.STRING, description: 'The time (HH:MM) or label text to identify the alarm to be deleted.' },
    },
    required: ['query'],
  },
};

export const stopAlarmFunctionDeclaration: FunctionDeclaration = {
  name: 'stopAlarm',
  description: 'Stops the currently ringing alarm. Use when the user says "stop", "snooze", "I\'m up", etc., while an alarm is sounding.',
  parameters: { type: Type.OBJECT, properties: {} },
};

export const startTimerFunctionDeclaration: FunctionDeclaration = {
  name: 'startTimer',
  description: "Starts an INVISIBLE background timer that the user cannot see. Use this ONLY for system tasks or when the user explicitly asks for a 'timer' without mentioning a task, e.g., 'set a timer for 10 minutes'. Do NOT use this for reminders like 'remind me to...'. For that, use `addPlannerEntry`.",
  parameters: {
    type: Type.OBJECT,
    properties: {
      durationInSeconds: { type: Type.NUMBER, description: 'The total duration of the timer in seconds.' },
      label: { type: Type.STRING, description: 'A descriptive label for the timer (e.g., "pizza in oven").' },
    },
    required: ['durationInSeconds', 'label'],
  },
};

export const stopTimerFunctionDeclaration: FunctionDeclaration = {
  name: 'stopTimer',
  description: 'Stops a non-visible timer that was previously started.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      label: { type: Type.STRING, description: 'The label of the timer to stop.' },
    },
    required: ['label'],
  },
};

export const startStopwatchFunctionDeclaration: FunctionDeclaration = {
  name: 'startStopwatch',
  description: 'Starts a non-visible stopwatch for the assistant to time an event.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      label: { type: Type.STRING, description: 'A descriptive label for the stopwatch (e.g., "5k run").' },
    },
    required: ['label'],
  },
};

export const stopStopwatchFunctionDeclaration: FunctionDeclaration = {
  name: 'stopStopwatch',
  description: 'Stops a non-visible stopwatch and reports the elapsed time.',
  parameters: {
    type: Type.OBJECT,
    properties: {
      label: { type: Type.STRING, description: 'The label of the stopwatch to stop.' },
    },
    required: ['label'],
  },
};