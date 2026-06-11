import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { validateProductionConfig } from '../Server/src/lib/config.js';

const PLACEHOLDER_PATTERNS = [
  /<[^>]+>/,
  /replace-with/i,
  /\byour[-_\s]/i,
  /example/i,
  /placeholder/i,
];

function parseArgs(argv) {
  const args = {
    allowPlaceholders: false,
    serverEnv: null,
    clientEnv: null,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--allow-placeholders') {
      args.allowPlaceholders = true;
    } else if (arg === '--server-env') {
      args.serverEnv = argv[index + 1];
      index += 1;
    } else if (arg === '--client-env') {
      args.clientEnv = argv[index + 1];
      index += 1;
    } else {
      throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return args;
}

function parseEnvFile(filePath) {
  if (!filePath) return {};
  const absolute = path.resolve(filePath);
  if (!existsSync(absolute)) {
    throw new Error(`Env file not found: ${filePath}`);
  }

  const env = {};
  const content = readFileSync(absolute, 'utf8');
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (!match) continue;

    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[match[1]] = value;
  }
  return env;
}

function isPlaceholder(value) {
  if (!value) return true;
  return PLACEHOLDER_PATTERNS.some((pattern) => pattern.test(value));
}

function requireValue(errors, env, key, { allowPlaceholders, expected, https } = {}) {
  const value = env[key];
  if (!value) {
    errors.push(`${key} is required`);
    return;
  }

  if (!allowPlaceholders && isPlaceholder(value)) {
    errors.push(`${key} must not be a placeholder`);
  }

  if (expected !== undefined && value !== expected) {
    errors.push(`${key} must be ${expected}`);
  }

  if (https && !value.startsWith('https://')) {
    errors.push(`${key} must use https://`);
  }
}

function validateClientEnv(env, { allowPlaceholders }) {
  const errors = [];
  requireValue(errors, env, 'VITE_API_URL', { allowPlaceholders, https: true });
  requireValue(errors, env, 'VITE_SOCKET_URL', { allowPlaceholders, https: true });
  requireValue(errors, env, 'VITE_HCAPTCHA_SITE_KEY', { allowPlaceholders });
  requireValue(errors, env, 'VITE_REQUIRE_HCAPTCHA', {
    allowPlaceholders,
    expected: 'true',
  });
  return errors;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const serverEnv = {
    ...process.env,
    ...parseEnvFile(args.serverEnv),
    NODE_ENV: 'production',
  };
  const clientEnv = {
    ...process.env,
    ...parseEnvFile(args.clientEnv),
  };

  const serverErrors = args.allowPlaceholders
    ? []
    : validateProductionConfig(serverEnv);
  const clientErrors = validateClientEnv(clientEnv, {
    allowPlaceholders: args.allowPlaceholders,
  });

  const errors = [
    ...serverErrors.map((error) => `server: ${error}`),
    ...clientErrors.map((error) => `client: ${error}`),
  ];

  if (errors.length > 0) {
    console.error('Production readiness check failed:');
    for (const error of errors) {
      console.error(`- ${error}`);
    }
    process.exit(1);
  }

  console.log('Production readiness check passed.');
}

try {
  main();
} catch (error) {
  console.error(error.message);
  process.exit(1);
}
