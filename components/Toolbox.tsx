import React, { useState, useEffect, useRef } from 'react';
import { Alarm } from '../types';

interface ToolboxProps {
    alarms: Alarm[];
    setAlarms: React.Dispatch<React.SetStateAction<Alarm[]>>;
}

const formatTime = (timeInSeconds: number, includeMs = false) => {
    if (!Number.isFinite(timeInSeconds) || timeInSeconds < 0) {
        return includeMs ? '00:00:00.00' : '00:00:00';
    }
    const totalSeconds = Math.floor(timeInSeconds);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;
    const milliseconds = Math.floor((timeInSeconds * 100) % 100);

    const formatted = `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    return includeMs ? `${formatted}.${milliseconds.toString().padStart(2, '0')}` : formatted;
};

// --- Alarm Component ---
const AlarmClock: React.FC<{ alarms: Alarm[]; setAlarms: React.Dispatch<React.SetStateAction<Alarm[]>> }> = ({ alarms, setAlarms }) => {
    const [newAlarm, setNewAlarm] = useState({ time: '08:00', label: '', enabled: true });

    const handleAddAlarm = () => {
        if (newAlarm.time && newAlarm.label) {
            setAlarms(prev => [...prev.filter(a => a.time !== newAlarm.time), { ...newAlarm, id: Date.now() }].sort((a, b) => a.time.localeCompare(b.time)));
            setNewAlarm({ time: '08:00', label: '', enabled: true });
        }
    };

    const handleToggleAlarm = (id: number) => {
        setAlarms(prev => prev.map(a => a.id === id ? { ...a, enabled: !a.enabled } : a));
    };

    const handleDeleteAlarm = (id: number) => {
        setAlarms(prev => prev.filter(a => a.id !== id));
    };

    return (
        <div className="h-full p-4 sm:p-6 flex flex-col text-white">
            <div className="flex-shrink-0 mb-4 p-3 bg-white/5 rounded-lg flex items-center gap-2">
                <input type="time" value={newAlarm.time} onChange={e => setNewAlarm(p => ({ ...p, time: e.target.value }))} className="h-9 px-3 bg-black/30 border border-white/20 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                <input type="text" value={newAlarm.label} onChange={e => setNewAlarm(p => ({ ...p, label: e.target.value }))} placeholder="Название будильника" className="flex-1 h-9 px-3 bg-black/30 border border-white/20 rounded-md focus:outline-none focus:ring-2 focus:ring-cyan-500" />
                <button onClick={handleAddAlarm} className="h-9 px-4 bg-cyan-600 hover:bg-cyan-500 rounded-md">Добавить</button>
            </div>
            <div className="overflow-y-auto flex-1 pr-2 space-y-2">
                {alarms.length === 0 ? <p className="text-gray-400 text-center pt-8">Будильников нет.</p> :
                    alarms.map(alarm => (
                        <div key={alarm.id} className={`bg-white/5 p-3 rounded-md flex items-center justify-between group transition-opacity ${!alarm.enabled ? 'opacity-50' : ''}`}>
                            <div>
                                <p className="text-2xl font-mono">{alarm.time}</p>
                                <p className="text-sm text-gray-300">{alarm.label}</p>
                            </div>
                            <div className="flex items-center gap-3">
                                <label className="relative inline-flex items-center cursor-pointer">
                                    <input type="checkbox" checked={alarm.enabled} onChange={() => handleToggleAlarm(alarm.id)} className="sr-only peer" />
                                    <div className="w-11 h-6 bg-gray-600 rounded-full peer peer-focus:ring-2 peer-focus:ring-cyan-500 peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-cyan-600"></div>
                                </label>
                                <button onClick={() => handleDeleteAlarm(alarm.id)} className="text-gray-500 hover:text-red-400 opacity-0 group-hover:opacity-100">&times;</button>
                            </div>
                        </div>
                    ))}
            </div>
        </div>
    );
};

// --- Timer Component ---
const Timer: React.FC = () => {
    const [duration, setDuration] = useState({ h: 0, m: 5, s: 0 });
    const [remainingTime, setRemainingTime] = useState(0); // in seconds
    const [isActive, setIsActive] = useState(false);
    const [isPaused, setIsPaused] = useState(false);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const alarmSoundRef = useRef<HTMLAudioElement | null>(null);

    useEffect(() => {
        if (isActive && !isPaused) {
            intervalRef.current = setInterval(() => {
                setRemainingTime(prev => {
                    if (prev <= 1) {
                        clearInterval(intervalRef.current!);
                        setIsActive(false);
                        playAlarmSound();
                        return 0;
                    }
                    return prev - 1;
                });
            }, 1000);
        } else if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isActive, isPaused]);
    
    const playAlarmSound = () => {
        const audioCtx = new (window.AudioContext || (window as any).webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        gainNode.gain.setValueAtTime(0.5, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 1);
        osc.start();
        osc.stop(audioCtx.currentTime + 1);
    };

    const handleStart = () => {
        const totalSeconds = duration.h * 3600 + duration.m * 60 + duration.s;
        if (totalSeconds > 0) {
            setRemainingTime(totalSeconds);
            setIsActive(true);
            setIsPaused(false);
        }
    };

    const handlePauseResume = () => {
        setIsPaused(!isPaused);
    };

    const handleReset = () => {
        setIsActive(false);
        setIsPaused(false);
        setRemainingTime(0);
        if (intervalRef.current) clearInterval(intervalRef.current);
    };

    const handleDurationChange = (unit: 'h' | 'm' | 's', value: string) => {
        const numValue = Math.max(0, parseInt(value) || 0);
        setDuration(prev => ({...prev, [unit]: unit === 'h' ? Math.min(23, numValue) : Math.min(59, numValue)}));
    };

    const progress = remainingTime / (duration.h * 3600 + duration.m * 60 + duration.s) * 100;

    return (
        <div className="h-full p-4 sm:p-6 flex flex-col items-center justify-center text-white">
            <div className="relative w-64 h-64 flex items-center justify-center">
                 <svg className="w-full h-full" viewBox="0 0 120 120">
                    <circle cx="60" cy="60" r="54" fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth="6" />
                    <circle
                        cx="60"
                        cy="60"
                        r="54"
                        fill="none"
                        stroke="#0891b2"
                        strokeWidth="6"
                        strokeDasharray="339.29"
                        strokeDashoffset={339.29 * (1 - progress / 100)}
                        transform="rotate(-90 60 60)"
                        style={{ transition: 'stroke-dashoffset 0.5s linear' }}
                    />
                </svg>
                <div className="absolute">
                    {isActive ? (
                        <p className="text-5xl font-mono">{formatTime(remainingTime)}</p>
                    ) : (
                        <div className="flex items-center gap-1">
                            <input type="number" value={duration.h.toString().padStart(2, '0')} onChange={e => handleDurationChange('h', e.target.value)} className="w-20 text-5xl font-mono bg-transparent text-center focus:outline-none"/>
                            <span className="text-5xl font-mono -translate-y-1">:</span>
                            <input type="number" value={duration.m.toString().padStart(2, '0')} onChange={e => handleDurationChange('m', e.target.value)} className="w-20 text-5xl font-mono bg-transparent text-center focus:outline-none"/>
                            <span className="text-5xl font-mono -translate-y-1">:</span>
                            <input type="number" value={duration.s.toString().padStart(2, '0')} onChange={e => handleDurationChange('s', e.target.value)} className="w-20 text-5xl font-mono bg-transparent text-center focus:outline-none"/>
                        </div>
                    )}
                </div>
            </div>
            <div className="flex items-center gap-4 mt-8">
                <button onClick={handleReset} className="w-20 h-10 bg-white/10 hover:bg-white/20 rounded-md">Сброс</button>
                {!isActive ? (
                    <button onClick={handleStart} className="w-24 h-12 bg-cyan-600 hover:bg-cyan-500 rounded-md font-semibold">Старт</button>
                ) : (
                    <button onClick={handlePauseResume} className="w-24 h-12 bg-yellow-600 hover:bg-yellow-500 rounded-md font-semibold">{isPaused ? 'Возобновить' : 'Пауза'}</button>
                )}
            </div>
        </div>
    );
};

// --- Stopwatch Component ---
const Stopwatch: React.FC = () => {
    const [time, setTime] = useState(0); // in ms
    const [isActive, setIsActive] = useState(false);
    const [laps, setLaps] = useState<number[]>([]);
    const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
    const startTimeRef = useRef(0);

    useEffect(() => {
        if (isActive) {
            startTimeRef.current = Date.now() - time;
            intervalRef.current = setInterval(() => {
                setTime(Date.now() - startTimeRef.current);
            }, 10);
        } else if (intervalRef.current) {
            clearInterval(intervalRef.current);
        }
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [isActive]);

    const handleStartStop = () => setIsActive(!isActive);
    const handleReset = () => {
        setIsActive(false);
        setTime(0);
        setLaps([]);
    };
    const handleLap = () => {
        if (isActive) {
            setLaps(prev => [time, ...prev]);
        }
    };

    return (
        <div className="h-full p-4 sm:p-6 flex flex-col text-white">
            <div className="flex-1 flex flex-col items-center justify-center">
                <p className="text-6xl font-mono tracking-tighter">{formatTime(time / 1000, true)}</p>
                <div className="flex items-center gap-4 mt-8">
                    <button onClick={handleReset} className="w-20 h-10 bg-white/10 hover:bg-white/20 rounded-md" disabled={isActive}>Сброс</button>
                    <button onClick={handleStartStop} className={`w-24 h-12 rounded-md font-semibold ${isActive ? 'bg-red-600 hover:bg-red-500' : 'bg-green-600 hover:bg-green-500'}`}>{isActive ? 'Стоп' : 'Старт'}</button>
                    <button onClick={handleLap} className="w-20 h-10 bg-white/10 hover:bg-white/20 rounded-md" disabled={!isActive}>Круг</button>
                </div>
            </div>
            <div className="h-48 overflow-y-auto pr-2 space-y-1 font-mono text-gray-300">
                {laps.map((lap, index) => (
                    <div key={index} className="flex justify-between items-center p-2 bg-white/5 rounded-md text-sm">
                        <span>Круг {laps.length - index}</span>
                        <span>{formatTime(lap / 1000, true)}</span>
                    </div>
                ))}
            </div>
        </div>
    );
};

// --- Main Toolbox Component ---
const Toolbox: React.FC<ToolboxProps> = ({ alarms, setAlarms }) => {
    const [activeTab, setActiveTab] = useState<'alarm' | 'timer' | 'stopwatch'>('alarm');

    const tabs: { id: typeof activeTab; label: string }[] = [
        { id: 'alarm', label: 'Будильник' },
        { id: 'timer', label: 'Таймер' },
        { id: 'stopwatch', label: 'Секундомер' },
    ];

    return (
        <div className="h-full flex flex-col">
            <div className="flex-shrink-0 border-b border-white/20 px-4">
                <nav className="-mb-px flex space-x-6">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`whitespace-nowrap py-3 px-1 border-b-2 font-medium text-sm transition-colors
                                ${activeTab === tab.id
                                    ? 'border-cyan-400 text-cyan-300'
                                    : 'border-transparent text-gray-400 hover:text-gray-200 hover:border-gray-500'
                                }`
                            }
                        >
                            {tab.label}
                        </button>
                    ))}
                </nav>
            </div>
            <div className="flex-1">
                {activeTab === 'alarm' && <AlarmClock alarms={alarms} setAlarms={setAlarms} />}
                {activeTab === 'timer' && <Timer />}
                {activeTab === 'stopwatch' && <Stopwatch />}
            </div>
        </div>
    );
};

export default Toolbox;
