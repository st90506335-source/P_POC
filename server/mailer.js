// mailer.js — Email 通知，未設定寄信相關環境變數時僅記錄警告、不中斷主流程
// 優先使用 SendGrid HTTPS API（SENDGRID_API_KEY，走 443 port）；
// 因部分託管平台（例如 Railway）會封鎖對外 SMTP（25/465/587），
// 只有 HTTPS 出站連線暢通，故 SMTP（Nodemailer）僅作為本機開發或其他平台的備援。

const nodemailer = require("nodemailer");

async function sendViaSendGridApi({ to, subject, html, text }) {
  const res = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${process.env.SENDGRID_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: to }] }],
      from: { email: process.env.MAIL_FROM },
      subject,
      content: [
        { type: "text/plain", value: text },
        { type: "text/html", value: html }
      ]
    })
  });
  if (!res.ok) {
    throw new Error(`SendGrid API 寄信失敗 (${res.status}): ${await res.text()}`);
  }
}

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
  const text = htmlToText(html);
  try {
    if (process.env.SENDGRID_API_KEY) {
      await sendViaSendGridApi({ to, subject, html, text });
      return;
    }
    const transport = getTransport();
    if (!transport) {
      console.warn("[mail] 未設定 SENDGRID_API_KEY 或 SMTP 環境變數，略過寄信：", subject, "->", to);
      return;
    }
    await transport.sendMail({
      from: process.env.MAIL_FROM || process.env.MAIL_USER,
      to,
      subject,
      html,
      text
    });
  } catch (err) {
    console.error("[mail] 寄送失敗", err);
  }
}

module.exports = { sendMail };
