// src/types/email.ts

export type Template = 'PASSWORD_RESET' | 'WELCOME' | 'ORDER_CONFIRMATION';

export interface EmailOptions {
  to: string | string[];
  subject: string;
  template: Template;
  data: Record<string, any>;
}