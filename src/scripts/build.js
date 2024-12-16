const fs = require('fs');
const path = require('path');

function copyEnvFile() {
  const env = process.env.NODE_ENV || 'development';
  const sourceFile = env === 'production' ? '.env.production' : '.env';
  const targetFile = '.env';

  if (!fs.existsSync(sourceFile)) {
    console.error(`Error: ${sourceFile} not found`);
    process.exit(1);
  }

  fs.copyFileSync(sourceFile, targetFile);
  console.log(`Copied ${sourceFile} to ${targetFile}`);
}

function createDirectories() {
  const dirs = ['dist/logs', 'dist/uploads'];
  dirs.forEach(dir => {
    const fullPath = path.join(__dirname, '..', dir);
    if (!fs.existsSync(fullPath)) {
      fs.mkdirSync(fullPath, { recursive: true });
      console.log(`Created directory: ${fullPath}`);
    }
  });
}

copyEnvFile();
createDirectories();
