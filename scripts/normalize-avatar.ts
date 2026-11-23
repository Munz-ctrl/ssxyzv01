// Re-normalize a cutout locally, no API calls:
//   npx tsx scripts/normalize-avatar.ts <cutout.png> <height_m> <out.png> [--overlay]
// --overlay also writes <out>-overlay.png with public/avatars/avatar_template.png on top.
// Measure the preset avatars against the template with:
//   npx tsx scripts/normalize-avatar.ts --check-presets
import { readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import sharp from 'sharp';
import { avatarSpec } from '../api/_lib/tools/avatarConfig.js';
import { measureFigure, normalizeAvatar } from '../api/_lib/tools/normalizeAvatar.js';

const TEMPLATE = join(process.cwd(), 'public/avatars/avatar_template.png');

async function overlay(png: Buffer, out: string) {
  const file = out.replace(/\.png$/, '') + '-overlay.png';
  await sharp({ create: { width: 800, height: 1000, channels: 4, background: '#b3b3b3' } })
    .composite([{ input: png }, { input: readFileSync(TEMPLATE) }])
    .png()
    .toFile(file);
  return file;
}

async function checkPresets() {
  const spec = avatarSpec();
  const list = JSON.parse(readFileSync('public/avatars/avatars.json', 'utf8')).avatars as { file: string }[];
  for (const { file } of list) {
    const { data, info } = await sharp(join('public/avatars', file)).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
    const f = measureFigure(data, info.width, info.height, info.channels);
    const heightM = (spec.anchor[1] - f.top) / spec.pxPerM;
    console.log(
      `${file.padEnd(36)} height ${heightM.toFixed(2)} m  ground (${f.groundX.toFixed(0)}, ${f.groundY.toFixed(0)})  off by (${(f.groundX - spec.anchor[0]).toFixed(0)}, ${(f.groundY - spec.anchor[1]).toFixed(0)}) px`,
    );
  }
}

const args = process.argv.slice(2);
if (args[0] === '--check-presets') {
  await checkPresets();
} else {
  const [input, height, out] = args;
  if (!input || !height || !out) {
    console.log('usage: normalize-avatar.ts <cutout.png> <height_m> <out.png> [--overlay]');
    process.exit(1);
  }
  const { png, scale, figure } = await normalizeAvatar(readFileSync(input), Number(height));
  writeFileSync(out, png);
  console.log(`wrote ${out}: scale ${scale.toFixed(3)}, figure ${figure.height} px tall in the cutout`);
  if (args.includes('--overlay')) console.log(`wrote ${await overlay(png, out)}`);
}
