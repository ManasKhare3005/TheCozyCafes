export function parseBooleanEnv(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;

  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

export function parseTrustProxy(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;

  const normalized = String(value).trim().toLowerCase();
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return 1;

  const numeric = Number(normalized);
  if (Number.isInteger(numeric) && numeric >= 0) return numeric;

  return String(value).trim();
}

export function firstForwardedProto(req) {
  const value = req.headers?.['x-forwarded-proto'];
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw) return '';
  return String(raw).split(',')[0].trim().toLowerCase();
}

export function isRequestSecure(req) {
  return Boolean(req.secure) || firstForwardedProto(req) === 'https';
}

export function createHttpsRedirectMiddleware({ enabled, httpsOrigin } = {}) {
  return (req, res, next) => {
    if (!enabled || isRequestSecure(req)) return next();

    let target;
    if (httpsOrigin) {
      target = new URL(req.originalUrl || req.url || '/', httpsOrigin).toString();
    } else {
      target = `https://${req.headers.host}${req.originalUrl || req.url || '/'}`;
    }

    return res.redirect(308, target);
  };
}

export function createHelmetOptions({ enforceHttps = false, hstsMaxAge = 31536000 } = {}) {
  return {
    contentSecurityPolicy: {
      useDefaults: true,
      directives: {
        defaultSrc: ["'none'"],
        baseUri: ["'none'"],
        connectSrc: ["'self'"],
        frameAncestors: ["'none'"],
        formAction: ["'none'"],
        imgSrc: ["'self'", 'data:', 'blob:', 'https:'],
        mediaSrc: ["'self'", 'blob:', 'https:'],
        objectSrc: ["'none'"],
        scriptSrc: ["'none'"],
        styleSrc: ["'none'"],
      },
    },
    crossOriginResourcePolicy: { policy: 'cross-origin' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    strictTransportSecurity: enforceHttps
      ? {
          maxAge: hstsMaxAge,
          includeSubDomains: true,
          preload: true,
        }
      : false,
    xFrameOptions: { action: 'deny' },
  };
}
