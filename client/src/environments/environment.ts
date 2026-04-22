// The file contents for the current environment will overwrite these during build.
// The build system defaults to the dev environment which uses `environment.ts`, but if you do
// `ng build --env=prod` then `environment.prod.ts` will be used instead.
// The list of which env maps to which file can be found in `.angular-cli.json`.

import { firebaseWebConfig } from './firebase-web.config';

export const environment = {
  production: false,
  prerenderUrl: 'http://localhost:4000',
  apiUrl: 'http://localhost:4000',
  /** Origen público del front (JSON-LD, og absolutos en dev). Producción: tu dominio real. */
  siteUrl: 'http://localhost:4200',
  /** Auth y SDK cliente: valores en `firebase-web.config.ts`. */
  firebase: firebaseWebConfig,
};
