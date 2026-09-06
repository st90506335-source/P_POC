// firebase-config.js
// Firebase App / Auth / Firestore(ppoc) / Functions 初始化
// 對應規格書 1.2 節

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";
import { getFunctions } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-functions.js";

// TODO：請至 Firebase Console > 專案設定 取得實際參數並替換以下設定值
const firebaseConfig = {
  apiKey: "AIzaSyCkIuQSBoc5bzJ9Tz3PhdUQL3_gIlFmVck",
  authDomain: "project-527b8c4a-cfeb-4c25-85c.firebaseapp.com",
  projectId: "project-527b8c4a-cfeb-4c25-85c",
  storageBucket: "project-527b8c4a-cfeb-4c25-85c.firebasestorage.app",
  messagingSenderId: "499931946357",
  appId: "1:499931946357:web:958006c31148fda215c73c",
  measurementId: "G-9M69E9604R"
};

const app = initializeApp(firebaseConfig);

export const auth = getAuth(app);
export const googleProvider = new GoogleAuthProvider();

// 重要：指定已建立之 Named Database ID "ppoc"（非 default）
export const db = getFirestore(app, "ppoc");

// Cloud Functions 部署區域為 asia-east1，需在前端呼叫端一併指定
export const functions = getFunctions(app, "asia-east1");
