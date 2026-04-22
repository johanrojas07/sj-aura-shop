import { Pipe, PipeTransform } from '@angular/core';

@Pipe({
  name: 'priceFormat',
  pure: true,
  standalone: true,
})
export class PriceFormatPipe implements PipeTransform {

  /** Formato COP colombiano: $49.900 (miles con punto, sin decimales). */
  transform(value: number | string | null | undefined): string {
    if (value === null || value === undefined || value === '') {
      return '$0';
    }
    const n = Math.round(Number(value));
    if (!Number.isFinite(n)) {
      return '$0';
    }
    const abs = Math.abs(n);
    const formatted = abs.toString().replace(/\B(?=(\d{3})+(?!\d))/g, '.');
    return n < 0 ? `-$${formatted}` : `$${formatted}`;
  }

}
