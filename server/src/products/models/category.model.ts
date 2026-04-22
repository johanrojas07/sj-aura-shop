export interface Category {
  titleUrl: string;
  mainImage: { url: string; name: string; type?: boolean };
  subCategories?: string[];
  _user?: string;
  dateAdded?: number;
  [key: string]: unknown;
}
