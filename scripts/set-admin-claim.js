// scripts/set-admin-claim.js
// 一次性設定管理員自訂聲明 (custom claim: admin=true) 的本機工具腳本
// 此腳本刻意不以 Cloud Function 形式公開，避免任何具備呼叫權限者可自行授予管理員身分
//
// 使用方式：
//   1. 於 Firebase Console > 專案設定 > 服務帳戶 下載服務帳戶金鑰 JSON
//   2. GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json node scripts/set-admin-claim.js <使用者Email>

const { initializeApp, cert } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");

const email = process.argv[2];
if (!email) {
  console.error("用法：node scripts/set-admin-claim.js <使用者Email>");
  process.exit(1);
}

initializeApp({
  credential: cert(require(process.env.GOOGLE_APPLICATION_CREDENTIALS))
});

(async () => {
  const auth = getAuth();
  const user = await auth.getUserByEmail(email);
  await auth.setCustomUserClaims(user.uid, { admin: true });
  console.log(`已將 admin=true 自訂聲明授予 ${email} (uid: ${user.uid})`);
  console.log("提醒：使用者需重新登入（或呼叫 getIdToken(true)）才會取得更新後的 token。");
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
