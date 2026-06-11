import { execFileSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const ROOT = process.cwd();
const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  'build',
  'coverage',
  'backups',
]);

const IGNORED_SUFFIXES = [
  '.log',
  '.dump',
  '.backup',
  '.png',
  '.jpg',
  '.jpeg',
  '.gif',
  '.webp',
  '.ico',
  '.mp3',
  '.zip',
  '.tar',
  '.gz',
];

const ALLOWED_ENV_EXAMPLES = new Set([
  '.env.example',
  '.env.production.example',
  '.env.sample',
  '.env.template',
]);

const SECRET_PATTERNS = [
  {
    name: 'private key',
    pattern: /-----BEGIN (?:RSA |OPENSSH |EC |DSA |)?PRIVATE KEY-----/,
  },
  {
    name: 'OpenAI-style API key',
    pattern: /\bsk-[A-Za-z0-9_-]{32,}\b/,
  },
  {
    name: 'Groq API key',
    pattern: /\bgsk_[A-Za-z0-9_-]{32,}\b/,
  },
  {
    name: 'Cloudinary URL',
    pattern: /cloudinary:\/\/\d+:[A-Za-z0-9_-]{12,}@/i,
  },
  {
    name: 'JWT secret assignment',
    pattern: /\bJWT_SECRET\s*=\s*(?!<|replace-with|your-|ci-only)[^\s#'"]{32,}/i,
  },
  {
    name: 'generic API secret assignment',
    pattern: /\b(?:API_SECRET|SECRET_KEY|PRIVATE_KEY)\s*=\s*(?!<|replace-with|your-)[^\s#'"]{32,}/i,
  },
];

function normalize(filePath) {
  return filePath.replaceAll('\\', '/');
}

function listTrackedFiles() {
  try {
    const output = execFileSync('git', ['ls-files', '-z'], {
      cwd: ROOT,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    });
    return output.split('\0').filter(Boolean);
  } catch {
    return null;
  }
}

function listFilesRecursively(dir = ROOT, prefix = '') {
  const files = [];
  for (const entry of readdirSync(dir)) {
    const absolute = path.join(dir, entry);
    const relative = prefix ? path.join(prefix, entry) : entry;
    const normalized = normalize(relative);

    if (IGNORED_DIRS.has(entry)) continue;

    const stat = statSync(absolute);
    if (stat.isDirectory()) {
      files.push(...listFilesRecursively(absolute, relative));
      continue;
    }

    if (IGNORED_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) continue;
    if (path.basename(normalized).startsWith('.env') && !ALLOWED_ENV_EXAMPLES.has(path.basename(normalized))) {
      continue;
    }
    files.push(normalized);
  }
  return files;
}

function isEnvFile(file) {
  const base = path.basename(file);
  return base.startsWith('.env') && !ALLOWED_ENV_EXAMPLES.has(base);
}

const files = listTrackedFiles() ?? listFilesRecursively();
const findings = [];

for (const file of files) {
  const normalized = normalize(file);
  if (isEnvFile(normalized)) {
    findings.push(`${normalized}: committed environment file`);
    continue;
  }

  if (IGNORED_SUFFIXES.some((suffix) => normalized.endsWith(suffix))) continue;

  let content;
  try {
    content = readFileSync(path.join(ROOT, normalized), 'utf8');
  } catch {
    continue;
  }

  for (const { name, pattern } of SECRET_PATTERNS) {
    if (pattern.test(content)) {
      findings.push(`${normalized}: possible ${name}`);
    }
  }
}

if (findings.length > 0) {
  console.error('Potential committed secrets found:');
  for (const finding of findings) {
    console.error(`- ${finding}`);
  }
  process.exit(1);
}

console.log(`Secret scan passed for ${files.length} files.`);
