import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  input,
  computed,
  booleanAttribute,
  OnChanges,
  SimpleChanges,
} from '@angular/core';

import { Product, Category } from '../../models';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { RouterLink } from '@angular/router';
import { PriceFormatPipe } from '../../../pipes/price.pipe';

import { MatChipsModule } from '@angular/material/chips';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { TranslateService } from '../../../services/translate.service';

@Component({
    selector: 'app-product-content',
    templateUrl: './product-content.component.html',
    styleUrls: ['./product-content.component.scss'],
    imports: [CommonModule, TranslatePipe, RouterLink, PriceFormatPipe, MatChipsModule, MatButtonModule, MatIconModule],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductContentComponent implements OnChanges {
  categoriesInput = input<Category[]>();
  /** `editorial`: ficha producto. `compact`: tarjetas home / listados. */
  layout = input<'compact' | 'editorial'>('compact');
  /** En editorial: lista vertical con todas las fotos (p. ej. vista rápida en bolsa). */
  fullGalleryStack = input(false);
  /** Con `layout=compact`: mini galería (imagen principal + strip) si hay varias fotos. */
  compactGallery = input(false, { transform: booleanAttribute });
  /** Oculta visualmente el `<h1>` (p. ej. modal vista rápida con título en cabecera). */
  hideTitle = input(false, { transform: booleanAttribute });
  categoriesToShow = computed(() => (this.categoriesInput() || []).reduce((prev, cat) => ({...prev, [cat.titleUrl]: cat.title }), {}));
  @Input()  product    : Product;
  @Input()  cartIds     : {[productId: string]: number};
  @Input()  currency    : string;
  @Input()  lang        : string;
  @Input()  withLink      = false;

  @Output() addProduct     = new EventEmitter<string>();

  /** Índice en `galleryUrls` para ficha editorial (thumbnails). */
  selectedGalleryIndex = 0;

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly translate: TranslateService,
  ) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['product']) {
      this.selectedGalleryIndex = 0;
    }
  }

  /** Principal + imágenes extra, sin duplicar URL. */
  get galleryUrls(): string[] {
    const p = this.product;
    if (!p) {
      return [];
    }
    const main = p.mainImage?.url;
    const extra = p.images || [];
    if (!main) {
      return extra.filter(Boolean);
    }
    const rest = extra.filter((u) => u && u !== main);
    return [main, ...rest];
  }

  get activeGalleryUrl(): string {
    const urls = this.galleryUrls;
    if (!urls.length) {
      return this.product?.mainImage?.url || '';
    }
    const i = Math.min(this.selectedGalleryIndex, urls.length - 1);
    return urls[i] || '';
  }

  selectGallery(index: number): void {
    this.selectedGalleryIndex = index;
    this.cdr.markForCheck();
  }

  onAddProduct(id: string): void {
    this.addProduct.emit(id);
  }

  /** Texto cinta compacta (misma lógica que listado de productos). */
  compactSaleRibbonLabel(): string {
    if (!this.product?.onSale) {
      return '';
    }
    const pct = this.discountPercent(this.product);
    if (pct != null) {
      return this.tr('SAVE_PERCENT', { pct });
    }
    return this.tr('PRODUCT_BADGE_SALE');
  }

  private tr(key: string, vars: Record<string, string | number> = {}): string {
    const map = this.translate.translationsSub$.getValue();
    let s = (map && map[key]) || key;
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(String(v));
    }
    return s;
  }

  private discountPercent(p: Product | undefined): number | null {
    if (!p?.onSale || p.regularPrice == null || p.salePrice == null) {
      return null;
    }
    if (p.regularPrice <= 0 || p.salePrice <= 0) {
      return null;
    }
    if (p.regularPrice <= p.salePrice) {
      return null;
    }
    const pct = Math.round(100 * (1 - p.salePrice / p.regularPrice));
    return pct > 0 ? pct : null;
  }

  trackById(_index: number, item: Product) {
    return item._id;
  }
}
