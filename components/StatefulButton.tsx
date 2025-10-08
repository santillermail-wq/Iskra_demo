import React from 'react';

type ButtonStatus = 'idle' | 'recording' | 'processing';

interface StatefulButtonProps {
    status: ButtonStatus;
    onClick: () => void;
    ariaLabel: string;
}

const StatefulButton: React.FC<StatefulButtonProps> = ({ status, onClick, ariaLabel }) => {
    const isIdle = status === 'idle';
    const isRecording = status === 'recording';
    const isProcessing = status === 'processing';

    const glowClasses = [
        'absolute inset-0 rounded-full blur-lg transition-colors duration-300',
        isRecording && 'bg-red-500/80 animate-breathing',
        isProcessing && 'bg-orange-500/80 animate-breathing',
        isIdle && 'hidden',
    ].filter(Boolean).join(' ');

    const buttonAnimationClasses = (isRecording || isProcessing) ? 'animate-subtle-pulse' : '';

    const iconColorClasses = [
        'h-7 w-7 transition-colors',
        isIdle && 'text-gray-400',
        isRecording && 'text-red-500',
        isProcessing && 'text-orange-500',
    ].filter(Boolean).join(' ');

    return (
        <div className="relative w-14 h-14 flex items-center justify-center">
            <div className={glowClasses}></div>
            <button
                onClick={onClick}
                disabled={isProcessing}
                className={`relative w-14 h-14 rounded-full flex items-center justify-center transition-all duration-300 ease-in-out shadow-lg focus:outline-none disabled:cursor-not-allowed ${buttonAnimationClasses}`}
                aria-label={ariaLabel}
            >
                <div className="w-full h-full p-0.5 rounded-full bg-gray-600">
                    <div className="w-full h-full rounded-full flex items-center justify-center bg-gray-800">
                        <svg
                            xmlns="http://www.w3.org/2000/svg"
                            className={iconColorClasses}
                            viewBox="0 0 24 24"
                            fill="currentColor"
                        >
                            <circle cx="12" cy="12" r="6"></circle>
                        </svg>
                    </div>
                </div>
            </button>
        </div>
    );
};

export default StatefulButton;