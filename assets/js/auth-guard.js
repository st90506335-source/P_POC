// auth-guard.js
// 身份狀態監聽與重導守衛（共用模組，供各頁面 JS 匯入使用）

import { auth, googleProvider } from "./firebase-config.js";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-auth.js";

// 監聽登入狀態，callback(user) 於狀態改變時觸發（user 可能為 null）
export function onAuthReady(callback) {
  return onAuthStateChanged(auth, callback);
}

export async function signIn() {
  return signInWithPopup(auth, googleProvider);
}

export async function signOutUser() {
  return signOut(auth);
}

// 檢查目前使用者是否具備 Admin 自訂聲明 (custom claim)
export async function isAdmin(user) {
  if (!user) return false;
  const tokenResult = await user.getIdTokenResult();
  return tokenResult.claims.admin === true;
}

export function redirectTo(path) {
  window.location.href = path;
}
