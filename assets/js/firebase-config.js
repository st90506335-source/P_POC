// firebase-config.js
// Firebase App / Auth / Firestore(ppoc) 初始化
// 對應規格書 1.2 節（後端改由平台無關的 server/ API 提供，見 assets/js/api-config.js）

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

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
// 強制每次登入都顯示帳號選擇畫面，避免瀏覽器沿用既有 Google 工作階段而無法切換帳號
googleProvider.setCustomParameters({ prompt: "select_account" });

// 重要：指定已建立之 Named Database ID "ppoc"（非 default）
export const db = getFirestore(app, "ppoc");
