/**
 * Renders the RideRescue SVG sources to the PNG assets Expo expects.
 *
 *   node assets/source/build-icons.mjs
 *
 * Re-run after editing any SVG, then `rr.bat prebuild` to copy them into the
 * native project.
 */
import sharp from 'sharp';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const here = path.dirname(fileURLToPath(import.meta.url));
const assets = path.resolve(here, '..');

const jobs = [
  // iOS + general app icon: opaque square, launcher rounds the corners.
  { from: 'icon.svg', to: 'icon.png', size: 1024 },
  // Android adaptive foreground: transparent, composited over the colour in app.json.
  { from: 'adaptive-icon.svg', to: 'adaptive-icon.png', size: 1024 },
  // Splash mark: transparent, sits on the brand blue.
  { from: 'splash-icon.svg', to: 'splash-icon.png', size: 1024 },
  // Web favicon.
  { from: 'icon.svg', to: 'favicon.png', size: 96 },
];

for (const job of jobs) {
  const src = path.join(here, job.from);
  const dest = path.join(assets, job.to);
  await sharp(src, { density: 400 })
    .resize(job.size, job.size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
    .png()
    .toFile(dest);
  console.log(`${job.to.padEnd(20)} ${job.size}x${job.size}`);
}

console.log('\nIcons written to mobile/assets/');
