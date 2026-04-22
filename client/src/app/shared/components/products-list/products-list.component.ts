import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostBinding,
  Input,
  OnDestroy,
  Output,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { Subscription } from 'rxjs';

import { Product, ProductColorOption } from '../../models';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PriceFormatPipe } from '../../../pipes/price.pipe';
import { MatButtonModule } from '@angular/material/button';
import { TranslateService } from '../../../services/translate.service';
import {
  CatalogAdminGalleryDialogComponent,
  type CatalogAdminGalleryData,
} from './catalog-admin-gallery-dialog.component';

@Component({
  selector: 'app-products-list',
  templateUrl: './products-list.component.html',
  styleUrls: ['./products-list.component.scss'],
  imports: [CommonModule, TranslatePipe, PriceFormatPipe, RouterLink, MatButtonModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductsListComponent implements OnDestroy {
  @Input() products: Product[] = [];
  @Input() cartIds: { [productId: string]: number };
  @Input() currency: string;
  @Input() lang: string;
  @Input() showEdit = false;
  /** Catálogo del panel: sin carrito, stock numérico, galería. */
  @Input() adminMode = false;
  /** En modo admin: rejilla compacta o filas (lista). */
  @Input() layout: 'grid' | 'list' = 'grid';
  @Output() addProduct = new EventEmitter<string>();
  @Output() editProduct = new EventEmitter<string>();
  /** Ajuste de inventario desde el catálogo de administración. */
  @Output() stockAdjust = new EventEmitter<Product>();

  @HostBinding('class.products-list--admin') get _hostAdmin(): boolean {
    return this.adminMode;
  }
  @HostBinding('class.products-list--admin-list') get _hostAdminList(): boolean {
    return this.adminMode && this.layout === 'list';
  }
  @HostBinding('class.products-list--admin-grid') get _hostAdminGrid(): boolean {
    return this.adminMode && this.layout === 'grid';
  }

  /** Índice de imagen bajo el cursor (hover scrub), por producto. */
  private readonly listPreviewIndex = new Map<string, number>();
  private readonly trSub: Subscription;

  constructor(
    private readonly cdr: ChangeDetectorRef,
    private readonly translate: TranslateService,
    private readonly dialog: MatDialog,
  ) {
    this.trSub = this.translate.translationsSub$.subscribe(() => this.cdr.markForCheck());
  }

  ngOnDestroy(): void {
    this.trSub.unsubscribe();
  }

  onAddProduct(id: string): void {
    this.addProduct.emit(id);
  }

  onEditProduct(id: string): void {
    this.editProduct.emit(id);
  }

  onStockAdjust(product: Product): void {
    this.stockAdjust.emit(product);
  }

  adminStockQty(p: Product | undefined): string {
    if (p == null) {
      return '—';
    }
    const q = p.stockQty;
    if (q == null || (typeof q === 'number' && (Number.isNaN(q) || !Number.isFinite(q)))) {
      return '—';
    }
    return String(Math.max(0, Math.floor(Number(q))));
  }

  onOpenAdminGallery(p: Product): void {
    if (!p) {
      return;
    }
    const images = this.listCardGalleryUrls(p);
    if (!images.length) {
      return;
    }
    const data: CatalogAdminGalleryData = {
      title: p.title || p.titleUrl || '',
      images,
      stockQty: p.stockQty,
    };
    this.dialog.open(CatalogAdminGalleryDialogComponent, {
      data,
      width: 'min(100vw, 900px)',
      maxHeight: '90vh',
      autoFocus: 'first-heading',
    });
  }

  /** Texto traducido con `{clave}` sustituida. */
  tr(key: string, vars: Record<string, string | number> = {}): string {
    const map = this.translate.translationsSub$.getValue();
    let s = (map && map[key]) || key;
    for (const [k, v] of Object.entries(vars)) {
      s = s.split(`{${k}}`).join(String(v));
    }
    return s;
  }

  productColors(p: Product | undefined): ProductColorOption[] {
    if (!p?.colors?.length) {
      return [];
    }
    return p.colors.filter((c) => c && typeof c.label === 'string' && c.label.trim().length > 0);
  }

  /** Porcentaje de ahorro respecto al precio tachado (solo si hay descuento real). */
  discountPercent(p: Product | undefined): number | null {
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

  availableInColorsLine(p: Product | undefined): string {
    const cols = this.productColors(p);
    if (cols.length >= 2) {
      return this.tr('AVAILABLE_IN_COLORS', { n: cols.length });
    }
    if (cols.length === 1) {
      return this.tr('AVAILABLE_ONE_COLOR', { name: cols[0].label });
    }
    return '';
  }

  colorNamesJoined(p: Product | undefined): string {
    return this.productColors(p)
      .map((c) => c.label.trim())
      .join(', ');
  }

  /** Texto para lectores de pantalla (resumen + nombres de color). */
  colorAriaLabel(p: Product | undefined): string {
    const line = this.availableInColorsLine(p);
    const names = this.colorNamesJoined(p);
    if (line && names) {
      return `${line}. ${names}`;
    }
    return line || names || '';
  }

  dotColor(c: ProductColorOption): string {
    return c.hex && /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(c.hex.trim()) ? c.hex.trim() : '#c8c8c8';
  }

  private productListKey(p: Product): string {
    return p?._id || p?.titleUrl || '';
  }

  listCardGalleryUrls(p: Product | undefined): string[] {
    if (!p) {
      return [];
    }
    const main = p.mainImage?.url;
    const raw = Array.isArray(p.images) ? p.images : [];
    const extra = raw.filter((u): u is string => typeof u === 'string' && !!u);
    if (!main) {
      return extra.slice(0, 4);
    }
    const rest = extra.filter((u) => u !== main);
    return [main, ...rest].slice(0, 4);
  }

  listCardPreviewUrl(p: Product | undefined): string {
    const urls = this.listCardGalleryUrls(p);
    if (!urls.length) {
      return p?.mainImage?.url || '';
    }
    if (!p) {
      return urls[0];
    }
    const key = this.productListKey(p);
    const idx = this.listPreviewIndex.get(key) ?? 0;
    return urls[Math.min(idx, urls.length - 1)];
  }

  onListCardImageMove(p: Product, ev: MouseEvent): void {
    const urls = this.listCardGalleryUrls(p);
    if (urls.length < 2) {
      return;
    }
    const el = ev.currentTarget as HTMLElement;
    const rect = el.getBoundingClientRect();
    const w = rect.width || 1;
    const x = Math.max(0, Math.min(w, ev.clientX - rect.left));
    const zoneW = w / urls.length;
    const idx = Math.min(urls.length - 1, Math.max(0, Math.floor(x / zoneW)));
    const key = this.productListKey(p);
    if (this.listPreviewIndex.get(key) !== idx) {
      this.listPreviewIndex.set(key, idx);
      this.cdr.markForCheck();
    }
  }

  onListCardImageLeave(p: Product): void {
    this.listPreviewIndex.delete(this.productListKey(p));
    this.cdr.markForCheck();
  }
}
