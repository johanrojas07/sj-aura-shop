/** Tags demasiado amplios para cruzar por API `category=` (se prefiere una subcategoría). */
const BROAD_CATEGORY_TAGS = new Set([
  'mujeres',
  'hombres',
  'moda',
  'en-promocion',
  'esenciales',
  'exclusivos',
  'unicolor',
  'casual',
  'hm-esenciales',
  'hm-deportivo',
]);

/**
 * Elige un slug de categoría a partir de los tags del producto (Firestore / `tags` en producto).
 * Prioriza el tag más específico (no listado en `BROAD_CATEGORY_TAGS`).
 */
export function pickCategorySlugFromTags(tags: string[] | undefined | null): string {
  const list = (tags || []).map((t) => String(t).toLowerCase().trim()).filter(Boolean);
  if (!list.length) {
    return '';
  }
  for (let i = list.length - 1; i >= 0; i--) {
    const t = list[i];
    if (!BROAD_CATEGORY_TAGS.has(t)) {
      return t;
    }
  }
  return list[list.length - 1];
}
