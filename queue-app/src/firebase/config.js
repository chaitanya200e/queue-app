import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyC2lP2aIeQzY2QRQLcplmXgpSYIieZePRI",
  authDomain: "smart-queue-management-s-4dd78.firebaseapp.com",
  projectId: "smart-queue-management-s-4dd78",
  storageBucket: "smart-queue-management-s-4dd78.firebasestorage.app",
  messagingSenderId: "897668713042",
  appId: "1:897668713042:web:25d7185135e3b062686d8b",
};

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app);
export const auth = getAuth(app);

export const ADMIN_EMAILS = ["chaitanyamandale125@gmail.com"];
export const SUPER_ADMIN_EMAILS = ["chaitanyamandale125@gmail.com"];
