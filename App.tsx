import React, { useState, useEffect } from 'react';
import Dashboard from './components/Dashboard';

// API-ключ считывается один раз при запуске
const API_KEY = process.env.API_KEY;

const ApiKeyErrorOverlay: React.FC = () => (
  <div className="absolute inset-0 z-50 bg-black/90 flex flex-col items-center justify-center text-center p-8">
    <div className="max-w-md bg-red-900/50 border border-red-600 rounded-lg p-6 animate-fade-in">
      <h1 className="text-2xl font-bold text-red-300 mb-2">ОШИБКА КОНФИГУРАЦИИ</h1>
      <p className="text-red-200">
        API-ключ Gemini не настроен. Приложение не может работать без него.
      </p>
      <p className="mt-4 text-sm text-gray-300">
        Пожалуйста, следуйте инструкциям в файле <code className="bg-gray-700 p-1 rounded">README.md</code>, чтобы создать файл <code className="bg-gray-700 p-1 rounded">.env.local</code> и добавить в него ваш ключ.
      </p>
    </div>
  </div>
);


const App: React.FC = () => {
  const [isApiKeyValid, setIsApiKeyValid] = useState(false);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [isSessionActive, setIsSessionActive] = useState(true);
  const [isChatCollapsed, setIsChatCollapsed] = useState(true);

  useEffect(() => {
    // Проверяем ключ только один раз при монтировании компонента
    if (API_KEY && API_KEY.trim() !== '' && !API_KEY.includes('YOUR_API_KEY')) {
      setIsApiKeyValid(true);
    } else {
      setIsApiKeyValid(false);
    }

    const timerId = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => clearInterval(timerId);
  }, []);

  const handleSessionEnd = () => {
    setIsSessionActive(false);
  };

  const handleCollapseChat = () => {
    setIsChatCollapsed(true);
  };

  const handleExpandChat = () => {
    setIsChatCollapsed(false);
  };

  const formattedTime = currentTime.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const formattedDate = currentTime.toLocaleDateString('ru-RU', { weekday: 'long', day: 'numeric', month: 'long' });

  const isHeaderCentered = (!isSessionActive || isChatCollapsed);

  return (
    <div className="relative min-h-screen bg-gray-900 text-white font-sans overflow-hidden">
      {!isApiKeyValid && <ApiKeyErrorOverlay />}
      
      {/* Background Image */}
      <div
        className="absolute inset-0 bg-cover bg-center z-0"
        style={{ backgroundImage: "url('https://images.unsplash.com/photo-1506905925346-21bda4d32df4?q=80&w=2070&auto=format&fit=crop')" }}
      />
      {/* Dark Overlay */}
      <div className="absolute inset-0 bg-black/70 z-10" />

      {/* Content - размываем и блокируем, если ключ невалидный */}
      <div className={`relative z-20 flex flex-col h-screen p-6 box-border gap-6 transition-all duration-300 ${!isApiKeyValid ? 'blur-sm pointer-events-none' : ''}`}>
        
        <header className={`relative flex-shrink-0 transition-[height] duration-700 ease-in-out w-full ${isHeaderCentered ? 'h-full' : 'h-20'}`}>
            <div className={`absolute transition-all duration-700 ease-in-out transform-gpu 
              ${isHeaderCentered 
                ? 'top-1/3 left-1/2 -translate-x-1/2 -translate-y-1/2 scale-100' 
                : 'top-1/2 left-0 -translate-y-1/2 scale-50 origin-left'}`
            }>
              <div className="relative pointer-events-auto">
                <p className="font-orbitron font-bold tracking-widest text-7xl whitespace-nowrap">
                  {formattedTime}
                </p>
                <p className={`
                  absolute top-full font-orbitron capitalize text-xl whitespace-nowrap 
                  transition-all duration-700 ease-in-out mt-1
                  ${isHeaderCentered 
                    ? 'left-1/2 -translate-x-1/2 text-gray-200' 
                    : 'left-0 translate-x-0 text-gray-300'
                  }
                `}>
                  {formattedDate}
                </p>
              </div>
            </div>
        </header>

        {/* Chat Window Container */}
        <main className={`flex-grow relative transition-opacity duration-700 ease-in-out ${!isSessionActive ? 'opacity-0 pointer-events-none' : 'opacity-100'}`}>
          {isSessionActive && isApiKeyValid && <Dashboard onSessionEnd={handleSessionEnd} isChatCollapsed={isChatCollapsed} onCollapseChat={handleCollapseChat} onExpandChat={handleExpandChat} />}
        </main>
      </div>
      
    </div>
  );
};

export default App;