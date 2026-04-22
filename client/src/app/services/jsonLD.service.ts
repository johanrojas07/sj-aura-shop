import { DOCUMENT } from '@angular/common';
import { Inject, Injectable } from '@angular/core';

import { environment } from '../../environments/environment';
import { SITE_BRAND_NAME, SITE_LOGO_PATH } from '../shared/site-media.defaults';

@Injectable({
  providedIn: 'root',
})
export class JsonLDService {
  scriptType = 'application/ld+json';

  websiteSchema: Record<string, unknown>;
  orgSchema: Record<string, unknown>;

  constructor(@Inject(DOCUMENT) private _document: Document) {
    const base =
      (environment.siteUrl || '').replace(/\/$/, '') ||
      (!environment.production ? 'http://localhost:4200' : '');
    const abs = (path: string) => {
      if (!path || path.startsWith('http')) {
        return path;
      }
      return base ? `${base}${path}` : path;
    };

    this.websiteSchema = {
      '@context': 'https://schema.org',
      '@type': 'WebSite',
      url: base || undefined,
      name: SITE_BRAND_NAME,
      description:
        'Moda y accesorios en SJ AURA. Compra online con envío y atención personalizada.',
      image: abs(SITE_LOGO_PATH),
      keywords: 'moda, boutique, tienda online, ropa, accesorios, Aura Boutique',
    };

    this.orgSchema = {
      '@context': 'https://schema.org',
      '@type': 'Organization',
      name: SITE_BRAND_NAME,
      url: base || undefined,
      logo: abs(SITE_LOGO_PATH),
      description: 'Tienda de moda SJ AURA.',
    };
  }

  removeStructuredData(className?: string): void {
    const els = [];
    ['structured-data', 'structured-data-org', className]
      .filter(Boolean)
      .forEach((c) => {
        els.push(...Array.from(this._document.head.getElementsByClassName(c as string)));
      });
    els.forEach((el) => this._document.head.removeChild(el));
  }

  insertSchema(schema, className = 'structured-data'): void {
    let script;
    let shouldAppend = false;
    if (this._document.head.getElementsByClassName(className).length) {
      script = this._document.head.getElementsByClassName(className)[0];
    } else {
      script = this._document.createElement('script');
      shouldAppend = true;
    }
    script.setAttribute('class', className);
    script.type = this.scriptType;
    script.text = JSON.stringify(schema);
    if (shouldAppend) {
      this._document.head.appendChild(script);
    }
  }
}
