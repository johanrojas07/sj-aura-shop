/**
 * Firebase Hosting sirve index.html por defecto; el build de Angular (SSR) deja index.csr.html en browser/.
 */
const fs = require('fs');
const path = require('path');

const browserDir = path.join(__dirname, '..', 'dist', 'eshop', 'browser');
const csr = path.join(browserDir, 'index.csr.html');
const out = path.join(browserDir, 'index.html');

if (!fs.existsSync(csr)) {
  console.error(
    '[prepare-firebase-hosting] No existe',
    csr,
    '\nEjecuta antes: npm run build:ssr',
  );
  process.exit(1);
}

fs.copyFileSync(csr, out);
console.log('[prepare-firebase-hosting] Copiado index.csr.html -> index.html');
