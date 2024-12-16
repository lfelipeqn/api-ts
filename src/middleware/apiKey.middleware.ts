// src/middleware/apiKey.middleware.ts

import { Request, Response, NextFunction } from 'express';

export interface ApiKeyRequest extends Request {
  isApiAuthenticated?: boolean;
}

export const apiKeyMiddleware = (req: ApiKeyRequest, res: Response, next: NextFunction) => {
  try {
    const apiKey = req.headers['x-api-key'];
    const validApiKey = process.env.MAIL_API_KEY;

    if (!validApiKey) {
      console.error('CLIENT_API_KEY not configured in environment variables');
      return res.status(500).json({
        status: 'error',
        message: 'Server configuration error'
      });
    }

    if (!apiKey || apiKey !== validApiKey) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid API key'
      });
    }

    req.isApiAuthenticated = true;
    next();
  } catch (error) {
    console.error('API key authentication error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Authentication error'
    });
  }
};