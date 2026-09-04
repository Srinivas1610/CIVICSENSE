import nodemailer, { Transporter } from "nodemailer";

interface EmailPayload {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

interface EmailResult {
  success: boolean;
  messageId?: string;
  simulated?: boolean;
  error?: string;
}

class EmailService {
  private transporter: Transporter | null = null;
  private isConfigured: boolean = false;

  constructor() {
    this.initialize();
  }

  private initialize(): void {
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS } = process.env;

    if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
      this.transporter = nodemailer.createTransport({
        host: SMTP_HOST,
        port: parseInt(SMTP_PORT || "587", 10),
        secure: parseInt(SMTP_PORT || "587", 10) === 465,
        auth: {
          user: SMTP_USER,
          pass: SMTP_PASS,
        },
      });
      this.isConfigured = true;
      console.log("[EmailService] SMTP transporter initialized");
    } else {
      console.log(
        "[EmailService] SMTP credentials not set — email will be simulated (console log mode)"
      );
      this.isConfigured = false;
    }
  }

  /**
   * Send an email. Falls back to console logging if SMTP is not configured.
   */
  async sendEmail(payload: EmailPayload): Promise<EmailResult> {
    const { to, subject, html, text } = payload;

    if (!this.isConfigured || !this.transporter) {
      // Graceful mock: log to console
      console.log("========== [EMAIL SIMULATION] ==========");
      console.log(`To      : ${to}`);
      console.log(`Subject : ${subject}`);
      console.log(`Body    : ${text || html}`);
      console.log("=========================================");
      return { success: true, simulated: true, messageId: `simulated-${Date.now()}` };
    }

    try {
      const info = await this.transporter.sendMail({
        from: `"CivicConnect" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html,
        text: text || html.replace(/<[^>]*>/g, ""),
      });

      console.log(`[EmailService] Email sent to ${to} — MessageId: ${info.messageId}`);
      return { success: true, messageId: info.messageId };
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Unknown email error";
      console.error(`[EmailService] Failed to send email to ${to}: ${message}`);
      return { success: false, error: message };
    }
  }

  /**
   * Build and send a status update email.
   */
  async sendStatusUpdateEmail(
    email: string,
    issueId: string,
    oldStatus: string,
    newStatus: string
  ): Promise<EmailResult> {
    const subject = `[CivicConnect] Issue #${issueId} — Status Updated`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#2563eb;">CivicConnect — Issue Update</h2>
        <p>Your reported issue <strong>#${issueId}</strong> has been updated.</p>
        <table style="width:100%;border-collapse:collapse;margin:20px 0;">
          <tr>
            <td style="padding:10px;background:#f1f5f9;font-weight:bold;">Previous Status</td>
            <td style="padding:10px;">${oldStatus}</td>
          </tr>
          <tr>
            <td style="padding:10px;background:#f1f5f9;font-weight:bold;">New Status</td>
            <td style="padding:10px;color:#16a34a;font-weight:bold;">${newStatus}</td>
          </tr>
        </table>
        <p>Log in to CivicConnect to view full details.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />
        <p style="color:#64748b;font-size:12px;">This is an automated message from CivicConnect. Please do not reply.</p>
      </div>
    `;
    return this.sendEmail({ to: email, subject, html });
  }

  /**
   * Build and send an escalation alert email.
   */
  async sendEscalationEmail(
    email: string,
    issueId: string,
    escalationLevel: number
  ): Promise<EmailResult> {
    const subject = `[CivicConnect] ⚠️ Issue #${issueId} — Escalated to Level ${escalationLevel}`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#dc2626;">CivicConnect — Escalation Alert</h2>
        <p>Your reported issue <strong>#${issueId}</strong> has been escalated.</p>
        <p><strong>Escalation Level:</strong> ${escalationLevel}</p>
        <p>Our team is prioritising your issue. You will receive updates as progress is made.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />
        <p style="color:#64748b;font-size:12px;">This is an automated message from CivicConnect. Please do not reply.</p>
      </div>
    `;
    return this.sendEmail({ to: email, subject, html });
  }

  /**
   * Build and send a resolution notice email.
   */
  async sendResolutionEmail(
    email: string,
    issueId: string
  ): Promise<EmailResult> {
    const subject = `[CivicConnect] ✅ Issue #${issueId} — Resolved`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#16a34a;">CivicConnect — Issue Resolved</h2>
        <p>Great news! Your reported issue <strong>#${issueId}</strong> has been resolved.</p>
        <p>Thank you for helping improve your community through CivicConnect.</p>
        <p>If you feel the issue has not been adequately resolved, please log in and reopen your ticket.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />
        <p style="color:#64748b;font-size:12px;">This is an automated message from CivicConnect. Please do not reply.</p>
      </div>
    `;
    return this.sendEmail({ to: email, subject, html });
  }

  /**
   * Build and send a validation request email.
   */
  async sendValidationRequestEmail(
    email: string,
    issueId: string,
    location: string
  ): Promise<EmailResult> {
    const subject = `[CivicConnect] Validation Request — Issue Near Your Area`;
    const html = `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;">
        <h2 style="color:#7c3aed;">CivicConnect — Validation Request</h2>
        <p>A civic issue has been reported near <strong>${location}</strong>.</p>
        <p>Issue Reference: <strong>#${issueId}</strong></p>
        <p>As a nearby resident, your validation helps us prioritise and address issues faster.</p>
        <p>Log in to CivicConnect to confirm or add details about this issue.</p>
        <hr style="border:none;border-top:1px solid #e2e8f0;margin:20px 0;" />
        <p style="color:#64748b;font-size:12px;">This is an automated message from CivicConnect. Please do not reply.</p>
      </div>
    `;
    return this.sendEmail({ to: email, subject, html });
  }
}

export const emailService = new EmailService();
