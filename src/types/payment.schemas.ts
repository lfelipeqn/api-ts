import { z } from 'zod';
import { PAYMENT_GATEWAYS } from './payment';

// Customer Schema
export const customerSchema = z.object({
  name: z.string(),
  last_name: z.string(),
  email: z.string().email(),
  phone_number: z.string(),
  requires_account: z.boolean().optional()
});

// Card Token Payment Schema
export const cardTokenPaymentSchema = z.object({
  paymentGateway: z.enum(PAYMENT_GATEWAYS),
  amount: z.number().positive(),
  currency: z.string().default('COP'),
  description: z.string(),
  tokenId: z.string(),
  deviceSessionId: z.string(),
  customer: customerSchema
});

// Process Payment Schema
export const processPaymentSchema = z.object({
  tokenId: z.string(),
  deviceSessionId: z.string(),
  customer: customerSchema
});

export type CardTokenPaymentData = z.infer<typeof cardTokenPaymentSchema>;
export type ProcessPaymentData = z.infer<typeof processPaymentSchema>;
