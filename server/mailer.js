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

async function sendMail({ to, subject, text }) {
  try {
    const transport = getTransport();
    if (!transport) {
      console.warn("[mail] 未設定 SMTP 環境變數，略過寄信：", subject, "->", to);
      return;
    }
    await transport.sendMail({ from: process.env.MAIL_FROM || process.env.MAIL_USER, to, subject, text });
  } catch (err) {
    console.error("[mail] 寄送失敗", err);
  }
}

module.exports = { sendMail };
