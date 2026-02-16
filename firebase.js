// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyBTRc6yFJIyO19lw8tPpIboKOQV8a4jWew",
  authDomain: "alert-6de89.firebaseapp.com",
  projectId: "alert-6de89",
  storageBucket: "alert-6de89.firebasestorage.app",
  messagingSenderId: "186905970373",
  appId: "1:186905970373:web:d5c22a126205610fa0d2ac",
  measurementId: "G-FHMRXGLJVH"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
