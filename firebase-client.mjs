const FIREBASE_SDK_VERSION = "11.10.0";
const FIRESTORE_DATABASE_ID = "settlement-register-db";
const STORAGE_KEY = "settlement-register-demo-v1";
const COLLECTIONS = ["counterparties", "contracts", "obligations", "payments"];

function normalizeData(data) {
  return Object.fromEntries(COLLECTIONS.map((name) => [name, Array.isArray(data?.[name]) ? data[name] : []]));
}

function clone(value) {
  return structuredClone(value);
}

function isConfigured(config) {
  return config && Object.values(config).every((value) => typeof value === "string" && value && !value.startsWith("REPLACE_WITH_"));
}

async function loadConfig() {
  try {
    const module = await import("./firebase-config.js");
    return module.firebaseConfig;
  } catch {
    return null;
  }
}

async function loadFirebaseModules() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
  const [app, auth, firestore] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`)
  ]);
  return { app, auth, firestore };
}

export async function createDataService(fallbackSeedData) {
  const config = await loadConfig();
  if (!isConfigured(config)) return createLocalService(fallbackSeedData);

  const modules = await loadFirebaseModules();
  const firebaseApp = modules.app.initializeApp(config);
  const auth = modules.auth.getAuth(firebaseApp);
  const db = modules.firestore.getFirestore(firebaseApp, FIRESTORE_DATABASE_ID);
  await modules.auth.setPersistence(auth, modules.auth.browserSessionPersistence);
  const user = await waitForAuthState(auth, modules.auth);

  return {
    mode: "cloud",
    user,
    async signIn(email, password) {
      const result = await modules.auth.signInWithEmailAndPassword(auth, email, password);
      this.user = result.user;
      return this.user;
    },
    async signOut() {
      await modules.auth.signOut(auth);
      this.user = null;
    },
    async loadData() {
      if (!this.user) throw new Error("Sign in before loading Firestore data.");
      const entries = await Promise.all(COLLECTIONS.map(async (name) => {
        const snapshot = await modules.firestore.getDocs(modules.firestore.collection(db, name));
        return [name, snapshot.docs.map((document) => ({ id: document.id, ...document.data() }))];
      }));
      return Object.fromEntries(entries);
    },
    async create(collectionName, record) {
      if (!this.user) throw new Error("Your session has expired. Sign in again.");
      const timestamp = modules.firestore.serverTimestamp();
      await modules.firestore.addDoc(modules.firestore.collection(db, collectionName), {
        ...record,
        createdAt: timestamp,
        updatedAt: timestamp
      });
    },
    async reset() {
      throw new Error("Cloud records are not deleted by the browser prototype.");
    }
  };
}

function waitForAuthState(auth, authModules) {
  return new Promise((resolve, reject) => {
    let unsubscribe;
    unsubscribe = authModules.onAuthStateChanged(auth, (user) => {
      unsubscribe?.();
      resolve(user);
    }, reject);
  });
}

function createLocalService(fallbackSeedData) {
  let data = readLocalData(fallbackSeedData);
  let user = sessionStorage.getItem("settlement-demo-session") === "operator" ? { email: "local.operator" } : null;

  return {
    mode: "local",
    get user() {
      return user;
    },
    async signIn() {
      user = { email: "local.operator" };
      sessionStorage.setItem("settlement-demo-session", "operator");
      return user;
    },
    async signOut() {
      user = null;
      sessionStorage.removeItem("settlement-demo-session");
    },
    async loadData() {
      return clone(data);
    },
    async create(collectionName, record) {
      data[collectionName].push({ ...record, createdAt: new Date().toISOString() });
      saveLocalData(data);
    },
    async reset() {
      data = clone(fallbackSeedData);
      saveLocalData(data);
    }
  };
}

function readLocalData(fallbackSeedData) {
  const stored = localStorage.getItem(STORAGE_KEY);
  if (!stored) return clone(fallbackSeedData);
  try {
    return normalizeData(JSON.parse(stored));
  } catch {
    return clone(fallbackSeedData);
  }
}

function saveLocalData(data) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
}
