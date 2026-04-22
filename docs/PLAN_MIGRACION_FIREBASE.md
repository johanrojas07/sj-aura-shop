# Plan de trabajo: eshop_mean-master → Firebase (Firestore + Auth)

**Estado del código (actual):** el backend en `server/src` ya **no usa MongoDB ni Mongoose**. La persistencia es **Firestore** y la autenticación de API es **Firebase Auth (ID token + Admin SDK)**. El front sigue siendo la misma app Angular; solo cambia el origen de datos vía la API Nest.

Lo siguiente en este documento quedó como **referencia histórica** del plan por fases; muchas fases ya están aplicadas en el repo.

---

## Principios de seguridad del cambio

1. **Una fase, un merge** (o un commit claro) y probar antes de seguir.
2. **No quitar Mongo** hasta que el módulo equivalente en Firestore esté probado (o usar variables de entorno para alternar).
3. **Prefijos o versión de API** (`/api/v2/...`) solo si necesitas convivencia larga; si no, usa **feature flags** (`USE_FIREBASE_AUTH=true`) en el mismo controlador.
4. Tras cada fase: `nest build` en `server/` y smoke test manual de endpoints críticos (lista de productos, login actual si aún existe, carrito).
5. Mantener una **checklist manual** al final del documento (copiar a issue o notas).

---

## Estado actual (referencia rápida)

| Área | Ubicación principal |
|------|---------------------|
| Mongo global | `server/src/app.module.ts` (`MongooseModule.forRoot`) |
| Sesión + Mongo store | `server/src/setAppDB.ts` |
| JWT / Passport | `server/src/auth/auth.module.ts`, `strategy/jwt.strategy.ts`, guards `AuthGuard('jwt')` |
| Usuario | `server/src/auth/schemas/user.schema.ts`, `auth.service.ts` |
| Productos | `server/src/products/*` |
| Pedidos | `server/src/orders/*` |
| Carrito | `server/src/cart/*` |
| CMS tienda | `server/src/eshop/*` |
| Traducciones | `server/src/translations/*` |
| Admin | `server/src/admin/*` |

---

## Fase 0 — Preparación (sin tocar lógica)

**Entregables**

- [ ] Rama Git dedicada (`feature/firebase-migration` o similar).
- [ ] Proyecto Firebase (dev/staging) creado: Firestore habilitado, Authentication (email/Google según necesites).
- [ ] Cuenta de servicio descargada o ADC configurada en tu máquina; **no** commitear JSON de claves.
- [ ] Archivo `.env.example` en `server/` (o raíz) documentando nuevas variables (ver Fase 1). **Ya creado:** `server/.env.example` — ampliarlo cuando añadas flags reales (`USE_FIREBASE_AUTH`, etc.).

**Criterio de “listo”**: puedes arrancar el servidor como hasta ahora; cero cambios de código obligatorio.

---

## Fase 1 — Firebase Admin “colgado” (Mongo intacto)

**Objetivo**: que Nest arranque y pueda hablar con Firebase **sin** usarlo en rutas de negocio todavía.

**Tareas**

- [ ] Dependencia `firebase-admin` en el `package.json` del workspace que compile el server (revisar si es monorepo único en raíz).
- [ ] Nuevo módulo global, por ejemplo:
  - `server/src/firebase/firebase.providers.ts`
  - `server/src/firebase/firebase.module.ts`
- [ ] Importar `FirebaseModule` en `app.module.ts` **junto** con `MongooseModule.forRoot` (ambos activos).
- [ ] Endpoint de diagnóstico **opcional** y protegido por entorno, p. ej. `GET /api/health/firebase` que solo compruebe `admin.apps.length` o lectura trivial (o deshabilitado en prod).

**Variables de entorno (ejemplo)**

- `FIREBASE_PROJECT_ID` (si hace falta explícito)
- Uso de `GOOGLE_APPLICATION_CREDENTIALS` apuntando al JSON local **solo en dev**

**Criterio de “listo”**: `npm run build:server` (o script equivalente) OK; app levanta; Mongo sigue siendo la única fuente de datos de negocio.

---

## Fase 2 — Contratos y carpeta de persistencia (aún sin migrar datos)

**Objetivo**: preparar **interfaces** y **repositorios vacíos o stub** para no mezclar Firestore en los servicios gigantes de golpe.

**Tareas**

- [ ] Definir convención de colecciones (`users`, `products`, `orders`, …) en un solo sitio, p. ej. `server/src/firebase/collections.ts`.
- [ ] Tipos TypeScript para documentos Firestore (sustitutos conceptuales de `*.model.ts` que extendían `Document` de Mongoose donde aplique).
- [ ] Crear `*.repository.ts` por dominio **con métodos no usados aún** o usados solo desde un test manual temporal.

**Criterio de “listo”**: compilación OK; ningún controlador cambiado aún (o solo inyección preparada sin llamar al repo).

---

## Fase 3 — Autenticación Firebase en paralelo (JWT actual sigue)

**Objetivo**: añadir validación de **ID token** de Firebase **sin** quitar login JWT actual.

**Tareas**

- [ ] `FirebaseAuthGuard` + decorador `FirebaseUid` / `FirebaseUser` (token decodificado).
- [ ] Nuevo endpoint, p. ej. `GET /api/auth/me-firebase` protegido solo con `FirebaseAuthGuard`, que devuelva `{ uid, email }` del token (y más adelante perfil Firestore).
- [ ] Variable `USE_FIREBASE_AUTH` (opcional): cuando sea `true` en rutas elegidas, usar el nuevo guard; cuando `false`, comportamiento actual `AuthGuard('jwt')`.

**Front (Angular)**: en fase tardía o sub-fase: interceptor que envíe `Authorization: Bearer <idToken>` cuando el usuario esté logueado con Firebase SDK. **No es obligatorio en esta fase** si solo pruebas con Postman.

**Criterio de “listo”**: con token Firebase válido, el nuevo endpoint responde 200; con JWT viejo, endpoints viejos siguen igual.

---

## Fase 4 — Perfil de usuario en Firestore (convivencia con Mongo)

**Objetivo**: documento `users/{uid}` en Firestore con `roles`, `email`, etc., sincronizado o creado al primer login Firebase.

**Tareas**

- [ ] `UsersRepository` / `UsersService` (Firestore): `getByUid`, `upsertProfile`.
- [ ] Tras `verifyIdToken`, cargar perfil y adjuntar a `request.user` para reutilizar `RolesGuard` con el mismo shape (`roles[]`) que espera hoy.
- [ ] Script o endpoint admin **solo desarrollo** para marcar un usuario como admin (o usar custom claims vía Admin SDK en fase posterior).

**Criterio de “listo”**: `RolesGuard` funciona con usuario cargado desde Firestore en rutas de prueba; admin Mongo **aún** puede coexistir hasta decidir corte.

---

## Fase 5 — Sustitución gradual de Mongoose por dominio

Orden recomendado (menos acoplamiento → más crítico):

### 5.1 Traducciones / configuración CMS (bajo riesgo)

- [ ] `translations`, `eshop` (config, pages, themes): lecturas principalmente; menos efectos secundarios.
- [ ] Reemplazar `InjectModel` en servicios por repositorio Firestore.
- [ ] Pruebas: mismos JSON de respuesta que consumía el front.

### 5.2 Productos y categorías

- [ ] Índices Firestore para las consultas que reemplazan `find` + `sort`.
- [ ] **Paginación**: diseñar cursores o límites; reemplazar `paginate` de Mongoose (impacto alto — planificar índices y posible simplificación de filtros).
- [ ] Búsqueda texto: decisión explícita (prefijos, campo `keywords`, o servicio externo).

### 5.3 Pedidos (orders)

- [ ] Mapear `_user` (ObjectId) → `userId` (UID string de Firebase) cuando el auth ya sea Firebase de forma estable.
- [ ] Stripe u otros flujos: mantener lógica; solo cambiar persistencia.

### 5.4 Carrito

- [ ] Desacoplar de **sesión Express** si hoy depende de `session` en Mongo (`setAppDB.ts`): carrito por `userId` o `guestId` en Firestore/cookie.
- [ ] Convivencia: periodo donde carrito se lee de sesión antigua o del nuevo store (solo uno en producción al final).

### 5.5 Admin (imágenes, etc.)

- [ ] Subida de archivos: valorar **Firebase Storage** además de Firestore para metadatos, o mantener almacenamiento actual hasta una fase dedicada.

**Por cada subfase**: quitar `MongooseModule.forFeature` **solo** de ese módulo cuando Firestore cubra el 100% de sus rutas.

**Criterio de “listo” (global Fase 5)**: ningún `InjectModel` restante en ese dominio; tests manuales del flujo de usuario para ese dominio.

---

## Fase 6 — Corte de autenticación

**Tareas**

- [ ] Front: login/registro vía Firebase SDK; retirar o deprecar `POST /api/auth/signin` y `signup` del template cuando el front ya no los use.
- [ ] Sustituir `AuthGuard('jwt')` por `FirebaseAuthGuard` en controladores restantes.
- [ ] Eliminar `JwtModule`, `JwtStrategy`, y dependencias no usadas del `auth.module.ts`.
- [ ] Migrar usuarios reales: importación a Firebase Auth + documentos `users/{uid}` (script aparte, carpeta `tools/`).

**Criterio de “listo”**: no hay dependencia de `JWT_SECRET` para usuarios finales; Admin solo valida tokens Firebase.

---

## Fase 7 — Sesiones y limpieza de Mongo

**Tareas**

- [ ] Eliminar `connect-mongo` / `MongoStore` de `setAppDB.ts` si ya no hay Passport session para Google server-side; o sustituir store por Redis/memoria según decisión.
- [ ] Quitar `MongooseModule.forRoot` de `app.module.ts` cuando **todos** los módulos estén en Firestore.
- [ ] Eliminar paquetes: `mongoose`, `@nestjs/mongoose`, `passport-jwt`, etc., si ya no se usan.
- [ ] Pasar linter y build de cliente si cambiaron environments.

**Criterio de “listo”**: arranque limpio solo con Firebase + (opcional) Redis/sesión mínima.

---

## Fase 8 — Migración de datos desde tu base actual

**Tareas**

- [ ] Exportar datos legacy (Mongo u otra fuente).
- [ ] Scripts de transformación (IDs, fechas `Timestamp`, referencias).
- [ ] Carga por lotes (≤500 ops por batch).
- [ ] Validación: conteos, muestreo, un flujo E2E en staging.

**Criterio de “listo”**: entorno staging con datos reales suficientes para demo y pruebas de carga básicas.

---

## Checklist rápida por PR (copiar al cerrar cada fase)

- [ ] Build servidor OK
- [ ] (Si aplica) Build cliente OK
- [ ] Smoke: listado productos / detalle / carrito / checkout básico
- [ ] Variables `.env` documentadas en `.env.example`
- [ ] Sin secretos en el repo

---

## Orden sugerido de PRs (una cosa a la vez)

1. Fase 0 solo (docs + `.env.example`).
2. Fase 1: `FirebaseModule` + health.
3. Fase 2: carpetas + interfaces + stubs.
4. Fase 3: guard + endpoint de prueba Firebase.
5. Fase 4: `users` Firestore + `RolesGuard`.
6. Fase 5.1 → 5.5 en PRs separados por carpeta (`translations`, `eshop`, `products`, `orders`, `cart`, `admin`).
7. Fase 6 y 7: corte auth + retirada Mongo.
8. Fase 8: scripts en `tools/` (carpeta nueva, no mezclar con `dist`).

---

## Siguiente paso inmediato (cuando digas “seguimos”)

Empezar por **Fase 0 + Fase 1**: rama, `.env.example`, `firebase-admin`, `FirebaseModule`, import en `app.module.ts`, endpoint de health opcional. Eso no altera el comportamiento del e-commerce para usuarios finales.
