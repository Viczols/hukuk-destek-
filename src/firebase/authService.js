import { auth } from "./config";
import {
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
} from "firebase/auth";

// Kullanıcı kayıt
export const registerUser = (email, password) =>
  createUserWithEmailAndPassword(auth, email, password);

// Giriş
export const loginUser = (email, password) =>
  signInWithEmailAndPassword(auth, email, password);

// Çıkış
export const logoutUser = () => signOut(auth);

// Oturum kontrolü
export const onAuthStateChange = (callback) =>
  onAuthStateChanged(auth, callback);
