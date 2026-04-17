const fs = require('fs');
const path = require('path');

const destDir = path.join(__dirname, 'www');
const filesToCopy = [
    'index.html',
    'script.js',
    'style.css',
    'appConfig.js',
    'sounds/dogru.mp3',
    'sounds/yanlis.mp3',
    'sounds/geri_sayim.mp3',
    'sounds/arkaplan.mp3',
    'icon.png',
    'images/dark.png',
    'images/white.png',
    'images/sakura.png',
    'images/orman.png',
    'images/sunrise.png',
    'about.txt',
    'version.json',
    'changelog.json'
];

// Create www if not exists
if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir);
}

// Copy files
filesToCopy.forEach(file => {
    const src = path.join(__dirname, file);
    const dest = path.join(destDir, file);
    
    // Ensure subdir exists
    const destDirName = path.dirname(dest);
    if (!fs.existsSync(destDirName)) {
        fs.mkdirSync(destDirName, { recursive: true });
    }

    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
        console.log(`Copied ${file} to www/`);
    } else {
        console.warn(`Warning: ${file} not found!`);
    }
});

console.log('Mobile build preparation complete.');
