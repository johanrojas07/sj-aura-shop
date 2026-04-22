import { Category } from '../models';

function sortByPosition(a: Category, b: Category): number {
  return (a.position ?? 0) - (b.position ?? 0);
}

export function topNavCategories(cats: Category[] | null | undefined): Category[] {
  return (cats || [])
    .filter((c) => !c.parentTitleUrl && !c.menuHidden)
    .sort(sortByPosition);
}

/** Subcategorías para mega menú (Mujeres, Hombres, etc.). */
export function megaChildrenFor(
  cats: Category[] | null | undefined,
  parentTitleUrl: string,
): Category[] {
  return (cats || [])
    .filter((c) => c.parentTitleUrl === parentTitleUrl)
    .sort(sortByPosition);
}
