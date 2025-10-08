import { FinanceData, Transaction } from '../types';

/**
 * Formats a number as a currency string.
 * @param amount - The number to format.
 * @returns A string representing the currency, e.g., "1,234.50 ₽".
 */
export const formatCurrency = (amount: number): string => {
    return new Intl.NumberFormat('ru-RU', {
        style: 'currency',
        currency: 'RUB',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
    }).format(amount);
};

// Helper functions to get week/month/year keys without external libraries
const getWeekNumber = (d: Date): number => {
    d = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    // Calculate full weeks to nearest Thursday
    const weekNo = Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
    return weekNo;
};
const getYearWeek = (date: Date): string => `${date.getFullYear()}-${getWeekNumber(date)}`;
const getYearMonth = (date: Date): string => `${date.getFullYear()}-${(date.getMonth() + 1).toString().padStart(2, '0')}`;
const getYearFromDate = (date: Date): string => `${date.getFullYear()}`;


interface Averages {
    avgDailyExpense: number;
    avgWeeklyExpense: number;
    avgMonthlyExpense: number;
    avgAnnualIncome: number;
}

export const calculateAverages = (transactions: Transaction[]): Averages => {
    const expenses = transactions.filter(t => t.type === 'expense');
    const incomes = transactions.filter(t => t.type === 'income');

    const expensesByDay: { [key: string]: number } = {};
    const expensesByWeek: { [key: string]: number } = {};
    const expensesByMonth: { [key: string]: number } = {};
    const incomesByYear: { [key: string]: number } = {};

    for (const expense of expenses) {
        const date = new Date(expense.date + 'T00:00:00'); // Ensure date is parsed correctly
        const dayKey = expense.date; // YYYY-MM-DD
        const weekKey = getYearWeek(date);
        const monthKey = getYearMonth(date);

        expensesByDay[dayKey] = (expensesByDay[dayKey] || 0) + expense.amount;
        expensesByWeek[weekKey] = (expensesByWeek[weekKey] || 0) + expense.amount;
        expensesByMonth[monthKey] = (expensesByMonth[monthKey] || 0) + expense.amount;
    }

    for (const income of incomes) {
        const date = new Date(income.date + 'T00:00:00');
        const yearKey = getYearFromDate(date);
        incomesByYear[yearKey] = (incomesByYear[yearKey] || 0) + income.amount;
    }

    const totalDailyExpenses = Object.values(expensesByDay).reduce((sum, val) => sum + val, 0);
    const dailyCount = Object.keys(expensesByDay).length;
    const avgDailyExpense = dailyCount > 0 ? totalDailyExpenses / dailyCount : 0;

    const totalWeeklyExpenses = Object.values(expensesByWeek).reduce((sum, val) => sum + val, 0);
    const weeklyCount = Object.keys(expensesByWeek).length;
    const avgWeeklyExpense = weeklyCount > 0 ? totalWeeklyExpenses / weeklyCount : 0;

    const totalMonthlyExpenses = Object.values(expensesByMonth).reduce((sum, val) => sum + val, 0);
    const monthlyCount = Object.keys(expensesByMonth).length;
    const avgMonthlyExpense = monthlyCount > 0 ? totalMonthlyExpenses / monthlyCount : 0;

    const totalAnnualIncomes = Object.values(incomesByYear).reduce((sum, val) => sum + val, 0);
    const yearlyCount = Object.keys(incomesByYear).length;
    const avgAnnualIncome = yearlyCount > 0 ? totalAnnualIncomes / yearlyCount : 0;
    
    return { avgDailyExpense, avgWeeklyExpense, avgMonthlyExpense, avgAnnualIncome };
};

/**
 * Parses a standard text bank statement.
 * Assumes format: DD.MM.YYYY;Description;Amount
 * e.g., "25.12.2023;Покупка в магазине;-1500.00"
 * e.g., "26.12.2023;Зарплата;+50000.00"
 */
const parseTxtStatement = (content: string): Omit<Transaction, 'id'>[] => {
    const transactions: Omit<Transaction, 'id'>[] = [];
    const lines = content.split('\n').filter(line => line.trim() !== '');

    for (const line of lines) {
        const parts = line.split(';');
        if (parts.length !== 3) continue;

        const [dateStr, description, amountStr] = parts;

        const dateParts = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if (!dateParts) continue;
        const date = `${dateParts[3]}-${dateParts[2]}-${dateParts[1]}`; // YYYY-MM-DD

        const amount = parseFloat(amountStr.replace(/[\s+,]/g, '').replace(',', '.'));
        if (isNaN(amount)) continue;

        transactions.push({
            date,
            description: description.trim(),
            amount: Math.abs(amount),
            type: amount >= 0 ? 'income' : 'expense',
        });
    }
    return transactions;
};

/**
 * Parses a simplified 1C-style statement.
 * This is a very basic example. A real 1C parser would be much more complex.
 * Assumes format contains lines like:
 * "Дата=25.12.2023"
 * "Сумма=-1500.00"
 * "Назначение=Покупка в магазине"
 */
const parse1CStatement = (content: string): Omit<Transaction, 'id'>[] => {
    const transactions: Omit<Transaction, 'id'>[] = [];
    const sections = content.split(/СекцияДокумент=Платежное поручение/i).slice(1);

    for (const section of sections) {
        const lines = section.split('\n');
        const data: { [key: string]: string } = {};
        
        lines.forEach(line => {
            const parts = line.split('=');
            if (parts.length === 2) {
                data[parts[0].trim()] = parts[1].trim();
            }
        });

        const dateStr = data['Дата'];
        const amountStr = data['Сумма'];
        const description = data['НазначениеПлатежа'] || data['Назначение'] || 'Без описания';

        if (!dateStr || !amountStr) continue;
        
        const dateParts = dateStr.match(/(\d{2})\.(\d{2})\.(\d{4})/);
        if (!dateParts) continue;
        const date = `${dateParts[3]}-${dateParts[2]}-${dateParts[1]}`;

        const amount = parseFloat(amountStr.replace(/[\s+,]/g, '').replace(',', '.'));
        if (isNaN(amount)) continue;

        transactions.push({
            date,
            description,
            amount: Math.abs(amount),
            type: amount >= 0 ? 'income' : 'expense',
        });
    }

    return transactions;
};


/**
 * Determines the file type and calls the appropriate parser.
 */
const parseStatement = (content: string): Omit<Transaction, 'id'>[] => {
    // Simple heuristic to detect 1C format
    if (content.toLowerCase().includes('секциядокумент')) {
        return parse1CStatement(content);
    }
    // Default to TXT format
    return parseTxtStatement(content);
};

/**
 * Processes the uploaded file content, merges transactions, and recalculates balances.
 * @param content - The string content of the uploaded file.
 * @param currentData - The existing finance data from state.
 * @returns The updated FinanceData object.
 */
export const processUploadedFile = (content: string, currentData: FinanceData): FinanceData => {
    const newTransactionsRaw = parseStatement(content);
    if (newTransactionsRaw.length === 0) {
        throw new Error("Не удалось найти транзакции в файле. Проверьте формат. Поддерживаемые форматы: 'ДД.ММ.ГГГГ;Описание;Сумма' или выгрузка из 1С.");
    }
    
    const existingTransactionSignatures = new Set(
        currentData.transactions.map(tx => `${tx.date}|${tx.description}|${tx.amount.toFixed(2)}|${tx.type}`)
    );

    const uniqueNewTransactions: Transaction[] = [];
    newTransactionsRaw.forEach(tx => {
        const signature = `${tx.date}|${tx.description}|${tx.amount.toFixed(2)}|${tx.type}`;
        if (!existingTransactionSignatures.has(signature)) {
            uniqueNewTransactions.push({
                ...tx,
                id: `${new Date(tx.date).getTime()}-${Math.random()}` // Create a unique ID
            });
            existingTransactionSignatures.add(signature); // Add to set to handle duplicates within the same file
        }
    });

    if (uniqueNewTransactions.length === 0) {
        throw new Error("Новые транзакции не найдены. Возможно, эта выписка уже была загружена.");
    }
    
    const allTransactions = [...currentData.transactions, ...uniqueNewTransactions];

    // Recalculate balances from scratch
    const totalBalance = allTransactions.reduce((acc, tx) => {
        return tx.type === 'income' ? acc + tx.amount : acc - tx.amount;
    }, 0);

    return {
        transactions: allTransactions,
        totalBalance,
        creditCardBalance: 0,
        cashBalance: 0,
    };
};