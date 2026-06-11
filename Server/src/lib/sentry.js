import * as Sentry from '@sentry/node';

let enabled = false;

function parseSampleRate(value) {
  if (value === undefined || value === null || value === '') return 0;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 0;
  return Math.min(Math.max(parsed, 0), 1);
}

export function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return false;

  Sentry.init({
    dsn,
    environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
    tracesSampleRate: parseSampleRate(process.env.SENTRY_TRACES_SAMPLE_RATE),
  });
  enabled = true;
  return true;
}

export function isSentryEnabled() {
  return enabled;
}

export function captureException(error, context = {}) {
  if (!enabled || !error) return;

  Sentry.withScope((scope) => {
    for (const [key, value] of Object.entries(context)) {
      scope.setContext(key, value && typeof value === 'object' ? value : { value });
    }
    Sentry.captureException(error);
  });
}

export function requestErrorMiddleware(error, req, res, next) {
  captureException(error, {
    request: {
      id: req.id,
      method: req.method,
      path: req.path,
      statusCode: res.statusCode,
      userId: req.userId,
    },
  });

  if (res.headersSent) {
    return next(error);
  }

  req.log?.error({ err: error }, 'Unhandled request error');
  return res.status(500).json({ error: 'Something went wrong' });
}

export function flushSentry(timeoutMs = 2000) {
  if (!enabled) return Promise.resolve(true);
  return Sentry.flush(timeoutMs);
}
