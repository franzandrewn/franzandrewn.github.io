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
- Firebase Authentication and Cloud Firestore persistence for the hosted build
- Explicit local browser fallback when no Firebase web configuration is present

## Local run

The browser application has no runtime npm dependency. The Node.js seed tooling uses the Firebase Admin SDK. Run the static application from the `prototype/` directory with the included MIME-aware local server:

```text
uv run python dev-server.py --port 8080
```

Open <http://127.0.0.1:8080> in a browser.

## Demo workflow

1. In cloud mode, sign in with the synthetic Firebase operator; without configuration, select **Enter local demo**.
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

The application uses a Firebase Web SDK adapter for hosted deployment. The browser imports the pinned modular SDK from `gstatic.com`, so no browser dependency is installed through npm. The repository includes deployment templates:

- `firebase-config.example.js` — placeholder web configuration;
- `firebase-client.mjs` — Firebase Authentication and Firestore adapter;
- `firebase/firestore.rules` — authenticated access and basic field/reference validation;
- `firebase/firestore.indexes.json` — initial empty index configuration;
- `firebase.json` — Firebase Firestore and hosting configuration.

To enable cloud mode, copy `firebase-config.example.js` to the ignored file `firebase-config.js` and replace its placeholders with the Firebase console's web-app configuration. Do not commit that file, passwords, service-account credentials or real data. With no valid local configuration, the application deliberately displays and uses a labelled local demo fallback; it is not cloud persistence.

In cloud mode, the application signs in with Firebase Email/Password Authentication, reads all four collections from the named `settlement-register-db` Firestore database on login and page refresh, creates documents with the field names accepted by the rules, and refreshes the register after each write. Firestore server timestamps are used for `createdAt` and `updatedAt`. The browser does not offer a cloud reset/delete action because the rules deny deletes.

### GitHub Pages deployment

`.github/workflows/deploy-pages.yml` builds a static Pages artifact and generates `firebase-config.js` only inside the GitHub Actions runner. Add these six repository secrets under **Settings → Secrets and variables → Actions**:

- `FIREBASE_API_KEY`
- `FIREBASE_AUTH_DOMAIN`
- `FIREBASE_PROJECT_ID`
- `FIREBASE_STORAGE_BUCKET`
- `FIREBASE_MESSAGING_SENDER_ID`
- `FIREBASE_APP_ID`

Copy each value from the local Firebase web-app configuration into GitHub's secret form without sending values through chat. Do not add a Firebase service-account key. Switch **Settings → Pages → Source** to **GitHub Actions**, then push to `main` or run the workflow manually. The workflow publishes only the static frontend files and never commits the generated configuration.

### Firestore seed script

The repository includes a one-time Admin SDK seed script and synthetic data file:

- `seed-data.json` contains fixed IDs and synthetic records;
- `seed-firestore.mjs` validates references and writes the four collections with an idempotent batch;
- `--dry-run` validates the seed file without connecting to Firebase.

Install the seed-tooling dependency with `npm install`. Then set `GOOGLE_APPLICATION_CREDENTIALS` to a service-account JSON file stored outside the repository. For a named Firestore database, set `FIRESTORE_DATABASE_ID` as well:

```text
$env:FIRESTORE_DATABASE_ID = "settlement-register-db"
npm run seed:firestore:dry-run
npm run seed:firestore
```

If `FIRESTORE_DATABASE_ID` is omitted, the script targets the default `(default)` database.

The seed script never stores or prints the service-account contents. Never commit passwords, service-account files, private keys, local environment files or real data. GitHub Pages may publish the static frontend, while Firebase provides authentication and Firestore services.
