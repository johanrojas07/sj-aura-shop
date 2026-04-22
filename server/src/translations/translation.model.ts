export interface Translation {
  lang: string;
  keys: Record<string, unknown>;
  [key: string]: unknown;
}
