import React from 'react';

const AssistantConfig: React.FC = () => {
    const definitions = [
        {
            term: 'Инструкция',
            description: 'Прямая, одноразовая команда для немедленного выполнения. Ассистент выполняет ее и не запоминает на будущее.',
            example: '«Добавь в планировщик задачу "Купить молоко"»'
        },
        {
            term: 'Правило',
            description: 'Постоянное указание, которое ассистент запоминает и должен соблюдать во всех последующих взаимодействиях. Эти правила хранятся в разделе "Инструкции" в Органайзере.',
            example: '«Запомни правило: всегда обращайся ко мне на "Вы"»'
        },
        {
            term: 'Протокол',
            description: 'Последовательность действий, запускаемая определенным событием или командой. Протоколы могут быть созданы путем объединения нескольких инструкций.',
            example: '«Когда я говорю "Доброе утро", сообщи мне прогноз погоды и мое первое событие в календаре»'
        },
        {
            term: 'Кодекс',
            description: 'Фундаментальные, неизменные принципы, управляющие работой ассистента. Они включают в себя стремление помогать пользователю, обеспечивать конфиденциальность данных и предоставлять точную информацию.',
            example: 'Кодекс является встроенным и не может быть изменен пользователем.'
        }
    ];

    return (
        <div className="h-full p-4 sm:p-6 text-white overflow-y-auto">
            <h2 className="text-xl font-bold mb-6">Конфигурация ассистента</h2>
            <div className="space-y-6">
                {definitions.map((def, index) => (
                    <div key={index} className="bg-white/5 p-4 rounded-lg border border-white/10">
                        <h3 className="text-lg font-semibold text-cyan-400">{def.term}</h3>
                        <p className="mt-2 text-gray-300">{def.description}</p>
                        <div className="mt-3 pt-3 border-t border-white/10">
                            <p className="text-sm text-gray-400">
                                <span className="font-semibold">Пример:</span>
                                <em className="ml-2">"{def.example}"</em>
                            </p>
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
};

export default AssistantConfig;