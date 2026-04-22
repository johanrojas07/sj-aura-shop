import { mergeApplicationConfig, ApplicationConfig } from '@angular/core';
import { provideServerRendering, withRoutes, RenderMode } from '@angular/ssr';
import { provideNoopAnimations } from '@angular/platform-browser/animations';

import { appConfig } from './app.config';

/**
 * Todas las URLs en SSR (sin SSG en build). Evita que el extractor de rutas
 * cargue cada `loadChildren` como si fuera pre-render, lo que en Windows/Vite
 * a veces falla con chunks huérfanos (`Failed to load url /chunk-*.mjs`).
 */
const serverConfig: ApplicationConfig = {
  providers: [
    provideServerRendering(
      withRoutes([{ path: '**', renderMode: RenderMode.Server }]),
    ),
    /** Sin esto, `provideAnimations()` del browser config deja tokens de animación inválidos en SSR → fallos en DI (p. ej. Material). */
    provideNoopAnimations(),
  ],
};

export const config = mergeApplicationConfig(appConfig, serverConfig);
