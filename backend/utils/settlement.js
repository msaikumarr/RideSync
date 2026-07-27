/**
 * Given a map of userId -> net balance (positive = should receive, negative = owes),
 * compute the minimum number of transactions to settle all debts.
 *
 * balances: { [userId: string]: number }
 * returns: [{ from: userId, to: userId, amount: number }]
 */
function computeMinimumSettlements(balances) {
  const creditors = [];
  const debtors = [];

  Object.entries(balances).forEach(([userId, amount]) => {
    const rounded = Math.round(amount * 100) / 100;
    if (rounded > 0.009) creditors.push({ userId, amount: rounded });
    else if (rounded < -0.009) debtors.push({ userId, amount: -rounded });
  }); 

  creditors.sort((a, b) => b.amount - a.amount);
  debtors.sort((a, b) => b.amount - a.amount);

  const transactions = [];
  let i = 0;
  let j = 0;

  while (i < debtors.length && j < creditors.length) {
    const debtor = debtors[i];
    const creditor = creditors[j];
    const settledAmount = Math.min(debtor.amount, creditor.amount);

    transactions.push({
      from: debtor.userId,
      to: creditor.userId,
      amount: Math.round(settledAmount * 100) / 100
    });

    debtor.amount -= settledAmount;
    creditor.amount -= settledAmount;

    if (debtor.amount < 0.01) i++;
    if (creditor.amount < 0.01) j++;
  }

  return transactions;
}

/**
 * Given a list of expenses (each with paidBy, amount, splitAmong[]),
 * compute net balance per user.
 */
function computeBalances(expenses) {
  const balances = {};

  expenses.forEach((expense) => {
    const payer = String(expense.paidBy);
    const participants = expense.splitAmong.map(String);
    const share = expense.amount / participants.length;

    balances[payer] = (balances[payer] || 0) + expense.amount;

    participants.forEach((userId) => {
      balances[userId] = (balances[userId] || 0) - share;
    });
  });

  return balances;
}

module.exports = { computeMinimumSettlements, computeBalances };
