import {
  Component,
  Input,
  Output,
  EventEmitter,
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  input,
  computed,
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

@Component({
    selector: 'app-product-content',
    templateUrl: './product-content.component.html',
    styleUrls: ['./product-content.component.scss'],
    imports: [CommonModule, TranslatePipe, RouterLink, PriceFormatPipe, MatChipsModule, MatButtonModule],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProductContentComponent implements OnChanges {
  categoriesInput = input<Category[]>();
  /** `editorial`: ficha producto. `compact`: tarjetas home / listados. */
  layout = input<'compact' | 'editorial'>('compact');
  /** En editorial: lista vertical con todas las fotos (p. ej. vista rápida en bolsa). */
  fullGalleryStack = input(false);
  categoriesToShow = computed(() => (this.categoriesInput() || []).reduce((prev, cat) => ({...prev, [cat.titleUrl]: cat.title }), {}));
  @Input()  product    : Product;
  @Input()  cartIds     : {[productId: string]: number};
  @Input()  currency    : string;
  @Input()  lang        : string;
  @Input()  withLink      = false;

  @Output() addProduct     = new EventEmitter<string>();

  /** Índice en `galleryUrls` para ficha editorial (thumbnails). */
  selectedGalleryIndex = 0;

  constructor(private readonly cdr: ChangeDetectorRef) {}

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

  trackById(_index: number, item: Product) {
    return item._id;
  }
}
