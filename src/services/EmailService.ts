// src/services/EmailService.ts

import { MailService } from '@sendgrid/mail';

export class EmailService {
  private static instance: EmailService;
  private readonly sendGrid: MailService;
  private readonly defaultFromName: string;
  private readonly defaultFromAddress: string;

  private constructor() {
    this.defaultFromName = process.env.MAIL_FROM_NAME || 'Batericars';
    this.defaultFromAddress = process.env.MAIL_FROM_ADDRESS || 'batericars@batericars.com.co';
    
    this.sendGrid = new MailService();
    this.sendGrid.setApiKey(process.env.MAIl_SENDDESK_API || '');
  }

  public static getInstance(): EmailService {
    if (!EmailService.instance) {
      EmailService.instance = new EmailService();
    }
    return EmailService.instance;
  }

  private async verifyConnection(): Promise<void> {
    try {
      const testMessage = {
        to: this.defaultFromAddress,
        from: `"${this.defaultFromName}" <${this.defaultFromAddress}>`,
        subject: 'Connection Test',
        text: 'Connection test successful',
        html: '<p>Connection test successful</p>'
      };

      // In development, just log the test message
      if (process.env.NODE_ENV === 'development') {
        console.log('SendGrid test message (development mode):', testMessage);
        return;
      }

      await this.sendGrid.send(testMessage);
      console.log('SendGrid connection verified successfully');
    } catch (error) {
      console.error('SendGrid connection verification failed:', error);
      throw new Error('Failed to establish SendGrid connection');
    }
  }

  public async sendTestEmail(to: string): Promise<void> {
    if (process.env.NODE_ENV !== 'development') {
      throw new Error('Test emails can only be sent in development mode');
    }

    const testHtml = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1 style="color: #333;">Test Email from Batericars</h1>
        <p style="color: #666;">This is a test email sent at: {{timestamp}}</p>
        <ul style="color: #666;">
          <li>Environment: {{environment}}</li>
          <li>Sender: {{sender}}</li>
          <li>Recipient: {{recipient}}</li>
        </ul>
        <div style="margin-top: 20px; padding: 20px; background-color: #f5f5f5; border-radius: 5px;">
          <h2 style="color: #333; margin-top: 0;">Template Variables Test</h2>
          <p>Hello {{name}}, this is a variable replacement test.</p>
        </div>
        <p style="color: #888; font-size: 12px; margin-top: 20px;">
          This is an automated test email. Please do not reply.
        </p>
      </div>
    `;

    const testData = {
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV,
      sender: `${this.defaultFromName} <${this.defaultFromAddress}>`,
      recipient: to,
      name: 'Developer'
    };

    try {
      await this.sendCustomEmail(
        to,
        '[TEST] Batericars Email Service Test',
        testHtml,
        testData
      );
      console.log('Test email sent successfully to:', to);
    } catch (error) {
      console.error('Error sending test email:', error);
      throw error;
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

      const mailData = {
        to: Array.isArray(to) ? to.join(', ') : to,
        from: {
          email: this.defaultFromAddress,
          name: this.defaultFromName
        },
        subject,
        html: processedHtml,
        text: this.stripHtml(processedHtml) // Provide plain text version
      };

      const response = await this.sendGrid.send(mailData);
      console.log('Email sent successfully:', response[0].statusCode);

    } catch (error) {
      console.error('Error sending email:', error);
      if ((error as any).response) {
        console.error('SendGrid API Error:', (error as any).response.body);
      }
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

  private stripHtml(html: string): string {
    // Basic HTML to text conversion for fallback plain text version
    return html
      .replace(/<[^>]+>/g, '') // Remove HTML tags
      .replace(/&nbsp;/g, ' ') // Replace non-breaking spaces
      .replace(/\s+/g, ' ') // Normalize whitespace
      .trim();
  }
}