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

function renderQuestionInput(qst) {
  const type = qst.type || "TEXT";

  if (type === "SINGLE_CHOICE" || type === "YES_NO") {
    const options = type === "YES_NO" ? ["是", "否"] : (qst.options || []);
    let html = options.map((opt) => `
      <label class="flex items-center gap-2 mb-2 cursor-pointer">
        <input type="radio" name="q_${qst.id}" value="${opt}" class="w-4 h-4">
        <span>${opt}</span>
      </label>
    `).join("");
    if (type === "SINGLE_CHOICE" && qst.allowOther) {
      html += `
        <label class="flex items-center gap-2 mb-2 cursor-pointer">
          <input type="radio" name="q_${qst.id}" class="w-4 h-4 other-radio">
          <span class="whitespace-nowrap">其他：</span>
          <input type="text" class="other-input flex-1 border-b border-gray-300 focus:outline-none focus:border-indigo-500 px-1 py-0.5 text-sm" placeholder="請輸入">
        </label>
      `;
    }
    return html;
  }

  if (type === "MULTIPLE_CHOICE") {
    let html = (qst.options || []).map((opt) => `
      <label class="flex items-center gap-2 mb-2 cursor-pointer">
        <input type="checkbox" value="${opt}" class="w-4 h-4">
        <span>${opt}</span>
      </label>
    `).join("");
    if (qst.allowOther) {
      html += `
        <label class="flex items-center gap-2 mb-2 cursor-pointer">
          <input type="checkbox" class="w-4 h-4 other-checkbox">
          <span class="whitespace-nowrap">其他：</span>
          <input type="text" class="other-input flex-1 border-b border-gray-300 focus:outline-none focus:border-indigo-500 px-1 py-0.5 text-sm" placeholder="請輸入">
        </label>
      `;
    }
    return html;
  }

  if (type === "RATING") {
    const max = qst.ratingMax || 5;
    let stars = "";
    for (let i = 1; i <= max; i++) {
      stars += `<button type="button" class="star-btn text-3xl text-gray-300 leading-none" data-value="${i}">★</button>`;
    }
    return `<div class="rating-stars flex gap-1" data-value="0">${stars}</div>`;
  }

  if (type === "SLIDER") {
    const min = qst.sliderMin ?? 0;
    const max = qst.sliderMax ?? 10;
    const step = qst.sliderStep ?? 1;
    return `
      <input type="range" min="${min}" max="${max}" step="${step}" value="${min}" class="slider-input w-full">
      <div class="text-sm text-gray-500 mt-1">目前數值：<span class="slider-value font-medium text-gray-700">${min}</span></div>
    `;
  }

  return `<textarea rows="4"
    class="text-input w-full border border-gray-300 rounded-lg p-3 focus:ring-2 focus:ring-indigo-500 focus:outline-none"
    placeholder="請輸入您的回饋..."></textarea>`;
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
    const type = qst.type || "TEXT";
    const wrap = document.createElement("div");
    wrap.className = "mb-6";
    wrap.dataset.qid = qst.id;
    wrap.dataset.qtype = type;
    wrap.innerHTML = `
      <label class="block font-medium text-gray-800 mb-2">${idx + 1}. ${qst.questionText}</label>
      ${renderQuestionInput(qst)}
    `;
    els.questionsContainer.appendChild(wrap);
  });

  els.questionsContainer.querySelectorAll('[data-qtype="RATING"] .rating-stars').forEach((starsEl) => {
    starsEl.querySelectorAll(".star-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const value = Number(btn.dataset.value);
        starsEl.dataset.value = value;
        starsEl.querySelectorAll(".star-btn").forEach((b) => {
          const filled = Number(b.dataset.value) <= value;
          b.classList.toggle("text-yellow-400", filled);
          b.classList.toggle("text-gray-300", !filled);
        });
      });
    });
  });

  els.questionsContainer.querySelectorAll('[data-qtype="SLIDER"] .slider-input').forEach((input) => {
    const display = input.parentElement.querySelector(".slider-value");
    input.addEventListener("input", () => { display.textContent = input.value; });
  });
}

function collectAnswers() {
  const wraps = els.questionsContainer.querySelectorAll("[data-qid]");
  const answers = [];
  let allFilled = true;

  wraps.forEach((wrap) => {
    const qid = wrap.dataset.qid;
    const type = wrap.dataset.qtype;
    const qst = questionsCache.find((q) => q.id === qid);
    let answerValue = null;
    let answerText = "";

    if (type === "SINGLE_CHOICE" || type === "YES_NO") {
      const checked = wrap.querySelector('input[type="radio"]:checked');
      if (checked?.classList.contains("other-radio")) {
        const otherText = wrap.querySelector(".other-input")?.value.trim() || "";
        answerValue = otherText || null;
        answerText = otherText ? `其他：${otherText}` : "";
        if (!otherText) allFilled = false;
      } else {
        answerValue = checked ? checked.value : null;
        answerText = answerValue || "";
        if (!answerValue) allFilled = false;
      }
    } else if (type === "MULTIPLE_CHOICE") {
      const checked = Array.from(wrap.querySelectorAll('input[type="checkbox"]:checked'));
      const values = [];
      const displayValues = [];
      let otherOk = true;
      checked.forEach((cb) => {
        if (cb.classList.contains("other-checkbox")) {
          const otherText = wrap.querySelector(".other-input")?.value.trim() || "";
          if (otherText) {
            values.push(otherText);
            displayValues.push(`其他：${otherText}`);
          } else {
            otherOk = false;
          }
        } else {
          values.push(cb.value);
          displayValues.push(cb.value);
        }
      });
      answerValue = values;
      answerText = displayValues.join("、");
      if (values.length === 0 || !otherOk) allFilled = false;
    } else if (type === "RATING") {
      const rating = Number(wrap.querySelector(".rating-stars")?.dataset.value || 0);
      answerValue = rating;
      answerText = rating > 0 ? `${rating} / ${qst?.ratingMax || 5} 顆星` : "";
      if (rating <= 0) allFilled = false;
    } else if (type === "SLIDER") {
      const value = Number(wrap.querySelector(".slider-input").value);
      answerValue = value;
      answerText = String(value);
    } else {
      const value = wrap.querySelector("textarea").value.trim();
      answerValue = value;
      answerText = value;
      if (!value) allFilled = false;
    }

    answers.push({
      questionId: qid,
      questionText: qst ? qst.questionText : "",
      questionType: type,
      answerValue,
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

function blockWith(html) {
  hide(els.loading);
  hide(els.wizard);
  hide(els.loginSection);
  show(els.blockedSection);
  els.blockedMessage.innerHTML = html;
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
    const html = {
      PENDING: "您已送出測試回饋，目前狀態：待審核",
      APPROVED: '您的測試回饋已審核通過！<br><a href="./redeem.html" class="text-indigo-600 hover:underline font-medium mt-2 inline-block">前往禮券兌換頁面 →</a>',
      REJECTED: "您的測試回饋審核未通過"
    }[status] || "您已送出測試回饋";
    blockWith(html);
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
