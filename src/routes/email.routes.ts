// src/routes/email.routes.ts

import { Router } from 'express';
import { z } from 'zod';
import { EmailService } from '../services/EmailService';
import { apiKeyMiddleware, ApiKeyRequest } from '../middleware/apiKey.middleware';

const router = Router();

// Validation schema for email requests
const sendEmailSchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email())]),
  subject: z.string().min(1),
  htmlContent: z.string().min(1),
  data: z.record(z.any()).optional()
});

if (process.env.NODE_ENV === 'development') {
  const testEmailSchema = z.object({
    email: z.string().email('Invalid email format')
  });

  router.post('/test', async (req, res) => {
    try {
      const { email } = testEmailSchema.parse(req.body);
      const emailService = EmailService.getInstance();
      
      await emailService.sendTestEmail(email);
      
      res.json({
        status: 'success',
        message: 'Test email sent successfully',
        details: {
          recipient: email,
          environment: process.env.NODE_ENV,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      if (error instanceof z.ZodError) {
        return res.status(400).json({
          status: 'error',
          message: 'Validation failed',
          errors: error.errors
        });
      }

      console.error('Error sending test email:', error);
      res.status(500).json({
        status: 'error',
        message: 'Failed to send test email',
        details: error instanceof Error ? error.message : 'Unknown error'
      });
    }
  });
}
// Use API key middleware instead of auth middleware
router.post('/send', apiKeyMiddleware, async (req: ApiKeyRequest, res) => {
  try {
    const { to, subject, htmlContent, data = {} } = sendEmailSchema.parse(req.body);

    const emailService = EmailService.getInstance();
    await emailService.sendCustomEmail(to, subject, htmlContent, data);

    res.json({
      status: 'success',
      message: 'Email sent successfully'
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: error.errors
      });
    }

    console.error('Error sending email:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to send email'
    });
  }
});

export default router;