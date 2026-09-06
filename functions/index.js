// functions/index.js
// P_POC 開放式測試招募平台 - Cloud Functions
// 部署區域：asia-east1 / 資料庫：ppoc (Firestore Native, Named Database)
// 對應規格書 5. 後端安全性與核心邏輯實作

const { initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { onCall, HttpsError } = require("firebase-functions/v2/https");
const nodemailer = require("nodemailer");

initializeApp();

// 指定連接 ppoc 資料庫（非 default）
const db = getFirestore("ppoc");

const REGION = "asia-east1";

// ---------------------------------------------------------------------------
// 郵件通知（Nodemailer，設定值透過環境變數注入，未設定時僅記錄警告不中斷主流程）
// 部署前請設定：firebase functions:secrets:set MAIL_USER / MAIL_PASS
// 或於 .env 中提供 MAIL_HOST / MAIL_PORT / MAIL_USER / MAIL_PASS / MAIL_FROM
// ---------------------------------------------------------------------------
function getMailTransport() {
  const { MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS } = process.env;
  if (!MAIL_HOST || !MAIL_USER || !MAIL_PASS) return null;
  return nodemailer.createTransport({
    host: MAIL_HOST,
    port: Number(MAIL_PORT) || 587,
    secure: Number(MAIL_PORT) === 465,
    auth: { user: MAIL_USER, pass: MAIL_PASS }
  });
}

async function sendMail({ to, subject, text }) {
  try {
    const transport = getMailTransport();
    if (!transport) {
      console.warn("[mail] 未設定 SMTP 環境變數，略過寄信：", subject, "->", to);
      return;
    }
    await transport.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to,
      subject,
      text
    });
  } catch (err) {
    console.error("[mail] 寄送失敗", err);
  }
}

function assertAdmin(request) {
  if (!request.auth || request.auth.token.admin !== true) {
    throw new HttpsError("permission-denied", "無管理員權限");
  }
}

// ---------------------------------------------------------------------------
// 5.1 庫存防護與邀請發送 (checkStockAndInvite)
// ---------------------------------------------------------------------------
exports.sendInvites = onCall({ region: REGION }, async (request) => {
  assertAdmin(request);

  const { targetUids } = request.data;
  if (!Array.isArray(targetUids) || targetUids.length === 0) {
    throw new HttpsError("invalid-argument", "請提供欲邀請的受測者名單");
  }

  // 1. 庫存檢查
  const availableSnap = await db.collection("rewards")
    .where("status", "==", "AVAILABLE").count().get();
  const stockCount = availableSnap.data().count;

  if (stockCount < targetUids.length) {
    throw new HttpsError(
      "failed-precondition",
      `序號庫存不足！可用序號僅剩 ${stockCount} 組，無法支應 ${targetUids.length} 位受測者。`
    );
  }

  // 2. 批次更新狀態並寄發信件
  const batch = db.batch();
  const applicantDocs = [];
  for (const uid of targetUids) {
    const ref = db.collection("applicants").doc(uid);
    batch.update(ref, {
      status: "INVITED",
      invitedAt: FieldValue.serverTimestamp()
    });
    applicantDocs.push(ref);
  }
  await batch.commit();

  const snaps = await Promise.all(applicantDocs.map((ref) => ref.get()));
  await Promise.all(snaps.map((snap) => {
    const data = snap.data();
    if (!data?.email) return Promise.resolve();
    return sendMail({
      to: data.email,
      subject: "P_POC 開放式測試邀請通知",
      text: `${data.userName || ""} 您好，\n\n恭喜您獲選為本次開放式測試核心受測名單，請登入測試頁面完成受測流程。\n\nP_POC 團隊`
    });
  }));

  return { success: true, count: targetUids.length };
});

// ---------------------------------------------------------------------------
// 5.2 交易排他鎖核發獎勵 (approveAndAssignReward)
// ---------------------------------------------------------------------------
exports.approveAndAssignReward = onCall({ region: REGION }, async (request) => {
  assertAdmin(request);

  const { targetUid } = request.data;
  if (!targetUid) {
    throw new HttpsError("invalid-argument", "請提供受測者 uid");
  }

  const result = await db.runTransaction(async (t) => {
    const rewardQuery = db.collection("rewards").where("status", "==", "AVAILABLE").limit(1);
    const rewardSnap = await t.get(rewardQuery);
    if (rewardSnap.empty) {
      throw new HttpsError("resource-exhausted", "可用超商序號已發畢！");
    }

    const submissionRef = db.collection("submissions").doc(targetUid);
    const submissionSnap = await t.get(submissionRef);
    if (!submissionSnap.exists) {
      throw new HttpsError("not-found", "找不到該受測者的測試回饋紀錄");
    }

    const rewardDoc = rewardSnap.docs[0];
    t.update(rewardDoc.ref, {
      status: "ASSIGNED",
      assignedToUid: targetUid,
      assignedAt: FieldValue.serverTimestamp()
    });
    t.update(submissionRef, {
      reviewStatus: "APPROVED",
      assignedRewardDocId: rewardDoc.id,
      reviewedAt: FieldValue.serverTimestamp()
    });

    return { email: submissionSnap.data().email, userName: submissionSnap.data().userName };
  });

  if (result.email) {
    await sendMail({
      to: result.email,
      subject: "P_POC 測試獎勵發放通知",
      text: `${result.userName || ""} 您好，\n\n感謝您完成本次測試回饋，審核已通過！請登入禮券兌換頁面領取您的超商禮券。\n\nP_POC 團隊`
    });
  }

  return { success: true };
});

// ---------------------------------------------------------------------------
// 受測者兌換序號查詢 (rewards 集合前端全閉鎖，僅能由此函式以 Admin SDK 存取)
// ---------------------------------------------------------------------------
exports.getRewardSerial = onCall({ region: REGION }, async (request) => {
  if (!request.auth) {
    throw new HttpsError("unauthenticated", "請先登入");
  }
  const uid = request.auth.uid;

  const submissionSnap = await db.collection("submissions").doc(uid).get();
  if (!submissionSnap.exists || submissionSnap.data().reviewStatus !== "APPROVED") {
    throw new HttpsError("failed-precondition", "尚未審核通過，暫無法兌換禮券");
  }

  const rewardDocId = submissionSnap.data().assignedRewardDocId;
  if (!rewardDocId) {
    throw new HttpsError("not-found", "尚未指派兌換序號，請稍後再試");
  }

  const rewardRef = db.collection("rewards").doc(rewardDocId);
  const rewardSnap = await rewardRef.get();
  if (!rewardSnap.exists) {
    throw new HttpsError("not-found", "找不到對應的序號紀錄");
  }

  const rewardData = rewardSnap.data();
  if (!rewardData.redeemedAt) {
    await rewardRef.update({ redeemedAt: FieldValue.serverTimestamp() });
  }

  return { serialNumber: rewardData.serialNumber };
});

// ---------------------------------------------------------------------------
// 後台：批次新增獎勵序號（rewards 集合，僅 Admin SDK 可寫入）
// ---------------------------------------------------------------------------
exports.addRewardSerials = onCall({ region: REGION }, async (request) => {
  assertAdmin(request);

  const { serials } = request.data;
  if (!Array.isArray(serials) || serials.length === 0) {
    throw new HttpsError("invalid-argument", "請提供欲新增的序號清單");
  }

  const batch = db.batch();
  serials.forEach((serialNumber) => {
    const ref = db.collection("rewards").doc();
    batch.set(ref, {
      serialNumber: String(serialNumber).trim(),
      status: "AVAILABLE",
      assignedToUid: null,
      assignedAt: null,
      redeemedAt: null
    });
  });
  await batch.commit();

  return { success: true, count: serials.length };
});

// ---------------------------------------------------------------------------
// 後台：獎勵序號池庫存統計
// ---------------------------------------------------------------------------
exports.getRewardStock = onCall({ region: REGION }, async (request) => {
  assertAdmin(request);

  const [availableSnap, assignedSnap, redeemedSnap] = await Promise.all([
    db.collection("rewards").where("status", "==", "AVAILABLE").count().get(),
    db.collection("rewards").where("status", "==", "ASSIGNED").count().get(),
    db.collection("rewards").where("status", "==", "REDEEMED").count().get()
  ]);

  return {
    available: availableSnap.data().count,
    assigned: assignedSnap.data().count,
    redeemed: redeemedSnap.data().count
  };
});
