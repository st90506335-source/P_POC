// index.js — P_POC 平台無關後端 API
// 取代原本的 Firebase Cloud Functions，邏輯完全相同，僅改用一般 Express 路由呈現，
// 可部署於任何能執行 Node.js 的環境（VPS、Render、Railway、Fly.io、Docker...等）。

const express = require("express");
const cors = require("cors");
const { db, FieldValue } = require("./firebase");
const { requireAuth, requireAdmin } = require("./middleware");
const { sendMail } = require("./mailer");

const app = express();

const FRONTEND_URL = (process.env.FRONTEND_URL || "").replace(/\/+$/, "");

const allowedOrigins = (process.env.ALLOWED_ORIGINS || "")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({ origin: allowedOrigins.length ? allowedOrigins : true }));
app.use(express.json());

app.get("/health", (req, res) => res.json({ ok: true }));

// ---------------------------------------------------------------------------
// 庫存防護與邀請發送
// ---------------------------------------------------------------------------
app.post("/api/sendInvites", requireAuth, requireAdmin, async (req, res) => {
  const { targetUids } = req.body || {};
  if (!Array.isArray(targetUids) || targetUids.length === 0) {
    return res.status(400).json({ error: "請提供欲邀請的受測者名單" });
  }

  const availableSnap = await db.collection("rewards")
    .where("status", "==", "AVAILABLE").count().get();
  const stockCount = availableSnap.data().count;

  if (stockCount < targetUids.length) {
    return res.status(409).json({
      error: `序號庫存不足！可用序號僅剩 ${stockCount} 組，無法支應 ${targetUids.length} 位受測者。`
    });
  }

  const batch = db.batch();
  const applicantRefs = targetUids.map((uid) => db.collection("applicants").doc(uid));
  applicantRefs.forEach((ref) => {
    batch.update(ref, { status: "INVITED", invitedAt: FieldValue.serverTimestamp() });
  });
  await batch.commit();

  const snaps = await Promise.all(applicantRefs.map((ref) => ref.get()));
  await Promise.all(snaps.map((snap) => {
    const data = snap.data();
    if (!data?.email) return Promise.resolve();
    return sendMail({
      to: data.email,
      subject: "P_POC 開放式測試邀請通知",
      text: `${data.userName || ""} 您好，\n\n恭喜您獲選為本次開放式測試核心受測名單，請點選以下連結登入完成受測流程：\n${FRONTEND_URL}/test.html\n\nP_POC 團隊`
    });
  }));

  res.json({ success: true, count: targetUids.length });
});

// ---------------------------------------------------------------------------
// 交易排他鎖核發獎勵
// ---------------------------------------------------------------------------
app.post("/api/approveAndAssignReward", requireAuth, requireAdmin, async (req, res) => {
  const { targetUid } = req.body || {};
  if (!targetUid) {
    return res.status(400).json({ error: "請提供受測者 uid" });
  }

  try {
    const result = await db.runTransaction(async (t) => {
      const rewardQuery = db.collection("rewards").where("status", "==", "AVAILABLE").limit(1);
      const rewardSnap = await t.get(rewardQuery);
      if (rewardSnap.empty) {
        throw Object.assign(new Error("可用超商序號已發畢！"), { statusCode: 409 });
      }

      const submissionRef = db.collection("submissions").doc(targetUid);
      const submissionSnap = await t.get(submissionRef);
      if (!submissionSnap.exists) {
        throw Object.assign(new Error("找不到該受測者的測試回饋紀錄"), { statusCode: 404 });
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
        text: `${result.userName || ""} 您好，\n\n感謝您完成本次測試回饋，審核已通過！請點選以下連結登入領取您的超商禮券：\n${FRONTEND_URL}/redeem.html\n\nP_POC 團隊`
      });
    }

    res.json({ success: true });
  } catch (err) {
    res.status(err.statusCode || 500).json({ error: err.message || "操作失敗" });
  }
});

// ---------------------------------------------------------------------------
// 受測者兌換序號查詢（rewards 集合前端全閉鎖，僅能由此 API 以 Admin SDK 存取）
// ---------------------------------------------------------------------------
app.post("/api/getRewardSerial", requireAuth, async (req, res) => {
  const uid = req.user.uid;

  const submissionSnap = await db.collection("submissions").doc(uid).get();
  if (!submissionSnap.exists || submissionSnap.data().reviewStatus !== "APPROVED") {
    return res.status(409).json({ error: "尚未審核通過，暫無法兌換禮券" });
  }

  const rewardDocId = submissionSnap.data().assignedRewardDocId;
  if (!rewardDocId) {
    return res.status(404).json({ error: "尚未指派兌換序號，請稍後再試" });
  }

  const rewardRef = db.collection("rewards").doc(rewardDocId);
  const rewardSnap = await rewardRef.get();
  if (!rewardSnap.exists) {
    return res.status(404).json({ error: "找不到對應的序號紀錄" });
  }

  const rewardData = rewardSnap.data();
  if (!rewardData.redeemedAt) {
    await rewardRef.update({ redeemedAt: FieldValue.serverTimestamp(), status: "REDEEMED" });
  }

  res.json({ serialNumber: rewardData.serialNumber });
});

// ---------------------------------------------------------------------------
// 後台：批次新增獎勵序號
// ---------------------------------------------------------------------------
app.post("/api/addRewardSerials", requireAuth, requireAdmin, async (req, res) => {
  const { serials } = req.body || {};
  if (!Array.isArray(serials) || serials.length === 0) {
    return res.status(400).json({ error: "請提供欲新增的序號清單" });
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

  res.json({ success: true, count: serials.length });
});

// ---------------------------------------------------------------------------
// 後台：獎勵序號池庫存統計
// ---------------------------------------------------------------------------
app.get("/api/getRewardStock", requireAuth, requireAdmin, async (req, res) => {
  const [availableSnap, assignedSnap, redeemedSnap] = await Promise.all([
    db.collection("rewards").where("status", "==", "AVAILABLE").count().get(),
    db.collection("rewards").where("status", "==", "ASSIGNED").count().get(),
    db.collection("rewards").where("status", "==", "REDEEMED").count().get()
  ]);

  res.json({
    available: availableSnap.data().count,
    assigned: assignedSnap.data().count,
    redeemed: redeemedSnap.data().count
  });
});

// ---------------------------------------------------------------------------
// 後台：獎勵序號池明細清單（含指派對象姓名/信箱，方便對照是誰領了哪組序號）
// ---------------------------------------------------------------------------
app.get("/api/getRewardList", requireAuth, requireAdmin, async (req, res) => {
  const snap = await db.collection("rewards").orderBy("status").get();

  const uids = [...new Set(snap.docs.map((d) => d.data().assignedToUid).filter(Boolean))];
  const applicantDocs = await Promise.all(uids.map((uid) => db.collection("applicants").doc(uid).get()));
  const applicantByUid = {};
  applicantDocs.forEach((doc) => {
    if (doc.exists) applicantByUid[doc.id] = doc.data();
  });

  const rewards = snap.docs.map((d) => {
    const data = d.data();
    const applicant = data.assignedToUid ? applicantByUid[data.assignedToUid] : null;
    return {
      id: d.id,
      serialNumber: data.serialNumber,
      status: data.status,
      assignedToUid: data.assignedToUid || null,
      assignedToName: applicant?.userName || null,
      assignedToEmail: applicant?.email || null,
      assignedAt: data.assignedAt ? data.assignedAt.toDate().toISOString() : null,
      redeemedAt: data.redeemedAt ? data.redeemedAt.toDate().toISOString() : null
    };
  });

  res.json({ rewards });
});

const port = process.env.PORT || 8080;
app.listen(port, () => console.log(`P_POC API server listening on port ${port}`));
