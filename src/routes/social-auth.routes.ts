// src/routes/social-auth.routes.ts

import { Router, Request, Response } from 'express';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { User } from '../models/User';
import { Person } from '../models/Person';
import { getSequelize } from '../config/database';
import { IdentificationType } from '../types/person';

const router = Router();

// Initialize Google OAuth client
const googleClient = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
});

// Interface for social auth providers
interface SocialAuthProvider {
  type: 'GOOGLE' | 'FACEBOOK' | 'INSTAGRAM';
  socialId: string;
  email: string;
  firstName: string;
  lastName: string;
}

import { LoginResponse } from '../types/social-auth-response';

async function handleSocialLogin(socialData: SocialAuthProvider): Promise<LoginResponse> {
  const sequelize = getSequelize();
  const t = await sequelize.transaction();

  try {
    // Check if user exists with this email
    let user = await User.findOne({
      where: { email: socialData.email },
      include: ['person'],
      transaction: t
    });

    if (!user) {
      // If user doesn't exist, return data for registration
      await t.commit();
      return {
        status: 'register_required',
        socialData: {
          email: socialData.email,
          firstName: socialData.firstName,
          lastName: socialData.lastName,
          socialId: socialData.socialId,
          provider: socialData.type
        },
        message: 'User registration required'
      };
    }

    // Check if user is active
    if (!user.isActive()) {
      await t.commit();
      return {
        status: 'error',
        message: 'Account is not active'
      };
    }

    // Create session
    const sessionId = await user.createSession();
    const userInfo = await user.getInfo();

    await t.commit();

    // Ensure we have valid person data before including it
    const personData = userInfo.person && userInfo.person.first_name && userInfo.person.last_name ? {
      first_name: userInfo.person.first_name,
      last_name: userInfo.person.last_name || '' // Convert null to empty string if needed
    } : undefined;

    const response: LoginResponse = {
      status: 'success',
      data: {
        token: sessionId,
        user: {
          id: userInfo.id,
          email: userInfo.email,
          person: personData
        }
      }
    };

    return response;

  } catch (error) {
    await t.rollback();
    console.error('Social login error:', error);
    throw error;
  }
}

// Google Login endpoint
router.post('/google', async (req: Request, res: Response) => {
  try {
    const { credential, callbackUrl } = req.body;

    // Verify Google token
    const ticket = await googleClient.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID
    });

    const payload = ticket.getPayload();
    if (!payload) {
      throw new Error('Invalid token payload');
    }

    // Extract user information from Google payload
    const socialData: SocialAuthProvider = {
      type: 'GOOGLE',
      socialId: payload.sub,
      email: payload.email!,
      firstName: payload.given_name!,
      lastName: payload.family_name || ''
    };

    const result = await handleSocialLogin(socialData);

    if (result.status === 'register_required' && callbackUrl) {
      // Add query parameters to callback URL
      const callbackUrlObj = new URL(callbackUrl);
      Object.entries(result.socialData!).forEach(([key, value]) => {
        callbackUrlObj.searchParams.append(key, value);
      });
      result.data = { ...result.data, redirectUrl: callbackUrlObj.toString() };
    }

    res.json(result);

  } catch (error) {
    console.error('Google authentication error:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Authentication failed'
    });
  }
});

export default router;