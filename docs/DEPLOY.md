# Despliegue: SJ AURA (repo [sj-aura-shop](https://github.com/johanrojas07/sj-aura-shop))

## 1. Git (monorepo único)

En la **raíz del proyecto** (donde está `package.json` y `vercel.json`):

```bash
git init
git add .
git commit -m "chore: SJ AURA monorepo (Angular + Nest + Vercel + Firebase)"
git branch -M main
git remote add origin https://github.com/johanrojas07/sj-aura-shop.git
git push -u origin main
```

Si el remoto ya existe, usa: `git remote set-url origin https://github.com/johanrojas07/sj-aura-shop.git`

## 2. API (Nest) en [Vercel](https://vercel.com)

1. *New project* → importar `johanrojas07/sj-aura-shop`.
2. **Framework Preset:** Other, o dejar en automático; lo importante:
   - **Build Command:** `npm run vercel-build` o `npm run build:server`
   - **Install Command:** `npm install`
   - **Output Directory:** `public` (carpeta mínima con `index.html` para que Vercel acepte el despliegue; el tráfico sigue yendo a la API con las reglas de `vercel.json`).
3. Añade **variables de entorno** (Production y Preview según toque), al menos:
   - `ORIGIN` — orígenes del front, separados por comas, por ejemplo: `https://TU-PROYECTO.web.app,https://tudominio.com`
   - **`FIREBASE_SERVICE_ACCOUNT`** (obligatoria en Vercel) — el JSON de la cuenta de servicio, en **una sola línea** (o minificado). En entornos sin clave, el Admin SDK puede colgar o dar 504 en el primer acceso a Firestore.
   - Mismas claves que en local: `COOKIE_KEY`, `FIREBASE_PROJECT_ID` si hace falta, Stripe, `NODE_ENV=production` si aplica, etc. (O `GOOGLE_APPLICATION_CREDENTIALS` apuntando a un archivo empaquetado en el despliegue, en vez del JSON en env.)
4. Tras el despligue, anota la URL: `https://<proyecto>.vercel.app`.

Notas: las funciones usan límite de memoria y tiempo; `vercel.json` ajusta `maxDuration` y `includeFiles` del build `server/dist/`. En local, `node server/dist/main` sigue sirviendo para probar el API clásico.

**Logs de diagnóstico (Vercel → Runtime / Functions):** en cada *cold start* el handler imprime `[sj-aura:api] boot env` (orígenes permitidos, si hay JSON de Firebase sin el contenido, `COOKIE_KEY` solo “set: true/false”, región) y, tras levantar Nest, `[sj-aura:api] createNestServer ok, ms` con el tiempo de arranque. Opcional: en variables de entorno añade `SJ_AURA_LOG_REQUESTS=1` (Production) para un log por petición con `method`, `url`, `origin` y si CORS hace match.

**504 / `FUNCTION_INVOCATION_TIMEOUT` (Vercel):** el *cold start* de Nest en serverless a menudo **supera el tope** que impone el plan. En **Hobby** el *timeout* de función ronda **10 s**; `maxDuration: 60` en `vercel.json` **sólo tiene efecto con plan Pro** (y, en el panel, *Settings → Functions →* **Function Max Duration** debe coincidir). CORS en el navegador con 504 es el típico error secundario (el *gateway* no añade CORS a la respuesta de timeout). El front ya encadena *config* y *traducciones* en el arranque. **Rutas sin quedarse en 504:** (A) [Vercel Pro](https://vercel.com/docs/plans) + 60 s + opc. *min instances* 1, o (B) API en **Render** (abajo).

## 2b. API (Nest) en [Render](https://render.com) (alternativa sin límite 10s)

En la raíz del repo: `render.yaml`. Evita el modelo serverless estricto: el proceso hace `node server/dist/main.js` y atiende hasta el **sleep** del plan *free*.

1. Crea cuenta en [Render](https://render.com) → **New** → *Blueprint* (importa el `render.yaml`) o *Web Service* (conecta el repo `sj-aura-shop`, misma *build* / *start* que en el yaml).
2. Añade las **mismas** variables de entorno que en Vercel: `ORIGIN` (tus `https://…web.app`), `FIREBASE_SERVICE_ACCOUNT` (JSON), `COOKIE_KEY`, `FIREBASE_PROJECT_ID`, etc. Añade **`CROSS_SITE_COOKIES=1`** (el front y el API en dominios distintos: cookies; ya está de ejemplo en `render.yaml`).
3. Tras el deploy, copia la URL pública (`https://sj-aura-api.onrender.com` o similar) y pégala en `client/src/environments/environment.prod.ts` como `apiUrl` (y en `prerenderUrl` si aplica). Vuelve a `npm run deploy:hosting`.
4. *Free* puede poner el servicio en *sleep* tras inactividad: la **primera** visita tarda mientras el dyno se despierta (puede ser 30 s–1 min); luego responde normal. Plan de pago desactiva el *sleep*.

## 3. Front (Angular) en Firebase Hosting

1. En `client/src/environments/environment.prod.ts`, rellena:
   - `apiUrl` — URL pública de la API en Vercel (sin `/` al final), p. ej. `https://<proyecto>.vercel.app`
   - `siteUrl` — URL pública del sitio (Firebase: `https://<id>.web.app` o custom domain)
2. Construcción y despliegue (el script de tu `package.json` apunta a un *site* concreto):

   ```bash
   npm run deploy:hosting
   ```

   Comprueba en `firebase.json` el *site* de hosting; si hace falta, alinea con tu proyecto en la consola Firebase o usa `firebase target:apply hosting <alias> <site>`.

3. CORS: en el panel de Vercel → *Environment Variables* del proyecto `sj-aura-api-three`, añade **`ORIGIN`** con al menos: `https://ecommerce-afcfb-db103.web.app` (y el dominio custom si lo conectas), separado por comas. Sin eso, el front en Firebase no podrá llamar al API por CORS.

## 4. Sesión (cookies) entre Front y API en dominios distintos

Front en Firebase y API en Vercel = **cross-site**: en el servidor, con `VERCEL=1` las cookies de sesión usan `SameSite=none` y `Secure` (ver `setAppDB.ts`). Todo debe ser **HTTPS** en producción. Si en desarrollo hace falta otro criterio, documenta o usa `CROSS_SITE_COOKIES` según el código.

## 5. Referencias

- [Vercel — Express en serverless](https://vercel.com/guides/using-express-with-vercel) (misma idea: `serverless-http` y una función bajo `api/`)
- Plan de migración Firebase: `PLAN_MIGRACION_FIREBASE.md` en esta carpeta
