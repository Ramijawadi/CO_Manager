import { apiRequest } from '../../lib/api';

export interface FinancialTotals {
  time_income: number;
  product_income: number;
  subscription_income: number;
  income: number;
  expenses: number;
  net: number;
}
export interface FinancialMonth extends FinancialTotals { month: string }
export interface FinancialReport { year: number; totals: FinancialTotals; months: FinancialMonth[] }

function inDinars<T extends FinancialTotals>(row: T): T {
  return {
    ...row, time_income: row.time_income / 1000, product_income: row.product_income / 1000,
    subscription_income: row.subscription_income / 1000, income: row.income / 1000,
    expenses: row.expenses / 1000, net: row.net / 1000,
  };
}

export async function getFinancialReport(year: number): Promise<FinancialReport> {
  const report = await apiRequest<FinancialReport>(`/reports/financial?${new URLSearchParams({ year: String(year) })}`);
  return { ...report, totals: inDinars(report.totals), months: report.months.map(inDinars) };
}
