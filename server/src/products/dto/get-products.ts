import { IsIn, IsNotEmpty, IsOptional } from 'class-validator';
import { SortOptions } from '../models/sort.enum';

export class GetProductsDto {
  @IsNotEmpty()
  lang: string;

  @IsNotEmpty()
  page: string;

  @IsIn([
    SortOptions.newest,
    SortOptions.oldest,
    SortOptions.priceasc,
    SortOptions.pricedesc,
  ])
  sort: SortOptions;

  @IsOptional()
  category?: string;

  /**
   * Varias categorías (slugs `titleUrl`) separadas por coma.
   * Si viene informado, filtra productos que tengan **alguna** coincidencia en `tags` (OR).
   * Tiene prioridad sobre `category` cuando hay al menos un slug.
   */
  @IsOptional()
  categories?: string;

  @IsOptional()
  search?: string;

  /** Filtro sidebar / URL: precio máximo (COP). */
  @IsOptional()
  maxPrice?: number;

  /** Filtro URL: precio mínimo (COP), p. ej. vitrina fija. */
  @IsOptional()
  minPrice?: number;

  /** Si es "1", solo productos en oferta (`onSale`). */
  @IsOptional()
  ofertas?: string;

  /** Si es "1", solo productos con tag `en-promocion` (vitrina destacada). */
  @IsOptional()
  promo?: string;
}
