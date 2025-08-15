// /src/lib/firebaseAdmin.ts
import * as admin from "firebase-admin";

declare global {
  // Next.js dev'de yeniden init'i önlemek için
  
  var __adminApp__: admin.app.App | undefined;
}

// Service account JSON (raw veya base64)
function getRawServiceAccount(): string {
  const b64 = process.env.FIREBASE_ADMIN_JSON_B64?.trim();
  if (b64) return Buffer.from(b64, "base64").toString("utf8");

  const raw = process.env.FIREBASE_ADMIN_JSON;
  if (!raw) throw new Error("FIREBASE_ADMIN_JSON is not set");
  return raw;
}

// Tek seferlik init
function getAdminApp(): admin.app.App {
  if (global.__adminApp__) return global.__adminApp__;

  const raw = getRawServiceAccount();
  const json = JSON.parse(raw);

  const projectId: string = json.project_id || process.env.FIREBASE_PROJECT_ID;
  const clientEmail: string = json.client_email || process.env.FIREBASE_CLIENT_EMAIL;
  const privateKey: string = (json.private_key || process.env.FIREBASE_PRIVATE_KEY || "").replace(/\\n/g, "\n");

  if (!projectId || !clientEmail || !privateKey) {
    throw new Error("Missing Firebase Admin credentials (projectId/clientEmail/privateKey)");
  }

  // PDF bucket'ı → mutlaka *.appspot.com
  const storageBucket =
    process.env.FIREBASE_STORAGE_BUCKET ||
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    `${projectId}.appspot.com`;

  // RTDB URL (kullanıyorsan)
  const databaseURL =
    process.env.FIREBASE_DB_URL ||
    process.env.FIREBASE_DATABASE_URL ||
    undefined;

  const app = admin.initializeApp({
    credential: admin.credential.cert({
      projectId,
      clientEmail,
      privateKey,
    }),
    storageBucket,
    databaseURL,
  });

  global.__adminApp__ = app;
  return app;
}

const app = getAdminApp();

// ---- EXPORTS (sıra önemli) ----
export const Admin = admin;               // tüm Admin SDK (eski kodlar için)
export const AdminFs = admin.firestore;   // FieldValue/Timestamp erişimi
export const adminApp = app;              // App instance (gerekirse)
export const adminAuth = admin.auth();    // Auth (verifyIdToken vs.)
export const adminDb = app.firestore();   // Firestore (server)
export const adminRtdb = app.database(    // RTDB (server) — databaseURL tanımlıysa
  process.env.FIREBASE_DB_URL || process.env.FIREBASE_DATABASE_URL
);
export const adminBucket = admin.storage().bucket(); // default = storageBucket

// 👇 ALIAS **adminDb sonrası** gelmeli; yoksa "used before its declaration" verir
export const adminDB = adminDb;
