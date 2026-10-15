export function summarizeFinancialYear(year, groups) {
  const months = Array.from({ length: 12 }, (_, index) => ({
    month: `${year}-${String(index + 1).padStart(2, '0')}`,
    time_income: 0, product_income: 0, subscription_income: 0, expenses: 0,
  }));
  const byMonth = new Map(months.map(month => [month.month, month]));
  for (const [field, rows] of Object.entries(groups)) {
    for (const row of rows) {
      const month = byMonth.get(row._id);
      if (!month || !Number.isSafeInteger(row.total) || row.total < 0) {
        throw new Error('Invalid financial aggregation result.');
      }
      month[field] = row.total;
    }
  }
  const finish = row => {
    const income = row.time_income + row.product_income + row.subscription_income;
    if (![income, row.expenses].every(Number.isSafeInteger)) {
      throw new Error('Financial totals exceed the supported amount.');
    }
    return { ...row, income, net: income - row.expenses };
  };
  const totals = { time_income: 0, product_income: 0, subscription_income: 0, expenses: 0 };
  for (const month of months) {
    for (const field of Object.keys(totals)) totals[field] += month[field];
  }
  return { year, months: months.map(finish), totals: finish(totals) };
}

export async function getFinancialYear(db, year) {
  // Tunisia's calendar boundaries are UTC+1; timestamps in storage are UTC.
  const start = new Date(`${year}-01-01T00:00:00+01:00`).toISOString();
  const end = new Date(`${year + 1}-01-01T00:00:00+01:00`).toISOString();
  const aggregate = (table, field, amount, timestamp, extra = {}) =>
    db.collection(table).aggregate([
      { $match: {
        ...extra,
        [field]: { $gte: timestamp ? start : `${year}-01-01`, $lt: timestamp ? end : `${year + 1}-01-01` },
      } },
      { $group: {
        _id: timestamp ? { $dateToString: {
          format: '%Y-%m', date: { $toDate: `$${field}` }, timezone: 'Africa/Tunis',
        } } : { $substrBytes: [`$${field}`, 0, 7] },
        total: { $sum: amount },
      } },
    ]).toArray();
  const [time_income, product_income, subscription_income, expenses] = await Promise.all([
    aggregate('sessions', 'exit_time', { $floor: { $add: [{ $multiply: ['$time_cost', 1000] }, 0.5] } }, true, { status: 'completed' }),
    aggregate('session_products', 'created_at', '$total_price', true),
    aggregate('subscription_payments', 'payment_date', '$amount', false),
    aggregate('expenses', 'expense_date', '$amount', false),
  ]);
  return summarizeFinancialYear(year, { time_income, product_income, subscription_income, expenses });
}
