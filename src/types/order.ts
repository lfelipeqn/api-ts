// types/order.ts

import { Optional } from 'sequelize';
import { OrderState, DeliveryType } from './checkout';

// Define all required and optional fields
export interface OrderAttributes {
  // Required fields
  id: number;
  user_id: number;
  cart_id: number;
  delivery_type: DeliveryType;
  state: OrderState;
  total_amount: number;
  subtotal_amount: number;
  shipping_amount: number;
  discount_amount: number;
  tax_amount: number;
  currency: string;
  payment_method_id: number;
  created_at: Date;
  updated_at: Date;

  // Optional fields
  delivery_address_id: number | null;
  pickup_agency_id: number | null;
  notes: string | null;
  tracking_number: string | null;
  estimated_delivery_date: Date | null;
  last_payment_id: number | null;
}

// Define which fields should be optional during creation
type CreationOptionalFields = 
  'id' | 
  'created_at' | 
  'updated_at' | 
  'notes' | 
  'tracking_number' | 
  'estimated_delivery_date' | 
  'last_payment_id' |
  'delivery_address_id' |
  'pickup_agency_id';

// Create the creation attributes type
export interface OrderCreationAttributes 
  extends Optional<OrderAttributes, CreationOptionalFields> {}

// Add a type for order updates
export type OrderUpdateAttributes = Partial<OrderAttributes>;

// Add a type for order summary
export interface OrderSummary {
  items: Array<{
    product_id: number;
    quantity: number;
    unit_price: number;
    subtotal: number;
    discount: number;
    final_amount: number;
    promotion_id?: number;
  }>;
  totals: {
    subtotal: number;
    discount: number;
    shipping: number;
    tax: number;
    total: number;
  };
}