// page0.js — index.html（Page 0：開放意願調查與 Google 登入）
// 對應規格書 3.2 / 4.1 節：登入後查詢 applicants/{uid}，未登記則帶入 Google 資訊供補填手機送出

import { db } from "./firebase-config.js";
import { onAuthReady, signIn, signOutUser } from "./auth-guard.js";
import {
  doc,
  getDoc,
  setDoc,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

const els = {
  loading: $("loading"),
  loginSection: $("loginSection"),
  formSection: $("formSection"),
  statusSection: $("statusSection"),
  loginBtn: $("loginBtn"),
  logoutBtn: $("logoutBtn"),
  userBar: $("userBar"),
  userName: $("userName"),
  userAvatar: $("userAvatar"),
  appName: $("appName"),
  featureIntro: $("featureIntro"),
  form: $("applyForm"),
  phoneInput: $("phone"),
  willingCheckbox: $("willingToTest"),
  submitBtn: $("submitBtn"),
  formError: $("formError"),
  statusBadge: $("statusBadge"),
  statusMessage: $("statusMessage")
};

function show(el) { el && el.classList.remove("hidden"); }
function hide(el) { el && el.classList.add("hidden"); }

const STATUS_TEXT = {
  APPLIED: "已完成登記，目前狀態：審核中",
  INVITED: "恭喜獲選！請至測試頁面完成受測流程",
  REJECTED: "很遺憾，本次未獲選為核心受測名單"
};

async function loadSettings() {
  try {
    const snap = await getDoc(doc(db, "settings", "config"));
    if (snap.exists()) {
      const data = snap.data();
      if (els.appName && data.appName) els.appName.textContent = data.appName;
      if (els.featureIntro && data.featureIntro) els.featureIntro.textContent = data.featureIntro;
    }
  } catch (err) {
    console.warn("讀取系統設定失敗", err);
  }
}

async function renderForUser(user) {
  hide(els.loading);

  if (!user) {
    show(els.loginSection);
    hide(els.formSection);
    hide(els.statusSection);
    hide(els.userBar);
    return;
  }

  show(els.userBar);
  hide(els.loginSection);
  if (els.userName) els.userName.textContent = user.displayName || user.email;
  if (els.userAvatar && user.photoURL) els.userAvatar.src = user.photoURL;

  const ref = doc(db, "applicants", user.uid);
  const snap = await getDoc(ref);

  if (snap.exists()) {
    const data = snap.data();
    hide(els.formSection);
    show(els.statusSection);
    if (els.statusBadge) {
      els.statusBadge.textContent = data.status;
      els.statusBadge.className = `status-badge status-${data.status}`;
    }
    if (els.statusMessage) {
      els.statusMessage.textContent = STATUS_TEXT[data.status] || "";
    }
  } else {
    hide(els.statusSection);
    show(els.formSection);
    if (els.form) {
      els.form.dataset.uid = user.uid;
      els.form.dataset.name = user.displayName || "";
      els.form.dataset.email = user.email || "";
    }
  }
}

async function handleSubmit(e) {
  e.preventDefault();
  hide(els.formError);

  const uid = els.form.dataset.uid;
  const phone = els.phoneInput.value.trim();
  const willing = els.willingCheckbox.checked;

  if (!phone) {
    els.formError.textContent = "請輸入聯絡手機";
    show(els.formError);
    return;
  }
  if (!willing) {
    els.formError.textContent = "請確認您願意參與測試";
    show(els.formError);
    return;
  }

  els.submitBtn.disabled = true;
  els.submitBtn.textContent = "送出中...";

  try {
    await setDoc(doc(db, "applicants", uid), {
      uid,
      userName: els.form.dataset.name,
      email: els.form.dataset.email,
      phone,
      willingToTest: willing,
      status: "APPLIED",
      createdAt: serverTimestamp(),
      invitedAt: null
    });
    hide(els.formSection);
    show(els.statusSection);
    if (els.statusBadge) {
      els.statusBadge.textContent = "APPLIED";
      els.statusBadge.className = "status-badge status-APPLIED";
    }
    if (els.statusMessage) {
      els.statusMessage.textContent = STATUS_TEXT.APPLIED;
    }
  } catch (err) {
    console.error(err);
    els.formError.textContent = "送出失敗，請稍後再試";
    show(els.formError);
  } finally {
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = "送出登記";
  }
}

els.loginBtn?.addEventListener("click", () => signIn().catch((err) => console.error(err)));
els.logoutBtn?.addEventListener("click", () => signOutUser());
els.form?.addEventListener("submit", handleSubmit);

loadSettings();
onAuthReady(renderForUser);
