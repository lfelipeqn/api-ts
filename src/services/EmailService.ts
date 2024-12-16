// src/services/EmailService.ts

import nodemailer, { Transporter } from 'nodemailer';

export class EmailService {
  private static instance: EmailService;
  private transporter: Transporter;
  private readonly defaultFromName: string;
  private readonly defaultFromAddress: string;

  private constructor() {
    this.defaultFromName = process.env.MAIL_FROM_NAME || 'Batericars';
    this.defaultFromAddress = process.env.MAIL_FROM_ADDRESS || 'batericars@batericars.com.co';
    
    this.transporter = nodemailer.createTransport({
      host: process.env.MAIL_HOST,
      port: parseInt(process.env.MAIL_PORT || '465'),
      secure: process.env.MAIL_ENCRYPTION?.toLowerCase() === 'ssl',
      auth: {
        user: process.env.MAIL_USERNAME,
        pass: process.env.MAIL_PASSWORD,
      },
      tls: {
        rejectUnauthorized: false
      }
    });
  }

  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  private async verifyConnection(): Promise<void> {
    try {
      await this.transporter.verify();
      console.log('SMTP connection verified successfully');
    } catch (error) {
      console.error('SMTP connection verification failed:', error);
      throw new Error('Failed to establish SMTP connection');
    }
  }

  public async sendCustomEmail(
    to: string | string[],
    subject: string,
    htmlContent: string,
    data: Record<string, any> = {}
  ): Promise<void> {
    try {
      await this.verifyConnection();

      // Replace variables in the HTML content
      const processedHtml = this.processTemplate(htmlContent, data);

      const mailOptions = {
        from: `"${this.defaultFromName}" <${this.defaultFromAddress}>`,
        to: Array.isArray(to) ? to.join(', ') : to,
        subject,
        html: processedHtml
      };

      const info = await this.transporter.sendMail(mailOptions);
      console.log('Email sent successfully:', info.messageId);

    } catch (error) {
      console.error('Error sending email:', error);
      throw new Error('Failed to send email');
    }
  }

  private processTemplate(html: string, data: Record<string, any>): string {
    // Replace variables in the template with actual data
    return Object.entries(data).reduce((content, [key, value]) => {
      const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
      return content.replace(regex, String(value));
    }, html);
  }
}