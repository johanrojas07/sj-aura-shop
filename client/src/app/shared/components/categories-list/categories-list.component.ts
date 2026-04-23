import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

import { Category } from '../../models';
import { CarouselComponent } from '../carousel/carousel.component';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';
import { TranslatePipe } from '../../../pipes/translate.pipe';

@Component({
    selector: 'app-categories-list',
    templateUrl: './categories-list.component.html',
    styleUrls: ['./categories-list.component.scss'],
    changeDetection: ChangeDetectionStrategy.OnPush,
    imports: [CarouselComponent, RouterLink, CommonModule, TranslatePipe]
})
export class CategoriesListComponent {
  @Input() categories: Category[] = [];
  @Input() lang: string;
  @Input() withSlider = true;
  /**
   * En carrusel: incluye subcategorías (`menuHidden`) para más slides sin meterlas en el mega menú.
   * En rejilla (`withSlider=false`) se ignora y se usa el filtro compacto.
   */
  @Input() expandCarouselCategories = false;
  /** Intervalo del carrusel (ms); solo aplica si `carouselAutoAdvance` es true. */
  @Input() carouselIntervalMs = 18000;
  /** Puntos y anillo de progreso (deshabilitado en home: carrusel manual). */
  @Input() carouselShowDots = false;
  @Input() carouselAutoAdvance = false;

  /** Categorías visibles según contexto (menú vs carrusel ampliado). */
  displayCategories(): Category[] {
    const list = this.categories ?? [];
    const filtered = list.filter((c) => {
      if (c.virtualNav) {
        return false;
      }
      if (this.expandCarouselCategories && this.withSlider) {
        return true;
      }
      return !c.menuHidden && !c.parentTitleUrl;
    });
    return [...filtered].sort((a, b) => (a.position ?? 0) - (b.position ?? 0));
  }
}
