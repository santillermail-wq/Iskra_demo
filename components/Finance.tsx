import React, { useState, useMemo, useRef } from 'react';
import { FinanceData, Transaction } from '../types';
import { processUploadedFile, formatCurrency, calculateAverages } from '../services/financeService';

interface FinanceProps {
    financeData: FinanceData;
    setFinanceData: (data: FinanceData) => void;
    searchTerm: string;
    setSearchTerm: (term: string) => void;
    dailySpendingAllowance: number | null;
    setDailySpendingAllowance: (allowance: number | null) => void;
}

const Finance: React.FC<FinanceProps> = ({ financeData, setFinanceData, searchTerm, setSearchTerm, dailySpendingAllowance, setDailySpendingAllowance }) => {
    const [error, setError] = useState<string | null>(null);
    const fileInputRef = useRef<HTMLInputElement>(null);

    const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        setError(null);
        const file = event.target.files?.[0];
        if (!file) return;

        try {
            const fileContent = await file.text();
            const updatedData = processUploadedFile(fileContent, financeData);
            setFinanceData(updatedData);
        } catch (err) {
            console.error("Error processing file:", err);
            setError(err instanceof Error ? err.message : "Не удалось обработать файл.");
        } finally {
            // Reset file input to allow uploading the same file again
            if (fileInputRef.current) {
                fileInputRef.current.value = '';
            }
        }
    };

    const handleUploadClick = () => {
        fileInputRef.current?.click();
    };

    const handleClearSearch = () => {
        setSearchTerm('');
        setDailySpendingAllowance(null);
    };

    const { todayIncome, todayExpenses, groupedTransactions, averages } = useMemo(() => {
        const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
        let todayIncome = 0;
        let todayExpenses = 0;
        
        let transactionsToDisplay = financeData.transactions;

        if (searchTerm) {
            const lowerTerm = searchTerm.toLowerCase();
            // A simple date normalization for "вчера"
            if (lowerTerm === 'вчера') {
                const yesterday = new Date();
                yesterday.setDate(yesterday.getDate() - 1);
                const yesterdayStr = yesterday.toISOString().slice(0, 10);
                transactionsToDisplay = transactionsToDisplay.filter(tx => tx.date === yesterdayStr);
            } else {
                 transactionsToDisplay = transactionsToDisplay.filter(tx =>
                    tx.description.toLowerCase().includes(lowerTerm) ||
                    tx.date.includes(lowerTerm) ||
                    new Date(tx.date).toLocaleString('ru-RU', { month: 'long' }).toLowerCase().includes(lowerTerm)
                );
            }
        }

        const groups: { [key: string]: Transaction[] } = {};

        transactionsToDisplay.forEach(tx => {
            if (tx.date === today) {
                if (tx.type === 'income') {
                    todayIncome += tx.amount;
                } else {
                    todayExpenses += tx.amount;
                }
            }

            if (!groups[tx.date]) {
                groups[tx.date] = [];
            }
            groups[tx.date].push(tx);
        });

        // Sort groups by date ascending (oldest first)
        const sortedGroupKeys = Object.keys(groups).sort((a, b) => new Date(a).getTime() - new Date(b).getTime());
        
        const sortedGroups: { [key: string]: Transaction[] } = {};
        sortedGroupKeys.forEach(key => {
            // Sort transactions within each group by ID ascending (oldest first)
            groups[key].sort((a, b) => Number(a.id) - Number(b.id));
            sortedGroups[key] = groups[key];
        });

        const calculatedAverages = calculateAverages(financeData.transactions);

        return { todayIncome, todayExpenses, groupedTransactions: sortedGroups, averages: calculatedAverages };
    }, [financeData.transactions, searchTerm]);
    
    const calculateDailyTotal = (transactions: Transaction[]) => {
        return transactions.reduce((acc, tx) => {
            return tx.type === 'income' ? acc + tx.amount : acc - tx.amount;
        }, 0);
    };

    const hasTransactions = financeData.transactions.length > 0;
    const hasFilteredResults = Object.keys(groupedTransactions).length > 0;

    return (
        <div className="h-full p-4 sm:p-6 flex flex-col text-white">
            {/* Header with Balances & Averages */}
            <div className="flex-shrink-0 flex flex-col gap-4 mb-4">
                {/* Main Balances */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-center">
                    <div className="p-3 bg-white/5 rounded-lg">
                        <p className="text-sm text-gray-400">Общий баланс</p>
                        <p className="text-2xl font-bold text-cyan-400">{formatCurrency(financeData.totalBalance)}</p>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg">
                        <p className="text-sm text-gray-400">Кредитная карта</p>
                        <p className="text-2xl font-semibold">{formatCurrency(financeData.creditCardBalance)}</p>
                    </div>
                    <div className="p-3 bg-white/5 rounded-lg">
                        <p className="text-sm text-gray-400">Наличные</p>
                        <p className="text-2xl font-semibold">{formatCurrency(financeData.cashBalance)}</p>
                    </div>
                </div>
                {/* Averages */}
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-center">
                    <div className="p-2 bg-white/5 rounded-lg">
                        <p className="text-xs text-gray-400">Ср. расход / день</p>
                        <p className="font-semibold text-red-400">{formatCurrency(averages.avgDailyExpense)}</p>
                    </div>
                    <div className="p-2 bg-white/5 rounded-lg">
                        <p className="text-xs text-gray-400">Ср. расход / неделя</p>
                        <p className="font-semibold text-red-400">{formatCurrency(averages.avgWeeklyExpense)}</p>
                    </div>
                    <div className="p-2 bg-white/5 rounded-lg">
                        <p className="text-xs text-gray-400">Ср. расход / месяц</p>
                        <p className="font-semibold text-red-400">{formatCurrency(averages.avgMonthlyExpense)}</p>
                    </div>
                    <div className="p-2 bg-white/5 rounded-lg">
                        <p className="text-xs text-gray-400">Ср. годовой доход</p>
                        <p className="font-semibold text-green-400">{formatCurrency(averages.avgAnnualIncome)}</p>
                    </div>
                </div>
            </div>


            {/* Today's Summary */}
            <div className="flex-shrink-0 bg-white/5 p-3 rounded-lg flex justify-between items-center mb-4">
                <span className="font-semibold">Сегодня</span>
                <div className="flex items-center gap-4 text-right">
                    <div>
                        <p className="text-xs text-green-400">Доход</p>
                        <p className="font-mono">{formatCurrency(todayIncome)}</p>
                    </div>
                    <div>
                        <p className="text-xs text-red-400">Расход</p>
                        <p className="font-mono">{formatCurrency(todayExpenses)}</p>
                    </div>
                </div>
            </div>
            
            {/* Daily Spending Allowance Display */}
            {dailySpendingAllowance !== null && (
                <div className="flex-shrink-0 bg-blue-900/50 border border-blue-700 rounded-lg p-3 flex justify-between items-center mb-4 text-sm animate-fade-in">
                    <div className="flex items-center gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-300 flex-shrink-0" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7-4a1 1 0 11-2 0 1 1 0 012 0zM9 9a1 1 0 000 2v3a1 1 0 001 1h1a1 1 0 100-2v-3a1 1 0 00-1-1H9z" clipRule="evenodd" />
                        </svg>
                        <p className="text-gray-200">
                            Рекомендуемый дневной расход: <span className="font-semibold text-white">{formatCurrency(dailySpendingAllowance)}</span>
                        </p>
                    </div>
                    <button 
                        onClick={() => setDailySpendingAllowance(null)} 
                        className="text-blue-300 hover:text-white flex-shrink-0 p-1"
                        title="Скрыть"
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                           <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.607a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>
            )}

            {/* Search Term Display */}
            {searchTerm && (
                <div className="flex-shrink-0 bg-cyan-900/50 border border-cyan-700 rounded-lg p-2 flex justify-between items-center mb-4 text-sm animate-fade-in">
                    <p className="text-gray-200 truncate pr-2">
                        Результаты по запросу: <span className="font-semibold text-white">"{searchTerm}"</span>
                    </p>
                    <button 
                        onClick={handleClearSearch} 
                        className="text-cyan-300 hover:text-white font-semibold flex-shrink-0 flex items-center gap-1"
                        title="Сбросить поиск"
                    >
                        Сбросить
                        <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" viewBox="0 0 20 20" fill="currentColor">
                           <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.607a1 1 0 010-1.414z" clipRule="evenodd" />
                        </svg>
                    </button>
                </div>
            )}

            {/* Transaction History */}
            <div className="flex-1 overflow-y-auto pr-2 space-y-4">
                {!hasTransactions ? (
                     <div className="h-full flex items-center justify-center">
                        <p className="text-gray-400 text-center">История транзакций пуста. <br/> Загрузите выписку, чтобы начать.</p>
                    </div>
                ) : !hasFilteredResults && searchTerm ? (
                    <div className="h-full flex items-center justify-center">
                        <p className="text-gray-400 text-center">Транзакции по запросу "{searchTerm}" не найдены.</p>
                    </div>
                ) : (
                    (Object.entries(groupedTransactions) as [string, Transaction[]][]).map(([date, transactions]) => {
                        const dailyTotal = calculateDailyTotal(transactions);
                        const dailyTotalColor = dailyTotal >= 0 ? 'text-green-400' : 'text-red-400';
                        const dailyTotalSign = dailyTotal >= 0 ? '+' : '';

                        return (
                            <div key={date}>
                                <div className="flex justify-between items-baseline mb-2">
                                    <h3 className="font-semibold text-gray-300">
                                        {new Date(date + 'T00:00:00').toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })}
                                    </h3>
                                    <p className={`font-mono text-sm ${dailyTotalColor}`}>{dailyTotalSign}{formatCurrency(dailyTotal)}</p>
                                </div>
                                <div className="space-y-2">
                                    {transactions.map(tx => (
                                        <div key={tx.id} className="bg-white/5 p-2.5 rounded-md flex justify-between items-center text-sm">
                                            <div className="flex items-center gap-3 flex-grow min-w-0 pr-4">
                                                {(tx.paymentMethod === 'cash' || tx.paymentMethod === 'creditCard') && (
                                                    <div className="flex-shrink-0">
                                                        {tx.paymentMethod === 'cash' && (
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-green-400" title="Наличные" viewBox="0 0 20 20" fill="currentColor">
                                                              <path fillRule="evenodd" d="M4 4a2 2 0 00-2 2v4a2 2 0 002 2h12a2 2 0 002-2V6a2 2 0 00-2-2H4zm12 1a1 1 0 100-2H4a1 1 0 100 2h12zM2 13.5a1.5 1.5 0 011.5-1.5h13A1.5 1.5 0 0118 13.5v1a1.5 1.5 0 01-1.5 1.5h-13A1.5 1.5 0 012 14.5v-1z" clipRule="evenodd" />
                                                            </svg>
                                                        )}
                                                        {tx.paymentMethod === 'creditCard' && (
                                                            <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5 text-blue-400" title="Кредитная карта" viewBox="0 0 20 20" fill="currentColor">
                                                              <path d="M4 4a2 2 0 00-2 2v1h16V6a2 2 0 00-2-2H4z" />
                                                              <path fillRule="evenodd" d="M18 9H2v6a2 2 0 002 2h12a2 2 0 002-2V9zM4 13a1 1 0 011-1h1a1 1 0 110 2H5a1 1 0 01-1-1zm3 0a1 1 0 011-1h1a1 1 0 110 2H8a1 1 0 01-1-1z" clipRule="evenodd" />
                                                            </svg>
                                                        )}
                                                    </div>
                                                )}
                                                <p className="text-gray-200 truncate">{tx.description}</p>
                                            </div>
                                            <p className={`font-mono flex-shrink-0 ${tx.type === 'income' ? 'text-green-400' : 'text-red-400'}`}>
                                                {tx.type === 'income' ? '+' : '-'}{formatCurrency(tx.amount)}
                                            </p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )
                    })
                )}
            </div>

             {/* Footer with Upload Button */}
             <div className="flex-shrink-0 pt-4">
                {error && <p className="text-red-400 text-center mb-2 text-sm">{error}</p>}
                <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    className="hidden"
                    accept=".txt, .csv" // .xls, .xlsx would require a library
                />
                <button
                    onClick={handleUploadClick}
                    className="w-full h-12 bg-cyan-600/80 hover:bg-cyan-600 rounded-lg text-white font-semibold flex items-center justify-center gap-2 transition-colors"
                >
                     <svg xmlns="http://www.w3.org/2000/svg" className="h-5 w-5" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zM6.293 6.707a1 1 0 010-1.414l3-3a1 1 0 011.414 0l3 3a1 1 0 01-1.414 1.414L11 5.414V13a1 1 0 11-2 0V5.414L7.707 6.707a1 1 0 01-1.414 0z" clipRule="evenodd" />
                    </svg>
                    Загрузить выписку (TXT, 1C)
                </button>
            </div>
        </div>
    );
};

export default Finance;