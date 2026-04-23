import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnChanges,
  OnDestroy,
  OnInit,
  Output,
  SimpleChanges,
  signal,
} from '@angular/core';
import { of, Subscription } from 'rxjs';
import { filter, take, delay } from 'rxjs/operators';
import { NavigationEnd, Router, RouterLink } from '@angular/router';
import { MatSliderModule } from '@angular/material/slider';
import { MatSelectModule } from '@angular/material/select';
import { MatButtonModule } from '@angular/material/button';

import { Category } from '../../models';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../../../pipes/translate.pipe';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { PriceFormatPipe } from '../../../pipes/price.pipe';

@Component({
    selector: 'app-sidebar',
    templateUrl: './sidebar.component.html',
    styleUrls: ['./sidebar.component.scss'],
    imports: [
      CommonModule,
      RouterLink,
      TranslatePipe,
      PriceFormatPipe,
      MatSliderModule,
      MatSelectModule,
      MatButtonModule,
      FormsModule,
      ReactiveFormsModule,
    ],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SidebarComponent implements OnChanges, OnInit, OnDestroy {
  @Input() categories: Category[];
  @Input() activeCategory?: string;
  /** Listado catálogo (p. ej. productos): casillas y varias categorías; en home suele ser false. */
  @Input() isCatalogAllView = false;
  /** Slugs seleccionados: `?categories=` y/o el `:category` de ruta (lo pasa el padre). */
  @Input() selectedCategorySlugs: string[] = [];
  @Input() minPrice: number = 0;
  @Input() maxPrice: number = Infinity;
  @Input() price: number;
  /** Piso del filtro (store) cuando `usePriceRange` es true. */
  @Input() priceMinFilter = 0;
  /** Catálogo productos: slider con dos extremos (desde / hasta). */
  @Input() usePriceRange = false;
  @Input() sortOptions: { name: string; id: string; icon?: string }[];
  @Input() choosenSort: string;
  @Input() currency: string;
  @Input() lang: string;

  @Output() changePrice = new EventEmitter<number>();
  @Output() changePriceRange = new EventEmitter<{ start: number; end: number }>();
  @Output() changeSort = new EventEmitter<string>();
  @Output() changeCategory = new EventEmitter<string>();
  @Output() categoriesFilterChange = new EventEmitter<string[]>();
  @Output() clearCategoryFilters = new EventEmitter<void>();
  /** Quitar categorías + precio (misma acción que “Limpiar todo” en la barra principal). */
  @Output() clearAllFiltersRequest = new EventEmitter<void>();

  productsUrl: string;
  categoryUrl: string;
  priceValue = 0;
  rngStart = 0;
  rngEnd = 0;
  private priceRangeEmitTimer?: ReturnType<typeof setTimeout>;

  /** URLs de categoría padre con sublista desplegada (muchas subcategorías). */
  readonly expandedParents = signal(new Set<string>());

  /**
   * Copia local de los slugs al marcar casillas (la URL actualiza después del navigate).
   * Con `preventDefault` en el checkbox, sin esto el tick no muestra el ✓ hasta más tarde.
   */
  private readonly categorySlugsUi = signal<string[] | null>(null);

  private navSub?: Subscription;

  constructor(
    private readonly router: Router,
    private readonly cdr: ChangeDetectorRef,
  ) {}

  ngOnInit(): void {
    if (this.usePriceRange) {
      this.syncRangeThumbsFromInputs();
    }
    this.navSub = this.router.events
      .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
      .subscribe(() => {
        this.categorySlugsUi.set(null);
        this.syncExpandedGroupsFromRoute();
        this.cdr.markForCheck();
      });
  }

  ngOnDestroy(): void {
    this.navSub?.unsubscribe();
    if (this.priceRangeEmitTimer != null) {
      clearTimeout(this.priceRangeEmitTimer);
    }
  }

  /**
   * Slugs en `?categories=` leídos del URL global.
   * `ActivatedRoute.snapshot` en hijos del catálogo a veces no trae queryParams; `Router` sí.
   */
  activeCategorySlugs(): string[] {
    const q = this.router.parseUrl(this.router.url).queryParams['categories'];
    if (q == null || q === '') {
      return [];
    }
    const raw = Array.isArray(q) ? q.join(',') : String(q);
    return raw
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
  }

  /** Slugs para pintar casillas: acción local, luego input del padre (ruta + query), luego solo query. */
  slugsForCheckboxUi(): string[] {
    const local = this.categorySlugsUi();
    if (local !== null) {
      return local;
    }
    if (this.isCatalogAllView && (this.selectedCategorySlugs?.length ?? 0) > 0) {
      return [...this.selectedCategorySlugs];
    }
    return this.activeCategorySlugs();
  }

  /**
   * Slug marcado en UI: está en la URL o queda cubierto por un padre en la lista
   * (p. ej. `?categories=mujeres` implica todas las subcategorías de Mujeres).
   */
  isCategorySlugChecked(slug: string): boolean {
    return this.slugSelectedInUi(slug, this.slugsForCheckboxUi());
  }

  private slugSelectedInUi(slug: string, slugs: string[]): boolean {
    if (slugs.includes(slug)) {
      return true;
    }
    for (const s of slugs) {
      if (this.sidebarChildren(s).some((ch) => ch.titleUrl === slug)) {
        return true;
      }
    }
    return false;
  }

  /** Padre del slug en el árbol del sidebar (solo categorías con `parentTitleUrl`). */
  private findParentTitleUrl(slug: string): string | null {
    for (const top of this.topLevelSidebarCategories()) {
      if (this.sidebarChildren(top.titleUrl).some((ch) => ch.titleUrl === slug)) {
        return top.titleUrl;
      }
    }
    return null;
  }

  /**
   * Fila padre (p. ej. Mujeres): todo el ramo vía slug padre en `?categories=`,
   * sin salir de la vista catálogo — así siguen visibles las casillas de subs.
   */
  isParentWholeBranchFilterSelected(parentTitleUrl: string): boolean {
    const slugs = this.slugsForCheckboxUi();
    if (slugs.includes(parentTitleUrl)) {
      return true;
    }
    const children = this.sidebarChildren(parentTitleUrl);
    if (!children.length) {
      return false;
    }
    return children.every((ch) => slugs.includes(ch.titleUrl));
  }

  onParentWholeBranchClick(parentTitleUrl: string, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    const base = new Set(this.slugsForCheckboxUi());
    const children = this.sidebarChildren(parentTitleUrl).map((c) => c.titleUrl);
    const parentOn =
      base.has(parentTitleUrl) ||
      (children.length > 0 && children.every((c) => base.has(c)));

    if (parentOn) {
      base.delete(parentTitleUrl);
      for (const c of children) {
        base.delete(c);
      }
    } else {
      for (const c of children) {
        base.delete(c);
      }
      base.add(parentTitleUrl);
    }
    this.maybeCollapseParentSlugs(base);
    const next = [...base];
    this.categorySlugsUi.set(next);
    this.categoriesFilterChange.emit(next);
    this.cdr.markForCheck();
  }

  /** Si todas las subs de un padre están en el set, sustituirlas por el slug padre. */
  private maybeCollapseParentSlugs(slugs: Set<string>): void {
    for (const top of this.topLevelSidebarCategories()) {
      const children = this.sidebarChildren(top.titleUrl);
      const childUrls = children.map((c) => c.titleUrl);
      if (!childUrls.length) {
        continue;
      }
      if (slugs.has(top.titleUrl)) {
        continue;
      }
      const allIn = childUrls.every((c) => slugs.has(c));
      if (allIn) {
        for (const c of childUrls) {
          slugs.delete(c);
        }
        slugs.add(top.titleUrl);
      }
    }
  }

  slugDisplayTitle(slug: string): string {
    const c = (this.categories || []).find((x) => x.titleUrl === slug);
    return (c?.title || slug).trim();
  }

  /** Hay filtro de precio activo (piso y/o techo). */
  hasActivePriceFilter(): boolean {
    const p = Number(this.price);
    const pf = Number(this.priceMinFilter);
    return (Number.isFinite(p) && p > 0) || (Number.isFinite(pf) && pf > 0);
  }

  priceFloorValue(): number {
    return Number.isFinite(Number(this.priceMinFilter)) && Number(this.priceMinFilter) > 0
      ? Number(this.priceMinFilter)
      : 0;
  }

  priceCeilingValue(): number {
    return Number.isFinite(Number(this.price)) && Number(this.price) > 0 ? Number(this.price) : 0;
  }

  catalogSliderMin(): number {
    return this.catalogPriceFloor();
  }

  catalogSliderMax(): number {
    const lo = this.catalogSliderMin();
    const hi = Number(this.maxPrice);
    if (Number.isFinite(hi) && hi > lo) {
      return hi;
    }
    return lo + 1;
  }

  priceSliderStep(): number {
    const lo = this.catalogSliderMin();
    const hi = this.catalogSliderMax();
    const span = hi - lo;
    if (span <= 0) {
      return 1;
    }
    return Math.max(1000, Math.round(span / 120));
  }

  priceRangeUsable(): boolean {
    return this.catalogSliderMax() > this.catalogSliderMin();
  }

  displayPriceFrom(): number {
    const lo = this.catalogSliderMin();
    const pf = this.priceFloorValue();
    return pf > 0 ? pf : lo;
  }

  displayPriceTo(): number {
    const hi = this.catalogSliderMax();
    const pc = this.priceCeilingValue();
    return pc > 0 ? Math.min(pc, hi) : hi;
  }

  private syncRangeThumbsFromInputs(): void {
    const lo = this.catalogSliderMin();
    const hi = this.catalogSliderMax();
    const pf = this.priceFloorValue();
    const pc = this.priceCeilingValue();
    let s = pf > 0 ? pf : lo;
    let e = pc > 0 ? pc : hi;
    s = Math.max(lo, Math.min(s, hi));
    e = Math.max(lo, Math.min(e, hi));
    if (s > e) {
      const t = s;
      s = e;
      e = t;
    }
    this.rngStart = s;
    this.rngEnd = e;
    const step = Math.max(1, this.priceSliderStep());
    if (hi > lo && this.rngEnd <= this.rngStart) {
      this.rngEnd = Math.min(hi, this.rngStart + step);
    }
  }

  onRangeThumbChange(): void {
    if (!this.usePriceRange) {
      return;
    }
    if (this.priceRangeEmitTimer != null) {
      clearTimeout(this.priceRangeEmitTimer);
    }
    this.priceRangeEmitTimer = setTimeout(() => {
      this.priceRangeEmitTimer = undefined;
      this.changePriceRange.emit({ start: this.rngStart, end: this.rngEnd });
    }, 180);
  }

  ngOnChanges(changes: SimpleChanges): void {
    if (
      changes['activeCategory'] ||
      changes['selectedCategorySlugs'] ||
      changes['isCatalogAllView']
    ) {
      this.syncExpandedGroupsFromRoute();
    }
    if (
      changes['price'] ||
      changes['priceMinFilter'] ||
      changes['minPrice'] ||
      changes['maxPrice'] ||
      changes['usePriceRange']
    ) {
      if (this.usePriceRange) {
        this.syncRangeThumbsFromInputs();
      }
      this.cdr.markForCheck();
    }
  }

  /** Abre grupos que contienen la categoría activa o algún slug seleccionado. */
  private syncExpandedGroupsFromRoute(): void {
    const next = new Set<string>();
    if (this.isCatalogAllView && this.slugsForCheckboxUi().length > 0) {
      const slugs = new Set(this.slugsForCheckboxUi());
      for (const top of this.topLevelSidebarCategories()) {
        if (slugs.has(top.titleUrl)) {
          next.add(top.titleUrl);
        }
        for (const s of this.sidebarChildren(top.titleUrl)) {
          if (slugs.has(s.titleUrl)) {
            next.add(top.titleUrl);
          }
        }
      }
    } else if (!this.isCatalogAllView && this.activeCategory) {
      const active = this.activeCategory;
      for (const top of this.topLevelSidebarCategories()) {
        if (top.titleUrl === active) {
          next.add(top.titleUrl);
          break;
        }
        if (this.sidebarChildren(top.titleUrl).some((s) => s.titleUrl === active)) {
          next.add(top.titleUrl);
          break;
        }
      }
    }
    this.expandedParents.set(next);
  }

  isParentExpanded(parentTitleUrl: string): boolean {
    return this.expandedParents().has(parentTitleUrl);
  }

  toggleParentGroup(parentTitleUrl: string, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    const cur = new Set(this.expandedParents());
    if (cur.has(parentTitleUrl)) {
      cur.delete(parentTitleUrl);
    } else {
      cur.add(parentTitleUrl);
    }
    this.expandedParents.set(cur);
  }

  /**
   * Alterna el slug en el filtro (suma o quita).
   * `preventDefault` evita el cambio nativo del checkbox: si no, el DOM y `[checked]`
   * se pelean con la URL y parece que “solo una” queda seleccionada.
   */
  onCategoryCheckboxClick(slug: string, ev: Event): void {
    ev.preventDefault();
    ev.stopPropagation();
    const slugsArr = this.slugsForCheckboxUi();
    const base = new Set(slugsArr);
    const wasChecked = this.slugSelectedInUi(slug, slugsArr);

    if (wasChecked) {
      if (base.has(slug)) {
        base.delete(slug);
      } else {
        const parent = this.findParentTitleUrl(slug);
        if (parent != null && base.has(parent)) {
          base.delete(parent);
          for (const sub of this.sidebarChildren(parent)) {
            if (sub.titleUrl !== slug) {
              base.add(sub.titleUrl);
            }
          }
        }
      }
    } else {
      base.add(slug);
    }

    this.maybeCollapseParentSlugs(base);
    const next = [...base];
    this.categorySlugsUi.set(next);
    this.categoriesFilterChange.emit(next);
    this.cdr.markForCheck();
  }

  onClearCategoryFiltersClick(): void {
    this.clearCategoryFilters.emit();
  }

  onClearAllFiltersClick(): void {
    this.clearAllFiltersRequest.emit();
  }

  /** Precio mínimo del catálogo actual (API). */
  catalogPriceFloor(): number {
    const n = Number(this.minPrice);
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  /** Ruta activa o selección múltiple bajo un padre. */
  isActiveUnderParent(parentTitleUrl: string): boolean {
    if (this.isCatalogAllView && this.slugsForCheckboxUi().length > 0) {
      const slugs = this.slugsForCheckboxUi();
      if (slugs.includes(parentTitleUrl)) {
        return true;
      }
      return this.sidebarChildren(parentTitleUrl).some((s) => slugs.includes(s.titleUrl));
    }
    const active = this.activeCategory;
    if (!active) {
      return false;
    }
    if (active === parentTitleUrl) {
      return true;
    }
    return this.sidebarChildren(parentTitleUrl).some((s) => s.titleUrl === active);
  }

  /** Opción mostrada en el trigger del `mat-select` de orden. */
  sortTriggerOption(): { name: string; id: string; icon?: string } {
    const list = this.sortOptions;
    if (!list?.length) {
      return { name: 'Newest', id: 'newest', icon: 'sort' };
    }
    const id = (this.choosenSort || 'newest').trim();
    return list.find((o) => o.id === id) ?? list[0];
  }

  onInputChange($event: string): void {
    const next = ($event || 'newest').trim();
    const cur = (this.choosenSort || 'newest').trim();
    /** Evita emit al montar / abrir drawer: ngModelChange repetido disparaba scroll al inicio en el catálogo. */
    if (next === cur) {
      return;
    }
    this.changeSort.emit(next);
  }

  onChangePrice(value: number): void {
    of('change_price')
      .pipe(take(1), delay(200))
      .subscribe(() => {
        this.changePrice.emit(value);
      });
  }

  /** Categorías de primer nivel para el panel de filtros (Firestore). */
  topLevelSidebarCategories(): Category[] {
    const list = this.categories || [];
    return list
      .filter((c) => !c.parentTitleUrl && !c.virtualNav && !c.menuHidden)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }

  /** Subcategorías enlazadas por `parentTitleUrl` (p. ej. bajo Mujeres). */
  sidebarChildren(parentTitleUrl: string): Category[] {
    const list = this.categories || [];
    return list
      .filter((c) => c.parentTitleUrl === parentTitleUrl && !c.virtualNav)
      .sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }
}
