import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;
  private readonly postmarkToken: string | null;
  private readonly postmarkApiUrl: string;

  private async sleep(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms));
  }

  private async sendWithRetry(
    mailOptions: nodemailer.SendMailOptions,
    recipientEmail: string,
    label: string,
  ): Promise<boolean> {
    if (!this.transporter) {
      return this.sendViaPostmarkApi(mailOptions, recipientEmail, label);
    }

    const maxAttempts = parseInt(process.env.EMAIL_MAX_ATTEMPTS || '3', 10);
    const baseDelayMs = parseInt(process.env.EMAIL_RETRY_DELAY_MS || '1200', 10);
    const normalizedRecipient = recipientEmail.trim().toLowerCase();

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const startTime = Date.now();
        const result = await this.transporter.sendMail(mailOptions);
        const elapsedMs = Date.now() - startTime;

        const accepted = Array.isArray((result as any).accepted)
          ? ((result as any).accepted as string[])
          : [];
        const rejected = Array.isArray((result as any).rejected)
          ? ((result as any).rejected as string[])
          : [];

        const recipientAccepted = accepted.some(
          (email) => String(email).trim().toLowerCase() === normalizedRecipient,
        );

        if (recipientAccepted) {
          console.log(
            `[EMAIL SENT] ${label} sent to ${recipientEmail} (Message ID: ${(result as any).messageId}, ${elapsedMs}ms)`,
          );
          return true;
        }

        console.warn(
          `[EMAIL WARNING] ${label} not accepted by SMTP for ${recipientEmail} (attempt ${attempt}/${maxAttempts}). accepted=${JSON.stringify(accepted)} rejected=${JSON.stringify(rejected)}`,
        );
      } catch (error) {
        const err = error as Error;
        console.error(
          `[EMAIL ERROR] ${label} failed for ${recipientEmail} (attempt ${attempt}/${maxAttempts}): ${err.message}`,
        );
      }

      if (attempt < maxAttempts) {
        await this.sleep(baseDelayMs * attempt);
      }
    }

    const isPostmarkTransport =
      (process.env.EMAIL_PROVIDER || '').toLowerCase() === 'postmark' ||
      (process.env.EMAIL_SMTP_HOST || '').includes('postmarkapp.com');

    if (isPostmarkTransport) {
      console.warn(`[EMAIL WARNING] ${label} SMTP path failed for ${recipientEmail}; trying Postmark API fallback`);
      return this.sendViaPostmarkApi(mailOptions, recipientEmail, label);
    }

    return false;
  }

  constructor() {
    this.postmarkToken =
      process.env.POSTMARK_SERVER_TOKEN ||
      process.env.EMAIL_POSTMARK_TOKEN ||
      process.env.EMAIL_SMTP_PASS ||
      null;
    this.postmarkApiUrl = process.env.EMAIL_POSTMARK_API_URL || 'https://api.postmarkapp.com/email';

    // Configure email transporter based on environment variables
    if (process.env.EMAIL_PROVIDER === 'gmail') {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
        connectionTimeout: parseInt(process.env.EMAIL_CONNECTION_TIMEOUT_MS || '10000', 10),
        greetingTimeout: parseInt(process.env.EMAIL_GREETING_TIMEOUT_MS || '10000', 10),
        socketTimeout: parseInt(process.env.EMAIL_SOCKET_TIMEOUT_MS || '20000', 10),
      });
    } else if (process.env.EMAIL_PROVIDER === 'ses' || process.env.EMAIL_SMTP_HOST) {
      // AWS SES SMTP or generic SMTP configuration
      this.transporter = nodemailer.createTransport({
        host: process.env.EMAIL_SMTP_HOST,
        port: parseInt(process.env.EMAIL_SMTP_PORT || '587'),
        secure: false, // SES supports STARTTLS on 587
        auth: {
          user: process.env.EMAIL_SMTP_USER,
          pass: process.env.EMAIL_SMTP_PASS,
        },
        pool: true,
        maxConnections: parseInt(process.env.EMAIL_MAX_CONNECTIONS || '5', 10),
        maxMessages: parseInt(process.env.EMAIL_MAX_MESSAGES || '100', 10),
        connectionTimeout: parseInt(process.env.EMAIL_CONNECTION_TIMEOUT_MS || '10000', 10),
        greetingTimeout: parseInt(process.env.EMAIL_GREETING_TIMEOUT_MS || '10000', 10),
        socketTimeout: parseInt(process.env.EMAIL_SOCKET_TIMEOUT_MS || '20000', 10),
      });
    } else {
      // Fallback: log-only mode for development
      console.warn('[EMAIL] No email provider configured. Emails will be logged to console.');
    }

    if (this.transporter) {
      this.transporter
        .verify()
        .then(() => {
          console.log('[EMAIL] SMTP transport verified successfully');
        })
        .catch((error: Error) => {
          console.error(`[EMAIL] SMTP transport verification failed: ${error.message}`);
        });
    }
  }

  private async sendViaPostmarkApi(
    mailOptions: nodemailer.SendMailOptions,
    recipientEmail: string,
    label: string,
  ): Promise<boolean> {
    if (!this.postmarkToken) {
      console.warn(`[EMAIL WARNING] ${label} fallback skipped: no Postmark token configured`);
      return false;
    }

    const to = String(mailOptions.to || '').trim();
    const from = String(mailOptions.from || '').trim();
    const subject = String(mailOptions.subject || '').trim();
    const textBody = mailOptions.text ? String(mailOptions.text).trim() : '';
    const htmlBody = mailOptions.html ? String(mailOptions.html).trim() : '';
    const replyTo = mailOptions.replyTo ? String(mailOptions.replyTo).trim() : undefined;

    if (!to || !from || !subject || (!textBody && !htmlBody)) {
      console.error(`[EMAIL ERROR] ${label} Postmark fallback aborted: incomplete payload`);
      return false;
    }

    const maxAttempts = parseInt(process.env.EMAIL_POSTMARK_MAX_ATTEMPTS || '3', 10);
    const baseDelayMs = parseInt(process.env.EMAIL_POSTMARK_RETRY_DELAY_MS || '1000', 10);

    for (let attempt = 1; attempt <= maxAttempts; attempt++) {
      try {
        const startTime = Date.now();
        const response = await fetch(this.postmarkApiUrl, {
          method: 'POST',
          headers: {
            Accept: 'application/json',
            'Content-Type': 'application/json',
            'X-Postmark-Server-Token': this.postmarkToken,
          },
          body: JSON.stringify({
            From: from,
            To: to,
            Subject: subject,
            TextBody: textBody || undefined,
            HtmlBody: htmlBody || undefined,
            ReplyTo: replyTo,
            MessageStream: process.env.EMAIL_SMTP_HEADER_X_PM_MESSAGE_STREAM || 'outbound',
          }),
        });

        const payload: any = await response.json().catch(() => ({}));
        const elapsedMs = Date.now() - startTime;
        const errorCode = typeof payload.ErrorCode === 'number' ? payload.ErrorCode : -1;

        if (response.ok && errorCode === 0) {
          console.log(
            `[EMAIL SENT] ${label} sent via Postmark API to ${recipientEmail} (Message ID: ${payload.MessageID || 'n/a'}, ${elapsedMs}ms)`,
          );
          return true;
        }

        console.error(
          `[EMAIL ERROR] ${label} Postmark API rejected for ${recipientEmail} (attempt ${attempt}/${maxAttempts}): status=${response.status}, ErrorCode=${errorCode}, Message=${payload.Message || 'unknown'}`,
        );
      } catch (error) {
        const err = error as Error;
        console.error(
          `[EMAIL ERROR] ${label} Postmark API failed for ${recipientEmail} (attempt ${attempt}/${maxAttempts}): ${err.message}`,
        );
      }

      if (attempt < maxAttempts) {
        await this.sleep(baseDelayMs * attempt);
      }
    }

    return false;
  }

  /**
   * Send password reset email with 6-digit code
   */
  async sendPasswordResetEmail(recipientEmail: string, memberName: string, resetCode: string): Promise<boolean> {
    try {
      if (!this.transporter) {
        console.log(`[EMAIL] Password reset code for ${memberName} (${recipientEmail}): ${resetCode}`);
        return true; // Pretend success in dev mode
      }

      const subject = 'SoyoSoyo Bank - Password Reset Code';
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; color: white; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">Password Reset Request</h1>
          </div>
          <div style="background: #f9f9f9; padding: 40px; border-radius: 0 0 8px 8px; border: 1px solid #ddd;">
            <p>Hello ${memberName},</p>
            <p>We received a request to reset your password. Here is your reset code:</p>
            <div style="background: white; border: 2px solid #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #667eea;">${resetCode}</span>
            </div>
            <p style="color: #666; font-size: 14px;">
              <strong>This code will expire in 15 minutes.</strong>
            </p>
            <p style="margin-top: 30px; color: #999; font-size: 12px; border-top: 1px solid #ddd; padding-top: 20px;">
              If you didn't request this password reset, please ignore this email or contact our support team immediately.
            </p>
            <p style="color: #999; font-size: 12px; margin: 10px 0 0 0;">
              &copy; 2026 SoyoSoyo Bank. All rights reserved.
            </p>
          </div>
        </div>
      `;

      const textContent = `
Password Reset Request

Hello ${memberName},

We received a request to reset your password. Here is your reset code:

${resetCode}

This code will expire in 15 minutes.

If you didn't request this password reset, please ignore this email or contact our support team.

© 2026 SoyoSoyo Bank
      `;

      const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@soyosoyobank.com',
        to: recipientEmail,
        subject,
        text: textContent.trim(),
        html: htmlContent,
        replyTo: process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM || undefined,
        headers: {},
      };
      // Add Postmark stream header if configured
      if (process.env.EMAIL_SMTP_HEADER_X_PM_MESSAGE_STREAM) {
        mailOptions.headers['X-PM-Message-Stream'] = process.env.EMAIL_SMTP_HEADER_X_PM_MESSAGE_STREAM;
      }

      return this.sendWithRetry(mailOptions, recipientEmail, 'Password reset email');
    } catch (error) {
      console.error(`[EMAIL ERROR] Failed to send password reset email to ${recipientEmail}:`, error.message);
      // In production, you might want to log this to a monitoring service
      // For now, we'll return false to indicate failure
      return false;
    }
  }

  /**
   * Send account verification email
   */
  async sendVerificationEmail(recipientEmail: string, memberName: string, verificationCode: string): Promise<boolean> {
    try {
      if (!this.transporter) {
        console.log(`[EMAIL] Verification code for ${memberName} (${recipientEmail}): ${verificationCode}`);
        return true;
      }

      const subject = 'SoyoSoyo Bank - Verify Your Email';
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; color: white; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">Email Verification</h1>
          </div>
          <div style="background: #f9f9f9; padding: 40px; border-radius: 0 0 8px 8px; border: 1px solid #ddd;">
            <p>Hello ${memberName},</p>
            <p>Welcome to SoyoSoyo Bank! Please verify your email address using this code:</p>
            <div style="background: white; border: 2px solid #667eea; border-radius: 8px; padding: 20px; text-align: center; margin: 30px 0;">
              <span style="font-size: 32px; font-weight: bold; letter-spacing: 5px; color: #667eea;">${verificationCode}</span>
            </div>
            <p style="color: #666; font-size: 14px;">
              <strong>This code will expire in 1 hour.</strong>
            </p>
          </div>
        </div>
      `;

      const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@soyosoyobank.com',
        to: recipientEmail,
        subject,
        text: `Hello ${memberName}, your email verification code is: ${verificationCode}. This code expires in 1 hour.`,
        html: htmlContent,
        replyTo: process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM || undefined,
      };

      return this.sendWithRetry(mailOptions, recipientEmail, 'Verification email');
    } catch (error) {
      console.error(`[EMAIL ERROR] Failed to send verification email to ${recipientEmail}:`, error.message);
      return false;
    }
  }

  /**
   * Send welcome email
   */
  async sendWelcomeEmail(recipientEmail: string, memberName: string): Promise<boolean> {
    try {
      if (!this.transporter) {
        console.log(`[EMAIL] Welcome email for ${memberName} (${recipientEmail})`);
        return true;
      }

      const subject = 'Welcome to SoyoSoyo Bank!';
      const htmlContent = `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 40px; text-align: center; color: white; border-radius: 8px 8px 0 0;">
            <h1 style="margin: 0; font-size: 24px;">Welcome to SoyoSoyo Bank!</h1>
          </div>
          <div style="background: #f9f9f9; padding: 40px; border-radius: 0 0 8px 8px; border: 1px solid #ddd;">
            <p>Hello ${memberName},</p>
            <p>Thank you for joining SoyoSoyo Bank. Your account is now active and ready to use.</p>
            <p style="margin-top: 20px;">You can now:</p>
            <ul style="color: #333;">
              <li>View your account balance</li>
              <li>Make deposits and withdraw funds</li>
              <li>Apply for loans</li>
              <li>View financial reports</li>
            </ul>
            <p style="margin-top: 20px; color: #666; font-size: 14px;">
              If you have any questions, please contact our support team.
            </p>
          </div>
        </div>
      `;

      const mailOptions = {
        from: process.env.EMAIL_FROM || process.env.SMTP_USER || 'noreply@soyosoyobank.com',
        to: recipientEmail,
        subject,
        text: `Hello ${memberName}, welcome to SoyoSoyo Bank. Your account is active and ready to use.`,
        html: htmlContent,
        replyTo: process.env.EMAIL_REPLY_TO || process.env.EMAIL_FROM || undefined,
      };

      return this.sendWithRetry(mailOptions, recipientEmail, 'Welcome email');
    } catch (error) {
      console.error(`[EMAIL ERROR] Failed to send welcome email to ${recipientEmail}:`, error.message);
      return false;
    }
  }
}
