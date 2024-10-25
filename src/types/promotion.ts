// types/promotion.ts

// State options
export const PROMOTION_STATES = ['ACTIVE', 'INACTIVE', 'DRAFT'] as const;
export type PromotionState = typeof PROMOTION_STATES[number];

// Type options
export const PROMOTION_TYPES = ['PERCENTAGE', 'FIXED'] as const;
export type PromotionType = typeof PROMOTION_TYPES[number];

// Product application options
export const PROMOTION_PRODUCT_APPLICATIONS = ['SPECIFIC', 'BRAND', 'LINE'] as const;
export type PromotionProductApplication = typeof PROMOTION_PRODUCT_APPLICATIONS[number];

// Service application options
export const PROMOTION_SERVICE_APPLICATIONS = ['SPECIFIC', 'LINE'] as const;
export type PromotionServiceApplication = typeof PROMOTION_SERVICE_APPLICATIONS[number];

// Base promotion interface
export interface BasePromotionAttributes {
  id: number;
  name: string;
  discount: number;
  state: PromotionState;
  type: PromotionType;
  automatically_generated: boolean;
  applies_to_products: PromotionProductApplication | null;
  applies_to_services: PromotionServiceApplication | null;
  start_date: Date;
  end_date: Date;
  user_id: number;
  product_line_id: number | null;
  service_line_id: number | null;
  file_id: number | null;
  created_at?: Date;
  updated_at?: Date;
}

// Promotion update interface
export interface PromotionUpdateData {
  name?: string;
  discount?: number;
  state?: PromotionState;
  type?: PromotionType;
  applies_to_products?: PromotionProductApplication | null;
  applies_to_services?: PromotionServiceApplication | null;
  start_date?: Date;
  end_date?: Date;
  product_line_id?: number | null;
  service_line_id?: number | null;
  products?: number[];
  brands?: number[];
  services?: number[];
}