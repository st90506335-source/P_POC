// middleware.js — 身份驗證與 Admin 權限檢查
// 前端需在每次呼叫時於 Authorization header 帶上 Firebase ID Token: "Bearer <idToken>"

const { auth } = require("./firebase");

async function requireAuth(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) {
    return res.status(401).json({ error: "請先登入" });
  }
  try {
    req.user = await auth.verifyIdToken(token);
    next();
  } catch (err) {
    res.status(401).json({ error: "登入憑證無效或已過期，請重新登入" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.admin !== true) {
    return res.status(403).json({ error: "無管理員權限" });
  }
  next();
}

module.exports = { requireAuth, requireAdmin };
