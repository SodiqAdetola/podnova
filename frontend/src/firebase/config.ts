// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
import { getAuth } from "firebase/auth";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
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
export const analytics = getAnalytics(app);
export const auth = getAuth(app);