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
5. **Límites en `vercel.json` (Hobby):** memoria y duración de función no pueden ser las de Pro (p. ej. 3008 MB o 60 s) o el *deploy* falla. En el repo van **1024 MB** y **10 s**; con **Vercel Pro** puedes subir en *Project → Settings → Functions* `Max Duration` (hasta 60+ s) y memoria, o ajusta `vercel.json` a esos valores solo si el plan lo permite.

Notas: las funciones usan límite de memoria y tiempo; `vercel.json` ajusta `maxDuration` y `includeFiles` del build `server/dist/`. En local, `node server/dist/main` sigue sirviendo para probar el API clásico.

**Comprobar en el navegador o con `curl` (sin levantar Nest, no 504):** abre `https://<tu-proyecto>.vercel.app/api/health` — debería dar JSON `{ "ok": true, "nest": "not-loaded", ... }` y en **Functions → Logs** una línea `liveness 200 (sin Nest)`. Así verificas que Vercel ejecuta el handler; el resto de `/api/...` sigue pasando por Nest y puede 504 con plan Hobby. `/favicon.ico` se responde 204 en el propio `api/index` (evita 504 inútiles en previews).

**Logs de diagnóstico (Vercel → Runtime / Functions):** el *handler* de `api/index.ts` imprime `[sj-aura:api] boot env` (sin secretos). Tras levantar Nest, el **servidor** escribe con prefijo **`[SJ AURA]`:** bloque *Inicio de la aplicación*, JSON con plataforma, CORS, si hay JSON de servicio (longitud, no el contenido), luego CORS/ sesión, Firebase/Firestore conectado o error. En local, lo verás en la consola. Opcional: `SJ_AURA_LOG_REQUESTS=1` para un log por petición HTTP.

**504 / `FUNCTION_INVOCATION_TIMEOUT` (Vercel):** el *cold start* de Nest en serverless a menudo **supera el tope** que impone el plan. En **Hobby** el *timeout* de función ronda **10 s**; `maxDuration: 60` en `vercel.json` **sólo tiene efecto con plan Pro** (y, en el panel, *Settings → Functions →* **Function Max Duration** debe coincidir). CORS en el navegador con 504 es el típico error secundario (el *gateway* no añade CORS a la respuesta de timeout). El front ya encadena *config* y *traducciones* en el arranque. **Rutas sin quedarse en 504:** (A) [Vercel Pro](https://vercel.com/docs/plans) + 60 s + opc. *min instances* 1, o (B) API en **Render** (abajo).

## 2b. API (Nest) en [Render](https://render.com) (recomendado: sin tope 10s de Vercel Hobby)

En la raíz del repo está `render.yaml` (Build: `npm install && npm run build:server` · Start: `node server/dist/main.js`).

1. Cuenta en [render.com](https://render.com) (GitHub).
2. **No uses Docker** para este API si el panel te ofrece *Language: Docker* con el repo tal cual: el `Dockerfile` de la raíz compila el **SSR** de Angular, no el Nest. Elige **Node** o, mejor, **New → Blueprint** e importa el `render.yaml` (build `npm install && npm run build:server`, start `node server/dist/main.js`).
3. Nombre del servicio (p. ej. `sj-aura-shop`): la URL pública será `https://<nombre>.onrender.com` — debe coincidir con `apiUrl` en `client/.../environment.prod.ts`.
4. En el servicio → **Environment** → añade (mismas claves que en Vercel):
   - **`ORIGIN`** — `https://ecommerce-afcfb-db103.web.app,https://ecommerce-afcfb-db103.firebaseapp.com` (o solo la `.web.app` si basta; sin barra final).
   - **`FIREBASE_SERVICE_ACCOUNT`** — el JSON de la cuenta de servicio, **en una sola línea** (minificado).
   - **`COOKIE_KEY`** — la misma cadena larga que en Vercel.
   - Opcional: `FIREBASE_PROJECT_ID`, `FIRESTORE_DATABASE_ID`, Stripe, SendGrid, etc., si las usas.
   - **`CROSS_SITE_COOKIES=1`** — ya suele fijar el blueprint; el API no está en `vercel.app` pero el front y el back siguen en dominios distintos, así que las cookies de sesión y `SameSite` son correctas (ver `setAppDB.ts`).
5. **Deploy** y espera a que pase *build* (varios minutos el primero). Prueba: `https://<tu-servicio>.onrender.com/api/eshop/config` o `GET /api/health/firebase` (Firebase). Tras el arranque debería ser 200, no 504.
6. **Front:** en `environment.prod.ts` usa la misma URL `https://<tu-servicio>.onrender.com` en `apiUrl` y `prerenderUrl`; luego `npm run deploy:hosting`.
7. **Plan free:** el servicio puede **dormir**; el primer acceso puede tardar. Plan de pago evita el *sleep*.

## 3. Front (Angular) en Firebase Hosting

1. En `client/src/environments/environment.prod.ts`, rellena:
   - `apiUrl` y `prerenderUrl` — URL pública de la **API** en Render, p. ej. `https://sj-aura-shop.onrender.com` (sin barra al final; debe ser el *service name* de Render)
   - `siteUrl` — URL pública del sitio (Firebase: `https://<id>.web.app` o custom domain)
2. Construcción y despliegue (el script de tu `package.json` apunta a un *site* concreto):

   ```bash
   npm run deploy:hosting
   ```

   Comprueba en `firebase.json` el *site* de hosting; si hace falta, alinea con tu proyecto en la consola Firebase o usa `firebase target:apply hosting <alias> <site>`.

3. CORS: el valor de **`ORIGIN`** en el back (Vercel o **Render**) debe listar el dominio de esta tienda en Firebase (`https://…web.app` y, si aplica, `…firebaseapp.com` o custom). Sin eso, el navegador bloquea las peticiones al API.

## 4. Sesión (cookies) entre Front y API en dominios distintos

Front (Firebase) y API en otro dominio (Vercel o **Render**): **cross-site**. En el servidor, `VERCEL=1` o **`CROSS_SITE_COOKIES=1`** hace que la cookie de sesión use `SameSite=none` y `Secure` (ver `setAppDB.ts`). Todo en **HTTPS** en producción.

## 5. Referencias

- [Vercel — Express en serverless](https://vercel.com/guides/using-express-with-vercel) (misma idea: `serverless-http` y una función bajo `api/`)
- Plan de migración Firebase: `PLAN_MIGRACION_FIREBASE.md` en esta carpeta
