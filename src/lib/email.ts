import "server-only";
import nodemailer from "nodemailer";

const emailEnabled =
  process.env.EMAIL_NOTIFICATIONS_ENABLED === "true";

const smtpHost = process.env.SMTP_HOST;
const smtpPort = Number(process.env.SMTP_PORT ?? 587);
const smtpUser = process.env.SMTP_USER;
const smtpPass = process.env.SMTP_PASS;

const emailTestRecipient =
  process.env.EMAIL_TEST_RECIPIENT?.trim();

const transporter = nodemailer.createTransport({
  host: smtpHost,
  port: smtpPort,
  secure: smtpPort === 465,
  auth: {
    user: smtpUser,
    pass: smtpPass,
  },
});

export async function sendEmail({
  to,
  subject,
  html,
}: {
  to: string | string[];
  subject: string;
  html: string;
}) {
  if (!emailEnabled) {
    console.log(
      "[email] Email notifications are disabled.",
    );
    return;
  }

  if (!smtpHost || !smtpUser || !smtpPass) {
    throw new Error(
      "SMTP email configuration is incomplete.",
    );
  }

  const isProduction =
    process.env.NODE_ENV === "production";

  /*
   * Safety rule:
   *
   * Production:
   *   Send to the real recipient.
   *
   * Development / localhost:
   *   Never send to the real recipient.
   *   Redirect only when EMAIL_TEST_RECIPIENT
   *   has been explicitly configured.
   */
  if (!isProduction) {
    if (!emailTestRecipient) {
      console.log(
        "[email] Development mode: email skipped because EMAIL_TEST_RECIPIENT is not configured.",
      );

      console.log(
        `[email] Original recipient was: ${
          Array.isArray(to)
            ? to.join(", ")
            : to
        }`,
      );

      return;
    }

    console.log(
      `[email] Development mode: redirecting email to ${emailTestRecipient}`,
    );

    return transporter.sendMail({
      from: `ISX Leave <${smtpUser}>`,
      to: emailTestRecipient,
      subject: `[TEST] ${subject}`,
      html,
    });
  }

  return transporter.sendMail({
    from: `ISX Leave <${smtpUser}>`,
    to: Array.isArray(to)
      ? to.join(", ")
      : to,
    subject,
    html,
  });
}