export const USER_STATES = ['ACTIVE', 'INACTIVE', 'PENDING', 'BLOCKED', 'SUSPENDED'] as const;
export type UserState = typeof USER_STATES[number];

export interface UserAttributes {
  id: number;
  email: string;
  state: UserState;
  password: string;
  schedule_code: string | null;
  identity_verified_at: Date | null;
  person_id: number;
  agency_id: number | null;
  product_line_id: number | null;
  social_network_name: string | null;
  social_network_user_id: string | null;
  token: string | null;
  city_id: number | null;
  user_id: number | null;
}

export interface UserCreationAttributes extends Omit<UserAttributes, 'id'> {
  password: string;
}

export interface UserUpdateData {
  email?: string;
  schedule_code?: string;
  agency_id?: number | null;
  product_line_id?: number | null;
  city_id?: number | null;
  state?: UserState;
  person?: {
    first_name?: string;
    last_name?: string;
    cell_phone_1?: string;
    email?: string;
  };
}

export interface TokenData {
  token: string;
  created_at: Date;
}
