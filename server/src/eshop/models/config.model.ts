export interface Config {
  _id?: string;
  titleUrl: string;
  dateAdded?: number;
  active: boolean;
  [key: string]: unknown;
}
