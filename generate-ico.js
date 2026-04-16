/**
 * generate-ico.js — erzeugt ts-icon.ico (16,24,32,48,64,128,256px) aus ts-icon-512.png
 * Ausführen: node generate-ico.js
 */
const sharp = require('sharp');
const pngToIco = require('png-to-ico');
// Support both ESM default export wrapped by CJS and direct function
const icoFn = typeof pngToIco === 'function' ? pngToIco : (pngToIco.default || pngToIco.imagesToIco);
const fs = require('fs');
const os = require('os');
const path = require('path');

const SRC = path.join(__dirname, 'ts-icon-app.png');
const ICO_OUT = path.join(__dirname, 'ts-icon.ico');
const SIZES = [16, 24, 32, 48, 64, 128, 256];
const TMP = os.tmpdir();

async function main() {
  // Write resized PNGs to temp files
  const tmpFiles = [];
  for (const size of SIZES) {
    const tmp = path.join(TMP, `ts-icon-${size}.png`);
    await sharp(SRC)
      .resize(size, size, { fit: 'cover', background: { r: 0, g: 0, b: 0, alpha: 0 } })
      .png()
      .toFile(tmp);
    tmpFiles.push(tmp);
  }

  // Convert to ICO using file paths
  const icoBuffer = await icoFn(tmpFiles);
  fs.writeFileSync(ICO_OUT, icoBuffer);

  // Cleanup
  tmpFiles.forEach(f => fs.unlinkSync(f));

  console.log(`ts-icon.ico erstellt mit Größen: ${SIZES.join(', ')}px (${(icoBuffer.length/1024).toFixed(1)} KB)`);
}

main().catch(e => { console.error('Fehler:', e); process.exit(1); });
