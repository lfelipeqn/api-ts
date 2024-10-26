// types/person.ts

export const IDENTIFICATION_TYPES = ['CC', 'CE', 'PAS', 'NIT'] as const;
export type IdentificationType = typeof IDENTIFICATION_TYPES[number];

export interface PersonAttributes {
  id: number;
  identification_type: IdentificationType;
  identification_number: string;
  first_name: string;
  last_name: string | null;
  date_of_birth: Date | null;
  cell_phone_1: string | null;
  cell_phone_1_whatsapp: boolean;
  cell_phone_2: string | null;
  cell_phone_2_whatsapp: boolean;
  address: string | null;
  email: string | null;
  shoe_size: string | null;
  pants_size: string | null;
  shirt_size: string | null;
  file_id: number | null;
  curriculum_vitae_id: number | null;
  dni_id: number | null;
  created_at: Date;
  updated_at: Date;
}

export interface PersonCreationAttributes extends Omit<PersonAttributes, 'id' | 'created_at' | 'updated_at'> {
  created_at?: Date;
  updated_at?: Date;
}

export interface PersonUpdateData extends Partial<Omit<PersonAttributes, 'id' | 'created_at' | 'updated_at'>> {}