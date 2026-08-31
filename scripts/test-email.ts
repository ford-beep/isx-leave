import { loadEnvConfig } from "@next/env";
import nodemailer from "nodemailer";

loadEnvConfig(process.cwd());

async function main() {
  const host = process.env.SMTP_HOST;
  const port = Number(process.env.SMTP_PORT ?? 587);
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    throw new Error("SMTP configuration is incomplete.");
  }

  const transporter = nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: {
      user,
      pass,
    },
  });

  console.log("Checking SMTP connection...");
  await transporter.verify();

  console.log("SMTP connection OK.");

  const result = await transporter.sendMail({
    from: `ISX Leave <${user}>`,
    to: user,
    subject: "ISX Leave — Gmail SMTP Test",
    html: `
      <h2>ISX Leave</h2>
      <p>Gmail SMTP is working correctly.</p>
      <p>This is a test email.</p>
    `,
  });

  console.log("Test email sent:", result.messageId);
}

main().catch((error) => {
  console.error("SMTP test failed:", error);
  process.exit(1);
});