export interface Theme {
  _id?: string;
  titleUrl: string;
  dateAdded?: number;
  active: boolean;
  styles: Record<string, unknown>;
  [key: string]: unknown;
}
