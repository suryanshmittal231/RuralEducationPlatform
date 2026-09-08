const fs = require('fs');
const path = require('path');

const srcDir = path.resolve(__dirname, '..');
const destDir = path.resolve(__dirname, '..', 'www');

if (fs.existsSync(destDir)) {
  fs.rmSync(destDir, { recursive: true, force: true });
}
fs.mkdirSync(destDir, { recursive: true });

const filesToCopy = ['index.html', 'manifest.json', 'sw.js'];
const dirsToCopy = ['assets', 'css', 'js'];

filesToCopy.forEach(file => {
  const src = path.join(srcDir, file);
  const dest = path.join(destDir, file);
  if (fs.existsSync(src)) {
    fs.copyFileSync(src, dest);
    console.log(`Copied ${file} -> www/`);
  }
});

function copyDirRecursive(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

dirsToCopy.forEach(dir => {
  const src = path.join(srcDir, dir);
  const dest = path.join(destDir, dir);
  if (fs.existsSync(src)) {
    copyDirRecursive(src, dest);
    console.log(`Copied ${dir}/ -> www/${dir}/`);
  }
});

console.log('Web assets built successfully to www/');
