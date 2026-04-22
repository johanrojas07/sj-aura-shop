import { Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { CommonModule } from '@angular/common';

import { Category } from '../../models';
import { languages } from '../../constants';
import { megaChildrenFor, topNavCategories } from '../../utils/nav-categories';

@Component({
  selector: 'app-nav-shop-menu',
  standalone: true,
  imports: [CommonModule, RouterLink],
  templateUrl: './nav-shop-menu.component.html',
  styleUrl: './nav-shop-menu.component.scss',
})
export class NavShopMenuComponent {
  /** Valor por defecto hasta que el padre emita idioma (evita estados inválidos en el primer CD). */
  lang = input<string>(languages[0]);
  categories = input<Category[]>([]);

  readonly topNav = computed(() => topNavCategories(this.categories()));

  childrenFor(parentSlug: string): Category[] {
    return megaChildrenFor(this.categories(), parentSlug);
  }

  /** Cualquier categoría de primer nivel con hijos en Firestore puede usar mega menú. */
  showMegaFor(cat: Category): boolean {
    if (cat.parentTitleUrl || cat.virtualNav) {
      return false;
    }
    return this.childrenFor(cat.titleUrl).length > 0;
  }
}
