/**
 * Genera los códigos QR de la encuesta de satisfacción, uno por canal de
 * distribución, en PNG (para imprimir / proyectar) y SVG (escalable).
 *
 * Uso:
 *   node scripts/generate-qr.mjs                          → usa https://geniusidiomas.com
 *   node scripts/generate-qr.mjs https://otro-dominio.com → base alternativa
 *
 * Los archivos van a public/assets/qr/ y quedan servidos en /assets/qr/…
 * El parámetro ?src= de cada QR alimenta la columna `canal` de la respuesta,
 * así el dashboard muestra de dónde vino cada una.
 */
import { mkdir } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import QRCode from 'qrcode';

const BASE_URL = (process.argv[2] ?? 'https://geniusidiomas.com').replace(/\/$/, '');
const CHANNELS = ['whatsapp', 'en-clase', 'instagram'];

const outDir = join(dirname(fileURLToPath(import.meta.url)), '..', 'public', 'assets', 'qr');
await mkdir(outDir, { recursive: true });

const OPTS = {
  errorCorrectionLevel: 'M',
  margin: 2,
  color: { dark: '#000E38', light: '#FFFFFF' },
};

for (const channel of CHANNELS) {
  const url = `${BASE_URL}/encuesta?src=${channel}`;
  const png = join(outDir, `encuesta-${channel}.png`);
  const svg = join(outDir, `encuesta-${channel}.svg`);
  await QRCode.toFile(png, url, { ...OPTS, width: 1024 });
  await QRCode.toFile(svg, url, { ...OPTS, type: 'svg' });
  console.log(`✔ ${channel}: ${url}`);
  console.log(`    ${png}`);
  console.log(`    ${svg}`);
}

console.log('\nListo. Archivos en public/assets/qr/ (servidos en /assets/qr/…).');
