import { ImageSizes } from '../types/file'; 

export interface BrandAttributes {
  id: number;
  name: string;
  for_vehicles: boolean;
  for_products: boolean;
  file_id: number | null;
  created_at?: Date;
  updated_at?: Date;
}

export interface BrandWithImage extends BrandAttributes {
  image?: {
    url: string;
    sizes?: ImageSizes;
  };
}