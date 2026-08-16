/** Previews the adaptive icon the way a launcher composites and crops it. */
import sharp from 'sharp';

const fg = await sharp('assets/adaptive-icon.png').toBuffer();

await sharp({ create: { width: 1024, height: 1024, channels: 4, background: '#2563eb' } })
  .composite([{ input: fg }])
  .png()
  .toFile('assets/source/_preview-adaptive.png');

const circle = Buffer.from(
  '<svg width="1024" height="1024"><circle cx="512" cy="512" r="512" fill="white"/></svg>'
);

await sharp('assets/source/_preview-adaptive.png')
  .composite([{ input: circle, blend: 'dest-in' }])
  .png()
  .toFile('assets/source/_preview-round.png');

console.log('previews written');
