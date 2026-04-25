/**
 * update_icons.js
 * icon.png dosyasını kullanarak tüm Android mipmap ikonlarını ve
 * Play Store ikonunu günceller.
 */

const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

const SOURCE = path.join(__dirname, 'icon.png');
const ANDROID_RES = path.join(__dirname, 'android', 'app', 'src', 'main', 'res');
const PLAYSTORE_OUT = path.join(__dirname, 'android', 'app', 'src', 'main', 'ic_launcher-playstore.png');

// Android mipmap launcher & foreground boyutları
// Foreground: 108dp grid içinde 72dp görünür alan → ×1.5 çarpanı
const DENSITIES = [
  { folder: 'mipmap-mdpi',    launcher: 48,  foreground: 108 },
  { folder: 'mipmap-hdpi',    launcher: 72,  foreground: 162 },
  { folder: 'mipmap-xhdpi',   launcher: 96,  foreground: 216 },
  { folder: 'mipmap-xxhdpi',  launcher: 144, foreground: 324 },
  { folder: 'mipmap-xxxhdpi', launcher: 192, foreground: 432 },
];

async function resizeTo(size, outputPath) {
  await sharp(SOURCE)
    .resize(size, size, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 1 } })
    .png()
    .toFile(outputPath);
  console.log(`✓ ${outputPath.replace(__dirname, '.')} (${size}×${size})`);
}

async function main() {
  console.log('🎨 İkon güncelleme başlıyor...\n');

  for (const d of DENSITIES) {
    const dir = path.join(ANDROID_RES, d.folder);
    if (!fs.existsSync(dir)) {
      console.warn(`⚠  Klasör bulunamadı, atlanıyor: ${dir}`);
      continue;
    }

    // Standart launcher ikonu
    await resizeTo(d.launcher, path.join(dir, 'ic_launcher.png'));

    // Yuvarlak launcher ikonu
    await resizeTo(d.launcher, path.join(dir, 'ic_launcher_round.png'));

    // Foreground (adaptive icon katmanı)
    const fgPath = path.join(dir, 'ic_launcher_foreground.png');
    if (fs.existsSync(fgPath) || d.folder === 'mipmap-hdpi') {
      await resizeTo(d.foreground, fgPath);
    }
  }

  // Play Store yüksek çözünürlüklü ikon (512×512)
  await resizeTo(512, PLAYSTORE_OUT);

  console.log('\n✅ Tüm ikonlar güncellendi!');
}

main().catch(err => {
  console.error('❌ Hata:', err.message);
  process.exit(1);
});
