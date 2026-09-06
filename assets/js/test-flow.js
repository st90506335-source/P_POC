// test-flow.js — test.html（Page 1~3：手冊下載、動態問卷回饋填寫）
// 對應規格書 3.2 節：以 auth-guard 檢查 INVITED 狀態；動態讀取 questions 集合；送出至 submissions/{uid}

import { db } from "./firebase-config.js";
import { onAuthReady, signIn } from "./auth-guard.js";
import {
  doc,
  getDoc,
  setDoc,
  collection,
  query,
  where,
  orderBy,
  getDocs,
  serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

const els = {
  loading: $("loading"),
  loginSection: $("loginSection"),
  loginBtn: $("loginBtn"),
  blockedSection: $("blockedSection"),
  blockedMessage: $("blockedMessage"),
  wizard: $("wizard"),
  steps: [null, $("step1"), $("step2"), $("step3")],
  stepIndicators: [null, $("indicator1"), $("indicator2"), $("indicator3")],
  manualLink: $("manualLink"),
  toStep2Btn: $("toStep2Btn"),
  backToStep1Btn: $("backToStep1Btn"),
  questionsContainer: $("questionsContainer"),
  toStep3Btn: $("toStep3Btn"),
  backToStep2Btn: $("backToStep2Btn"),
  confirmName: $("confirmName"),
  confirmEmail: $("confirmEmail"),
  submitBtn: $("submitBtn"),
  submitError: $("submitError"),
  doneSection: $("doneSection")
};

function show(el) { el && el.classList.remove("hidden"); }
function hide(el) { el && el.classList.add("hidden"); }

let currentUser = null;
let questionsCache = [];

function goToStep(n) {
  [1, 2, 3].forEach((i) => {
    if (i === n) {
      show(els.steps[i]);
      els.stepIndicators[i]?.classList.add("bg-indigo-600", "text-white");
      els.stepIndicators[i]?.classList.remove("bg-gray-200", "text-gray-500");
    } else {
      hide(els.steps[i]);
      els.stepIndicators[i]?.classList.remove("bg-indigo-600", "text-white");
      els.stepIndicators[i]?.classList.add("bg-gray-200", "text-gray-500");
    }
  });
}

async function loadManualUrl() {
  try {
    const snap = await getDoc(doc(db, "settings", "config"));
    if (snap.exists() && els.manualLink) {
      const url = snap.data().manualUrl || "./assets/app-manual.pdf";
      els.manualLink.href = url;
    }
  } catch (err) {
    console.warn("讀取手冊連結失敗", err);
    if (els.manualLink) els.manualLink.href = "./assets/app-manual.pdf";
  }
}

async function loadQuestions() {
  const q = query(
    collection(db, "questions"),
    where("isActive", "==", true),
    orderBy("sortOrder", "asc")
  );
  const snap = await getDocs(q);
  questionsCache = snap.docs.map((d) => ({ id: d.id, ...d.data() }));

  els.questionsContainer.innerHTML = "";
  questionsCache.forEach((qst, idx) => {
    const wrap = document.createElement("div");
    wrap.className = "mb-6";
    wrap.innerHTML = `
      <label class="block font-medium text-gray-800 mb-2">${idx + 1}. ${qst.questionText}</label>
      <textarea data-qid="${qst.id}" rows="4"
        class="w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
        placeholder="請輸入您的回饋..."></textarea>
    `;
    els.questionsContainer.appendChild(wrap);
  });
}

function collectAnswers() {
  const textareas = els.questionsContainer.querySelectorAll("textarea[data-qid]");
  const answers = [];
  let allFilled = true;
  textareas.forEach((ta) => {
    const qid = ta.dataset.qid;
    const qst = questionsCache.find((q) => q.id === qid);
    const answerText = ta.value.trim();
    if (!answerText) allFilled = false;
    answers.push({
      questionId: qid,
      questionText: qst ? qst.questionText : "",
      answerText
    });
  });
  return { answers, allFilled };
}

async function handleFinalSubmit() {
  hide(els.submitError);
  const { answers, allFilled } = collectAnswers();
  if (!allFilled) {
    els.submitError.textContent = "請完整填寫所有題目後再送出";
    show(els.submitError);
    return;
  }

  els.submitBtn.disabled = true;
  els.submitBtn.textContent = "送出中...";

  try {
    await setDoc(doc(db, "submissions", currentUser.uid), {
      uid: currentUser.uid,
      userName: currentUser.displayName || "",
      email: currentUser.email || "",
      answers,
      reviewStatus: "PENDING",
      reviewedAt: null,
      assignedRewardDocId: null,
      createdAt: serverTimestamp()
    });
    hide(els.wizard);
    show(els.doneSection);
  } catch (err) {
    console.error(err);
    els.submitError.textContent = "送出失敗，請稍後再試";
    show(els.submitError);
  } finally {
    els.submitBtn.disabled = false;
    els.submitBtn.textContent = "確認送出";
  }
}

function blockWith(message) {
  hide(els.loading);
  hide(els.wizard);
  hide(els.loginSection);
  show(els.blockedSection);
  els.blockedMessage.textContent = message;
}

async function init(user) {
  hide(els.loading);

  if (!user) {
    show(els.loginSection);
    return;
  }
  currentUser = user;

  const applicantSnap = await getDoc(doc(db, "applicants", user.uid));
  if (!applicantSnap.exists() || applicantSnap.data().status !== "INVITED") {
    blockWith("您目前尚未獲選為受測名單，無法進入測試流程。");
    return;
  }

  const submissionSnap = await getDoc(doc(db, "submissions", user.uid));
  if (submissionSnap.exists()) {
    const status = submissionSnap.data().reviewStatus;
    const text = {
      PENDING: "您已送出測試回饋，目前狀態：待審核",
      APPROVED: "您的測試回饋已審核通過，請至禮券兌換頁面領取獎勵",
      REJECTED: "您的測試回饋審核未通過"
    }[status] || "您已送出測試回饋";
    blockWith(text);
    return;
  }

  await loadManualUrl();
  await loadQuestions();
  if (els.confirmName) els.confirmName.textContent = user.displayName || "";
  if (els.confirmEmail) els.confirmEmail.textContent = user.email || "";

  show(els.wizard);
  goToStep(1);
}

els.loginBtn?.addEventListener("click", () => signIn().catch((err) => console.error(err)));
els.toStep2Btn?.addEventListener("click", () => goToStep(2));
els.backToStep1Btn?.addEventListener("click", () => goToStep(1));
els.toStep3Btn?.addEventListener("click", () => {
  const { allFilled } = collectAnswers();
  if (!allFilled) {
    alert("請完整填寫所有題目後再繼續");
    return;
  }
  goToStep(3);
});
els.backToStep2Btn?.addEventListener("click", () => goToStep(2));
els.submitBtn?.addEventListener("click", handleFinalSubmit);

onAuthReady(init);
