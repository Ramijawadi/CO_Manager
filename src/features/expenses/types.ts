export interface ExpenseInput {
  name: string;
  category: string;
  amount: number;
  expense_date: string;
  notes?: string;
}

export interface Expense extends ExpenseInput {
  id: string;
  created_at: string;
  updated_at: string;
}

export const expenseCategories = [
  'Internet', 'Électricité', 'Eau', 'Loyer', 'Entretien', 'Fournitures', 'Autres',
];

export const formatExpenseAmount = (amount: number, locale = 'fr-TN'): string => {
  const currency = locale.startsWith('ar') ? 'د.ت' : 'DT';
  return `${amount.toLocaleString(locale, { minimumFractionDigits: 3, maximumFractionDigits: 3 })} ${currency}`;
};
