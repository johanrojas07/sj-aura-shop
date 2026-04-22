import { Pipe, PipeTransform } from '@angular/core';

function toMillis(value: unknown): number | null {
  if (value === null || value === undefined) {
    return null;
  }
  if (typeof value === 'number' && Number.isFinite(value)) {
    return value < 1e12 ? Math.round(value * 1000) : Math.round(value);
  }
  if (typeof value === 'string') {
    const t = Date.parse(value);
    return Number.isNaN(t) ? null : t;
  }
  if (value instanceof Date) {
    return value.getTime();
  }
  if (typeof value === 'object' && 'seconds' in (value as object)) {
    const s = Number((value as { seconds: number }).seconds);
    return Number.isFinite(s) ? s * 1000 : null;
  }
  return null;
}

/** Idiomas soportados explícitamente; el resto usa inglés. */
type RelLang = 'es' | 'en';

@Pipe({
  name: 'relativeTime',
  pure: true,
  standalone: true,
})
export class RelativeTimePipe implements PipeTransform {
  transform(value: unknown, lang?: string | null): string {
    const ms = toMillis(value);
    if (ms === null) {
      return '—';
    }
    const l = (lang === 'es' ? 'es' : 'en') as RelLang;
    const diffSec = Math.floor((Date.now() - ms) / 1000);
    if (diffSec < 0) {
      return l === 'es' ? 'fecha futura' : 'in the future';
    }
    if (diffSec < 45) {
      return l === 'es' ? 'hace un momento' : 'just now';
    }
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) {
      return l === 'es' ? pluralEs(diffMin, 'minuto', 'minutos', true) : pluralEn(diffMin, 'minute');
    }
    const diffHr = Math.floor(diffMin / 60);
    if (diffHr < 24) {
      return l === 'es' ? pluralEs(diffHr, 'hora', 'horas', true) : pluralEn(diffHr, 'hour');
    }
    const diffDay = Math.floor(diffHr / 24);
    if (diffDay < 7) {
      return l === 'es' ? pluralEs(diffDay, 'día', 'días', true) : pluralEn(diffDay, 'day');
    }
    const weeks = Math.floor(diffDay / 7);
    const remDays = diffDay % 7;
    if (remDays === 0) {
      return l === 'es' ? pluralEs(weeks, 'semana', 'semanas', true) : pluralEn(weeks, 'week');
    }
    if (l === 'es') {
      const weekPart = pluralEs(weeks, 'semana', 'semanas', true);
      const dayPart = pluralEs(remDays, 'día', 'días', false);
      return `${weekPart} y ${dayPart}`;
    }
    const w = weeks === 1 ? '1 week' : `${weeks} weeks`;
    const d = remDays === 1 ? '1 day' : `${remDays} days`;
    return `${w} and ${d} ago`;
  }
}

function pluralEs(n: number, one: string, many: string, withHace: boolean): string {
  const body = n === 1 ? `1 ${one}` : `${n} ${many}`;
  return withHace ? `hace ${body}` : body;
}

function pluralEn(n: number, unit: string): string {
  const body = n === 1 ? `1 ${unit}` : `${n} ${unit}s`;
  return `${body} ago`;
}
