import React, { useState, useEffect, useMemo } from 'react';
import { PlannerItem, NoteItem, ContactItem, CalendarEventItem, UserInstruction } from '../types';
import Planner from './Planner';

// --- PROPS INTERFACE ---
interface OrganizerProps {
    plannerContent: PlannerItem[];
    setPlannerContent: React.Dispatch<React.SetStateAction<PlannerItem[]>>;
    notes: NoteItem[];
    setNotes: React.Dispatch<React.SetStateAction<NoteItem[]>>;
    contacts: ContactItem[];
    setContacts: React.Dispatch<React.SetStateAction<ContactItem[]>>;
    calendarEvents: CalendarEventItem[];
    setCalendarEvents: React.Dispatch<React.SetStateAction<CalendarEventItem[]>>;
    userInstructions: UserInstruction[];
    onAddInstruction: (text: string) => Promise<void>;
    onDeleteInstruction: (id: number) => Promise<void>;
    playPageTurnSound: (reverse?: boolean) => void;
    organizerInitialState: string | null;
    onStateHandled: () => void;
}

// --- AGENDA VIEW SUB-COMPONENT ---

interface AgendaItem {
    id: string | number;
    date: string;
    time?: string;
    text: string;
    type: 'task' | 'event' | 'finance';
    completed?: boolean;
    sourceId: number;
}

const AgendaView: React.FC<{
    plannerContent: PlannerItem[];
    calendarEvents: CalendarEventItem[];
}> = ({ plannerContent, calendarEvents }) => {

    const agendaItems = useMemo(() => {
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        const endOfToday = new Date(today);
        endOfToday.setHours(23, 59, 59, 999);

        const startOfWeek = new Date(today);
        // Adjust to Monday as the start of the week
        const dayOfWeek = today.getDay(); // Sunday is 0, Monday is 1, etc.
        const diff = today.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
        startOfWeek.setDate(diff);

        const endOfWeek = new Date(startOfWeek);
        endOfWeek.setDate(startOfWeek.getDate() + 6);
        endOfWeek.setHours(23, 59, 59, 999);

        const endOfMonth = new Date(today.getFullYear(), today.getMonth() + 1, 0);
        endOfMonth.setHours(23, 59, 59, 999);

        const financialKeywords = ['оплата', 'кредит', 'долг', 'счет', 'платеж', 'зарплата', 'bill', 'payment', 'invoice', 'salary'];

        const allItems: AgendaItem[] = [];

        plannerContent.forEach(item => {
            if (!item.completed) {
                allItems.push({
                    id: `p-${item.id}`,
                    date: item.date,
                    text: item.text,
                    type: 'task',
                    completed: item.completed,
                    sourceId: item.id
                });
            }
        });

        calendarEvents.forEach(event => {
            const isFinancial = financialKeywords.some(kw => event.title.toLowerCase().includes(kw));
            allItems.push({
                id: `c-${event.id}`,
                date: event.date,
                time: event.time,
                text: event.title,
                type: isFinancial ? 'finance' : 'event',
                sourceId: event.id
            });
        });

        const todayItems: AgendaItem[] = [];
        const weekItems: AgendaItem[] = [];
        const monthItems: AgendaItem[] = [];

        allItems.forEach(item => {
            const itemDate = new Date(item.date + 'T00:00:00');
            if (itemDate >= today && itemDate <= endOfToday) {
                todayItems.push(item);
            } else if (itemDate > endOfToday && itemDate <= endOfWeek) {
                weekItems.push(item);
            } else if (itemDate > endOfWeek && itemDate <= endOfMonth) {
                monthItems.push(item);
            }
        });

        const sortFn = (a: AgendaItem, b: AgendaItem) => {
            const dateA = new Date(a.date).getTime();
            const dateB = new Date(b.date).getTime();
            if (dateA !== dateB) return dateA - dateB;
            return (a.time || '23:59').localeCompare(b.time || '23:59');
        };

        return {
            todayItems: todayItems.sort(sortFn),
            weekItems: weekItems.sort(sortFn),
            monthItems: monthItems.sort(sortFn)
        };

    }, [plannerContent, calendarEvents]);

    const AgendaSection: React.FC<{ title: string, items: AgendaItem[] }> = ({ title, items }) => {
        if (items.length === 0) return null;

        const formatDate = (dateString: string) => {
            return new Date(dateString + 'T00:00:00').toLocaleDateString('ru-RU', { weekday: 'short', day: 'numeric' });
        };

        return (
            <div className="mb-6">
                <h3 className="font-semibold text-gray-300 mb-2 px-4 sm:px-6">{title}</h3>
                <ul className="space-y-1">
                    {items.map(item => (
                        <li key={item.id} className="mx-2 p-3 rounded-md flex items-center gap-3 group hover:bg-white/10 transition-colors">
                             <div className="flex-shrink-0 w-12 text-center text-sm text-gray-400">
                                {title === 'На сегодня' ? (
                                    <span className="font-semibold">{item.time || 'Весь день'}</span>
                                ) : (
                                    <span>{formatDate(item.date)}</span>
                                )}
                            </div>
                            <div className="flex-shrink-0 w-6 flex items-center justify-center" title={item.type === 'task' ? 'Задача' : item.type === 'event' ? 'Событие' : 'Финансы'}>
                                {item.type === 'task' && <div className="h-2 w-2 rounded-full bg-cyan-400"></div>}
                                {item.type === 'event' && <div className="h-2 w-2 rounded-full bg-purple-400"></div>}
                                {item.type === 'finance' && <div className="h-2 w-2 rounded-full bg-green-400"></div>}
                            </div>
                            <p className="flex-1 text-gray-200 text-sm">{item.text}</p>
                        </li>
                    ))}
                </ul>
            </div>
        );
    };

    const hasItems = agendaItems.todayItems.length > 0 || agendaItems.weekItems.length > 0 || agendaItems.monthItems.length > 0;

    return (
        <div className="h-full overflow-y-auto">
            <h2 className="text-xl font-bold text-white mb-4 px-4 sm:px-6 pt-4 sm:pt-6">Обзор</h2>
            {hasItems ? (
                 <>
                    <AgendaSection title="На сегодня" items={agendaItems.todayItems} />
                    <AgendaSection title="На этой неделе" items={agendaItems.weekItems} />
                    <AgendaSection title="В этом месяце" items={agendaItems.monthItems} />
                 </>
            ) : (
                <div className="h-4/5 flex items-center justify-center">
                    <p className="text-gray-400 text-center">На ближайшее время ничего не запланировано.</p>
                </div>
            )}
        </div>
    );
};


// --- SUB-COMPONENTS FOR TOOLS ---

// --- Instructions Tool ---
const InstructionsTool: React.FC<{ 
    instructions: UserInstruction[]; 
    onAdd: (text: string) => Promise<void>;
    onDelete: (id: number) => Promise<void>;
}> = ({ instructions, onAdd, onDelete }) => {
    const [newInstruction, setNewInstruction] = useState('');
    
    const handleAdd = async () => {
        if (newInstruction.trim()) {
            await onAdd(newInstruction.trim());
            setNewInstruction('');
        }
    };

    return (
        <div className="h-full p-4 sm:p-6 flex flex-col text-white">
            <div className="flex-shrink-0 mb-4 flex items-center gap-2">
                <input
                    type="text"
                    value={newInstruction}
                    onChange={(e) => setNewInstruction(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
                    placeholder="Новое правило для ассистента..."
                    className="w-full h-10 px-4 bg-black/30 border border-white/20 rounded-full text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                 <button onClick={handleAdd} className="flex-shrink-0 w-10 h-10 bg-cyan-600 hover:bg-cyan-500 rounded-full flex items-center justify-center">+</button>
            </div>
            <div className="overflow-y-auto flex-1 pr-2 space-y-2">
                {instructions.length === 0 ? <p className="text-gray-400 text-center pt-8">Нет сохраненных инструкций.</p> :
                    instructions.map((instr, index) => (
                        <div key={instr.id} className="bg-white/5 p-3 rounded-md flex items-start gap-3 group">
                            <span className="text-gray-400 font-mono text-sm pt-0.5">{index + 1}.</span>
                            <p className="flex-1 text-gray-200 whitespace-pre-wrap">{instr.text}</p>
                            <button onClick={() => onDelete(instr.id)} className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100">&times;</button>
                        </div>
                    ))
                }
            </div>
        </div>
    );
};


// --- Notes Tool ---
const NotesTool: React.FC<{ notes: NoteItem[]; setNotes: React.Dispatch<React.SetStateAction<NoteItem[]>> }> = ({ notes, setNotes }) => {
    const [newNote, setNewNote] = useState('');
    
    const handleAddNote = () => {
        if (newNote.trim()) {
            setNotes(prev => [{ id: Date.now(), text: newNote.trim(), date: new Date().toISOString().slice(0, 10) }, ...prev]);
            setNewNote('');
        }
    };

    const handleDeleteNote = (id: number) => {
        setNotes(prev => prev.filter(note => note.id !== id));
    };

    return (
        <div className="h-full p-4 sm:p-6 flex flex-col text-white">
            <div className="flex-shrink-0 mb-4 flex items-center gap-2">
                <input
                    type="text"
                    value={newNote}
                    onChange={(e) => setNewNote(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleAddNote()}
                    placeholder="Новая заметка..."
                    className="w-full h-10 px-4 bg-black/30 border border-white/20 rounded-full text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                />
                 <button onClick={handleAddNote} className="flex-shrink-0 w-10 h-10 bg-cyan-600 hover:bg-cyan-500 rounded-full flex items-center justify-center">+</button>
            </div>
            <div className="overflow-y-auto flex-1 pr-2 space-y-2">
                {notes.length === 0 ? <p className="text-gray-400 text-center pt-8">Заметок нет.</p> :
                    notes.map(note => (
                        <div key={note.id} className="bg-white/5 p-3 rounded-md flex items-start gap-3 group">
                            <p className="flex-1 text-gray-200 whitespace-pre-wrap">{note.text}</p>
                            <button onClick={() => handleDeleteNote(note.id)} className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100">&times;</button>
                        </div>
                    ))
                }
            </div>
        </div>
    );
};

// --- Contacts Tool ---
const ContactsTool: React.FC<{ contacts: ContactItem[]; setContacts: React.Dispatch<React.SetStateAction<ContactItem[]>> }> = ({ contacts, setContacts }) => {
    const [newContact, setNewContact] = useState({ name: '', phone: '', email: '' });

    const handleAddContact = () => {
        if (newContact.name.trim()) {
            setContacts(prev => [{ id: Date.now(), ...newContact }, ...prev].sort((a,b) => a.name.localeCompare(b.name)));
            setNewContact({ name: '', phone: '', email: '' });
        }
    };
    
    const handleDeleteContact = (id: number) => {
        setContacts(prev => prev.filter(contact => contact.id !== id));
    };

    return (
         <div className="h-full p-4 sm:p-6 flex flex-col text-white">
            <div className="flex-shrink-0 mb-4 p-3 bg-white/5 rounded-lg grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                <input value={newContact.name} onChange={e => setNewContact(p => ({...p, name: e.target.value}))} placeholder="Имя" className="h-9 px-3 bg-black/30 border border-white/20 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 col-span-1 sm:col-span-2"/>
                <input value={newContact.phone} onChange={e => setNewContact(p => ({...p, phone: e.target.value}))} placeholder="Телефон" className="h-9 px-3 bg-black/30 border border-white/20 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                <input value={newContact.email} onChange={e => setNewContact(p => ({...p, email: e.target.value}))} placeholder="Email" className="h-9 px-3 bg-black/30 border border-white/20 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                <button onClick={handleAddContact} className="h-9 bg-cyan-600 hover:bg-cyan-500 rounded-md col-span-1 sm:col-span-4">Добавить контакт</button>
            </div>
            <div className="overflow-y-auto flex-1 pr-2 space-y-2">
                 {contacts.length === 0 ? <p className="text-gray-400 text-center pt-8">Контактов нет.</p> :
                    contacts.map(c => (
                        <div key={c.id} className="bg-white/5 p-3 rounded-md group">
                           <div className="flex justify-between items-start">
                             <p className="font-semibold">{c.name}</p>
                             <button onClick={() => handleDeleteContact(c.id)} className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 text-xs">&times;</button>
                           </div>
                           <p className="text-sm text-gray-300">{c.phone}</p>
                           <p className="text-sm text-gray-400">{c.email}</p>
                        </div>
                    ))
                }
            </div>
        </div>
    );
};

// --- Calendar Tool ---
const CalendarTool: React.FC<{ events: CalendarEventItem[]; setEvents: React.Dispatch<React.SetStateAction<CalendarEventItem[]>> }> = ({ events, setEvents }) => {
    const [newEvent, setNewEvent] = useState({ title: '', date: '', time: ''});
    
    const handleAddEvent = () => {
        if (newEvent.title && newEvent.date) {
            setEvents(prev => [...prev, { id: Date.now(), ...newEvent }].sort((a,b) => new Date(a.date).getTime() - new Date(b.date).getTime()));
            setNewEvent({ title: '', date: '', time: '' });
        }
    };
    
    const handleDeleteEvent = (id: number) => {
        setEvents(prev => prev.filter(event => event.id !== id));
    };

    const groupedEvents = useMemo(() => events.reduce((acc, event) => {
            (acc[event.date] = acc[event.date] || []).push(event);
            return acc;
        }, {} as Record<string, CalendarEventItem[]>), [events]);

    return (
        <div className="h-full p-4 sm:p-6 flex flex-col text-white">
            <div className="flex-shrink-0 mb-4 p-3 bg-white/5 rounded-lg grid grid-cols-1 sm:grid-cols-4 gap-2 items-center">
                <input value={newEvent.title} onChange={e => setNewEvent(p => ({...p, title: e.target.value}))} placeholder="Название события" className="h-9 px-3 bg-black/30 border border-white/20 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500 col-span-1 sm:col-span-2"/>
                <input type="date" value={newEvent.date} onChange={e => setNewEvent(p => ({...p, date: e.target.value}))} className="h-9 px-3 bg-black/30 border border-white/20 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                <input type="time" value={newEvent.time} onChange={e => setNewEvent(p => ({...p, time: e.target.value}))} className="h-9 px-3 bg-black/30 border border-white/20 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500"/>
                <button onClick={handleAddEvent} className="h-9 bg-cyan-600 hover:bg-cyan-500 rounded-md col-span-1 sm:col-span-4">Добавить событие</button>
            </div>
            <div className="overflow-y-auto flex-1 pr-2 space-y-4">
                 {events.length === 0 ? <p className="text-gray-400 text-center pt-8">Событий нет.</p> :
                    Object.keys(groupedEvents).map(date => (
                        <div key={date}>
                           <h3 className="font-semibold text-gray-300 mb-2">{new Date(date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}</h3>
                           <div className="space-y-2">
                               {groupedEvents[date].map(event => (
                                    <div key={event.id} className="bg-white/5 p-2 rounded-md group flex justify-between items-center">
                                        <div>
                                            <span className="text-gray-400 mr-2">{event.time}</span>
                                            <span>{event.title}</span>
                                        </div>
                                        <button onClick={() => handleDeleteEvent(event.id)} className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100">&times;</button>
                                    </div>
                               ))}
                           </div>
                        </div>
                    ))
                }
            </div>
        </div>
    );
};

// --- MAIN ORGANIZER COMPONENT ---

const Organizer: React.FC<OrganizerProps> = (props) => {
    const { 
      plannerContent, setPlannerContent, notes, setNotes, contacts, setContacts, 
      calendarEvents, setCalendarEvents, userInstructions, onAddInstruction, onDeleteInstruction,
      playPageTurnSound, organizerInitialState, onStateHandled 
    } = props;
    const [activeTool, setActiveTool] = useState<string | null>(null);
    const [isContentVisible, setIsContentVisible] = useState(false);
    
    const isUnrolled = activeTool !== null;

    useEffect(() => {
        if (organizerInitialState === null) return;

        const validTools = ['planner', 'notes', 'contacts', 'calendar', 'instructions', 'unrolled']; // unrolled for legacy
        const toolToOpen = organizerInitialState === 'unrolled' ? 'planner' : organizerInitialState;
        
        if (organizerInitialState === 'close' || organizerInitialState === 'rolled-up') {
            if (activeTool) playPageTurnSound(true);
            setActiveTool(null);
        } else if (validTools.includes(toolToOpen)) {
            if (activeTool !== toolToOpen) playPageTurnSound(false);
            setActiveTool(toolToOpen);
        }
        
        onStateHandled();
    }, [organizerInitialState, activeTool, onStateHandled, playPageTurnSound]);

    useEffect(() => {
        if (isUnrolled) {
            const timer = setTimeout(() => setIsContentVisible(true), 300);
            return () => clearTimeout(timer);
        } else {
            setIsContentVisible(false);
        }
    }, [isUnrolled]);

    const handleToolClick = (toolName: string) => {
        if (activeTool === toolName) {
            playPageTurnSound(true);
            setActiveTool(null);
        } else {
            playPageTurnSound(false);
            setActiveTool(toolName);
        }
    };
    
    const toolIcons = [
        { name: 'instructions', title: 'Инструкции', path: "M19.43 12.98c.04-.32.07-.64.07-.98s-.03-.66-.07-.98l2.11-1.65c.19-.15.24-.42.12-.64l-2-3.46c-.12-.22-.39-.3-.61-.22l-2.49 1c-.52-.4-1.08-.73-1.69-.98l-.38-2.65C14.46 2.18 14.25 2 14 2h-4c-.25 0-.46.18-.49.42l-.38 2.65c-.61.25-1.17.59-1.69.98l-2.49-1c-.23-.09-.49 0-.61.22l-2 3.46c-.13.22-.07.49.12.64l2.11 1.65c-.04.32-.07.65-.07.98s.03.66.07.98l-2.11 1.65c-.19.15-.24.42-.12.64l2 3.46c.12.22.39.3.61.22l2.49-1c.52.4 1.08.73 1.69.98l.38 2.65c.03.24.24.42.49.42h4c.25 0 .46-.18.49-.42l.38-2.65c.61-.25 1.17-.59 1.69-.98l2.49 1c.23.09.49 0 .61-.22l2-3.46c.12-.22.07-.49-.12-.64l-2.11-1.65zM12 15.5c-1.93 0-3.5-1.57-3.5-3.5s1.57-3.5 3.5-3.5 3.5 1.57 3.5 3.5-1.57 3.5-3.5 3.5z" },
        { name: 'notes', title: 'Заметки', path: "M19,3H5C3.89,3 3,3.89 3,5V19C3,20.11 3.89,21 5,21H19C20.11,21 21,20.11 21,19V5C21,3.89 20.11,3 19,3M9,7H15V9H9V7M9,11H15V13H9V11M9,15H13V17H9V15Z" },
        { name: 'contacts', title: 'Контакты', path: "M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z" },
        { name: 'calendar', title: 'Календарь', path: "M17 12h-5v5h5v-5zM16 1v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2h-1V1h-2zm3 18H5V8h14v11z" },
        { name: 'planner', title: 'Планировщик', path: "M14.06,9L15,9.94L5.92,19H5V18.08L14.06,9M17.66,3C17.41,3 17.15,3.1 16.96,3.29L15.13,5.12L18.88,8.87L20.71,7.04C21.1,6.65 21.1,6 20.71,5.63L18.37,3.29C18.17,3.09 17.92,3 17.66,3M14.06,6.19L3,17.25V21H6.75L17.81,9.94L14.06,6.19Z" }
    ];

    return (
        <div className="h-full relative overflow-hidden bg-black/10 rounded-bl-2xl">
            <svg width="0" height="0" className="absolute">
                <defs>
                    <clipPath id="downward-tab-shape">
                        <path d="M 0 0 L 56 0 L 56 36 L 16 36 A 16 16 0 0 1 0 20 Z" />
                    </clipPath>
                </defs>
            </svg>
            
            {/* The new AgendaView, which serves as the default background */}
            <div className={`h-full transition-opacity duration-500 ${isUnrolled ? 'opacity-0' : 'opacity-100'}`}>
                 <AgendaView 
                    plannerContent={plannerContent}
                    calendarEvents={calendarEvents}
                 />
            </div>


            {/* The original animated container for tools, which sits on top of the AgendaView */}
            <div
                className="absolute left-6 right-6 flex flex-col"
                style={{
                    top: '1rem',
                    height: isUnrolled ? 'calc(100% - 1rem - 1.5rem)' : '36px',
                    transition: 'height 0.5s ease-in-out',
                }}
            >
                <div className="flex-1 bg-black/30 backdrop-blur-sm border border-white/20 rounded-xl overflow-hidden">
                    <div
                        className="transition-opacity duration-300 h-full"
                        style={{ opacity: isContentVisible ? 1 : 0 }}
                    >
                       {isUnrolled && (
                            <>
                                {activeTool === 'planner' && <Planner content={plannerContent} setContent={setPlannerContent} />}
                                {activeTool === 'calendar' && <CalendarTool events={calendarEvents} setEvents={setCalendarEvents} />}
                                {activeTool === 'contacts' && <ContactsTool contacts={contacts} setContacts={setContacts} />}
                                {activeTool === 'notes' && <NotesTool notes={notes} setNotes={setNotes} />}
                                {activeTool === 'instructions' && <InstructionsTool instructions={userInstructions} onAdd={onAddInstruction} onDelete={onDeleteInstruction} />}
                            </>
                        )}
                    </div>
                </div>

                <div className="flex-shrink-0 h-9 flex justify-end -mt-px">
                    {toolIcons.map((tool, index) => (
                        <div
                            key={tool.name}
                            onClick={() => handleToolClick(tool.name)}
                            className={`w-14 h-full flex items-center justify-center cursor-pointer transition-colors ${
                                activeTool === tool.name ? 'text-white' : 'text-white/50 hover:text-white/80'
                            }`}
                            style={{ 
                                clipPath: 'url(#downward-tab-shape)',
                                marginLeft: index > 0 ? '-16px' : '0',
                                zIndex: toolIcons.length - index 
                            }}
                            title={tool.title}
                            aria-expanded={activeTool === tool.name}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" viewBox="0 0 24 24" fill="currentColor">
                                <g transform="scale(0.85) translate(2, 2)">
                                    <path d={tool.path} />
                                </g>
                            </svg>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
};

export default Organizer;