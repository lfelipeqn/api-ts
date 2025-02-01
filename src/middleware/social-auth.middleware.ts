import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';

const googleClient = new OAuth2Client({
  clientId: process.env.GOOGLE_CLIENT_ID
});

interface SocialToken {
  provider: 'GOOGLE' | 'FACEBOOK' | 'INSTAGRAM';
  token: string;
  scope?: string[];
}

// Define required permissions for each provider
export const REQUIRED_PERMISSIONS = {
  FACEBOOK: ['email', 'public_profile'],
  GOOGLE: ['email', 'profile'],
  INSTAGRAM: ['basic']
} as const;

async function verifyGoogleToken(token: string): Promise<boolean> {
  try {
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID
    });
    return !!ticket.getPayload();
  } catch (error) {
    console.error('Google token verification error:', error);
    return false;
  }
}

interface FacebookTokenData {
  data: {
    is_valid: boolean;
    application: string;
    expires_at: number;
    user_id: string;
  };
}

interface FacebookPermission {
  permission: string;
  status: 'granted' | 'declined';
}

interface FacebookPermissionsData {
  data: FacebookPermission[];
}

async function verifyFacebookToken(token: string): Promise<{isValid: boolean; permissions?: string[]}> {
  try {
    // First, verify the token
    const debugTokenUrl = new URL('https://graph.facebook.com/debug_token');
    debugTokenUrl.searchParams.append('input_token', token);
    debugTokenUrl.searchParams.append('access_token', `${process.env.FACEBOOK_CLIENT_ID}|${process.env.FACEBOOK_CLIENT_SECRET}`);

    const tokenResponse = await fetch(debugTokenUrl.toString());
    if (!tokenResponse.ok) {
      throw new Error(`Facebook Debug Token API error: ${tokenResponse.status}`);
    }

    const tokenData = await tokenResponse.json() as FacebookTokenData;
    if (!tokenData.data?.is_valid) {
      return { isValid: false };
    }

    // Then, check permissions
    const permissionsUrl = new URL(`https://graph.facebook.com/me/permissions`);
    permissionsUrl.searchParams.append('access_token', token);

    const permissionsResponse = await fetch(permissionsUrl.toString());
    if (!permissionsResponse.ok) {
      throw new Error(`Facebook Permissions API error: ${permissionsResponse.status}`);
    }

    const permissionsData = await permissionsResponse.json() as FacebookPermissionsData;
    const grantedPermissions = permissionsData.data
      .filter((perm) => perm.status === 'granted')
      .map((perm) => perm.permission);

    const hasRequiredPermissions = REQUIRED_PERMISSIONS.FACEBOOK.every(
      permission => grantedPermissions.includes(permission)
    );

    return {
      isValid: hasRequiredPermissions,
      permissions: grantedPermissions
    };
  } catch (error) {
    console.error('Facebook token verification error:', error);
    return { isValid: false };
  }
}

export const verifySocialToken = async (token: SocialToken): Promise<{
  isValid: boolean;
  missingPermissions?: string[];
}> => {
  try {
    switch (token.provider) {
      case 'FACEBOOK': {
        const { isValid, permissions = [] } = await verifyFacebookToken(token.token);
        const missingPermissions = REQUIRED_PERMISSIONS.FACEBOOK.filter(
          perm => !permissions.includes(perm)
        );
        return {
          isValid,
          ...(missingPermissions.length > 0 && { missingPermissions })
        };
      }
      
      case 'GOOGLE':
        return { isValid: await verifyGoogleToken(token.token) };

      default:
        return { isValid: false };
    }
  } catch (error) {
    console.error('Social token verification error:', error);
    return { isValid: false };
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

    if (!socialToken || !socialProvider) {
      return res.status(401).json({
        status: 'error',
        message: 'Missing social authentication credentials'
      });
    }

    const { isValid, missingPermissions } = await verifySocialToken({
      provider: socialProvider,
      token: socialToken
    });

    if (!isValid) {
      return res.status(401).json({
        status: 'error',
        message: missingPermissions ? 
          `Missing required permissions: ${missingPermissions.join(', ')}` : 
          'Invalid social token',
        details: process.env.NODE_ENV === 'development' ? {
          provider: socialProvider,
          missingPermissions
        } : undefined
      });
    }

    next();
  } catch (error) {
    console.error('Social auth middleware error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Authentication error',
      details: process.env.NODE_ENV === 'development' ? 
        error instanceof Error ? error.message : 'Unknown error' : 
        undefined
    });
  }
};