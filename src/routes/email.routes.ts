// src/routes/email.routes.ts

import { Router } from 'express';
import { z } from 'zod';
import { EmailService } from '../services/EmailService';
import { apiKeyMiddleware, ApiKeyRequest } from '../middleware/apiKey.middleware';

const router = Router();

// Validation schemas
const sendEmailSchema = z.object({
  to: z.union([z.string().email(), z.array(z.string().email())]),
  subject: z.string().min(1),
  htmlContent: z.string().min(1),
  data: z.record(z.any()).optional()
});

const testEmailSchema = z.object({
  email: z.string().email('Invalid email format')
});

// Production email endpoint - requires both X-API-Key and SendGrid auth
router.post('/send', apiKeyMiddleware, async (req: ApiKeyRequest, res) => {
  try {
    const { to, subject, htmlContent, data = {} } = sendEmailSchema.parse(req.body);

    const emailService = EmailService.getInstance();
    await emailService.sendCustomEmail(to, subject, htmlContent, data);

    res.json({
      status: 'success',
      message: 'Email sent successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error: any) {
    console.error('Email route error:', {
      name: error.name,
      message: error.message,
      sendGridErrors: error.response?.body?.errors,
      timestamp: new Date().toISOString()
    });

    if (error instanceof z.ZodError) {
      return res.status(400).json({
        status: 'error',
        message: 'Validation failed',
        errors: error.errors
      });
    }

    res.status(500).json({
      status: 'error',
      message: error.response?.body?.errors?.[0]?.message || error.message || 'Failed to send email'
    });
  }
});

// Development test endpoint - only requires SendGrid auth
/*
if (process.env.NODE_ENV === 'development') {
  router.post('/test', async (req, res) => {
    try {
      const { email } = testEmailSchema.parse(req.body);
      
      // No API key check in development
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
}*/

export default router;