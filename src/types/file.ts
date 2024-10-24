export interface ImageSizes {
  xs: string;
  sm: string;
  md: string;
  lg: string;
  original: string;
}

export interface FileMetadata {
  mimeType: string;
  size: number;
  originalName: string;
  [key: string]: any;
}

export interface ProductFiles {
  principal: boolean;
}

export interface FileAttributes {
  id: number;
  name: string;
  location: string;
  created_at: Date;
  updated_at: Date;
}

export interface RawFileWithPrincipal extends FileAttributes {
  principal: number | boolean;
}

export interface FileWithDetails extends FileAttributes {
  url: string;
  sizes: ImageSizes;
  products_files?: {
    principal: boolean;
  };
}

export interface FileWithPrincipal extends FileAttributes {
  products_files: {
    principal: boolean;
  };
}