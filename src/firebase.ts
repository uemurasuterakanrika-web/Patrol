import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";

const firebaseConfig = {
  projectId: "suterakanrika",
  appId: "1:573909973568:web:76b437d3c08f76c90a3da5",
  storageBucket: "suterakanrika.firebasestorage.app",
  apiKey: "AIzaSyCj98dr3WSlxNQld7FT202YQ_fhdwCZGS0",
  authDomain: "suterakanrika.firebaseapp.com",
  messagingSenderId: "573909973568"
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const storage = getStorage(app);
