// Compute net balances per user and a minimal set of settlement transactions.
// balances: { userId: netAmount }  (positive = is owed money, negative = owes money)
export function computeBalances(expenses, shares) {
  const bal = {};
  const add = (u, v) => { bal[u] = (bal[u] || 0) + v; };

  for (const e of expenses) {
    add(e.paid_by, Number(e.amount)); // payer fronted the money
  }
  for (const s of shares) {
    add(s.user_id, -Number(s.share)); // each participant owes their share
  }
  // round to paise
  for (const k of Object.keys(bal)) bal[k] = Math.round(bal[k] * 100) / 100;
  return bal;
}

// Greedy minimal cash flow: who pays whom.
export function settlements(balances) {
  const creditors = [];
  const debtors = [];
  for (const [user, amt] of Object.entries(balances)) {
    if (amt > 0.009) creditors.push({ user, amt });
    else if (amt < -0.009) debtors.push({ user, amt: -amt });
  }
  creditors.sort((a, b) => b.amt - a.amt);
  debtors.sort((a, b) => b.amt - a.amt);

  const result = [];
  let i = 0, j = 0;
  while (i < debtors.length && j < creditors.length) {
    const pay = Math.min(debtors[i].amt, creditors[j].amt);
    result.push({
      from: debtors[i].user,
      to: creditors[j].user,
      amount: Math.round(pay * 100) / 100,
    });
    debtors[i].amt -= pay;
    creditors[j].amt -= pay;
    if (debtors[i].amt < 0.009) i++;
    if (creditors[j].amt < 0.009) j++;
  }
  return result;
}
