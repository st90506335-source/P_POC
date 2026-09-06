// firebase.js — Firebase Admin SDK 初始化
// 憑證來源優先順序：
//   1. GOOGLE_APPLICATION_CREDENTIALS_JSON（服務帳戶金鑰 JSON 字串，適合放在託管平台的環境變數）
//   2. GOOGLE_APPLICATION_CREDENTIALS（服務帳戶金鑰檔案路徑，適合本機開發）

const { initializeApp, cert, applicationDefault } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");

const credential = process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON
  ? cert(JSON.parse(process.env.GOOGLE_APPLICATION_CREDENTIALS_JSON))
  : applicationDefault();

const app = initializeApp({ credential });

// 指定連接 ppoc 資料庫（非 default）
const db = getFirestore(app, "ppoc");
const auth = getAuth(app);

module.exports = { db, auth, FieldValue };
