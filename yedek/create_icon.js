const { PNG } = require('pngjs');
const fs = require('fs');

const width = 256;
const height = 256;

const png = new PNG({ width, height });

for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
        const idx = (width * y + x) << 2;
        png.data[idx] = 0;   // Red
        png.data[idx + 1] = 0; // Green
        png.data[idx + 2] = 0; // Blue
        png.data[idx + 3] = 255; // Alpha (fully opaque)
    }
}

png.pack()
    .pipe(fs.createWriteStream('icon.png'))
    .on('finish', () => console.log('icon.png created successfully.'))
    .on('error', (err) => console.error('Error creating icon.png:', err));
