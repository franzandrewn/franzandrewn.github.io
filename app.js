import { calculateMetrics, calculateSummary, filterSettlements, validatePaymentAmount } from "./calculations.mjs";
import { createDataService } from "./firebase-client.mjs";

const TODAY = "2026-10-03";

const seedData = {
  counterparties: [
    { id: "cp-volga", name: "Volga Office Supply", counterpartyType: "supplier", registrationNumber: "TEST-S-001", contact: "demo@supplier.test", active: true, createdAt: "2026-09-01T09:00:00.000Z" },
    { id: "cp-northline", name: "Northline Repairs", counterpartyType: "contractor", registrationNumber: "TEST-C-001", contact: "demo@contractor.test", active: true, createdAt: "2026-09-01T09:00:00.000Z" }
  ],
  contracts: [
    { id: "contract-office", counterpartyId: "cp-volga", number: "SUP-2026-014", contractDate: "2026-08-28", paymentTermsDays: 14, currency: "RUB", description: "Office supplies", active: true },
    { id: "contract-repair", counterpartyId: "cp-northline", number: "WORK-2026-009", contractDate: "2026-08-30", paymentTermsDays: 30, currency: "RUB", description: "Equipment repair", active: true }
  ],
  obligations: [
    { id: "obligation-paper", counterpartyId: "cp-volga", contractId: "contract-office", documentType: "invoice", documentNumber: "INV-0148", documentDate: "2026-09-03", amountMinor: 180000, recognizedOn: "2026-09-03", dueDate: "2026-09-20", active: true },
    { id: "obligation-repair", counterpartyId: "cp-northline", contractId: "contract-repair", documentType: "completedWorkAct", documentNumber: "ACT-0092", documentDate: "2026-09-15", amountMinor: 245000, recognizedOn: "2026-09-15", dueDate: "2026-10-20", active: true }
  ],
  payments: [
    { id: "payment-paper-1", obligationId: "obligation-paper", paymentDate: "2026-09-12", amountMinor: 100000, currency: "RUB", method: "bankTransfer", reference: "PAY-0912-01", active: true }
  ]
};

function emptyData() {
  return { counterparties: [], contracts: [], obligations: [], payments: [] };
}

const dataServicePromise = createDataService(seedData);
let dataService;
const state = {
  view: "overview",
  data: emptyData(),
  mode: "initializing",
  user: null,
  loading: true,
  firestoreError: "",
  reportAsOf: TODAY,
  filters: { type: "all", status: "all", search: "" }
};

const app = document.querySelector("#app");
const loginView = document.querySelector("#login-view");
const workspaceView = document.querySelector("#workspace-view");
const loginForm = document.querySelector('[data-form="login"]');
const loginError = document.querySelector("#login-error");
const loginModeNote = document.querySelector("#login-mode-note");
const mainContent = document.querySelector("#main-content");
const toastRegion = document.querySelector("#toast-region");

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[character]));
}

function money(amountMinor) {
  return new Intl.NumberFormat("en-US", { style: "currency", currency: "RUB", minimumFractionDigits: 2 }).format((amountMinor || 0) / 100);
}

function dateValue(value) {
  return new Date(`${value}T00:00:00`);
}

function formatDate(value) {
  if (!value) return "—";
  return new Intl.DateTimeFormat("en-GB", { day: "2-digit", month: "short", year: "numeric" }).format(dateValue(value));
}

function todayValue() {
  return TODAY;
}

function counterparty(id) {
  return state.data.counterparties.find((item) => item.id === id);
}

function contract(id) {
  return state.data.contracts.find((item) => item.id === id);
}

function obligation(id) {
  return state.data.obligations.find((item) => item.id === id);
}

function metricsFor(item, asOf = state.reportAsOf) {
  return calculateMetrics(item, state.data.payments, asOf);
}

function activeObligations() {
  return state.data.obligations.filter((item) => item.active);
}

function summary(asOf = state.reportAsOf, items = activeObligations()) {
  return calculateSummary(items, state.data.payments, asOf);
}

function statusLabel(status) {
  return ({ registered: "Registered", partiallyPaid: "Partially paid", paid: "Paid", overdue: "Overdue" }[status] || status);
}

function typeLabel(type) {
  return type === "completedWorkAct" ? "Completed-work act" : ({ invoice: "Invoice", deliveryNote: "Delivery note", adjustment: "Adjustment" }[type] || type);
}

function methodLabel(method) {
  return ({ bankTransfer: "Bank transfer", cash: "Cash", other: "Other" }[method] || method);
}

function selectOptions(items, valueKey, label) {
  return items.map((item) => `<option value="${escapeHtml(item[valueKey])}">${escapeHtml(label(item))}</option>`).join("");
}

function summaryCards(data) {
  return `<div class="summary-grid">
    <article class="summary-card accent"><p>Obligations</p><strong class="summary-value">${data.count}</strong><small>${money(data.obligationMinor)} registered</small></article>
    <article class="summary-card"><p>Paid</p><strong class="summary-value">${money(data.paidMinor)}</strong><small>Recorded payments</small></article>
    <article class="summary-card warn"><p>Remaining</p><strong class="summary-value">${money(data.remainingMinor)}</strong><small>Open balance</small></article>
    <article class="summary-card alert"><p>Overdue</p><strong class="summary-value">${money(data.overdueMinor)}</strong><small>At ${formatDate(state.reportAsOf)}</small></article>
  </div>`;
}

function environmentLabel() {
  return state.mode === "cloud" ? "Firebase-backed register" : "Local demo fallback";
}

function pageHeading(title, description, action = "") {
  return `<div class="page-heading"><div><p class="eyebrow">${environmentLabel()}</p><h1>${title}</h1><p>${description}</p></div>${action}</div>`;
}

function render() {
  updateWorkspaceChrome();
  document.querySelectorAll(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.view === state.view));
  if (state.loading) mainContent.innerHTML = loadingState();
  else if (state.firestoreError) mainContent.innerHTML = firestoreErrorState();
  else mainContent.innerHTML = viewMarkup();
  mainContent.focus({ preventScroll: true });
}

function updateLoginMode() {
  const demoButton = document.querySelector('[data-action="login"]');
  const cloudMode = state.mode === "cloud";
  loginModeNote.innerHTML = cloudMode
    ? "<strong>Firebase operator sign-in</strong><span>Use the synthetic account provisioned for this isolated project.</span>"
    : "<strong>Local demo fallback</strong><span>Firebase configuration is not present; records stay in this browser only.</span>";
  loginForm.classList.toggle("hidden", !cloudMode);
  demoButton.classList.toggle("hidden", cloudMode);
}

function updateWorkspaceChrome() {
  const cloudMode = state.mode === "cloud";
  document.querySelector("#data-environment-label").textContent = cloudMode ? "Firebase / Firestore" : "Local fallback";
  document.querySelector("#operator-label").textContent = state.user?.email || "Operator";
  document.querySelector("#sidebar-environment-label").textContent = cloudMode ? "Cloud environment" : "Demo environment";
  document.querySelector("#sidebar-storage-label").textContent = cloudMode ? "Firestore persistence" : "Local browser storage";
  document.querySelector("#reset-data-button").classList.toggle("hidden", cloudMode);
}

function loadingState() {
  return "<section class=\"panel loading-state\"><strong>Loading settlement data</strong><span>Reading the current register from the selected data source.</span></section>";
}

function firestoreErrorState() {
  return `<section class="panel error-state"><strong>Settlement data could not be loaded</strong><span>${escapeHtml(state.firestoreError)}</span><button class="button button-primary" data-action="retry-load">Retry</button></section>`;
}

function viewMarkup() {
  if (state.view === "counterparties") return counterpartiesView();
  if (state.view === "contracts") return contractsView();
  if (state.view === "obligations") return obligationsView();
  if (state.view === "payments") return paymentsView();
  if (state.view === "report") return reportView();
  return overviewView();
}

function overviewView() {
  const data = summary();
  const recent = activeObligations().slice().sort((a, b) => b.documentDate.localeCompare(a.documentDate)).slice(0, 4);
  return `${pageHeading("Settlement overview", "A compact view of obligations, payments and the current open balance.", `<button class="button button-primary" data-view="obligations">Register obligation</button>`)}
    ${summaryCards(data)}
    <div class="content-grid">
      <section class="panel"><div class="panel-header"><h2>Recent obligations</h2><button class="button button-ghost button-small" data-view="report">Open register</button></div><div class="table-wrap">${obligationTable(recent)}</div></section>
      <section class="panel"><div class="panel-header"><h2>Core workflow</h2></div><div class="panel-body"><div class="workflow-list">
        <div class="workflow-step"><span class="step-index">1</span><div><strong>Counterparty</strong><span>Supplier or contractor record</span></div></div>
        <div class="workflow-step"><span class="step-index">2</span><div><strong>Contract</strong><span>Terms and responsible party</span></div></div>
        <div class="workflow-step"><span class="step-index">3</span><div><strong>Obligation</strong><span>Document, amount and due date</span></div></div>
        <div class="workflow-step"><span class="step-index">4</span><div><strong>Payment and report</strong><span>Partial payment and balance</span></div></div>
      </div></div></section>
    </div>`;
}

function counterpartiesView() {
  return `${pageHeading("Counterparties", "Maintain the small directory used by contracts and settlement reports.", `<button class="button button-primary" data-scroll-to="counterparty-form">Add counterparty</button>`)}
    <section id="counterparty-form" class="panel form-panel"><div class="panel-header"><h2>New counterparty</h2><span class="helper">Supplier or contractor</span></div><form class="panel-body" data-form="counterparty"><div class="form-grid">
      <div class="field"><label for="counterparty-name">Name *</label><input id="counterparty-name" name="name" required maxlength="80" placeholder="Example: Volga Office Supply"></div>
      <div class="field"><label for="counterparty-type">Type *</label><select id="counterparty-type" name="counterpartyType" required><option value="supplier">Supplier</option><option value="contractor">Contractor</option></select></div>
      <div class="field"><label for="counterparty-registration">Test registration number</label><input id="counterparty-registration" name="registrationNumber" maxlength="30" placeholder="TEST-S-003"></div>
      <div class="field"><label for="counterparty-contact">Contact reference</label><input id="counterparty-contact" name="contact" maxlength="80" placeholder="demo@example.test"></div>
    </div><div class="form-actions"><button class="button button-primary" type="submit">Save counterparty</button></div></form></section>
    <section class="panel"><div class="panel-header"><h2>Directory</h2><span class="helper">${state.data.counterparties.length} records</span></div><div class="table-wrap">${counterpartyTable()}</div></section>`;
}

function contractsView() {
  const activeCounterparties = state.data.counterparties.filter((item) => item.active);
  return `${pageHeading("Contracts", "Link a simple contract record to each supplier or contractor.", `<button class="button button-primary" data-scroll-to="contract-form">Add contract</button>`)}
    <section id="contract-form" class="panel form-panel"><div class="panel-header"><h2>New contract</h2><span class="helper">RUB only</span></div><form class="panel-body" data-form="contract"><div class="form-grid">
      <div class="field"><label for="contract-counterparty">Counterparty *</label><select id="contract-counterparty" name="counterpartyId" required><option value="">Select counterparty</option>${selectOptions(activeCounterparties, "id", (item) => `${item.name} · ${item.counterpartyType}`)}</select></div>
      <div class="field"><label for="contract-number">Contract number *</label><input id="contract-number" name="number" required maxlength="40" placeholder="SUP-2026-015"></div>
      <div class="field"><label for="contract-date">Contract date *</label><input id="contract-date" name="contractDate" type="date" required value="${todayValue()}"></div>
      <div class="field"><label for="contract-terms">Payment terms, days</label><input id="contract-terms" name="paymentTermsDays" type="number" min="0" max="3650" value="14"></div>
      <div class="field full"><label for="contract-description">Description</label><input id="contract-description" name="description" maxlength="120" placeholder="Goods or work covered by the contract"></div>
    </div><div class="form-actions"><button class="button button-primary" type="submit">Save contract</button></div></form></section>
    <section class="panel"><div class="panel-header"><h2>Contract register</h2><span class="helper">${state.data.contracts.length} records</span></div><div class="table-wrap">${contractTable()}</div></section>`;
}

function obligationsView() {
  const activeCounterparties = state.data.counterparties.filter((item) => item.active);
  const activeContracts = state.data.contracts.filter((item) => item.active);
  return `${pageHeading("Obligations", "Register the source-document details and amount that create a settlement obligation.", `<button class="button button-primary" data-scroll-to="obligation-form">Add obligation</button>`)}
    <section id="obligation-form" class="panel form-panel"><div class="panel-header"><h2>New obligation</h2><span class="helper">Document metadata is embedded here</span></div><form class="panel-body" data-form="obligation"><div class="form-grid">
      <div class="field"><label for="obligation-counterparty">Counterparty *</label><select id="obligation-counterparty" name="counterpartyId" required><option value="">Select counterparty</option>${selectOptions(activeCounterparties, "id", (item) => `${item.name} · ${item.counterpartyType}`)}</select></div>
      <div class="field"><label for="obligation-contract">Contract *</label><select id="obligation-contract" name="contractId" required><option value="">Select contract</option>${selectOptions(activeContracts, "id", (item) => `${item.number} · ${counterparty(item.counterpartyId)?.name || "Unknown"}`)}</select></div>
      <div class="field"><label for="obligation-document-type">Document type *</label><select id="obligation-document-type" name="documentType" required><option value="invoice">Invoice</option><option value="deliveryNote">Delivery note</option><option value="completedWorkAct">Completed-work act</option><option value="adjustment">Adjustment</option></select></div>
      <div class="field"><label for="obligation-document-number">Document number *</label><input id="obligation-document-number" name="documentNumber" required maxlength="40" placeholder="INV-0152"></div>
      <div class="field"><label for="obligation-document-date">Document date *</label><input id="obligation-document-date" name="documentDate" type="date" required value="${todayValue()}"></div>
      <div class="field"><label for="obligation-recognized">Recognition date *</label><input id="obligation-recognized" name="recognizedOn" type="date" required value="${todayValue()}"></div>
      <div class="field"><label for="obligation-amount">Amount, RUB *</label><input id="obligation-amount" name="amount" type="number" min="0.01" step="0.01" required placeholder="1500.00"></div>
      <div class="field"><label for="obligation-due-date">Due date *</label><input id="obligation-due-date" name="dueDate" type="date" required></div>
    </div><div class="form-actions"><button class="button button-primary" type="submit">Save obligation</button></div></form></section>
    <section class="panel"><div class="panel-header"><h2>Obligation register</h2><span class="helper">${activeObligations().length} active records</span></div><div class="table-wrap">${obligationTable(activeObligations())}</div></section>`;
}

function paymentsView() {
  const openObligations = activeObligations().filter((item) => metricsFor(item).remainingMinor > 0);
  return `${pageHeading("Payments", "Record one payment against one obligation. Several payments can settle one obligation.", `<button class="button button-primary" data-scroll-to="payment-form">Add payment</button>`)}
    <section id="payment-form" class="panel form-panel"><div class="panel-header"><h2>New payment</h2><span class="helper">Overpayments are blocked</span></div><form class="panel-body" data-form="payment"><div class="form-grid">
      <div class="field full"><label for="payment-obligation">Obligation *</label><select id="payment-obligation" name="obligationId" required><option value="">Select open obligation</option>${selectOptions(openObligations, "id", (item) => `${item.documentNumber} · ${counterparty(item.counterpartyId)?.name || "Unknown"} · ${money(metricsFor(item).remainingMinor)} remaining`)}</select></div>
      <div class="field"><label for="payment-date">Payment date *</label><input id="payment-date" name="paymentDate" type="date" required value="${todayValue()}"></div>
      <div class="field"><label for="payment-amount">Amount, RUB *</label><input id="payment-amount" name="amount" type="number" min="0.01" step="0.01" required placeholder="750.00"></div>
      <div class="field"><label for="payment-method">Method *</label><select id="payment-method" name="method"><option value="bankTransfer">Bank transfer</option><option value="cash">Cash</option><option value="other">Other</option></select></div>
      <div class="field"><label for="payment-reference">Reference</label><input id="payment-reference" name="reference" maxlength="40" placeholder="PAY-1003-01"></div>
    </div><p class="validation-message" data-form-message="payment"></p><div class="form-actions"><button class="button button-primary" type="submit">Save payment</button></div></form></section>
    <section class="panel"><div class="panel-header"><h2>Payment register</h2><span class="helper">${state.data.payments.length} records</span></div><div class="table-wrap">${paymentTable()}</div></section>`;
}

function reportView() {
  const rows = filteredObligations();
  const data = summary(state.reportAsOf, rows);
  const supplier = rows.filter((item) => counterparty(item.counterpartyId)?.counterpartyType === "supplier").reduce((sum, item) => sum + metricsFor(item, state.reportAsOf).remainingMinor, 0);
  const contractor = rows.filter((item) => counterparty(item.counterpartyId)?.counterpartyType === "contractor").reduce((sum, item) => sum + metricsFor(item, state.reportAsOf).remainingMinor, 0);
  return `${pageHeading("Settlement report", "Filter the compact register and inspect balances as of a selected date.")}
    <section class="report-hero"><div><h2>As-of settlement register</h2><p>Due today is not treated as overdue. All totals are calculated from synthetic records.</p></div><div class="field"><label for="report-as-of">As-of date</label><input id="report-as-of" data-report-as-of type="date" value="${escapeHtml(state.reportAsOf)}"></div></section>
    ${summaryCards(data)}
    <div class="compare-grid"><article class="compare-card"><span>Supplier remaining balance</span><strong>${money(supplier)}</strong></article><article class="compare-card"><span>Contractor remaining balance</span><strong>${money(contractor)}</strong></article></div>
    <section class="toolbar"><div class="field"><label for="report-type">Counterparty type</label><select id="report-type" data-filter="type"><option value="all" ${state.filters.type === "all" ? "selected" : ""}>All types</option><option value="supplier" ${state.filters.type === "supplier" ? "selected" : ""}>Supplier</option><option value="contractor" ${state.filters.type === "contractor" ? "selected" : ""}>Contractor</option></select></div><div class="field"><label for="report-status">Status</label><select id="report-status" data-filter="status"><option value="all" ${state.filters.status === "all" ? "selected" : ""}>All statuses</option><option value="registered" ${state.filters.status === "registered" ? "selected" : ""}>Registered</option><option value="partiallyPaid" ${state.filters.status === "partiallyPaid" ? "selected" : ""}>Partially paid</option><option value="paid" ${state.filters.status === "paid" ? "selected" : ""}>Paid</option><option value="overdue" ${state.filters.status === "overdue" ? "selected" : ""}>Overdue</option></select></div><div class="field"><label for="report-search">Search</label><input id="report-search" data-filter="search" value="${escapeHtml(state.filters.search)}" placeholder="Name or document"></div><button class="button button-ghost" data-action="clear-filters">Reset filters</button></section>
    <section class="panel"><div class="panel-header"><h2>Filtered register</h2><span class="helper">${rows.length} records</span></div><div class="table-wrap">${obligationTable(rows, state.reportAsOf)}</div></section>`;
}

function counterpartyTable() {
  if (!state.data.counterparties.length) return emptyState("No counterparties yet", "Add a supplier or contractor to begin.");
  return `<table><thead><tr><th>Name</th><th>Type</th><th>Test registration</th><th>Contracts</th></tr></thead><tbody>${state.data.counterparties.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong></td><td><span class="type-label">${escapeHtml(item.counterpartyType)}</span></td><td>${escapeHtml(item.registrationNumber || "—")}</td><td>${state.data.contracts.filter((entry) => entry.counterpartyId === item.id).length}</td></tr>`).join("")}</tbody></table>`;
}

function contractTable() {
  if (!state.data.contracts.length) return emptyState("No contracts yet", "Add a contract after creating a counterparty.");
  return `<table><thead><tr><th>Number</th><th>Counterparty</th><th>Date</th><th>Terms</th><th>Description</th></tr></thead><tbody>${state.data.contracts.map((item) => `<tr><td><strong>${escapeHtml(item.number)}</strong></td><td>${escapeHtml(counterparty(item.counterpartyId)?.name || "Unknown")}</td><td>${formatDate(item.contractDate)}</td><td>${item.paymentTermsDays} days</td><td>${escapeHtml(item.description || "—")}</td></tr>`).join("")}</tbody></table>`;
}

function obligationTable(items, asOf = state.reportAsOf) {
  if (!items.length) return emptyState("No matching obligations", "Try another filter or register a new obligation.");
  return `<table><thead><tr><th>Document</th><th>Counterparty</th><th>Due date</th><th>Amount</th><th>Paid</th><th>Remaining</th><th>Status</th></tr></thead><tbody>${items.map((item) => { const metrics = metricsFor(item, asOf); return `<tr><td><strong>${escapeHtml(item.documentNumber)}</strong><br><span class="helper">${escapeHtml(typeLabel(item.documentType))}</span></td><td>${escapeHtml(counterparty(item.counterpartyId)?.name || "Unknown")}</td><td>${formatDate(item.dueDate)}</td><td class="amount">${money(item.amountMinor)}</td><td class="amount">${money(metrics.paidMinor)}</td><td class="amount">${money(metrics.remainingMinor)}</td><td><span class="status status-${metrics.status}">${statusLabel(metrics.status)}</span></td></tr>`; }).join("")}</tbody></table>`;
}

function paymentTable() {
  if (!state.data.payments.length) return emptyState("No payments yet", "Register a payment against an open obligation.");
  return `<table><thead><tr><th>Reference</th><th>Obligation</th><th>Payment date</th><th>Method</th><th>Amount</th></tr></thead><tbody>${state.data.payments.slice().sort((a, b) => b.paymentDate.localeCompare(a.paymentDate)).map((item) => `<tr><td><strong>${escapeHtml(item.reference || "—")}</strong></td><td>${escapeHtml(obligation(item.obligationId)?.documentNumber || "Unknown")}</td><td>${formatDate(item.paymentDate)}</td><td>${escapeHtml(methodLabel(item.method))}</td><td class="amount">${money(item.amountMinor)}</td></tr>`).join("")}</tbody></table>`;
}

function emptyState(title, description) {
  return `<div class="empty-state"><strong>${title}</strong><span>${description}</span></div>`;
}

function filteredObligations() {
  return filterSettlements(state.data.obligations, state.data.payments, state.data.counterparties, state.filters, state.reportAsOf);
}

function amountToMinor(value) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : 0;
}

function formData(form) {
  return Object.fromEntries(new FormData(form).entries());
}

function validateDateOrder(first, second, message) {
  if (first && second && first > second) throw new Error(message);
}

async function handleForm(form) {
  const values = formData(form);
  try {
    if (form.dataset.form === "login") {
      await signIn(values.email, values.password);
      return;
    }
    let records;
    if (form.dataset.form === "counterparty") records = ["counterparties", addCounterparty(values)];
    if (form.dataset.form === "contract") records = ["contracts", addContract(values)];
    if (form.dataset.form === "obligation") records = ["obligations", addObligation(values)];
    if (form.dataset.form === "payment") records = ["payments", addPayment(values)];
    if (!records || !dataService) throw new Error("The data service is not ready.");
    await dataService.create(records[0], records[1]);
    await refreshData();
    form.reset();
    showToast(state.mode === "cloud" ? "Saved to Firestore." : "Saved to the local demo fallback.");
    render();
  } catch (error) {
    const message = form.querySelector("[data-form-message]") || loginError;
    if (message) message.textContent = error.message;
    showToast(error.message, true);
  }
}

function addCounterparty(values) {
  if (!values.name.trim() || !values.counterpartyType) throw new Error("Name and type are required.");
  return { name: values.name.trim(), counterpartyType: values.counterpartyType, registrationNumber: values.registrationNumber.trim(), contact: values.contact.trim(), active: true };
}

function addContract(values) {
  if (!values.counterpartyId || !values.number.trim() || !values.contractDate) throw new Error("Counterparty, number and date are required.");
  if (!counterparty(values.counterpartyId)) throw new Error("Select a valid counterparty.");
  return { counterpartyId: values.counterpartyId, number: values.number.trim(), contractDate: values.contractDate, paymentTermsDays: Math.max(Number(values.paymentTermsDays) || 0, 0), currency: "RUB", description: values.description.trim(), active: true };
}

function addObligation(values) {
  if (!values.counterpartyId || !values.contractId || !values.documentType || !values.documentNumber.trim() || !values.documentDate || !values.recognizedOn || !values.dueDate) throw new Error("Complete all required obligation fields.");
  if (!counterparty(values.counterpartyId) || !contract(values.contractId)) throw new Error("Select valid linked records.");
  if (contract(values.contractId)?.counterpartyId !== values.counterpartyId) throw new Error("The contract belongs to another counterparty.");
  const amountMinor = amountToMinor(values.amount);
  if (amountMinor <= 0) throw new Error("The obligation amount must be greater than zero.");
  validateDateOrder(values.recognizedOn, values.dueDate, "Due date cannot precede recognition date.");
  return { counterpartyId: values.counterpartyId, contractId: values.contractId, documentType: values.documentType, documentNumber: values.documentNumber.trim(), documentDate: values.documentDate, amountMinor, recognizedOn: values.recognizedOn, dueDate: values.dueDate, active: true };
}

function addPayment(values) {
  if (!values.obligationId || !values.paymentDate) throw new Error("Obligation and payment date are required.");
  const selected = obligation(values.obligationId);
  if (!selected) throw new Error("Select a valid obligation.");
  const amountMinor = amountToMinor(values.amount);
  const validation = validatePaymentAmount(selected, state.data.payments, amountMinor);
  if (!validation.valid) {
    if (amountMinor <= 0) throw new Error("The payment amount must be greater than zero.");
    throw new Error(`Payment cannot exceed the remaining balance of ${money(validation.remainingMinor)}.`);
  }
  return { obligationId: values.obligationId, paymentDate: values.paymentDate, amountMinor, currency: "RUB", method: values.method, reference: values.reference.trim(), active: true };
}

async function refreshData() {
  if (!dataService) throw new Error("The data service is not ready.");
  state.data = await dataService.loadData();
  state.firestoreError = "";
}

async function enterWorkspace() {
  state.loading = true;
  state.firestoreError = "";
  loginView.classList.add("hidden");
  workspaceView.classList.remove("hidden");
  render();
  try {
    await refreshData();
  } catch (error) {
    state.firestoreError = error.message;
  } finally {
    state.loading = false;
    render();
  }
}

async function signIn(email, password) {
  loginError.textContent = "";
  try {
    if (!dataService) throw new Error("Firebase initialization is still in progress.");
    state.user = await dataService.signIn(email, password);
    await enterWorkspace();
  } catch (error) {
    state.user = null;
    loginError.textContent = error.message;
    showToast(error.message, true);
  }
}

async function boot() {
  try {
    dataService = await dataServicePromise;
    state.mode = dataService.mode;
    state.user = dataService.user;
    state.loading = false;
    updateLoginMode();
    if (state.user) await enterWorkspace();
  } catch (error) {
    state.mode = "cloud";
    state.loading = false;
    updateLoginMode();
    loginError.textContent = `Firebase initialization failed: ${error.message}`;
  }
}

function showToast(message, error = false) {
  const toast = document.createElement("div");
  toast.className = `toast${error ? " error" : ""}`;
  toast.textContent = message;
  toastRegion.append(toast);
  window.setTimeout(() => toast.remove(), 3500);
}

function scrollToElement(id) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

app.addEventListener("click", (event) => {
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    state.view = viewButton.dataset.view;
    render();
    return;
  }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "login") {
    void signIn();
  }
  if (action === "logout") {
    void dataService?.signOut();
    state.user = null;
    workspaceView.classList.add("hidden");
    loginView.classList.remove("hidden");
    updateLoginMode();
  }
  if (action === "reset-data" && state.mode === "local") {
    void dataService.reset().then(refreshData).then(() => {
      showToast("Synthetic data reset.");
      render();
    }).catch((error) => showToast(error.message, true));
  }
  if (action === "retry-load") {
    void enterWorkspace();
  }
  if (action === "clear-filters") {
    state.filters = { type: "all", status: "all", search: "" };
    render();
  }
  const scrollTarget = event.target.closest("[data-scroll-to]")?.dataset.scrollTo;
  if (scrollTarget) scrollToElement(scrollTarget);
});

app.addEventListener("submit", (event) => {
  const form = event.target.closest("form[data-form]");
  if (!form) return;
  event.preventDefault();
  handleForm(form);
});

app.addEventListener("change", (event) => {
  if (event.target.matches("[data-report-as-of]")) {
    state.reportAsOf = event.target.value || TODAY;
    render();
  }
  if (event.target.matches("[data-filter]")) {
    state.filters[event.target.dataset.filter] = event.target.value;
    render();
  }
});

app.addEventListener("input", (event) => {
  if (event.target.matches('[data-filter="search"]')) {
    state.filters.search = event.target.value;
    render();
    const input = document.querySelector('[data-filter="search"]');
    input?.focus();
    input?.setSelectionRange(input.value.length, input.value.length);
  }
});

void boot();
