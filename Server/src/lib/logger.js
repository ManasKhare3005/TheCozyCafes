import { randomUUID } from 'node:crypto';
import pino from 'pino';
import pinoHttp from 'pino-http';

const redactedPaths = [
  'req.headers.authorization',
  'req.headers.cookie',
  'req.body.password',
  'req.body.token',
  'req.body.captchaToken',
  'req.body.code',
  'req.body.email',
  'password',
  'token',
  'captchaToken',
  'authorization',
  'cookie',
  '*.password',
  '*.token',
  '*.captchaToken',
  '*.authorization',
  '*.cookie',
];

const logger = pino({
  level: process.env.LOG_LEVEL || (process.env.NODE_ENV === 'production' ? 'info' : 'debug'),
  timestamp: pino.stdTimeFunctions.isoTime,
  redact: {
    paths: redactedPaths,
    censor: '[redacted]',
  },
});

function normalizeArgs(args) {
  const error = args.find((arg) => arg instanceof Error);
  const objects = args.filter((arg) => arg && typeof arg === 'object' && !(arg instanceof Error));
  const messages = args
    .filter((arg) => typeof arg !== 'object' || arg === null)
    .map(String);

  const fields = {};
  if (error) fields.err = error;
  if (objects.length === 1) fields.data = objects[0];
  if (objects.length > 1) fields.data = objects;

  return {
    fields,
    message: messages.join(' ') || error?.message || 'Log event',
    error,
  };
}

export function installConsoleBridge({ captureException } = {}) {
  if (globalThis.__chatroomConsoleBridgeInstalled) return;
  globalThis.__chatroomConsoleBridgeInstalled = true;

  console.log = (...args) => {
    const { fields, message } = normalizeArgs(args);
    logger.info(fields, message);
  };

  console.info = (...args) => {
    const { fields, message } = normalizeArgs(args);
    logger.info(fields, message);
  };

  console.warn = (...args) => {
    const { fields, message, error } = normalizeArgs(args);
    logger.warn(fields, message);
    if (error) captureException?.(error, { source: 'console.warn' });
  };

  console.error = (...args) => {
    const { fields, message, error } = normalizeArgs(args);
    logger.error(fields, message);
    if (error) captureException?.(error, { source: 'console.error' });
  };

  console.debug = (...args) => {
    const { fields, message } = normalizeArgs(args);
    logger.debug(fields, message);
  };
}

export const requestLogger = pinoHttp({
  logger,
  genReqId: (req, res) => {
    const existingId = req.headers['x-request-id'];
    const requestId = typeof existingId === 'string' && existingId.trim()
      ? existingId.trim()
      : randomUUID();
    res.setHeader('x-request-id', requestId);
    return requestId;
  },
  customLogLevel: (req, res, err) => {
    if (err || res.statusCode >= 500) return 'error';
    if (res.statusCode >= 400) return 'warn';
    return 'info';
  },
  customSuccessMessage: (req, res) => `${req.method} ${req.url} completed with ${res.statusCode}`,
  customErrorMessage: (req, res) => `${req.method} ${req.url} failed with ${res.statusCode}`,
  serializers: {
    req(req) {
      return {
        id: req.id,
        method: req.method,
        url: req.url,
        remoteAddress: req.remoteAddress,
      };
    },
    res(res) {
      return {
        statusCode: res.statusCode,
      };
    },
    err: pino.stdSerializers.err,
  },
});

export default logger;
