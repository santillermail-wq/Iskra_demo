import React, { useState, useMemo, useEffect, useRef } from 'react';
import { StoredFile } from '../types';

interface FileStorageProps {
    files: StoredFile[];
    onReadFile: (file: StoredFile) => void;
    onDeleteFile: (id: number) => void;
    highlightedFileId?: number | null;
}

const formatBytes = (bytes: number, decimals = 2) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const dm = decimals < 0 ? 0 : decimals;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(dm)) + ' ' + sizes[i];
};

const FileTypeIcon: React.FC<{ type: StoredFile['type'] }> = ({ type }) => {
    const commonClasses = "h-8 w-8 text-gray-300";
    switch (type) {
        case 'audio':
            return <svg xmlns="http://www.w3.org/2000/svg" className={commonClasses} viewBox="0 0 24 24" fill="currentColor"><path d="M12 3v9.28c-.47-.17-.97-.28-1.5-.28C8.01 12 6 14.01 6 16.5S8.01 21 10.5 21c2.31 0 4.2-1.75 4.45-4H15V6h4V3h-7z"/></svg>;
        case 'pdf':
            return <svg xmlns="http://www.w3.org/2000/svg" className={commonClasses} viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-8.5 7.5c0 .83-.67 1.5-1.5 1.5H9v2H7.5V7H10c.83 0 1.5.67 1.5 1.5v1zm5 2c0 .83-.67 1.5-1.5 1.5h-2.5V7H15c.83 0 1.5.67 1.5 1.5v3zm4-3H19v1h1.5v-1zm-2.5-3H19v1h-1.5V7zM9 9.5h1v-1H9v1zM4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm11.5 5.5h1v-3h-1v3z"/></svg>;
        case 'video':
            return <svg xmlns="http://www.w3.org/2000/svg" className={commonClasses} viewBox="0 0 24 24" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>;
        case 'text':
        case 'docx':
        case 'other':
        default:
            return <svg xmlns="http://www.w3.org/2000/svg" className={commonClasses} viewBox="0 0 24 24" fill="currentColor"><path d="M14 2H6c-1.1 0-1.99.9-1.99 2L4 20c0 1.1.89 2 1.99 2H18c1.1 0 2-.9 2-2V8l-6-6zm2 16H8v-2h8v2zm0-4H8v-2h8v2zm-3-5V3.5L18.5 9H13z"/></svg>;
    }
};

const FileStorage: React.FC<FileStorageProps> = ({ files, onReadFile, onDeleteFile, highlightedFileId }) => {
    const [activeTab, setActiveTab] = useState<'all' | 'text' | 'pdf' | 'audio' | 'video'>('all');
    const highlightedFileRef = useRef<HTMLDivElement>(null);

    const filteredFiles = useMemo(() => {
        if (activeTab === 'all') return files;
        if (activeTab === 'text') return files.filter(f => ['text', 'docx', 'other'].includes(f.type));
        return files.filter(f => f.type === activeTab);
    }, [files, activeTab]);

    useEffect(() => {
        if (highlightedFileId && highlightedFileRef.current) {
            highlightedFileRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
        }
    }, [highlightedFileId, filteredFiles]); // Rerun when filteredFiles changes to find the ref

    const handleDownload = (file: StoredFile) => {
        const url = URL.createObjectURL(file.content);
        const a = document.createElement('a');
        a.href = url;
        a.download = file.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };
    
    const tabs: { id: typeof activeTab; label: string }[] = [
        { id: 'all', label: 'Все' },
        { id: 'text', label: 'Текст' },
        { id: 'pdf', label: 'PDF' },
        { id: 'audio', label: 'Аудио' },
        { id: 'video', label: 'Видео' },
    ];

    return (
        <div className="h-full p-4 sm:p-6 flex flex-col text-white">
            <div className="flex-shrink-0 mb-4 border-b border-white/20">
                <nav className="-mb-px flex space-x-6">
                    {tabs.map(tab => (
                        <button
                            key={tab.id}
                            onClick={() => setActiveTab(tab.id)}
                            className={`whitespace-nowrap pb-3 px-1 border-b-2 font-medium text-sm transition-colors
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
            
            <div className="overflow-y-auto flex-1 pr-2 -mr-2">
                {filteredFiles.length === 0 ? (
                     <div className="h-full flex items-center justify-center">
                        <p className="text-gray-400 text-center">В этой категории нет файлов.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                        {filteredFiles.map(file => {
                            const isHighlighted = file.id === highlightedFileId;
                            return (
                                <div 
                                    key={file.id} 
                                    ref={isHighlighted ? highlightedFileRef : null}
                                    className={`bg-white/5 p-4 rounded-lg flex flex-col justify-between group transition-all duration-300 ${isHighlighted ? 'ring-2 ring-cyan-400 animate-subtle-pulse' : 'ring-0'}`}
                                >
                                    <div>
                                        <div className="flex items-start gap-4">
                                            <FileTypeIcon type={file.type} />
                                            <div className="flex-1 min-w-0">
                                                <p className="font-semibold text-gray-100 truncate" title={file.name}>{file.name}</p>
                                                <p className="text-xs text-gray-400 mt-1">
                                                    {new Date(file.date).toLocaleDateString('ru-RU')}
                                                    <span className="mx-1.5">&middot;</span>
                                                    {formatBytes(file.size)}
                                                </p>
                                            </div>
                                        </div>
                                    </div>
                                    <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-end gap-2">
                                        {['text', 'pdf', 'docx'].includes(file.type) && (
                                            <button onClick={() => onReadFile(file)} title="Прочитать содержимое" className="text-sm text-cyan-400 hover:text-cyan-300 font-medium px-3 py-1 rounded-md hover:bg-white/10 transition-colors">
                                                Прочитать
                                            </button>
                                        )}
                                        <button onClick={() => handleDownload(file)} title="Скачать файл" className="text-gray-400 hover:text-white transition-colors p-2 rounded-full hover:bg-white/10">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor"><path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" /></svg>
                                        </button>
                                        <button onClick={() => onDeleteFile(file.id)} title="Удалить файл" className="text-gray-400 hover:text-red-400 transition-colors p-2 rounded-full hover:bg-white/10">
                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 24 24" fill="currentColor"><path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
                                        </button>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
};

export default FileStorage;