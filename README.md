# Settlement Register

A compact browser application for recording and reviewing settlements with suppliers and contractors.

## Features

- Synthetic operator demo with seeded test data
- Supplier and contractor directory
- Contract register
- Obligation register with invoice and completed-work-act metadata
- Payment register with one payment linked to one obligation
- Partial-payment and overpayment validation
- Paid, partially paid, registered and overdue statuses
- Settlement summary and filtered report
- Supplier/contractor balance comparison
- Responsive desktop and mobile layout
- Browser `localStorage` persistence for the standalone demo

## Local run

The application has no npm dependencies. Run it from the repository root with a local static server:

```text
uv run python -m http.server 8080
```

Open <http://127.0.0.1:8080> in a browser.

## Demo workflow

1. Select **Enter demo as operator**.
2. Review the seeded supplier, contractor, contracts, obligations and payment.
3. Add or review counterparties, contracts and obligations.
4. Add a partial payment and inspect the remaining balance.
5. Try an overpayment; it should be rejected.
6. Open **Settlement report** and filter by counterparty type, status or search text.
7. Change the as-of date to review overdue status.
8. Use **Reset** to restore the seeded synthetic data.

All records in the demo are invented test data. Do not enter real personal, banking, tax or contract information.

## Calculations and tests

Amounts are stored as integer minor RUB units. For each obligation:

```text
paid amount = sum of active payments linked to the obligation
remaining balance = obligation amount - paid amount
```

An obligation is overdue when it has a positive remaining balance and its due date is earlier than the selected as-of date. An obligation due on the as-of date is not overdue.

Run the calculation tests with:

```text
node --test calculations.test.mjs
```

Check application syntax with:

```text
node --check app.js
```

## Firebase and static hosting

The application can be connected to Firebase Authentication and Cloud Firestore for hosted deployment. The repository includes deployment templates:

- `firebase-config.example.js` — placeholder web configuration;
- `firebase/firestore.rules` — authenticated access and basic field/reference validation;
- `firebase/firestore.indexes.json` — initial empty index configuration;
- `firebase.json` — Firebase Firestore and hosting configuration.

The standalone browser demo currently uses `localStorage`. A Firebase data/auth adapter is required before the hosted version can use Firestore persistence.

Never commit passwords, service-account files, private keys, local environment files or real data. GitHub Pages may publish the static frontend, while Firebase provides authentication and Firestore services.
