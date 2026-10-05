import { calculateMetrics, calculateSummary, filterSettlements, validatePaymentAmount } from "./calculations.mjs";
import { createDataService } from "./firebase-client.mjs";
import { DEFAULT_LOCALE, formatDateValue, localeFromPath, localeUrl, translate, translateText } from "./localization.mjs";

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
const VALID_VIEWS = ["overview", "counterparties", "contracts", "obligations", "payments", "report"];
const initialView = new URLSearchParams(window.location.search).get("view");
const state = {
  view: VALID_VIEWS.includes(initialView) ? initialView : "overview",
  data: emptyData(),
  mode: "initializing",
  locale: localeFromPath(window.location.pathname) || DEFAULT_LOCALE,
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

function text(key, values = {}) {
  return translate(state.locale, key, values);
}

function localizeDom(root) {
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  const textNodes = [];
  while (walker.nextNode()) textNodes.push(walker.currentNode);
  textNodes.forEach((node) => {
    const trimmed = node.textContent.trim();
    if (!trimmed) return;
    const localized = translateText(trimmed, state.locale);
    if (localized !== trimmed) node.textContent = node.textContent.replace(trimmed, localized);
  });
  root.querySelectorAll?.("[placeholder], [title], [aria-label]").forEach((element) => {
    ["placeholder", "title", "aria-label"].forEach((attribute) => {
      if (element.hasAttribute(attribute)) element.setAttribute(attribute, translateText(element.getAttribute(attribute), state.locale));
    });
  });
}

function updateLocaleUI() {
  document.documentElement.lang = state.locale;
  document.title = translateText("Settlement Register", state.locale);
  document.querySelector('meta[name="description"]')?.setAttribute("content", text("metaDescription"));
  document.querySelectorAll("[data-locale]").forEach((button) => {
    const selected = button.dataset.locale === state.locale;
    button.classList.toggle("active", selected);
    button.setAttribute("aria-pressed", String(selected));
    button.setAttribute("aria-label", text(button.dataset.locale === "ru" ? "switchToRussian" : "switchToEnglish"));
  });
  localizeDom(app);
}

function initializeDatePickers() {
  if (typeof globalThis.flatpickr !== "function") return;
  const dateFormat = state.locale === "ru" ? "d.m.Y" : "d/m/Y";
  const locale = state.locale === "ru" ? globalThis.flatpickr.l10ns.ru : globalThis.flatpickr.l10ns.default;
  document.querySelectorAll("input[data-date-input]").forEach((input) => {
    if (input._flatpickr) return;
    globalThis.flatpickr(input, { allowInput: true, dateFormat, disableMobile: true, locale });
  });
}

function errorMessage(error, fallbackKey = "") {
  const code = error?.code || "";
  if (code.startsWith("auth/")) return text("authFailedError");
  if (code.includes("permission-denied") || error?.message?.includes("Missing or insufficient permissions")) return text("permissionDeniedError");
  return fallbackKey ? text(fallbackKey) : error?.message || text("dataServiceNotReadyError");
}

function money(amountMinor) {
  const numberLocale = state.locale === "ru" ? "ru-RU" : "en-US";
  return new Intl.NumberFormat(numberLocale, { style: "currency", currency: "RUB", minimumFractionDigits: 2 }).format((amountMinor || 0) / 100);
}

function formatDate(value) {
  return formatDateValue(value, state.locale);
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
  return ({ registered: text("registeredStatus"), partiallyPaid: text("partiallyPaidStatus"), paid: text("paidStatus"), overdue: text("overdueStatus") }[status] || status);
}

function typeLabel(type) {
  return ({ invoice: text("invoice"), deliveryNote: text("deliveryNote"), completedWorkAct: text("completedWorkAct"), adjustment: text("adjustment") }[type] || type);
}

function methodLabel(method) {
  return ({ bankTransfer: text("bankTransfer"), cash: text("cash"), other: text("other") }[method] || method);
}

function selectOptions(items, valueKey, label) {
  return items.map((item) => `<option value="${escapeHtml(item[valueKey])}">${escapeHtml(label(item))}</option>`).join("");
}

function summaryCards(data) {
  return `<div class="summary-grid">
    <article class="summary-card accent"><p>Obligations</p><strong class="metric-value">${data.count}</strong><small>${money(data.obligationMinor)} registered</small></article>
    <article class="summary-card"><p>Paid</p><strong class="metric-value">${money(data.paidMinor)}</strong><small>Recorded payments</small></article>
    <article class="summary-card warn"><p>Remaining</p><strong class="metric-value">${money(data.remainingMinor)}</strong><small>Open balance</small></article>
    <article class="summary-card alert"><p>Overdue</p><strong class="metric-value">${money(data.overdueMinor)}</strong><small>${text("atDate", { date: formatDate(state.reportAsOf) })}</small></article>
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
  updateLocaleUI();
  initializeDatePickers();
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
  return `${pageHeading("Counterparties", "Maintain the small directory used by contracts and settlement reports.", `<button class="button button-primary" data-action="open-form" data-form-target="counterparty-form">Add counterparty</button>`)}
    <section id="counterparty-form" class="panel form-panel hidden"><div class="panel-header"><h2>New counterparty</h2><div class="inline-actions"><span class="helper">Supplier or contractor</span><button class="icon-button" type="button" data-action="close-form" data-form-target="counterparty-form" aria-label="Close" title="Close">×</button></div></div><form class="panel-body" data-form="counterparty"><div class="form-grid">
      <div class="field"><label for="counterparty-name">Name *</label><input id="counterparty-name" name="name" required maxlength="80" placeholder="Example: Volga Office Supply"></div>
      <div class="field"><label for="counterparty-type">Type *</label><select id="counterparty-type" name="counterpartyType" required><option value="supplier">Supplier</option><option value="contractor">Contractor</option></select></div>
      <div class="field"><label for="counterparty-registration">Test registration number</label><input id="counterparty-registration" name="registrationNumber" maxlength="30" placeholder="TEST-S-003"></div>
      <div class="field"><label for="counterparty-contact">Contact reference</label><input id="counterparty-contact" name="contact" maxlength="80" placeholder="demo@example.test"></div>
    </div><div class="form-actions"><button class="button button-primary" type="submit">Save counterparty</button></div></form></section>
    <section class="panel"><div class="panel-header"><h2>Directory</h2><span class="helper">${state.data.counterparties.length} records</span></div><div class="table-wrap">${counterpartyTable()}</div></section>`;
}

function contractsView() {
  const activeCounterparties = state.data.counterparties.filter((item) => item.active);
  return `${pageHeading("Contracts", text("contractsDescription"), `<button class="button button-primary" data-action="open-form" data-form-target="contract-form">Add contract</button>`)}
    <section id="contract-form" class="panel form-panel hidden"><div class="panel-header"><h2>New contract</h2><div class="inline-actions"><span class="helper">RUB only</span><button class="icon-button" type="button" data-action="close-form" data-form-target="contract-form" aria-label="Close" title="Close">×</button></div></div><form class="panel-body" data-form="contract"><div class="form-grid">
      <div class="field"><label for="contract-counterparty">Counterparty *</label><select id="contract-counterparty" name="counterpartyId" required><option value="">Select counterparty</option>${selectOptions(activeCounterparties, "id", (item) => `${item.name} · ${text(item.counterpartyType)}`)}</select></div>
      <div class="field"><label for="contract-number">Contract number *</label><input id="contract-number" name="number" required maxlength="40" placeholder="SUP-2026-015"></div>
      <div class="field"><label for="contract-date">Contract date *</label><input id="contract-date" name="contractDate" type="text" inputmode="numeric" data-date-input required value="${formatInputDate(todayValue())}" placeholder="${text("datePlaceholder")}"></div>
      <div class="field"><label for="contract-terms">Payment terms, days</label><input id="contract-terms" name="paymentTermsDays" type="number" min="0" max="3650" value="14"></div>
      <div class="field full"><label for="contract-description">Description</label><input id="contract-description" name="description" maxlength="120" placeholder="Goods or work covered by the contract"></div>
    </div><div class="form-actions"><button class="button button-primary" type="submit">Save contract</button></div></form></section>
    <section class="panel"><div class="panel-header"><h2>Contract register</h2><span class="helper">${state.data.contracts.length} records</span></div><div class="table-wrap">${contractTable()}</div></section>`;
}

function obligationsView() {
  const activeCounterparties = state.data.counterparties.filter((item) => item.active);
  const activeContracts = state.data.contracts.filter((item) => item.active);
  return `${pageHeading("Obligations", "Register the source-document details and amount that create a settlement obligation.", `<button class="button button-primary" data-action="open-form" data-form-target="obligation-form">Add obligation</button>`)}
    <section id="obligation-form" class="panel form-panel hidden"><div class="panel-header"><h2>New obligation</h2><div class="inline-actions"><span class="helper">Document metadata is embedded here</span><button class="icon-button" type="button" data-action="close-form" data-form-target="obligation-form" aria-label="Close" title="Close">×</button></div></div><form class="panel-body" data-form="obligation"><div class="form-grid">
      <div class="field"><label for="obligation-counterparty">Counterparty *</label><select id="obligation-counterparty" name="counterpartyId" required><option value="">Select counterparty</option>${selectOptions(activeCounterparties, "id", (item) => `${item.name} · ${text(item.counterpartyType)}`)}</select></div>
      <div class="field"><label for="obligation-contract">Contract *</label><select id="obligation-contract" name="contractId" required><option value="">Select contract</option>${selectOptions(activeContracts, "id", (item) => `${item.number} · ${counterparty(item.counterpartyId)?.name || "Unknown"}`)}</select></div>
      <div class="field"><label for="obligation-document-type">Document type *</label><select id="obligation-document-type" name="documentType" required><option value="invoice">Invoice</option><option value="deliveryNote">Delivery note</option><option value="completedWorkAct">Completed-work act</option><option value="adjustment">Adjustment</option></select></div>
      <div class="field"><label for="obligation-document-number">Document number *</label><input id="obligation-document-number" name="documentNumber" required maxlength="40" placeholder="INV-0152"></div>
      <div class="field"><label for="obligation-document-date">Document date *</label><input id="obligation-document-date" name="documentDate" type="text" inputmode="numeric" data-date-input required value="${formatInputDate(todayValue())}" placeholder="${text("datePlaceholder")}"></div>
      <div class="field"><label for="obligation-recognized">Recognition date *</label><input id="obligation-recognized" name="recognizedOn" type="text" inputmode="numeric" data-date-input required value="${formatInputDate(todayValue())}" placeholder="${text("datePlaceholder")}"></div>
      <div class="field"><label for="obligation-amount">Amount, RUB *</label><input id="obligation-amount" name="amount" type="number" min="0.01" step="0.01" required placeholder="1500.00"></div>
      <div class="field"><label for="obligation-due-date">Due date *</label><input id="obligation-due-date" name="dueDate" type="text" inputmode="numeric" data-date-input required placeholder="${text("datePlaceholder")}"></div>
    </div><div class="form-actions"><button class="button button-primary" type="submit">Save obligation</button></div></form></section>
    <section class="panel"><div class="panel-header"><h2>Obligation register</h2><span class="helper">${activeObligations().length} active records</span></div><div class="table-wrap">${obligationTable(activeObligations())}</div></section>`;
}

function paymentsView() {
  const openObligations = activeObligations().filter((item) => metricsFor(item).remainingMinor > 0);
  return `${pageHeading("Payments", "Record one payment against one obligation. Several payments can settle one obligation.", `<button class="button button-primary" data-action="open-form" data-form-target="payment-form">Add payment</button>`)}
    <section id="payment-form" class="panel form-panel hidden"><div class="panel-header"><h2>New payment</h2><div class="inline-actions"><span class="helper">Overpayments are blocked</span><button class="icon-button" type="button" data-action="close-form" data-form-target="payment-form" aria-label="Close" title="Close">×</button></div></div><form class="panel-body" data-form="payment"><div class="form-grid">
      <div class="field full"><label for="payment-obligation">Obligation *</label><select id="payment-obligation" name="obligationId" required><option value="">Select open obligation</option>${selectOptions(openObligations, "id", (item) => `${item.documentNumber} · ${counterparty(item.counterpartyId)?.name || "Unknown"} · ${money(metricsFor(item).remainingMinor)} remaining`)}</select></div>
      <div class="field"><label for="payment-date">Payment date *</label><input id="payment-date" name="paymentDate" type="text" inputmode="numeric" data-date-input required value="${formatInputDate(todayValue())}" placeholder="${text("datePlaceholder")}"></div>
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
    <section class="report-hero"><div><h2>As-of settlement register</h2><p>Due today is not treated as overdue. All totals are calculated from synthetic records.</p></div><div class="field"><label for="report-as-of">As-of date</label><input id="report-as-of" data-report-as-of data-date-input type="text" inputmode="numeric" value="${escapeHtml(formatInputDate(state.reportAsOf))}" placeholder="${text("datePlaceholder")}"></div></section>
    ${summaryCards(data)}
    <div class="compare-grid"><article class="compare-card"><span>Supplier remaining balance</span><strong class="metric-value">${money(supplier)}</strong></article><article class="compare-card"><span>Contractor remaining balance</span><strong class="metric-value">${money(contractor)}</strong></article></div>
    <section class="toolbar"><div class="field"><label for="report-type">Counterparty type</label><select id="report-type" data-filter="type"><option value="all" ${state.filters.type === "all" ? "selected" : ""}>All types</option><option value="supplier" ${state.filters.type === "supplier" ? "selected" : ""}>Supplier</option><option value="contractor" ${state.filters.type === "contractor" ? "selected" : ""}>Contractor</option></select></div><div class="field"><label for="report-status">Status</label><select id="report-status" data-filter="status"><option value="all" ${state.filters.status === "all" ? "selected" : ""}>All statuses</option><option value="registered" ${state.filters.status === "registered" ? "selected" : ""}>Registered</option><option value="partiallyPaid" ${state.filters.status === "partiallyPaid" ? "selected" : ""}>Partially paid</option><option value="paid" ${state.filters.status === "paid" ? "selected" : ""}>Paid</option><option value="overdue" ${state.filters.status === "overdue" ? "selected" : ""}>Overdue</option></select></div><div class="field"><label for="report-search">Search</label><input id="report-search" data-filter="search" value="${escapeHtml(state.filters.search)}" placeholder="Name or document"></div><button class="button button-ghost" data-action="clear-filters">Reset filters</button></section>
    <section class="panel"><div class="panel-header"><h2>Filtered register</h2><span class="helper">${rows.length} records</span></div><div class="table-wrap">${obligationTable(rows, state.reportAsOf)}</div></section>`;
}

function counterpartyTable() {
  if (!state.data.counterparties.length) return emptyState("No counterparties yet", "Add a supplier or contractor to begin.");
  return `<table><thead><tr><th>Name</th><th>Type</th><th>Test registration</th><th>Contracts</th></tr></thead><tbody>${state.data.counterparties.map((item) => `<tr><td><strong>${escapeHtml(item.name)}</strong></td><td><span class="type-label">${escapeHtml(text(item.counterpartyType))}</span></td><td>${escapeHtml(item.registrationNumber || "—")}</td><td>${state.data.contracts.filter((entry) => entry.counterpartyId === item.id).length}</td></tr>`).join("")}</tbody></table>`;
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

function formatInputDate(value) {
  if (!value) return "";
  if (state.locale === "ru") return formatDateValue(value, "ru");
  const [year, month, day] = value.split("-");
  return `${day}/${month}/${year}`;
}

function parseInputDate(value) {
  const normalized = String(value || "").trim();
  if (!normalized) return "";
  const isoMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(normalized);
  const localizedMatch = state.locale === "ru"
    ? /^(\d{2})\.(\d{2})\.(\d{4})$/.exec(normalized)
    : /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(normalized);
  const year = isoMatch ? Number(isoMatch[1]) : localizedMatch ? Number(localizedMatch[3]) : 0;
  const month = isoMatch ? Number(isoMatch[2]) : localizedMatch ? Number(localizedMatch[2]) : 0;
  const day = isoMatch ? Number(isoMatch[3]) : localizedMatch ? Number(localizedMatch[1]) : 0;
  const date = new Date(Date.UTC(year, month - 1, day));
  if (!year || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) throw new Error(text("invalidDateError"));
  return `${year.toString().padStart(4, "0")}-${month.toString().padStart(2, "0")}-${day.toString().padStart(2, "0")}`;
}

function formData(form) {
  const values = Object.fromEntries(new FormData(form).entries());
  form.querySelectorAll("[data-date-input]").forEach((input) => {
    values[input.name] = parseInputDate(values[input.name]);
  });
  return values;
}

function validateDateOrder(first, second, message) {
  if (first && second && first > second) throw new Error(message);
}

async function handleForm(form) {
  try {
    const values = formData(form);
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
    showToast(state.mode === "cloud" ? text("savedToFirestore") : text("savedToLocalFallback"));
    render();
  } catch (error) {
    const message = form.querySelector("[data-form-message]") || loginError;
    const messageText = errorMessage(error);
    if (message) message.textContent = messageText;
    showToast(messageText, true);
  }
}

function addCounterparty(values) {
  if (!values.name.trim() || !values.counterpartyType) throw new Error(text("nameTypeRequiredError"));
  return { name: values.name.trim(), counterpartyType: values.counterpartyType, registrationNumber: values.registrationNumber.trim(), contact: values.contact.trim(), active: true };
}

function addContract(values) {
  if (!values.counterpartyId || !values.number.trim() || !values.contractDate) throw new Error(text("counterpartyNumberDateRequiredError"));
  if (!counterparty(values.counterpartyId)) throw new Error(text("validCounterpartyError"));
  return { counterpartyId: values.counterpartyId, number: values.number.trim(), contractDate: values.contractDate, paymentTermsDays: Math.max(Number(values.paymentTermsDays) || 0, 0), currency: "RUB", description: values.description.trim(), active: true };
}

function addObligation(values) {
  if (!values.counterpartyId || !values.contractId || !values.documentType || !values.documentNumber.trim() || !values.documentDate || !values.recognizedOn || !values.dueDate) throw new Error(text("completeObligationFieldsError"));
  if (!counterparty(values.counterpartyId) || !contract(values.contractId)) throw new Error(text("validLinkedRecordsError"));
  if (contract(values.contractId)?.counterpartyId !== values.counterpartyId) throw new Error(text("contractOtherCounterpartyError"));
  const amountMinor = amountToMinor(values.amount);
  if (amountMinor <= 0) throw new Error(text("obligationAmountPositiveError"));
  validateDateOrder(values.recognizedOn, values.dueDate, text("dueDateRecognitionError"));
  return { counterpartyId: values.counterpartyId, contractId: values.contractId, documentType: values.documentType, documentNumber: values.documentNumber.trim(), documentDate: values.documentDate, amountMinor, recognizedOn: values.recognizedOn, dueDate: values.dueDate, active: true };
}

function addPayment(values) {
  if (!values.obligationId || !values.paymentDate) throw new Error(text("obligationPaymentDateRequiredError"));
  const selected = obligation(values.obligationId);
  if (!selected) throw new Error(text("validObligationError"));
  const amountMinor = amountToMinor(values.amount);
  const validation = validatePaymentAmount(selected, state.data.payments, amountMinor);
  if (!validation.valid) {
    if (amountMinor <= 0) throw new Error(text("paymentAmountPositiveError"));
    throw new Error(text("paymentOverLimitError", { amount: money(validation.remainingMinor) }));
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
    state.firestoreError = errorMessage(error, "firestoreLoadFailedError");
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
    const message = errorMessage(error, "authFailedError");
    loginError.textContent = message;
    showToast(message, true);
  }
}

async function boot() {
  try {
    dataService = await dataServicePromise;
    state.mode = dataService.mode;
    state.user = dataService.user;
    state.loading = false;
    updateLoginMode();
    updateLocaleUI();
    if (state.user) await enterWorkspace();
  } catch (error) {
    state.mode = "cloud";
    state.loading = false;
    updateLoginMode();
    loginError.textContent = text("firebaseInitializationError", { message: error.message });
    updateLocaleUI();
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
  const localeButton = event.target.closest("[data-locale]");
  if (localeButton) {
    const target = new URL(localeUrl(localeButton.dataset.locale));
    if (state.view !== "overview") target.searchParams.set("view", state.view);
    window.location.assign(target.href);
    return;
  }
  const viewButton = event.target.closest("[data-view]");
  if (viewButton) {
    state.view = viewButton.dataset.view;
    render();
    return;
  }
  const action = event.target.closest("[data-action]")?.dataset.action;
  if (action === "open-form" || action === "close-form") {
    const formPanel = document.getElementById(event.target.closest("[data-action]").dataset.formTarget);
    if (!formPanel) return;
    formPanel.classList.toggle("hidden", action === "close-form");
    if (action === "open-form") scrollToElement(formPanel.id);
    return;
  }
  if (action === "login") {
    void signIn();
  }
  if (action === "logout") {
    void dataService?.signOut();
    state.user = null;
    workspaceView.classList.add("hidden");
    loginView.classList.remove("hidden");
    updateLoginMode();
    updateLocaleUI();
  }
  if (action === "reset-data" && state.mode === "local") {
    void dataService.reset().then(refreshData).then(() => {
      showToast(text("syntheticDataReset"));
      render();
    }).catch((error) => showToast(errorMessage(error), true));
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
    try {
      state.reportAsOf = parseInputDate(event.target.value) || TODAY;
      render();
    } catch (error) {
      showToast(error.message, true);
      render();
    }
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
