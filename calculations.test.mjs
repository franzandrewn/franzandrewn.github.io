import assert from "node:assert/strict";
import { test } from "node:test";
import { calculateMetrics, calculateSummary, filterSettlements, validatePaymentAmount } from "./calculations.mjs";

const obligation = { id: "o-1", counterpartyId: "cp-1", amountMinor: 10000, dueDate: "2026-10-10", active: true, documentNumber: "INV-1" };
const payments = [{ id: "p-1", obligationId: "o-1", amountMinor: 2500, active: true }];
const counterparties = [{ id: "cp-1", name: "Test Supplier", counterpartyType: "supplier" }];

test("calculates a partial payment and remaining balance", () => {
  assert.deepEqual(calculateMetrics(obligation, payments, "2026-10-03"), { paidMinor: 2500, remainingMinor: 7500, status: "partiallyPaid", overdueMinor: 0 });
});

test("gives overdue precedence over partially paid after the due date", () => {
  const result = calculateMetrics({ ...obligation, dueDate: "2026-10-02" }, payments, "2026-10-03");
  assert.deepEqual(result, { paidMinor: 2500, remainingMinor: 7500, status: "overdue", overdueMinor: 7500 });
});

test("includes active payments after the as-of date in the balance", () => {
  const result = calculateMetrics(obligation, [{ ...payments[0], paymentDate: "2026-10-20" }], "2026-10-03");
  assert.deepEqual(result, { paidMinor: 2500, remainingMinor: 7500, status: "partiallyPaid", overdueMinor: 0 });
});

test("calculates a fully paid obligation", () => {
  const result = calculateMetrics(obligation, [{ ...payments[0], amountMinor: 10000 }], "2026-10-03");
  assert.equal(result.remainingMinor, 0);
  assert.equal(result.status, "paid");
});

test("marks an unpaid past-due obligation overdue", () => {
  const result = calculateMetrics({ ...obligation, dueDate: "2026-10-02" }, [], "2026-10-03");
  assert.equal(result.status, "overdue");
  assert.equal(result.overdueMinor, 10000);
});

test("does not mark an obligation due today overdue", () => {
  const result = calculateMetrics({ ...obligation, dueDate: "2026-10-03" }, [], "2026-10-03");
  assert.equal(result.status, "registered");
});

test("rejects an overpayment", () => {
  const result = validatePaymentAmount(obligation, payments, 7501);
  assert.equal(result.valid, false);
  assert.equal(result.remainingMinor, 7500);
});

test("summarizes and filters the same source records", () => {
  const rows = filterSettlements([obligation], payments, counterparties, { type: "supplier", status: "partiallyPaid", search: "test" }, "2026-10-03");
  assert.equal(rows.length, 1);
  assert.deepEqual(calculateSummary(rows, payments, "2026-10-03"), { obligationMinor: 10000, paidMinor: 2500, remainingMinor: 7500, overdueMinor: 0, count: 1 });
});
