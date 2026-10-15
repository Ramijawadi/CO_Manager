import { apiRequest, jsonBody } from '../../lib/api';
import { toProductMillimes } from '../../lib/productMoney';
import type { Expense, ExpenseInput } from './types';

const inDinars = (expense: Expense): Expense => ({
  ...expense, amount: expense.amount / 1000,
});

export const getExpenses = async (): Promise<Expense[]> =>
  (await apiRequest<Expense[]>('/expenses')).map(inDinars);

export const createExpense = async (expense: ExpenseInput): Promise<Expense> =>
  inDinars(await apiRequest<Expense>('/expenses', {
    method: 'POST', body: jsonBody({ ...expense, amount: toProductMillimes(expense.amount) }),
  }));

export const updateExpense = async (id: string, expense: Partial<ExpenseInput>): Promise<Expense> =>
  inDinars(await apiRequest<Expense>(`/expenses/${id}`, {
    method: 'PATCH', body: jsonBody({
      ...expense, ...(expense.amount !== undefined ? { amount: toProductMillimes(expense.amount) } : {}),
    }),
  }));

export const deleteExpense = (id: string): Promise<void> =>
  apiRequest(`/expenses/${id}`, { method: 'DELETE' });
