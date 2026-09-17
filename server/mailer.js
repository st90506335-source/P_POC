// mailer.js — Email 通知（Nodemailer），未設定 SMTP 環境變數時僅記錄警告、不中斷主流程

const nodemailer = require("nodemailer");

function getTransport() {
  const { MAIL_HOST, MAIL_PORT, MAIL_USER, MAIL_PASS } = process.env;
  if (!MAIL_HOST || !MAIL_USER || !MAIL_PASS) return null;
  return nodemailer.createTransport({
    host: MAIL_HOST,
    port: Number(MAIL_PORT) || 587,
    secure: Number(MAIL_PORT) === 465,
    auth: { user: MAIL_USER, pass: MAIL_PASS }
  });
}

// 簡易 HTML 轉純文字，作為不支援 HTML 的信箱用戶端的備用內容
function htmlToText(html) {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|li|tr)>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

// 通知信內容支援 HTML 語法（後台可編輯，見 server/index.js 的 getEmailTemplate）
async function sendMail({ to, subject, html }) {
  try {
    const transport = getTransport();
    if (!transport) {
      console.warn("[mail] 未設定 SMTP 環境變數，略過寄信：", subject, "->", to);
      return;
    }
    await transport.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to,
      subject,
      html,
      text: htmlToText(html)
    });
  } catch (err) {
    console.error("[mail] 寄送失敗", err);
  }
}

module.exports = { sendMail };
