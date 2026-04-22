export interface Page {
  _id?: string;
  titleUrl: string;
  dateAdded?: number;
  [key: string]: unknown;
}
