import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  HostBinding,
  Input,
  OnChanges,
  OnDestroy,
  Output,
  SimpleChanges,
  ViewChild,
} from '@angular/core';
import { MatDialog } from '@angular/material/dialog';
import { MatPaginator } from '@angular/material/paginator';
import { MatSort } from '@angular/material/sort';
import { MatTableDataSource } from '@angular/material/table';
import { Subscription } from 'rxjs';

import { Product, ProductColorOption } from '../../models';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { PriceFormatPipe } from '../../../pipes/price.pipe';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatSortModule } from '@angular/material/sort';
import { MatPaginatorModule } from '@angular/material/paginator';
import { MatTooltipModule } from '@angular/material/tooltip';
import { TranslateService } from '../../../services/translate.service';
import {
  CatalogAdminGalleryDialogComponent,
  type CatalogAdminGalleryData,
} from './catalog-admin-gallery-dialog.component';
import { ProductQuickViewService } from '../../../services/product-quick-view.service';

@Component({
  selector: 'app-products-list',
  templateUrl: './products-list.component.html',
  styleUrls: ['./products-list.component.scss'],
  imports: [
    CommonModule,
    TranslatePipe,
    PriceFormatPipe,
    RouterLink,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatSortModule,
    MatPaginatorModule,
    MatTooltipModule,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProductsListComponent implements OnDestroy, OnChanges {
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

  readonly dataSource = new MatTableDataSource<Product>([]);
  readonly catalogDisplayColumns: string[] = ['thumb', 'name', 'status', 'stock', 'price', 'actions'];
  private _listDataFp = '';
  private _paginator: MatPaginator | null = null;

  @ViewChild(MatPaginator) set catalogPaginator(p: MatPaginator | undefined) {
    this._paginator = p ?? null;
    this.dataSource.paginator = p ?? null;
  }

  @ViewChild(MatSort) set catalogSort(s: MatSort | undefined) {
    this.dataSource.sort = s ?? null;
  }

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
    private readonly productQuickView: ProductQuickViewService,
  ) {
    this.trSub = this.translate.translationsSub$.subscribe(() => this.cdr.markForCheck());
    this.dataSource.sortingDataAccessor = (row, column) => {
      if (!row) {
        return '';
      }
      switch (column) {
        case 'name':
          return String(row.title || row.titleUrl || '').toLowerCase();
        case 'status':
          return row.visibility === false ? 0 : 1;
        case 'stock': {
          const n = Number(row.stockQty);
          return Number.isFinite(n) ? n : 0;
        }
        case 'price': {
          const n = Number(row.salePrice);
          return Number.isFinite(n) ? n : 0;
        }
        default:
          return '';
      }
    };
  }

  /** Evita reasignar con cada CD del padre si el listado filtrado es el mismo. */
  private adminListFingerprint(rows: Product[] | undefined | null): string {
    if (!rows?.length) {
      return '0';
    }
    return rows
      .map((p) => `${p?.titleUrl ?? ''}:${p?.stockQty ?? ''}:${p?.salePrice ?? ''}:${p?.visibility}`)
      .join('|');
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (!this.adminMode || this.layout !== 'list') {
      return;
    }
    if (changes['layout']?.currentValue === 'list' && this.layout === 'list') {
      this._listDataFp = '';
    }
    if (!('products' in changes) && !changes['layout']) {
      return;
    }
    const fp = this.adminListFingerprint(this.products);
    if (fp === this._listDataFp) {
      return;
    }
    this._listDataFp = fp;
    this.dataSource.data = Array.isArray(this.products) ? [...this.products] : [];
    queueMicrotask(() => {
      this._paginator?.firstPage();
    });
    this.cdr.markForCheck();
  }

  ngOnDestroy(): void {
    this.trSub.unsubscribe();
  }

  trackByRow(_: number, row: Product): string {
    return row?.titleUrl || row?._id || String(_);
  }

  onAddProduct(id: string): void {
    this.addProduct.emit(id);
  }

  /** Vista rápida sin salir del listado (no afecta la ficha PDP en URL). */
  openQuickView(ev: Event, titleUrl: string | undefined): void {
    ev.preventDefault();
    ev.stopPropagation();
    const slug = (titleUrl || '').trim();
    if (!slug) {
      return;
    }
    this.productQuickView.open(slug);
    this.cdr.markForCheck();
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

  /** Solo estilos de listado (stock bajo / sin unidades). */
  catalogStockIsLow(p: Product | undefined): boolean {
    if (p?.stockQty == null) {
      return false;
    }
    const n = Math.floor(Number(p.stockQty));
    return Number.isFinite(n) && n > 0 && n < 5;
  }

  catalogStockIsOut(p: Product | undefined): boolean {
    if (p?.stockQty == null) {
      return false;
    }
    const n = Math.floor(Number(p.stockQty));
    return Number.isFinite(n) && n <= 0;
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
