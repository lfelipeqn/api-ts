// src/routes/social-auth.routes.ts

import { Router, Request, Response } from 'express';
import { OAuth2Client, TokenPayload } from 'google-auth-library';
import { User } from '../models/User';
import { Person } from '../models/Person';
import { getSequelize } from '../config/database';
import { REQUIRED_PERMISSIONS } from '../middleware/social-auth.middleware';
import { LoginResponse } from '../types/social-auth-response';

const router = Router();

const googleClient = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID,
});

interface SocialAuthProvider {
  type: 'GOOGLE' | 'FACEBOOK' | 'INSTAGRAM';
  socialId: string;
  email: string;
  firstName: string;
  lastName: string;
  permissions?: string[];
}

interface FacebookUserData {
  id: string;
  email: string;
  first_name: string;
  last_name: string;
}

interface FacebookPermissionData {
  data: Array<{
    permission: string;
    status: string;
  }>;
}

const appendSocialDataToUrl = (url: URL, data: Record<string, string>) => {
  Object.entries(data).forEach(([key, value]) => {
    url.searchParams.append(key, String(value));
  });
  return url;
};

const assertFacebookUserData = (data: unknown): FacebookUserData => {
  if (
    typeof data === 'object' && 
    data !== null && 
    'id' in data &&
    'email' in data &&
    'first_name' in data &&
    'last_name' in data
  ) {
    return data as FacebookUserData;
  }
  throw new Error('Invalid Facebook user data format');
};

const assertFacebookPermissionData = (data: unknown): FacebookPermissionData => {
  if (
    typeof data === 'object' && 
    data !== null && 
    'data' in data &&
    Array.isArray((data as any).data)
  ) {
    return data as FacebookPermissionData;
  }
  throw new Error('Invalid Facebook permissions data format');
};

async function verifyGoogleIdToken(token: string): Promise<TokenPayload | null> {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    return ticket.getPayload() || null;
  } catch (error) {
    console.error('Google token verification error:', error);
    return null;
  }
}

async function verifyFacebookUserData(accessToken: string): Promise<{
  id: string;
  email: string;
  first_name: string;
  last_name: string;
  permissions: string[];
} | null> {
  try {
    const userDataUrl = new URL('https://graph.facebook.com/me');
    userDataUrl.searchParams.append('fields', 'id,email,first_name,last_name');
    userDataUrl.searchParams.append('access_token', accessToken);

    const userDataResponse = await fetch(userDataUrl.toString());
    if (!userDataResponse.ok) {
      throw new Error('Failed to fetch Facebook user data');
    }

    const rawUserData = await userDataResponse.json();
    const userData = assertFacebookUserData(rawUserData);

    const permissionsUrl = new URL(`https://graph.facebook.com/${userData.id}/permissions`);
    permissionsUrl.searchParams.append('access_token', accessToken);

    const permissionsResponse = await fetch(permissionsUrl.toString());
    if (!permissionsResponse.ok) {
      throw new Error('Failed to fetch Facebook permissions');
    }

    const rawPermissionsData = await permissionsResponse.json();
    const permissionsData = assertFacebookPermissionData(rawPermissionsData);

    const grantedPermissions = permissionsData.data
      .filter((perm) => perm.status === 'granted')
      .map((perm) => perm.permission);

    return {
      ...userData,
      permissions: grantedPermissions
    };
  } catch (error) {
    console.error('Facebook data verification error:', error);
    return null;
  }
}

router.post('/google', async (req: Request, res: Response) => {
  try {
    const { credential, callbackUrl } = req.body;

    const payload = await verifyGoogleIdToken(credential);
    if (!payload) {
      throw new Error('Invalid Google token');
    }

    const socialData: SocialAuthProvider = {
      type: 'GOOGLE',
      socialId: payload.sub,
      email: payload.email!,
      firstName: payload.given_name!,
      lastName: payload.family_name || ''
    };

    const result = await handleSocialLogin(socialData);
    if (result.status === 'register_required' && callbackUrl) {
      const callbackUrlObj = new URL(callbackUrl);
      if (result.socialData) {
        appendSocialDataToUrl(callbackUrlObj, result.socialData);
      }
      result.data = { redirectUrl: callbackUrlObj.toString() };
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

router.post('/facebook', async (req: Request, res: Response) => {
  try {
    const { accessToken, callbackUrl } = req.body;
    
    if (!accessToken) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing access token'
      });
    }

    const userData = await verifyFacebookUserData(accessToken);
    if (!userData) {
      return res.status(401).json({
        status: 'error',
        message: 'Invalid Facebook token'
      });
    }

    // Validate email existence
    if (!userData.email) {
      return res.status(403).json({
        status: 'error',
        message: 'Email permission required'
      });
    }

    // Verify required permissions
    const missingPermissions = REQUIRED_PERMISSIONS.FACEBOOK.filter(
      (permission: string) => !userData.permissions.includes(permission)
    );

    if (missingPermissions.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Missing required permissions',
        details: {
          missingPermissions,
          required: REQUIRED_PERMISSIONS.FACEBOOK,
          granted: userData.permissions
        }
      });
    }

    const socialData: SocialAuthProvider = {
      type: 'FACEBOOK',
      socialId: userData.id,
      email: userData.email,
      firstName: userData.first_name,
      lastName: userData.last_name,
      permissions: userData.permissions
    };

    const result = await handleSocialLogin(socialData);
    if (result.status === 'register_required' && callbackUrl) {
      const callbackUrlObj = new URL(callbackUrl);
      if (result.socialData) {
        appendSocialDataToUrl(callbackUrlObj, result.socialData);
      }
      result.data = { redirectUrl: callbackUrlObj.toString() };
    }

    res.json(result);
  } catch (error) {
    console.error('Facebook authentication error:', error);
    res.status(500).json({
      status: 'error',
      message: error instanceof Error ? error.message : 'Authentication failed',
      details: process.env.NODE_ENV === 'development' ? error : undefined
    });
  }
});

async function handleSocialLogin(socialData: SocialAuthProvider): Promise<LoginResponse> {
  const sequelize = getSequelize();
  const t = await sequelize.transaction();

  try {
    let user = await User.findOne({
      where: { email: socialData.email },
      include: ['person'],
      transaction: t
    });

    if (!user) {
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

    if (!user.isActive()) {
      await t.commit();
      return {
        status: 'error',
        message: 'Account is not active'
      };
    }

    const sessionId = await user.createSession();
    const userInfo = await user.getInfo();

    await t.commit();

    return {
      status: 'success',
      data: {
        token: sessionId,
        user: {
          id: userInfo.id,
          email: userInfo.email,
          person: userInfo.person && userInfo.person.first_name ? {
            first_name: userInfo.person.first_name,
            last_name: userInfo.person.last_name || ''
          } : undefined
        }
      }
    };
  } catch (error) {
    await t.rollback();
    console.error('Social login error:', error);
    throw error;
  }
}

export default router;  