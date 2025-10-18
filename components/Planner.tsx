import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { PlannerItem } from '../types';

const formatTimer = (totalSeconds: number): string => {
    if (totalSeconds < 0) totalSeconds = 0;
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = Math.floor(totalSeconds % 60);
    
    return `${days}:${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
};

const TaskTimer: React.FC<{ item: PlannerItem }> = ({ item }) => {
    const calculateRemaining = useCallback(() => {
        if (!item.time || item.completed) {
            return null;
        }
        const targetDateTime = new Date(`${item.date}T${item.time}`);
        const now = new Date();
        // Return 0 if the time is in the past
        return Math.max(0, Math.round((targetDateTime.getTime() - now.getTime()) / 1000));
    }, [item.date, item.time, item.completed]);

    const [remainingSeconds, setRemainingSeconds] = useState(calculateRemaining());

    useEffect(() => {
        // Do not start a timer if the task has no time or is completed
        if (item.completed || !item.time) {
            setRemainingSeconds(null);
            return;
        }

        // Set up an interval that recalculates the remaining time every second.
        // This is more robust against browser tab throttling than a setTimeout chain.
        const timerId = setInterval(() => {
            const remaining = calculateRemaining();
            setRemainingSeconds(remaining);
            // Stop the interval once the timer reaches zero
            if (remaining !== null && remaining <= 0) {
                clearInterval(timerId);
            }
        }, 1000);

        // Immediately update the timer on first render or when item props change
        setRemainingSeconds(calculateRemaining());

        // Cleanup the interval when the component unmounts or its dependencies change.
        return () => clearInterval(timerId);
    }, [item.date, item.time, item.completed, calculateRemaining]);

    if (remainingSeconds === null) {
        return null;
    }

    const isExpired = remainingSeconds <= 0;
    const colorClass = isExpired ? 'text-red-500' : 'text-cyan-400';

    return (
        <div className={`font-mono text-sm ${colorClass} bg-black/20 px-2 py-1 rounded-md`}>
            {formatTimer(remainingSeconds)}
        </div>
    );
};


interface PlannerProps {
    content: PlannerItem[];
    setContent: React.Dispatch<React.SetStateAction<PlannerItem[]>>;
}

const Planner: React.FC<PlannerProps> = ({ content, setContent }) => {
    const [newTaskText, setNewTaskText] = useState('');

    const handleAddTask = () => {
        if (newTaskText.trim() === '') return;
        const newItem: PlannerItem = {
            id: Date.now(),
            text: newTaskText.trim(),
            date: new Date().toISOString().slice(0, 10),
            completed: false,
            creationDate: Date.now(),
        };
        setContent(prev => [newItem, ...prev]);
        setNewTaskText('');
    };

    const handleInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
        if (event.key === 'Enter') {
            handleAddTask();
        }
    };
    
    const handleToggleComplete = (id: number) => {
        setContent(prev => prev.map(item =>
            item.id === id ? { ...item, completed: !item.completed } : item
        ));
    };

    const handleDelete = (id: number) => {
        setContent(prev => prev.filter(item => item.id !== id));
    };

    const groupedItems = useMemo(() => {
        const groups = content.reduce((acc, item) => {
            const date = item.date;
            if (!acc[date]) {
                acc[date] = [];
            }
            acc[date].push(item);
            return acc;
        }, {} as Record<string, PlannerItem[]>);

        // Sort items within each date group by time (earliest first)
        for (const date in groups) {
            groups[date].sort((a, b) => {
                const timeA = a.time || '00:00';
                const timeB = b.time || '00:00';
                return timeA.localeCompare(timeB);
            });
        }
        
        return groups;
    }, [content]);

    // Sort dates ascending (earliest first)
    const sortedDates = Object.keys(groupedItems).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());

    return (
        <div className="h-full p-4 sm:p-6 flex flex-col text-white">
            <div className="flex-shrink-0 mb-4">
                <div className="flex items-center gap-2 mt-4">
                    <input
                        type="text"
                        value={newTaskText}
                        onChange={(e) => setNewTaskText(e.target.value)}
                        onKeyDown={handleInputKeyDown}
                        placeholder="Добавить новую задачу..."
                        className="w-full h-10 px-4 bg-black/30 border border-white/20 rounded-full text-white placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 transition-shadow duration-300"
                    />
                    <button
                        onClick={handleAddTask}
                        className="flex-shrink-0 w-10 h-10 bg-cyan-600 hover:bg-cyan-500 text-white rounded-full flex items-center justify-center transition-colors"
                        aria-label="Add new task"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-6 w-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                        </svg>
                    </button>
                </div>
            </div>
            
            <div className="overflow-y-auto flex-1 pr-2 space-y-6">
                {content.length === 0 ? (
                    <div className="h-full flex items-center justify-center">
                        <p className="text-gray-400 text-center">Нет задач.</p>
                    </div>
                ) : (
                    sortedDates.map(date => (
                        <div key={date}>
                            <h3 className="font-semibold text-gray-300 mb-2">
                                {new Date(date + 'T00:00:00').toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' })}
                            </h3>
                            <ul className="space-y-2">
                                {groupedItems[date].map(item => {
                                    return (
                                        <li key={item.id} className="bg-white/5 p-3 rounded-md flex items-center gap-3 group">
                                            <span className={`text-xs text-gray-500 font-mono transition-colors ${item.completed ? 'line-through' : ''}`}>
                                                {item.time || new Date(item.creationDate || item.id).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}
                                            </span>
                                            <input
                                                type="checkbox"
                                                checked={item.completed}
                                                onChange={() => handleToggleComplete(item.id)}
                                                className="w-5 h-5 rounded bg-gray-700 border-gray-500 text-cyan-500 focus:ring-cyan-600 cursor-pointer"
                                                aria-labelledby={`task-label-${item.id}`}
                                            />
                                            <label id={`task-label-${item.id}`} className={`flex-1 text-gray-200 transition-colors ${item.completed ? 'line-through text-gray-500' : ''}`}>
                                                {item.text}
                                            </label>

                                            {!!item.time && <TaskTimer item={item} />}
                                            
                                            <button
                                                onClick={() => handleDelete(item.id)}
                                                className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100 transition-opacity"
                                                aria-label="Delete task"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                                                    <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.607a1 1 0 010-1.414z" clipRule="evenodd" />
                                                </svg>
                                            </button>
                                        </li>
                                    );
                                })}
                            </ul>
                        </div>
                    ))
                )}
            </div>
        </div>
    );
};

export default Planner;