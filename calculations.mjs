export function activePaymentsFor(obligationId, payments) {
  return payments.filter((payment) => payment.active && payment.obligationId === obligationId);
}

export function calculateMetrics(obligation, payments, asOfDate) {
  const paidMinor = activePaymentsFor(obligation.id, payments).reduce((total, payment) => total + payment.amountMinor, 0);
  const remainingMinor = Math.max(obligation.amountMinor - paidMinor, 0);
  let status = "registered";
  if (remainingMinor === 0) status = "paid";
  else if (obligation.dueDate < asOfDate) status = "overdue";
  else if (paidMinor > 0) status = "partiallyPaid";
  return { paidMinor, remainingMinor, status, overdueMinor: status === "overdue" ? remainingMinor : 0 };
}

export function calculateSummary(obligations, payments, asOfDate) {
  return obligations.filter((obligation) => obligation.active).reduce((result, obligation) => {
    const metrics = calculateMetrics(obligation, payments, asOfDate);
    result.obligationMinor += obligation.amountMinor;
    result.paidMinor += metrics.paidMinor;
    result.remainingMinor += metrics.remainingMinor;
    result.overdueMinor += metrics.overdueMinor;
    result.count += 1;
    return result;
  }, { obligationMinor: 0, paidMinor: 0, remainingMinor: 0, overdueMinor: 0, count: 0 });
}

export function filterSettlements(obligations, payments, counterparties, filters, asOfDate) {
  const search = filters.search.trim().toLowerCase();
  return obligations.filter((obligation) => {
    if (!obligation.active) return false;
    const metrics = calculateMetrics(obligation, payments, asOfDate);
    const type = counterparties.find((item) => item.id === obligation.counterpartyId)?.counterpartyType;
    const name = counterparties.find((item) => item.id === obligation.counterpartyId)?.name || "";
    const matchesType = filters.type === "all" || type === filters.type;
    const matchesStatus = filters.status === "all" || metrics.status === filters.status;
    const matchesSearch = !search || name.toLowerCase().includes(search) || obligation.documentNumber.toLowerCase().includes(search);
    return matchesType && matchesStatus && matchesSearch;
  });
}

export function validatePaymentAmount(obligation, payments, amountMinor) {
  const remainingMinor = calculateMetrics(obligation, payments, "9999-12-31").remainingMinor;
  if (amountMinor <= 0) return { valid: false, remainingMinor, message: "The payment amount must be greater than zero." };
  if (amountMinor > remainingMinor) return { valid: false, remainingMinor, message: `Payment cannot exceed the remaining balance of ${remainingMinor} minor units.` };
  return { valid: true, remainingMinor, message: "" };
}
