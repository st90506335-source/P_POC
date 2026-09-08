// admin.js — admin.html（後台管理控制台，限 Admin Google 帳號存取）
// 對應規格書 3.2 / 5 節：審核介面、題庫 CRUD、庫存管理、批次邀請、核准發券

import { db, auth } from "./firebase-config.js";
import { API_BASE_URL } from "./api-config.js";
import { onAuthReady, isAdmin, signIn, signOutUser } from "./auth-guard.js";
import {
  doc,
  getDoc,
  getDocs,
  setDoc,
  updateDoc,
  deleteDoc,
  addDoc,
  collection,
  query,
  where,
  orderBy,
  onSnapshot,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

async function callApi(path, { method = "POST", body } = {}) {
  const idToken = await auth.currentUser.getIdToken();
  const res = await fetch(`${API_BASE_URL}${path}`, {
    method,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `請求失敗 (${res.status})`);
  return data;
}

const $ = (id) => document.getElementById(id);
function show(el) { el && el.classList.remove("hidden"); }
function hide(el) { el && el.classList.add("hidden"); }

const els = {
  loading: $("loading"),
  loginSection: $("loginSection"),
  loginBtn: $("loginBtn"),
  deniedSection: $("deniedSection"),
  console: $("console"),
  userName: $("userName"),
  logoutBtn: $("logoutBtn"),

  tabs: document.querySelectorAll("[data-tab]"),
  panels: document.querySelectorAll("[data-panel]"),

  // 意願登記審核
  applicantsTbody: $("applicantsTbody"),
  sendInvitesBtn: $("sendInvitesBtn"),
  invitesMessage: $("invitesMessage"),

  // 題庫管理
  questionsTbody: $("questionsTbody"),
  newQuestionText: $("newQuestionText"),
  newQuestionType: $("newQuestionType"),
  newQuestionOrder: $("newQuestionOrder"),
  newQuestionOptions: $("newQuestionOptions"),
  newQuestionAllowOther: $("newQuestionAllowOther"),
  newQuestionRatingMax: $("newQuestionRatingMax"),
  newQuestionSliderMin: $("newQuestionSliderMin"),
  newQuestionSliderMax: $("newQuestionSliderMax"),
  newQuestionSliderStep: $("newQuestionSliderStep"),
  choiceOptionsField: $("choiceOptionsField"),
  ratingConfigField: $("ratingConfigField"),
  sliderConfigField: $("sliderConfigField"),
  newQuestionRequiredMode: $("newQuestionRequiredMode"),
  newConditionalField: $("newConditionalField"),
  newQuestionCondQuestion: $("newQuestionCondQuestion"),
  newQuestionCondOperator: $("newQuestionCondOperator"),
  newQuestionCondValue: $("newQuestionCondValue"),
  addQuestionBtn: $("addQuestionBtn"),

  // 回饋審核
  submissionsContainer: $("submissionsContainer"),

  // 獎勵序號池
  rewardStockSummary: $("rewardStockSummary"),
  refreshStockBtn: $("refreshStockBtn"),
  newSerialsText: $("newSerialsText"),
  addSerialsBtn: $("addSerialsBtn"),
  rewardsMessage: $("rewardsMessage"),
  rewardsTbody: $("rewardsTbody"),

  // 系統設定
  settingsForm: $("settingsForm"),
  appNameInput: $("appNameInput"),
  manualUrlInput: $("manualUrlInput"),
  featureIntroInput: $("featureIntroInput"),
  targetSampleSizeInput: $("targetSampleSizeInput"),
  settingsMessage: $("settingsMessage")
};

// ---------- Tabs ----------
els.tabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    const target = btn.dataset.tab;
    els.tabs.forEach((b) => b.classList.toggle("bg-indigo-600", b === btn));
    els.tabs.forEach((b) => b.classList.toggle("text-white", b === btn));
    els.tabs.forEach((b) => b.classList.toggle("bg-gray-100", b !== btn));
    els.panels.forEach((p) => {
      if (p.dataset.panel === target) show(p); else hide(p);
    });
  });
});

// ---------- 1. 意願登記審核 & 批次邀請 ----------
const STATUS_LABEL = { APPLIED: "已登記", INVITED: "已邀請", REJECTED: "已婉拒" };

function watchApplicants() {
  const q = query(collection(db, "applicants"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    els.applicantsTbody.innerHTML = "";
    snap.forEach((d) => {
      const a = d.data();
      const tr = document.createElement("tr");
      tr.className = "border-b";
      tr.innerHTML = `
        <td class="p-2">
          ${a.status === "APPLIED" ? `<input type="checkbox" class="applicant-check" value="${d.id}">` : ""}
        </td>
        <td class="p-2">${a.userName || ""}</td>
        <td class="p-2">${a.email || ""}</td>
        <td class="p-2">${a.phone || ""}</td>
        <td class="p-2"><span class="status-badge status-${a.status}">${STATUS_LABEL[a.status] || a.status}</span></td>
      `;
      els.applicantsTbody.appendChild(tr);
    });
  });
}

els.sendInvitesBtn?.addEventListener("click", async () => {
  const checks = document.querySelectorAll(".applicant-check:checked");
  const targetUids = Array.from(checks).map((c) => c.value);
  if (targetUids.length === 0) {
    els.invitesMessage.textContent = "請至少勾選一位受測者";
    els.invitesMessage.className = "text-sm text-red-600 mt-2";
    return;
  }

  els.sendInvitesBtn.disabled = true;
  els.invitesMessage.textContent = "處理中...";
  els.invitesMessage.className = "text-sm text-gray-500 mt-2";

  try {
    const result = await callApi("/api/sendInvites", { body: { targetUids } });
    els.invitesMessage.textContent = `成功發送 ${result.count} 封測試邀請`;
    els.invitesMessage.className = "text-sm text-green-600 mt-2";
  } catch (err) {
    console.error(err);
    els.invitesMessage.textContent = err.message || "發送邀請失敗";
    els.invitesMessage.className = "text-sm text-red-600 mt-2";
  } finally {
    els.sendInvitesBtn.disabled = false;
  }
});

// ---------- 2. 題庫管理 ----------
const QUESTION_TYPE_LABEL = {
  TEXT: "文字",
  SINGLE_CHOICE: "單選",
  MULTIPLE_CHOICE: "多選",
  YES_NO: "是非題",
  RATING: "評星",
  SLIDER: "滑桿"
};

function escapeAttr(str) {
  return String(str).replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

function questionConfigSummary(qst, type) {
  if (type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE") {
    const opts = (qst.options || []).join("、");
    return qst.allowOther ? `選項：${opts}（＋其他）` : `選項：${opts}`;
  }
  if (type === "RATING") return `最多 ${qst.ratingMax || 5} 顆星`;
  if (type === "SLIDER") return `範圍 ${qst.sliderMin ?? 0} ~ ${qst.sliderMax ?? 10}（間距 ${qst.sliderStep ?? 1}）`;
  return "";
}

function updateQuestionConfigFields() {
  const type = els.newQuestionType.value;
  hide(els.choiceOptionsField);
  hide(els.ratingConfigField);
  hide(els.sliderConfigField);
  if (type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE") show(els.choiceOptionsField);
  if (type === "RATING") show(els.ratingConfigField);
  if (type === "SLIDER") show(els.sliderConfigField);
}
els.newQuestionType?.addEventListener("change", updateQuestionConfigFields);
updateQuestionConfigFields();

els.newQuestionRequiredMode?.addEventListener("change", () => {
  els.newConditionalField.classList.toggle("hidden", els.newQuestionRequiredMode.value !== "CONDITIONAL");
});

const REQUIRED_MODE_LABEL = { ALWAYS: "必填", OPTIONAL: "選填", CONDITIONAL: "條件式" };

function conditionSummary(qst) {
  if (qst.requiredMode !== "CONDITIONAL" || !qst.condition) return "";
  const trigger = lastQuestionsDocs.find((d) => d.id === qst.condition.questionId);
  const opLabel = { eq: "等於", gt: "大於", lt: "小於" }[qst.condition.operator] || qst.condition.operator;
  const triggerText = trigger ? trigger.data().questionText : "(題目已刪除)";
  return `條件：「${triggerText}」${opLabel}「${qst.condition.value}」`;
}

// 依目前題庫清單重建「觸發題目」下拉選單（排除 excludeId，例如編輯中的題目自己）
function buildConditionOptions(selectEl, excludeId, selectedId) {
  if (!selectEl) return;
  selectEl.innerHTML = lastQuestionsDocs
    .filter((d) => d.id !== excludeId)
    .map((d) => {
      const text = d.data().questionText || "(未命名題目)";
      return `<option value="${d.id}" ${d.id === selectedId ? "selected" : ""}>${escapeAttr(text)}</option>`;
    })
    .join("");
}

const editingQuestionIds = new Set();
let lastQuestionsDocs = [];

function renderQuestionEditRow(id, qst) {
  const type = qst.type || "TEXT";
  const isChoice = type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE";
  return `
    <tr class="border-b bg-indigo-50" data-edit-row="${id}">
      <td class="p-2 align-top">
        <input type="number" class="edit-order w-16 border border-gray-300 rounded p-1 text-sm" value="${qst.sortOrder ?? 0}">
      </td>
      <td class="p-2 align-top" colspan="4">
        <div class="space-y-2 max-w-lg">
          <input type="text" class="edit-text w-full border border-gray-300 rounded-lg p-2 text-sm" value="${escapeAttr(qst.questionText)}">
          <select class="edit-type border border-gray-300 rounded-lg p-2 text-sm">
            <option value="TEXT" ${type === "TEXT" ? "selected" : ""}>文字</option>
            <option value="SINGLE_CHOICE" ${type === "SINGLE_CHOICE" ? "selected" : ""}>單選</option>
            <option value="MULTIPLE_CHOICE" ${type === "MULTIPLE_CHOICE" ? "selected" : ""}>多選</option>
            <option value="YES_NO" ${type === "YES_NO" ? "selected" : ""}>是非題</option>
            <option value="RATING" ${type === "RATING" ? "selected" : ""}>評星</option>
            <option value="SLIDER" ${type === "SLIDER" ? "selected" : ""}>滑桿</option>
          </select>

          <div class="edit-choice-field ${isChoice ? "" : "hidden"}">
            <textarea class="edit-options w-full border border-gray-300 rounded-lg p-2 text-sm" rows="3">${(qst.options || []).join("\n")}</textarea>
            <label class="flex items-center gap-2 mt-2 text-sm text-gray-700">
              <input type="checkbox" class="edit-allow-other w-4 h-4" ${qst.allowOther ? "checked" : ""}>
              允許「其他（請說明）」自由回答
            </label>
          </div>

          <div class="edit-rating-field ${type === "RATING" ? "" : "hidden"} flex items-center gap-2">
            <label class="text-xs text-gray-500">星星上限</label>
            <input type="number" class="edit-rating-max w-20 border border-gray-300 rounded-lg p-1 text-sm" value="${qst.ratingMax || 5}">
          </div>

          <div class="edit-slider-field ${type === "SLIDER" ? "" : "hidden"} flex items-center gap-3">
            <label class="text-xs text-gray-500">最小值 <input type="number" class="edit-slider-min w-16 border border-gray-300 rounded-lg p-1 text-sm ml-1" value="${qst.sliderMin ?? 0}"></label>
            <label class="text-xs text-gray-500">最大值 <input type="number" class="edit-slider-max w-16 border border-gray-300 rounded-lg p-1 text-sm ml-1" value="${qst.sliderMax ?? 10}"></label>
            <label class="text-xs text-gray-500">間距 <input type="number" class="edit-slider-step w-16 border border-gray-300 rounded-lg p-1 text-sm ml-1" value="${qst.sliderStep ?? 1}"></label>
          </div>

          <div class="flex items-center gap-2">
            <label class="text-xs text-gray-500">必填設定</label>
            <select class="edit-required-mode border border-gray-300 rounded-lg p-2 text-sm">
              <option value="ALWAYS" ${(qst.requiredMode || "ALWAYS") === "ALWAYS" ? "selected" : ""}>一律必填</option>
              <option value="OPTIONAL" ${qst.requiredMode === "OPTIONAL" ? "selected" : ""}>一律非必填</option>
              <option value="CONDITIONAL" ${qst.requiredMode === "CONDITIONAL" ? "selected" : ""}>條件式（不符合則隱藏）</option>
            </select>
          </div>
          <div class="edit-conditional-field ${qst.requiredMode === "CONDITIONAL" ? "" : "hidden"} flex items-center gap-2 flex-wrap p-3 rounded-lg bg-gray-50">
            <label class="text-xs text-gray-500">觸發題目</label>
            <select class="edit-cond-question border border-gray-300 rounded-lg p-2 text-sm max-w-[200px]">
              ${lastQuestionsDocs.filter((d) => d.id !== id).map((d) => {
                const qText = d.data().questionText || "(未命名題目)";
                const selected = qst.condition?.questionId === d.id ? "selected" : "";
                return `<option value="${d.id}" ${selected}>${escapeAttr(qText)}</option>`;
              }).join("")}
            </select>
            <select class="edit-cond-operator border border-gray-300 rounded-lg p-2 text-sm">
              <option value="eq" ${(qst.condition?.operator || "eq") === "eq" ? "selected" : ""}>等於</option>
              <option value="gt" ${qst.condition?.operator === "gt" ? "selected" : ""}>大於</option>
              <option value="lt" ${qst.condition?.operator === "lt" ? "selected" : ""}>小於</option>
            </select>
            <input type="text" class="edit-cond-value border border-gray-300 rounded-lg p-2 text-sm w-32" placeholder="比對值（例如：是）" value="${escapeAttr(qst.condition?.value ?? "")}">
          </div>

          <div class="flex gap-2 pt-1">
            <button data-id="${id}" class="save-question bg-indigo-600 text-white px-3 py-1.5 rounded text-sm hover:bg-indigo-700">儲存</button>
            <button data-id="${id}" class="cancel-edit-question bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-sm hover:bg-gray-300">取消</button>
          </div>
        </div>
      </td>
    </tr>
  `;
}

// 重新排序：與相鄰題目交換位置，並將整份題庫依目前顯示順序重新編為連續整數，
// 徹底解決重複/跳號問題（不是只交換數值，是依畫面順序整批重新編號）
async function moveQuestion(id, offset) {
  const docs = lastQuestionsDocs;
  const index = docs.findIndex((d) => d.id === id);
  const targetIndex = index + offset;
  if (index === -1 || targetIndex < 0 || targetIndex >= docs.length) return;

  const reordered = docs.slice();
  [reordered[index], reordered[targetIndex]] = [reordered[targetIndex], reordered[index]];

  const batch = writeBatch(db);
  reordered.forEach((d, i) => {
    batch.update(d.ref, { sortOrder: i + 1 });
  });
  await batch.commit();
}

function renderQuestionsTable(docs) {
  els.questionsTbody.innerHTML = "";
  docs.forEach((d) => {
    const qst = d.data();
    const type = qst.type || "TEXT";

    if (editingQuestionIds.has(d.id)) {
      els.questionsTbody.insertAdjacentHTML("beforeend", renderQuestionEditRow(d.id, qst));
      return;
    }

    const configSummary = questionConfigSummary(qst, type);
    const condSummary = conditionSummary(qst);
    const typeLabel = `${QUESTION_TYPE_LABEL[type] || type}${qst.allowOther ? " ＋其他" : ""}`;
    const requiredMode = qst.requiredMode || "ALWAYS";
    const requiredBadgeClass = { ALWAYS: "bg-red-50 text-red-600", OPTIONAL: "bg-gray-100 text-gray-500", CONDITIONAL: "bg-amber-50 text-amber-600" }[requiredMode];
    const subLines = [configSummary, condSummary].filter(Boolean).join("　|　");
    const tr = document.createElement("tr");
    tr.className = "border-b";
    tr.innerHTML = `
      <td class="p-2">
        <div class="flex items-center gap-1">
          <span>${qst.sortOrder ?? 0}</span>
          <button data-id="${d.id}" class="move-up text-gray-400 hover:text-indigo-600 leading-none" title="往前移">▲</button>
          <button data-id="${d.id}" class="move-down text-gray-400 hover:text-indigo-600 leading-none" title="往後移">▼</button>
        </div>
      </td>
      <td class="p-2">${qst.questionText}</td>
      <td class="p-2 text-gray-500">
        ${configSummary
          ? `<span title="${escapeAttr(configSummary)}" class="border-b border-dotted border-gray-400 cursor-help">${typeLabel}</span>`
          : typeLabel}
        <span class="ml-1 px-1.5 py-0.5 rounded text-xs ${requiredBadgeClass}">${REQUIRED_MODE_LABEL[requiredMode]}</span>
      </td>
      <td class="p-2">
        <button data-id="${d.id}" data-active="${qst.isActive}" class="toggle-active px-2 py-1 rounded text-xs ${qst.isActive ? "bg-green-100 text-green-700" : "bg-gray-200 text-gray-600"}">
          ${qst.isActive ? "啟用中" : "已停用"}
        </button>
      </td>
      <td class="p-2 space-x-2">
        <button data-id="${d.id}" class="edit-question text-indigo-600 text-sm hover:underline">修改</button>
        <button data-id="${d.id}" class="delete-question text-red-600 text-sm hover:underline">刪除</button>
      </td>
    `;
    els.questionsTbody.appendChild(tr);

    if (subLines) {
      const subTr = document.createElement("tr");
      subTr.className = "border-b";
      subTr.innerHTML = `<td></td><td colspan="4" class="pl-6 pb-2 text-xs text-gray-400">${subLines}</td>`;
      els.questionsTbody.appendChild(subTr);
    }
  });

  els.questionsTbody.querySelectorAll(".move-up, .move-down").forEach((btn) => {
    btn.addEventListener("click", () => moveQuestion(btn.dataset.id, btn.classList.contains("move-up") ? -1 : 1));
  });
  els.questionsTbody.querySelectorAll(".toggle-active").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const isActive = btn.dataset.active === "true";
      await updateDoc(doc(db, "questions", btn.dataset.id), { isActive: !isActive });
    });
  });
  els.questionsTbody.querySelectorAll(".delete-question").forEach((btn) => {
    btn.addEventListener("click", async () => {
      if (confirm("確定要刪除此題目嗎？")) {
        await deleteDoc(doc(db, "questions", btn.dataset.id));
      }
    });
  });
  els.questionsTbody.querySelectorAll(".edit-question").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingQuestionIds.add(btn.dataset.id);
      renderQuestionsTable(lastQuestionsDocs);
    });
  });
  els.questionsTbody.querySelectorAll(".cancel-edit-question").forEach((btn) => {
    btn.addEventListener("click", () => {
      editingQuestionIds.delete(btn.dataset.id);
      renderQuestionsTable(lastQuestionsDocs);
    });
  });
  els.questionsTbody.querySelectorAll('[data-edit-row] .edit-type').forEach((select) => {
    select.addEventListener("change", () => {
      const row = select.closest("[data-edit-row]");
      const type = select.value;
      row.querySelector(".edit-choice-field")?.classList.toggle("hidden", !(type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE"));
      row.querySelector(".edit-rating-field")?.classList.toggle("hidden", type !== "RATING");
      row.querySelector(".edit-slider-field")?.classList.toggle("hidden", type !== "SLIDER");
    });
  });
  els.questionsTbody.querySelectorAll('[data-edit-row] .edit-required-mode').forEach((select) => {
    select.addEventListener("change", () => {
      const row = select.closest("[data-edit-row]");
      row.querySelector(".edit-conditional-field")?.classList.toggle("hidden", select.value !== "CONDITIONAL");
    });
  });
  els.questionsTbody.querySelectorAll(".save-question").forEach((btn) => {
    btn.addEventListener("click", async () => {
      const row = btn.closest("[data-edit-row]");
      const id = btn.dataset.id;
      const text = row.querySelector(".edit-text").value.trim();
      const type = row.querySelector(".edit-type").value;
      const order = Number(row.querySelector(".edit-order").value) || 0;
      if (!text) {
        alert("題目內容不可空白");
        return;
      }

      const requiredMode = row.querySelector(".edit-required-mode").value;
      let condition = null;
      if (requiredMode === "CONDITIONAL") {
        const condQuestionId = row.querySelector(".edit-cond-question").value;
        const condValue = row.querySelector(".edit-cond-value").value.trim();
        if (!condQuestionId) {
          alert("請選擇觸發題目");
          return;
        }
        if (!condValue) {
          alert("請輸入比對值");
          return;
        }
        condition = {
          questionId: condQuestionId,
          operator: row.querySelector(".edit-cond-operator").value,
          value: condValue
        };
      }

      const update = { questionText: text, type, sortOrder: order, requiredMode, condition };
      if (type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE") {
        const options = row.querySelector(".edit-options").value.split("\n").map((s) => s.trim()).filter(Boolean);
        if (options.length < 2) {
          alert("選項至少需要 2 個");
          return;
        }
        update.options = options;
        update.allowOther = !!row.querySelector(".edit-allow-other").checked;
        update.ratingMax = null;
        update.sliderMin = null;
        update.sliderMax = null;
        update.sliderStep = null;
      } else if (type === "RATING") {
        update.ratingMax = Number(row.querySelector(".edit-rating-max").value) || 5;
        update.options = null;
        update.allowOther = null;
        update.sliderMin = null;
        update.sliderMax = null;
        update.sliderStep = null;
      } else if (type === "SLIDER") {
        update.sliderMin = Number(row.querySelector(".edit-slider-min").value) || 0;
        update.sliderMax = Number(row.querySelector(".edit-slider-max").value) || 10;
        update.sliderStep = Number(row.querySelector(".edit-slider-step").value) || 1;
        update.options = null;
        update.allowOther = null;
        update.ratingMax = null;
      } else {
        update.options = null;
        update.allowOther = null;
        update.ratingMax = null;
        update.sliderMin = null;
        update.sliderMax = null;
        update.sliderStep = null;
      }

      // 順序異動一律透過「▲▼ 重新排序」按鈕處理（見 moveQuestion），
      // 這裡直接寫入使用者輸入的值即可，不做自動遞補——
      // 先前在此處也套用遞補邏輯是誤用：會導致每次修改儲存都把後面所有題目
      // 順序集體 +1，越改越亂。
      await updateDoc(doc(db, "questions", id), update);

      editingQuestionIds.delete(id);
      renderQuestionsTable(lastQuestionsDocs);
    });
  });
}

function watchQuestions() {
  const q = query(collection(db, "questions"), orderBy("sortOrder", "asc"));
  onSnapshot(q, (snap) => {
    lastQuestionsDocs = snap.docs;
    renderQuestionsTable(lastQuestionsDocs);
    buildConditionOptions(els.newQuestionCondQuestion, null, els.newQuestionCondQuestion?.value);
  });
}

els.addQuestionBtn?.addEventListener("click", async () => {
  const text = els.newQuestionText.value.trim();
  const type = els.newQuestionType.value;
  const order = Number(els.newQuestionOrder.value) || 0;
  if (!text) return;

  const requiredMode = els.newQuestionRequiredMode.value;
  if (requiredMode === "CONDITIONAL") {
    if (!els.newQuestionCondQuestion.value) {
      alert("請選擇觸發題目");
      return;
    }
    if (!els.newQuestionCondValue.value.trim()) {
      alert("請輸入比對值");
      return;
    }
  }

  const questionDoc = {
    questionText: text,
    type,
    sortOrder: order,
    isActive: true,
    requiredMode,
    condition: requiredMode === "CONDITIONAL" ? {
      questionId: els.newQuestionCondQuestion.value,
      operator: els.newQuestionCondOperator.value,
      value: els.newQuestionCondValue.value.trim()
    } : null,
    createdAt: serverTimestamp()
  };

  if (type === "SINGLE_CHOICE" || type === "MULTIPLE_CHOICE") {
    const options = els.newQuestionOptions.value.split("\n").map((s) => s.trim()).filter(Boolean);
    if (options.length < 2) {
      alert("選項至少需要 2 個");
      return;
    }
    questionDoc.options = options;
    questionDoc.allowOther = !!els.newQuestionAllowOther.checked;
  } else if (type === "RATING") {
    questionDoc.ratingMax = Number(els.newQuestionRatingMax.value) || 5;
  } else if (type === "SLIDER") {
    questionDoc.sliderMin = Number(els.newQuestionSliderMin.value) || 0;
    questionDoc.sliderMax = Number(els.newQuestionSliderMax.value) || 10;
    questionDoc.sliderStep = Number(els.newQuestionSliderStep.value) || 1;
  }

  // 插入指定順序時，將原本該順序（含）之後的題目依序往後遞補，
  // 避免多題共用同一個 sortOrder 導致排序不明確
  const shiftQuery = query(collection(db, "questions"), where("sortOrder", ">=", order));
  const shiftSnap = await getDocs(shiftQuery);
  if (!shiftSnap.empty) {
    const batch = writeBatch(db);
    shiftSnap.forEach((d) => {
      batch.update(d.ref, { sortOrder: d.data().sortOrder + 1 });
    });
    await batch.commit();
  }

  await addDoc(collection(db, "questions"), questionDoc);
  els.newQuestionText.value = "";
  els.newQuestionOrder.value = "";
  els.newQuestionOptions.value = "";
  els.newQuestionAllowOther.checked = false;
  els.newQuestionRequiredMode.value = "ALWAYS";
  els.newQuestionCondValue.value = "";
  hide(els.newConditionalField);
});

// ---------- 3. 回饋審核與發券 ----------
const REVIEW_LABEL = { PENDING: "待審核", APPROVED: "已核准", REJECTED: "已退回" };

function watchSubmissions() {
  const q = query(collection(db, "submissions"), orderBy("createdAt", "desc"));
  onSnapshot(q, (snap) => {
    els.submissionsContainer.innerHTML = "";
    snap.forEach((d) => {
      const s = d.data();
      const card = document.createElement("div");
      card.className = "border rounded-lg p-4 mb-4 bg-white";
      const answersHtml = (s.answers || [])
        .map((a, i) => `<p class="mb-2"><span class="font-medium">${i + 1}. ${a.questionText}</span><br><span class="text-gray-700 whitespace-pre-wrap">${a.answerText}</span></p>`)
        .join("");
      card.innerHTML = `
        <div class="flex justify-between items-start mb-3">
          <div>
            <p class="font-semibold">${s.userName} <span class="text-gray-500 font-normal">(${s.email})</span></p>
            <span class="status-badge status-${s.reviewStatus}">${REVIEW_LABEL[s.reviewStatus] || s.reviewStatus}</span>
          </div>
          <div class="space-x-2">
            ${s.reviewStatus === "PENDING" ? `
              <button data-id="${d.id}" class="approve-btn bg-green-600 text-white px-3 py-1.5 rounded text-sm hover:bg-green-700">核准並發送禮券</button>
              <button data-id="${d.id}" class="reject-btn bg-gray-200 text-gray-700 px-3 py-1.5 rounded text-sm hover:bg-gray-300">退回</button>
            ` : ""}
          </div>
        </div>
        <div class="text-sm">${answersHtml}</div>
        <p class="text-xs text-gray-400 mt-2" data-msg-for="${d.id}"></p>
      `;
      els.submissionsContainer.appendChild(card);
    });

    els.submissionsContainer.querySelectorAll(".approve-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        const uid = btn.dataset.id;
        const msgEl = els.submissionsContainer.querySelector(`[data-msg-for="${uid}"]`);
        btn.disabled = true;
        msgEl.textContent = "處理中...";
        try {
          await callApi("/api/approveAndAssignReward", { body: { targetUid: uid } });
          msgEl.textContent = "已核准並指派禮券";
          msgEl.className = "text-xs text-green-600 mt-2";
        } catch (err) {
          console.error(err);
          msgEl.textContent = err.message || "操作失敗";
          msgEl.className = "text-xs text-red-600 mt-2";
          btn.disabled = false;
        }
      });
    });
    els.submissionsContainer.querySelectorAll(".reject-btn").forEach((btn) => {
      btn.addEventListener("click", async () => {
        if (!confirm("確定要退回此份回饋嗎？")) return;
        await updateDoc(doc(db, "submissions", btn.dataset.id), {
          reviewStatus: "REJECTED",
          reviewedAt: serverTimestamp()
        });
      });
    });
  });
}

// ---------- 4. 獎勵序號池管理（rewards 集合前端全閉鎖，需經後端 API） ----------
const REWARD_STATUS_LABEL = { AVAILABLE: "可用", ASSIGNED: "已指派", REDEEMED: "已兌換" };

function formatDateTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleString("zh-TW");
}

async function refreshRewardStock() {
  els.rewardStockSummary.textContent = "讀取中...";
  try {
    const { available, assigned, redeemed } = await callApi("/api/getRewardStock", { method: "GET" });
    els.rewardStockSummary.innerHTML = `
      <span class="mr-4">可用：<b class="text-green-600">${available}</b></span>
      <span class="mr-4">已指派：<b class="text-blue-600">${assigned}</b></span>
      <span>已兌換：<b class="text-gray-600">${redeemed}</b></span>
    `;
  } catch (err) {
    console.error(err);
    els.rewardStockSummary.textContent = "讀取庫存失敗";
  }
}

async function refreshRewardList() {
  if (!els.rewardsTbody) return;
  try {
    const { rewards } = await callApi("/api/getRewardList", { method: "GET" });
    els.rewardsTbody.innerHTML = "";
    rewards.forEach((r) => {
      const who = r.assignedToName ? `${r.assignedToName}（${r.assignedToEmail}）` : "—";
      const tr = document.createElement("tr");
      tr.className = "border-b";
      tr.innerHTML = `
        <td class="p-2 font-mono">${r.serialNumber}</td>
        <td class="p-2"><span class="status-badge status-${r.status === "AVAILABLE" ? "APPLIED" : r.status === "ASSIGNED" ? "INVITED" : "APPROVED"}">${REWARD_STATUS_LABEL[r.status] || r.status}</span></td>
        <td class="p-2">${who}</td>
        <td class="p-2 text-gray-500">${formatDateTime(r.assignedAt)}</td>
        <td class="p-2 text-gray-500">${formatDateTime(r.redeemedAt)}</td>
      `;
      els.rewardsTbody.appendChild(tr);
    });
  } catch (err) {
    console.error(err);
    els.rewardsTbody.innerHTML = `<tr><td class="p-2 text-red-600" colspan="5">讀取序號清單失敗</td></tr>`;
  }
}

async function refreshRewards() {
  await Promise.all([refreshRewardStock(), refreshRewardList()]);
}

els.refreshStockBtn?.addEventListener("click", refreshRewards);

els.addSerialsBtn?.addEventListener("click", async () => {
  const raw = els.newSerialsText.value;
  const serials = raw.split("\n").map((s) => s.trim()).filter(Boolean);
  if (serials.length === 0) return;

  els.addSerialsBtn.disabled = true;
  els.rewardsMessage.textContent = "新增中...";
  try {
    const result = await callApi("/api/addRewardSerials", { body: { serials } });
    els.rewardsMessage.textContent = `已新增 ${result.count} 組序號`;
    els.rewardsMessage.className = "text-sm text-green-600 mt-2";
    els.newSerialsText.value = "";
    refreshRewards();
  } catch (err) {
    console.error(err);
    els.rewardsMessage.textContent = err.message || "新增失敗";
    els.rewardsMessage.className = "text-sm text-red-600 mt-2";
  } finally {
    els.addSerialsBtn.disabled = false;
  }
});

// ---------- 5. 系統設定 ----------
async function loadSettings() {
  const snap = await getDoc(doc(db, "settings", "config"));
  if (snap.exists()) {
    const data = snap.data();
    els.appNameInput.value = data.appName || "";
    els.manualUrlInput.value = data.manualUrl || "";
    els.featureIntroInput.value = data.featureIntro || "";
    els.targetSampleSizeInput.value = data.targetSampleSize ?? 14;
  }
}

els.settingsForm?.addEventListener("submit", async (e) => {
  e.preventDefault();
  els.settingsMessage.textContent = "儲存中...";
  try {
    await setDoc(doc(db, "settings", "config"), {
      appName: els.appNameInput.value.trim(),
      manualUrl: els.manualUrlInput.value.trim(),
      featureIntro: els.featureIntroInput.value.trim(),
      targetSampleSize: Number(els.targetSampleSizeInput.value) || 14
    }, { merge: true });
    els.settingsMessage.textContent = "設定已儲存";
    els.settingsMessage.className = "text-sm text-green-600 mt-2";
  } catch (err) {
    console.error(err);
    els.settingsMessage.textContent = "儲存失敗";
    els.settingsMessage.className = "text-sm text-red-600 mt-2";
  }
});

// ---------- Init ----------
els.loginBtn?.addEventListener("click", () => signIn().catch((err) => console.error(err)));
els.logoutBtn?.addEventListener("click", () => signOutUser());

async function init(user) {
  hide(els.loading);

  if (!user) {
    hide(els.console);
    hide(els.deniedSection);
    show(els.loginSection);
    return;
  }

  const admin = await isAdmin(user);
  if (!admin) {
    hide(els.loginSection);
    hide(els.console);
    show(els.deniedSection);
    return;
  }

  hide(els.loginSection);
  hide(els.deniedSection);
  show(els.console);
  els.userName.textContent = user.displayName || user.email;

  watchApplicants();
  watchQuestions();
  watchSubmissions();
  loadSettings();
  refreshRewards();
}

onAuthReady(init);
