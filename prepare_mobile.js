const fs = require('fs');
const path = require('path');

const destDir = path.join(__dirname, 'www');
const filesToCopy = [
    'index.html',
    'script.js',
    'style.css',
    'appConfig.js',
    'dogru.mp3',
    'yanlis.mp3',
    'geri_sayim.mp3',
    'arkaplan.mp3',
    'arkaplan.mp3',
    'icon.png',
    'dark.png',
    'white.png',
    'sakura.png',
    'orman.png',
    'sunrise.png',
    'about.txt',
    'version.json'
];

// Create www if not exists
if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir);
}

// Copy files
filesToCopy.forEach(file => {
    const src = path.join(__dirname, file);
    const dest = path.join(destDir, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`Copied ${file} to www/`);
    } else {
        console.warn(`Warning: ${file} not found!`);
    }
});

console.log('Mobile build preparation complete.');
