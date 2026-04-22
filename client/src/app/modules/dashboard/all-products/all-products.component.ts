import { Component, EventEmitter, Input, OnInit, Output, Signal, inject } from '@angular/core';
import { MatButtonToggleChange } from '@angular/material/button-toggle';
import { MatDialog } from '@angular/material/dialog';
import { Router } from '@angular/router';
import { firstValueFrom } from 'rxjs';

import { Category, Product } from '../../../shared/models';
import { SignalStore } from '../../../store/signal.store';
import { SignalStoreSelectors } from '../../../store/signal.store.selectors';
import { TranslateService } from '../../../services/translate.service';
import {
  CatalogStockAdjustDialogComponent,
  type CatalogStockAdjustData,
  type CatalogStockAdjustResult,
} from './catalog-stock-adjust-dialog.component';

type CatalogSortKey = 'name-asc' | 'name-desc' | 'stock-asc' | 'stock-desc' | 'price-asc' | 'price-desc';

@Component({
  selector: 'app-all-products',
  templateUrl: './all-products.component.html',
  styleUrls: ['./all-products.component.scss'],
  standalone: false,
})
export class AllProductsComponent implements OnInit {
  private static readonly CATALOG_VIEW_KEY = 'aura_dash_catalog_view';

  /** true = pestaña resumen con datos del padre; false = ruta `/dashboard/catalog`. */
  @Input() embeddedMode = false;
  @Input() allProducts: Product[] | null = null;
  @Input() lang: string | null = null;
  @Input() currency: string | null = null;
  @Output() getAllProducts = new EventEmitter<void>();
  @Output() editProduct = new EventEmitter<string>();

  /** Vista del catálogo de administración: por defecto siempre rejilla (solo se recuerda «lista» en localStorage). */
  viewMode: 'grid' | 'list' = 'grid';

  /** Filtro de texto: nombre, slug o categoría (nombre/slug de categoría asignada al producto). */
  catalogSearch = '';

  /** Filtro por categoría (slug `titleUrl`); vacío = todas. */
  catalogCategory = '';

  /** Orden: nombre, unidades o precio (venta), A→Z / Z→A o ascendente/descendente. */
  catalogSort: CatalogSortKey = 'name-asc';

  private readonly store = inject(SignalStore);
  private readonly selectors = inject(SignalStoreSelectors);
  private readonly translate = inject(TranslateService);
  private readonly router = inject(Router);
  private readonly dialog = inject(MatDialog);

  readonly routedProducts: Signal<Product[]> = this.selectors.allProducts;
  readonly routedLang: Signal<string> = this.selectors.appLang;
  readonly routedCurrency: Signal<string> = this.selectors.currency;
  readonly allCategories = this.selectors.allCategories;

  ngOnInit(): void {
    this.restoreCatalogView();
    if (!this.embeddedMode) {
      this.store.getAllProducts();
      this.store.getAllCategories();
    }
  }

  private restoreCatalogView(): void {
    this.viewMode = 'grid';
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      const v = localStorage.getItem(AllProductsComponent.CATALOG_VIEW_KEY);
      if (v === 'list') {
        this.viewMode = 'list';
      }
    } catch {
      /* ignore */
    }
  }

  onCatalogViewChange(ev: MatButtonToggleChange): void {
    const v = ev.value as string;
    if (v === 'list' || v === 'grid') {
      this.viewMode = v;
    }
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      if (this.viewMode === 'list') {
        localStorage.setItem(AllProductsComponent.CATALOG_VIEW_KEY, 'list');
      } else {
        localStorage.removeItem(AllProductsComponent.CATALOG_VIEW_KEY);
      }
    } catch {
      /* ignore */
    }
  }

  refresh(): void {
    if (this.embeddedMode) {
      this.getAllProducts.emit();
      return;
    }
    this.store.getAllProducts();
  }

  onEdit(titleUrl: string): void {
    if (this.embeddedMode) {
      this.editProduct.emit(titleUrl);
      return;
    }
    const lang = this.routedLang();
    void this.router.navigate(['/', lang, 'dashboard', 'product-edit', titleUrl]);
  }

  goToNewProduct(): void {
    const lang = (this.embeddedMode ? this.lang : this.routedLang()) || 'es';
    void this.router.navigate(['/', String(lang), 'dashboard', 'product-add']);
  }

  /** Categorías planas para el desplegable (API devuelve `{ category, productsWithCategory }[]`). */
  categorySelectOptions(): { titleUrl: string; title: string }[] {
    const raw = this.embeddedMode ? [] : this.allCategories();
    if (!Array.isArray(raw)) {
      return [];
    }
    const lang = this.langVal() || 'es';
    const out: { titleUrl: string; title: string }[] = [];
    for (const row of raw) {
      const c = (row as { category?: Category }).category;
      if (!c?.titleUrl) {
        continue;
      }
      const loc = c[lang] as { title?: string } | undefined;
      const title = String(loc?.title ?? c.es?.title ?? c.en?.title ?? c.title ?? c.titleUrl);
      out.push({ titleUrl: String(c.titleUrl), title });
    }
    out.sort((a, b) => a.title.localeCompare(b.title, lang, { sensitivity: 'base' }));
    return out;
  }

  openStockDialog(product: Product): void {
    if (!product?.titleUrl) {
      return;
    }
    const data: CatalogStockAdjustData = {
      title: String(product.title || product.titleUrl),
      titleUrl: String(product.titleUrl),
      stockQty: Number(product.stockQty) >= 0 && Number.isFinite(Number(product.stockQty)) ? Math.floor(Number(product.stockQty)) : 0,
    };
    const ref = this.dialog.open(CatalogStockAdjustDialogComponent, {
      data,
      width: 'min(100vw, 420px)',
      autoFocus: 'first-heading',
    });
    void firstValueFrom(ref.afterClosed()).then((r: CatalogStockAdjustResult | undefined) => {
      if (r && typeof r.stockQty === 'number' && Number.isFinite(r.stockQty)) {
        this.store.editProduct({
          titleUrl: data.titleUrl,
          stockQty: Math.max(0, Math.floor(r.stockQty)),
        });
      }
    });
  }

  /** Productos filtrados por categoría, búsqueda (nombre / slug / categoría) y ordenados. */
  visibleProducts(): Product[] {
    let out = [...this.productsList()];
    const catSlug = (this.catalogCategory || '').trim();

    if (catSlug) {
      out = out.filter((p) => this.productHasCategorySlug(p, catSlug));
    }

    const q = this.catalogSearch.trim().toLowerCase();
    if (q.length) {
      const catOpts = this.categorySelectOptions();
      const categoryMatchSlugs = new Set(
        catOpts
          .filter((o) => o.title.toLowerCase().includes(q) || o.titleUrl.toLowerCase().includes(q))
          .map((o) => o.titleUrl.toLowerCase()),
      );
      out = out.filter((p) => this.productMatchesQuery(p, q, categoryMatchSlugs));
    }

    const [by, dir] = this.catalogSort.split('-') as ['name' | 'stock' | 'price', 'asc' | 'desc'];
    const mul = dir === 'asc' ? 1 : -1;
    const locale = this.langVal() || 'es';

    if (by === 'stock') {
      out.sort((a, b) => {
        const na = Number(a.stockQty);
        const nb = Number(b.stockQty);
        const va = Number.isFinite(na) ? na : 0;
        const vb = Number.isFinite(nb) ? nb : 0;
        return mul * (va - vb);
      });
    } else if (by === 'price') {
      out.sort((a, b) => {
        const pa = Number(a.salePrice);
        const pb = Number(b.salePrice);
        const va = Number.isFinite(pa) ? pa : 0;
        const vb = Number.isFinite(pb) ? pb : 0;
        return mul * (va - vb);
      });
    } else {
      out.sort(
        (a, b) =>
          mul *
          String(a.title || a.titleUrl || '')
            .trim()
            .localeCompare(String(b.title || b.titleUrl || '').trim(), locale, { sensitivity: 'base' }),
      );
    }
    return out;
  }

  private productHasCategorySlug(p: Product, slug: string): boolean {
    const tags = Array.isArray(p.tags) ? p.tags.map((t) => String(t).toLowerCase()) : [];
    return tags.includes(slug.toLowerCase());
  }

  private productMatchesQuery(p: Product, q: string, categoryMatchSlugs: Set<string>): boolean {
    const title = String(p.title || '').toLowerCase();
    const slug = String(p.titleUrl || '').toLowerCase();
    if (title.includes(q) || slug.includes(q)) {
      return true;
    }
    const tags = Array.isArray(p.tags) ? p.tags.map((t) => String(t).toLowerCase()) : [];
    for (const t of tags) {
      if (categoryMatchSlugs.has(t)) {
        return true;
      }
    }
    return false;
  }

  productsList(): Product[] {
    return this.embeddedMode ? this.allProducts ?? [] : this.routedProducts() ?? [];
  }

  langVal(): string {
    return this.embeddedMode ? this.lang ?? '' : this.routedLang() ?? '';
  }

  currencyVal(): string {
    return this.embeddedMode ? this.currency ?? '' : this.routedCurrency() ?? '';
  }
}
