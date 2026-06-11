import { existsSync, readdirSync, statSync, readFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import path from 'node:path';

const distDir = path.resolve('dist');
const assetsDir = path.join(distDir, 'assets');

function collectFiles(dir) {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(dir, entry.name);
    if (entry.isDirectory()) return collectFiles(absolute);
    return absolute;
  });
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

if (!existsSync(assetsDir)) {
  console.error('Build assets not found. Run npm run build first.');
  process.exit(1);
}

const rows = collectFiles(assetsDir)
  .map((file) => {
    const content = readFileSync(file);
    return {
      file: path.relative(distDir, file).replace(/\\/g, '/'),
      size: statSync(file).size,
      gzip: gzipSync(content).length,
    };
  })
  .sort((a, b) => b.size - a.size);

console.log('Bundle size report:');
for (const row of rows) {
  console.log(`${formatBytes(row.size).padStart(9)} gzip ${formatBytes(row.gzip).padStart(8)}  ${row.file}`);
}

const total = rows.reduce((sum, row) => sum + row.size, 0);
const totalGzip = rows.reduce((sum, row) => sum + row.gzip, 0);
console.log(`Total: ${formatBytes(total)} gzip ${formatBytes(totalGzip)}`);
