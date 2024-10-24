
export interface DataSheetBase {
  id: number;
  name: string;
  year: number;
  original: boolean;
  vehicle_version_id: number | null;
  product_id: number | null;
  client_id: number | null;
  product_line_id: number;
  created_at: Date;
  updated_at: Date;
}

export interface DataSheetFieldBase {
  id: number;
  field_name: string;
  type: string;
  values: string | null;
  use_to_filter: boolean;
  use_to_compare: boolean;
  product_line_id: number;
  created_at: Date;
  updated_at: Date;
}

export interface DataSheetValueBase {
  id: number;
  data_sheet_id: number;
  data_sheet_field_id: number;
  value: string;
  created_at: Date;
  updated_at: Date;
}