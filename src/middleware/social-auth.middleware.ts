// src/middleware/social-auth.middleware.ts

import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';

// Initialize Google OAuth client
const googleClient = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID
});

// Interface for social tokens
interface SocialToken {
  provider: 'GOOGLE' | 'FACEBOOK' | 'INSTAGRAM';
  token: string;
}

export const verifySocialToken = async (token: SocialToken): Promise<boolean> => {
  try {
    switch (token.provider) {
      case 'GOOGLE':
        const ticket = await googleClient.verifyIdToken({
          idToken: token.token,
          audience: process.env.GOOGLE_CLIENT_ID
        });
        return !!ticket.getPayload();

      // Add other social providers here
      default:
        return false;
    }
  } catch (error) {
    console.error('Social token verification error:', error);
    return false;
  }
};

export const socialAuthMiddleware = async (
  req: Request, 
  res: Response, 
  next: NextFunction
) => {
  try {
    const socialToken = req.headers['x-social-token'] as string;
    const socialProvider = req.headers['x-social-provider'] as 'GOOGLE' | 'FACEBOOK' | 'INSTAGRAM';

    if (socialToken && socialProvider) {
      const isValid = await verifySocialToken({
        provider: socialProvider,
        token: socialToken
      });

      if (!isValid) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid social token'
        });
      }
    }

    next();
  } catch (error) {
    console.error('Social auth middleware error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Authentication error'
    });
  }
};