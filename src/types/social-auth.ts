// src/types/social-auth.ts

export const SOCIAL_PROVIDERS = ['GOOGLE', 'FACEBOOK', 'INSTAGRAM'] as const;
export type SocialProvider = typeof SOCIAL_PROVIDERS[number];

export interface SocialProfile {
  provider: SocialProvider;
  socialId: string;
  email: string;
  name: string;
  firstName: string;
  lastName: string;
  pictureUrl?: string;
}

export interface SocialAuthConfig {
  provider: SocialProvider;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}