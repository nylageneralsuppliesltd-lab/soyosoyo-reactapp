import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';

@Injectable()
export class EmailService {
  private transporter: nodemailer.Transporter;

  constructor() {
    // Configure email transporter based on environment variables
    if (process.env.EMAIL_PROVIDER === 'gmail') {
      this.transporter = nodemailer.createTransport({
        service: 'gmail',
        auth: {
          user: process.env.GMAIL_USER,
          pass: process.env.GMAIL_APP_PASSWORD,
        },
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
      });
    } else {
      // Fallback: log-only mode for development
      console.warn('[EMAIL] No email provider configured. Emails will be logged to console.');
    }
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
        headers: {}
      };
      // Add Postmark stream header if configured
      if (process.env.EMAIL_SMTP_HEADER_X_PM_MESSAGE_STREAM) {
        mailOptions.headers['X-PM-Message-Stream'] = process.env.EMAIL_SMTP_HEADER_X_PM_MESSAGE_STREAM;
      }

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`[EMAIL SENT] Password reset code sent to ${recipientEmail} (Message ID: ${result.messageId})`);
      return true;
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
        html: htmlContent,
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`[EMAIL SENT] Verification email sent to ${recipientEmail}`);
      return true;
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
        html: htmlContent,
      };

      const result = await this.transporter.sendMail(mailOptions);
      console.log(`[EMAIL SENT] Welcome email sent to ${recipientEmail}`);
      return true;
    } catch (error) {
      console.error(`[EMAIL ERROR] Failed to send welcome email to ${recipientEmail}:`, error.message);
      return false;
    }
  }
}
