// redeem.js — redeem.html（Page 4：獎勵超商序號兌換頁）
// 對應規格書 3.2 節：向後端安全呼叫請求序號（rewards 集合前端全閉鎖，僅能透過後端 API 取得）

import { db } from "./firebase-config.js";
import { API_BASE_URL } from "./api-config.js";
import { onAuthReady, signIn } from "./auth-guard.js";
import { doc, getDoc } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const $ = (id) => document.getElementById(id);

const els = {
  loading: $("loading"),
  loginSection: $("loginSection"),
  loginBtn: $("loginBtn"),
  blockedSection: $("blockedSection"),
  blockedMessage: $("blockedMessage"),
  rewardSection: $("rewardSection"),
  serialText: $("serialText"),
  barcodeSvg: $("barcodeSvg"),
  qrContainer: $("qrContainer"),
  rewardError: $("rewardError")
};

function show(el) { el && el.classList.remove("hidden"); }
function hide(el) { el && el.classList.add("hidden"); }

function blockWith(message) {
  hide(els.loading);
  hide(els.loginSection);
  hide(els.rewardSection);
  show(els.blockedSection);
  els.blockedMessage.textContent = message;
}

async function init(user) {
  hide(els.loading);

  if (!user) {
    show(els.loginSection);
    return;
  }

  const submissionSnap = await getDoc(doc(db, "submissions", user.uid));
  if (!submissionSnap.exists() || submissionSnap.data().reviewStatus !== "APPROVED") {
    blockWith("尚未通過審核，暫無法兌換禮券。請待後台審核完成後再回到此頁面。");
    return;
  }

  try {
    const idToken = await user.getIdToken();
    const res = await fetch(`${API_BASE_URL}/api/getRewardSerial`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
      body: JSON.stringify({})
    });
    const result = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(result.error || `請求失敗 (${res.status})`);
    const { serialNumber } = result;

    show(els.rewardSection);
    els.serialText.textContent = serialNumber;

    if (window.JsBarcode) {
      window.JsBarcode(els.barcodeSvg, serialNumber, {
        format: "CODE128",
        lineColor: "#111827",
        width: 2,
        height: 80,
        displayValue: false
      });
    }

    if (window.QRCode && els.qrContainer) {
      els.qrContainer.innerHTML = "";
      new window.QRCode(els.qrContainer, { text: serialNumber, width: 160, height: 160 });
    }
  } catch (err) {
    console.error(err);
    blockWith(err.message || "序號取得失敗，請稍後再試或聯繫後台人員。");
  }
}

els.loginBtn?.addEventListener("click", () => signIn().catch((err) => console.error(err)));

onAuthReady(init);
