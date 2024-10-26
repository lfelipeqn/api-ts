// types/address.ts

export const ADDRESS_TYPES = ['SHIPPING', 'BILLING', 'WORK', 'HOME', 'AGENCY'] as const;
export type AddressType = typeof ADDRESS_TYPES[number];

export interface AddressAttributes {
  id: number;
  name: string | null;
  neighborhood: string | null;
  detail: string;
  user_id: number;
  city_id: number;
  via: string | null;
  via_identification: string | null;
  number: string | null;
  is_default: boolean;
  type: AddressType;
  created_at: Date;
  updated_at: Date;
}

export interface AddressCreationAttributes extends Omit<AddressAttributes, 'id' | 'created_at' | 'updated_at'> {
  created_at?: Date;
  updated_at?: Date;
}

export interface AddressCountResult {
    type: AddressType;
    count: string;
}