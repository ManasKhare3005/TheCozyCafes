import { describe, expect, it, vi } from 'vitest';
import {
  createHelmetOptions,
  createHttpsRedirectMiddleware,
  firstForwardedProto,
  isRequestSecure,
  parseBooleanEnv,
  parseTrustProxy,
} from '../security.js';

describe('security helpers', () => {
  it('parses boolean-style environment values', () => {
    expect(parseBooleanEnv(undefined, true)).toBe(true);
    expect(parseBooleanEnv('true')).toBe(true);
    expect(parseBooleanEnv('1')).toBe(true);
    expect(parseBooleanEnv('yes')).toBe(true);
    expect(parseBooleanEnv('false', true)).toBe(false);
    expect(parseBooleanEnv('0', true)).toBe(false);
    expect(parseBooleanEnv('no', true)).toBe(false);
    expect(parseBooleanEnv('surprise', true)).toBe(true);
  });

  it('parses Express trust proxy values', () => {
    expect(parseTrustProxy(undefined, 1)).toBe(1);
    expect(parseTrustProxy('false', 1)).toBe(false);
    expect(parseTrustProxy('true')).toBe(1);
    expect(parseTrustProxy('2')).toBe(2);
    expect(parseTrustProxy('loopback')).toBe('loopback');
  });

  it('reads the first forwarded proto value', () => {
    expect(firstForwardedProto({
      headers: { 'x-forwarded-proto': 'https,http' },
    })).toBe('https');
    expect(firstForwardedProto({
      headers: { 'x-forwarded-proto': ['http', 'https'] },
    })).toBe('http');
  });

  it('detects secure requests from Express or forwarded proto', () => {
    expect(isRequestSecure({ secure: true, headers: {} })).toBe(true);
    expect(isRequestSecure({
      secure: false,
      headers: { 'x-forwarded-proto': 'https' },
    })).toBe(true);
    expect(isRequestSecure({
      secure: false,
      headers: { 'x-forwarded-proto': 'http' },
    })).toBe(false);
  });

  it('redirects insecure requests with a permanent HTTPS redirect', () => {
    const middleware = createHttpsRedirectMiddleware({
      enabled: true,
      httpsOrigin: 'https://chat.example',
    });
    const req = {
      secure: false,
      headers: { host: 'localhost:3001' },
      originalUrl: '/api/rooms?x=1',
    };
    const res = { redirect: vi.fn() };
    const next = vi.fn();

    middleware(req, res, next);

    expect(res.redirect).toHaveBeenCalledWith(308, 'https://chat.example/api/rooms?x=1');
    expect(next).not.toHaveBeenCalled();
  });

  it('does not redirect when HTTPS enforcement is off or request is already secure', () => {
    const disabled = createHttpsRedirectMiddleware({ enabled: false });
    const enabled = createHttpsRedirectMiddleware({ enabled: true });
    const res = { redirect: vi.fn() };
    const next = vi.fn();

    disabled({ secure: false, headers: { host: 'localhost' }, originalUrl: '/' }, res, next);
    enabled({ secure: true, headers: { host: 'localhost' }, originalUrl: '/' }, res, next);

    expect(next).toHaveBeenCalledTimes(2);
    expect(res.redirect).not.toHaveBeenCalled();
  });

  it('creates strict Helmet options with HSTS only when HTTPS is enforced', () => {
    const withoutHttps = createHelmetOptions({ enforceHttps: false });
    const withHttps = createHelmetOptions({ enforceHttps: true, hstsMaxAge: 123 });

    expect(withoutHttps.strictTransportSecurity).toBe(false);
    expect(withoutHttps.xFrameOptions).toEqual({ action: 'deny' });
    expect(withoutHttps.referrerPolicy).toEqual({ policy: 'strict-origin-when-cross-origin' });
    expect(withHttps.strictTransportSecurity).toEqual({
      maxAge: 123,
      includeSubDomains: true,
      preload: true,
    });
    expect(withHttps.contentSecurityPolicy.directives.frameAncestors).toEqual(["'none'"]);
  });
});
