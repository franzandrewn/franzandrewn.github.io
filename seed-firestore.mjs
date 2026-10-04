import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { cert, initializeApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const seedPath = path.join(__dirname, "seed-data.json");
const collections = ["counterparties", "contracts", "obligations", "payments"];
const databaseId = process.env.FIRESTORE_DATABASE_ID || "(default)";

function fail(message) {
  throw new Error(message);
}

function validateSeed(data) {
  const ids = new Set();
  for (const collection of collections) {
    if (!Array.isArray(data[collection])) fail(`Seed collection is missing or invalid: ${collection}`);
    for (const record of data[collection]) {
      if (!record.id || typeof record.id !== "string") fail(`Record in ${collection} has no valid id.`);
      if (ids.has(record.id)) fail(`Duplicate seed id: ${record.id}`);
      ids.add(record.id);
    }
  }

  const counterpartyIds = new Set(data.counterparties.map((item) => item.id));
  const contractIds = new Set(data.contracts.map((item) => item.id));
  const obligationIds = new Set(data.obligations.map((item) => item.id));

  for (const contract of data.contracts) {
    if (!counterpartyIds.has(contract.counterpartyId)) fail(`Contract ${contract.id} references a missing counterparty.`);
  }
  for (const obligation of data.obligations) {
    if (!counterpartyIds.has(obligation.counterpartyId)) fail(`Obligation ${obligation.id} references a missing counterparty.`);
    if (!contractIds.has(obligation.contractId)) fail(`Obligation ${obligation.id} references a missing contract.`);
  }
  for (const payment of data.payments) {
    if (!obligationIds.has(payment.obligationId)) fail(`Payment ${payment.id} references a missing obligation.`);
  }
}

async function loadSeed() {
  try {
    return JSON.parse(await readFile(seedPath, "utf8"));
  } catch {
    fail(`Unable to read or parse ${path.basename(seedPath)}.`);
  }
}

async function main() {
  const data = await loadSeed();
  validateSeed(data);

  const counts = collections.map((collection) => `${data[collection].length} ${collection}`).join(", ");
  if (process.argv.includes("--dry-run")) {
    console.log(`Seed data is valid: ${counts}.`);
    return;
  }

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsPath) {
    fail("GOOGLE_APPLICATION_CREDENTIALS is not set. Keep the service-account JSON outside the repository.");
  }

  let serviceAccount;
  let serviceAccountText;
  try {
    serviceAccountText = await readFile(credentialsPath, "utf8");
  } catch {
    fail("Unable to read the service-account file. Check GOOGLE_APPLICATION_CREDENTIALS and file permissions.");
  }

  try {
    serviceAccount = JSON.parse(serviceAccountText.replace(/^\uFEFF/, ""));
  } catch {
    fail("The service-account file is not valid JSON. Download a fresh private key from Firebase Console instead of editing the file manually.");
  }

  const requiredCredentialFields = ["type", "project_id", "private_key_id", "private_key", "client_email", "client_id", "auth_uri", "token_uri", "auth_provider_x509_cert_url", "client_x509_cert_url", "universe_domain"];
  const missingCredentialFields = requiredCredentialFields.filter((field) => typeof serviceAccount[field] !== "string" || serviceAccount[field].length === 0);
  if (missingCredentialFields.length > 0) {
    fail(`The service-account file is missing required fields: ${missingCredentialFields.join(", ")}.`);
  }

  const app = initializeApp({ credential: cert(serviceAccount) });
  const db = getFirestore(app, databaseId);
  const timestamp = Timestamp.now();
  const batch = db.batch();

  for (const collection of collections) {
    for (const record of data[collection]) {
      const { id, ...fields } = record;
      const reference = db.collection(collection).doc(id);
      batch.set(reference, { ...fields, createdAt: timestamp, updatedAt: timestamp }, { merge: true });
    }
  }

  try {
    await batch.commit();
  } catch (error) {
    if (error.code === 5) {
      fail(`Firestore database "${databaseId}" was not found in the Firebase project named by the service-account project_id.`);
    }
    throw error;
  }
  console.log(`Seeded Firestore with ${counts}.`);
}

main().catch((error) => {
  console.error(`Firestore seed failed: ${error.message}`);
  process.exitCode = 1;
});
