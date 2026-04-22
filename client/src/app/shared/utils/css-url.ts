/** Valor CSS `url("…")` seguro para URLs con `&` (p. ej. descarga de Firebase Storage). */
export function cssUrl(value: string): string {
  const v = String(value ?? '').trim();
  if (!v) {
    return '';
  }
  const esc = v.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `url("${esc}")`;
}
