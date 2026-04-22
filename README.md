# Aura Boutique — tienda (Angular + NestJS)

Proyecto de comercio electrónico con catálogo, carrito, pedidos y panel de administración. **Mantenimiento:** Johan Rojas.

## Stack

- **Cliente:** Angular 20 (SSR con `@angular/ssr`)
- **Servidor:** NestJS (Express), Firebase (Firestore, Auth, Storage donde aplique)
- **Un solo** `package.json` en la raíz para cliente y API

## Requisitos

- Node.js y npm (ver `engines` en `package.json`)

## Instalación

```bash
npm install
```

Copia `.env.example` a `.env` y configura variables (Firebase, correo, Stripe si aplica, `ORIGIN` para la URL pública del front — se usa en enlaces de correos).

## Desarrollo

```bash
# API (puerto 4000 por defecto)
npm run start:dev

# Front (puerto 3000)
npm run start:client
```

O ambos:

```bash
npm run dev
```

## Producción (SSR)

```bash
npm run build:ssr
npm run start
```

## Docker

Hay un `Dockerfile` multi-etapa en la raíz: construye el SSR y arranca con `npm run start`. Ajusta variables con `--env-file` o `-e` según tu despliegue.

## Scripts útiles

- `npm run seed:firestore` — datos de ejemplo en Firestore (ver `server/scripts/`)
- `npm run lint` / `npm run lint:client` — lint del servidor / cliente
