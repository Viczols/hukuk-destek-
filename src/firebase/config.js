// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getDatabase } from "firebase/database";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

// Firebase configuration
export const firebaseConfig = {
  apiKey: "AIzaSyChorIgwMpcfU6nIlpGzG2z3N12QGc6Scg",
  authDomain: "dilekce-destek.firebaseapp.com",
  projectId: "dilekce-destek",
  storageBucket: "dilekce-destek.appspot.com",
  databaseURL: "https://dilekce-destek-default-rtdb.europe-west1.firebasedatabase.app/",
  messagingSenderId: "176069932687",
  appId: "1:176069932687:web:971d28ab1493718d2fa2fa",
  measurementId: "G-RKDE2L2VDY"
};

// Initialize Firebase app
export const app = initializeApp(firebaseConfig);

// ✅ Export servisler
export const auth = getAuth(app);
export const dbRealtime = getDatabase(app);
export const dbFirestore = getFirestore(app);

export const storage = getStorage(app);
