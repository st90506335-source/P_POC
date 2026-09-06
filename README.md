# P_POC 開放式測試招募平台

依據《P_POC_開放式測試招募平台_開發規格書_FirebaseNative.docx》實作的完整前後端專案。
前端為純靜態頁面（可直接部署至 GitHub Pages），後端使用 Firebase Authentication、
Firestore（Named Database：`ppoc`，區域 `asia-east1`）與 Cloud Functions。

## 目錄結構

```
P_POC/
├── index.html            # Page 0：開放意願調查與 Google 登入
├── test.html              # Page 1~3：手冊下載、動態問卷回饋填寫
├── redeem.html            # Page 4：受測獎勵超商序號兌換頁
├── admin.html              # 後台管理控制台（限 Admin 帳號）
├── assets/
│   ├── app-manual.pdf      # 受測 App 操作手冊（目前為佔位檔，請替換為正式文件）
│   ├── css/style.css
│   └── js/
│       ├── firebase-config.js
│       ├── auth-guard.js
│       ├── page0.js
│       ├── test-flow.js
│       ├── redeem.js
│       └── admin.js
├── functions/
│   ├── index.js            # sendInvites / approveAndAssignReward / getRewardSerial / addRewardSerials / getRewardStock
│   └── package.json
├── scripts/set-admin-claim.js  # 本機一次性工具：授予管理員 custom claim
├── firestore.rules
├── firestore.indexes.json
├── firebase.json
└── .firebaserc
```

## 部署前置作業

1. **建立 Firebase 專案**，於 Firestore 中建立 Named Database，ID 為 `ppoc`，
   區域選擇 `asia-east1`，模式 `Firestore Native`。
2. 於 Firebase Console 啟用 **Authentication > Google** 登入方式。
3. 複製專案設定值填入 [`assets/js/firebase-config.js`](assets/js/firebase-config.js) 的
   `firebaseConfig` 物件（apiKey / authDomain / projectId 等）。
4. 修改 [`.firebaserc`](.firebaserc)，將 `ppoc-xxxx` 換成實際專案 ID。

## 授予管理員權限

`admin.html` 透過 Firebase Auth **custom claim** `admin: true` 判斷存取權限（對應
`firestore.rules` 中的 `request.auth.token.admin == true`）。此聲明刻意不透過任何
可呼叫的 Cloud Function 設定，避免權限被任意授予，僅能以服務帳戶金鑰於本機執行：

```bash
GOOGLE_APPLICATION_CREDENTIALS=/path/to/serviceAccountKey.json \
  node scripts/set-admin-claim.js admin@example.com
```

設定後，該使用者需要重新登入（或前端呼叫 `user.getIdToken(true)` 強制刷新）
才會取得包含 `admin` 聲明的新 token。

## 安裝與部署 Cloud Functions

```bash
cd functions
npm install
cd ..
firebase deploy --only firestore:rules,firestore:indexes,functions
```

> 部署至 Named Database 的規則時，若 CLI 版本較舊需改用
> `firebase deploy --only firestore:rules -P <project> --database=ppoc`，
> 詳見 Firebase CLI 文件中對多資料庫實例的支援說明。

### 郵件通知（Nodemailer）設定

`sendInvites`（邀請通知）與 `approveAndAssignReward`（發券通知）會嘗試寄信，
若未設定以下環境變數則僅記錄警告、不影響主流程：

```bash
firebase functions:secrets:set MAIL_HOST
firebase functions:secrets:set MAIL_USER
firebase functions:secrets:set MAIL_PASS
```

並在 `functions/index.js` 對應的 `onCall` 設定中加入 `secrets: [...]`，
或於本機開發時使用 `.env` 設定 `MAIL_HOST` / `MAIL_PORT` / `MAIL_USER` / `MAIL_PASS` / `MAIL_FROM`。

## 部署前端（GitHub Pages）

將整個 `P_POC/` 目錄推送至 GitHub Repository，於 Settings > Pages 選擇部署分支即可；
無需額外建置流程（純靜態檔案 + ES Module）。

## 初始資料設定

首次上線前，請透過 `admin.html`：

1. 於「系統設定」填入 `appName` / `manualUrl` / `featureIntro` / `targetSampleSize`。
2. 於「題庫管理」新增問卷題目。
3. 於「獎勵序號池」批次貼上超商禮券序號（每行一組），供後續派發使用。

## 與規格書的對應說明

- `functions/index.js` 中的 `getRewardSerial` / `addRewardSerials` / `getRewardStock`
  為規格書流程圖所隱含、但程式碼範例未列出的必要函式：因為 `rewards` 集合規則為
  `allow read, write: if false`（全閉鎖），前端（含具備 Admin 權限的登入者）皆無法
  直接讀寫，僅能透過 Cloud Functions 內的 Admin SDK 存取，因此新增這三支函式以完整
  支撐「Page 4 序號兌換」與「後台獎勵序號池管理」兩項規格書已定義的功能。
