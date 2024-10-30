export const CART_STATUSES = ['active', 'abandoned', 'ordered'] as const;
export type CartStatus = typeof CART_STATUSES[number];

export interface CartAttributes {
    id: number;
    user_id: number | null;
    session_id: string;
    status: CartStatus;
    expires_at: Date;
    created_at: Date;
    updated_at: Date;
  }

export interface CartCreationAttributes extends 
  Omit<CartAttributes, 'id' | 'created_at' | 'updated_at'> {
  created_at?: Date;
  updated_at?: Date;
}

export interface CartDetailAttributes {
  id: number;
  cart_id: number;
  product_id: number;
  quantity: number;
  price_history_id: number;
  created_at: Date;
  updated_at: Date;
}

export interface CartDetailCreationAttributes extends Omit<CartDetailAttributes, 'id' | 'created_at' | 'updated_at'> {
  created_at?: Date;
  updated_at?: Date;
}

export interface CartSummaryItem {
  product_id: number;
  quantity: number;
  price: number;
  discount: number;
  subtotal: number;
  final_price: number;
  stock_available: boolean;
  applied_promotion: AppliedPromotion | null;
}

export interface CartSummary {
  total: number;
  subtotal: number;
  totalDiscount: number;
  items: CartSummaryItem[];
}

export interface CartSession {
  cart_id: number;
  user_id: number | null;
  created_at: Date;
  expires_at: Date;
}

 export interface AppliedPromotion {
    id: number;
    type: string;
    discount: number;
    is_sporadic: boolean;
  }

  export interface OrderedCart {
    cart_id: number;
    order_id: number;
    ordered_at: Date;
  }