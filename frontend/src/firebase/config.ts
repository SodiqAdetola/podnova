// frontend/src/firebase/config.ts
import { initializeApp } from "firebase/app";
import { getAuth, initializeAuth, getReactNativePersistence } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import AsyncStorage from '@react-native-async-storage/async-storage';

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyB1IXQT9oZPRwTORS_Td3neA4B-R7LV6AE",
  authDomain: "podnova-9ecc2.firebaseapp.com",
  projectId: "podnova-9ecc2",
  storageBucket: "podnova-9ecc2.firebasestorage.app",
  messagingSenderId: "664275673122",
  appId: "1:664275673122:web:26a0ac92be14734dc9aa7b",
  measurementId: "G-9433CEFJBG"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);

// Initialize Auth with React Native persistence
// using initializeAuth instead of getAuth
export const auth = initializeAuth(app, {
  persistence: getReactNativePersistence(AsyncStorage)
});

export const db = getFirestore(app);
export const storage = getStorage(app);

// Note: Analytics doesn't work in React Native by default
// You might want to remove this or use a React Native specific solution
// export const analytics = getAnalytics(app);