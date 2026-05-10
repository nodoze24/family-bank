import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyDdMKtFp6iS6_cxUA4M4AnngklSfCRBVIw",
  authDomain: "nedd-fam-bank.firebaseapp.com",
  projectId: "nedd-fam-bank",
  storageBucket: "nedd-fam-bank.firebasestorage.app",
  messagingSenderId: "385258773570",
  appId: "1:385258773570:web:ce5f3854237dbd8a4621db",
  measurementId: "G-2T657EJ67K"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);