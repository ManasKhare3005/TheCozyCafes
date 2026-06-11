import dns from 'node:dns/promises';
import net from 'node:net';

const cache = new Map(); // url -> { data, expiry }
const CACHE_TTL = 60 * 60 * 1000; // 1 hour
const MAX_REDIRECTS = 5;
const MAX_HTML_BYTES = 50 * 1024;

function isPrivateIPv4(address) {
  const parts = address.split('.').map((part) => Number(part));
  if (parts.length !== 4 || parts.some((part) => Number.isNaN(part) || part < 0 || part > 255)) {
    return true;
  }

  const [a, b] = parts;
  return (
    a === 0 ||
    a === 10 ||
    a === 127 ||
    (a === 100 && b >= 64 && b <= 127) ||
    (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) ||
    (a === 192 && b === 168) ||
    (a === 198 && (b === 18 || b === 19)) ||
    a >= 224
  );
}

function isPrivateIPv6(address) {
  const normalized = address.toLowerCase();
  if (normalized === '::1' || normalized === '::') return true;
  if (normalized.startsWith('fc') || normalized.startsWith('fd')) return true;
  if (normalized.startsWith('fe8') || normalized.startsWith('fe9') || normalized.startsWith('fea') || normalized.startsWith('feb')) {
    return true;
  }

  const mapped = normalized.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (mapped) return isPrivateIPv4(mapped[1]);

  return false;
}

function isPrivateAddress(address) {
  const family = net.isIP(address);
  if (family === 4) return isPrivateIPv4(address);
  if (family === 6) return isPrivateIPv6(address);
  return true;
}

async function assertSafeHttpUrl(rawUrl) {
  let parsed;
  try {
    parsed = new URL(rawUrl);
  } catch {
    const error = new Error('Invalid URL');
    error.status = 400;
    throw error;
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    const error = new Error('Only HTTP/HTTPS URLs are supported');
    error.status = 400;
    throw error;
  }

  const hostname = parsed.hostname.toLowerCase();
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    const error = new Error('URL host is not allowed');
    error.status = 400;
    throw error;
  }

  if (net.isIP(hostname)) {
    if (isPrivateAddress(hostname)) {
      const error = new Error('URL host is not allowed');
      error.status = 400;
      throw error;
    }
    return parsed;
  }

  let addresses;
  try {
    addresses = await dns.lookup(hostname, { all: true, verbatim: true });
  } catch {
    const error = new Error('URL host could not be resolved');
    error.status = 400;
    throw error;
  }

  if (addresses.length === 0 || addresses.some(({ address }) => isPrivateAddress(address))) {
    const error = new Error('URL host is not allowed');
    error.status = 400;
    throw error;
  }

  return parsed;
}

async function fetchSafeHtml(rawUrl, signal) {
  let current = rawUrl;

  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    await assertSafeHttpUrl(current);

    const response = await fetch(current, {
      signal,
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; LinkPreviewBot/1.0)',
        Accept: 'text/html',
      },
      redirect: 'manual',
    });

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location) return { response, finalUrl: current };
      current = new URL(location, current).href;
      continue;
    }

    await assertSafeHttpUrl(response.url || current);
    return { response, finalUrl: response.url || current };
  }

  const error = new Error('Too many redirects');
  error.status = 400;
  throw error;
}

function emptyPreview() {
  return { title: null, description: null, image: null, siteName: null };
}

export async function getLinkPreview(req, res) {
  try {
    const { url } = req.query;

    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    const parsed = await assertSafeHttpUrl(url);

    // Check cache
    const cached = cache.get(url);
    if (cached && cached.expiry > Date.now()) {
      return res.json(cached.data);
    }

    // Fetch the page with a timeout
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 5000);

    const { response, finalUrl } = await fetchSafeHtml(url, controller.signal);
    clearTimeout(timeout);

    if (!response.ok) {
      return res.json(emptyPreview());
    }

    const contentType = response.headers.get('content-type') || '';
    if (!contentType.includes('text/html')) {
      return res.json(emptyPreview());
    }

    // Only read first 50KB to avoid downloading huge pages
    const reader = response.body.getReader();
    const chunks = [];
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(Buffer.from(value));
      totalSize += value.length;
      if (totalSize >= MAX_HTML_BYTES) break;
    }
    reader.cancel();

    const html = Buffer.concat(chunks).toString('utf-8');

    // Extract OG tags and basic meta tags
    const getMetaContent = (nameOrProperty) => {
      const patterns = [
        new RegExp(`<meta[^>]+property=["']${nameOrProperty}["'][^>]+content=["']([^"']*)["']`, 'i'),
        new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+property=["']${nameOrProperty}["']`, 'i'),
        new RegExp(`<meta[^>]+name=["']${nameOrProperty}["'][^>]+content=["']([^"']*)["']`, 'i'),
        new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]+name=["']${nameOrProperty}["']`, 'i'),
      ];
      for (const pattern of patterns) {
        const match = html.match(pattern);
        if (match) return match[1].trim();
      }
      return null;
    };

    const title = getMetaContent('og:title')
      || getMetaContent('twitter:title')
      || (html.match(/<title[^>]*>([^<]*)<\/title>/i)?.[1]?.trim())
      || null;

    const description = getMetaContent('og:description')
      || getMetaContent('twitter:description')
      || getMetaContent('description')
      || null;

    let image = getMetaContent('og:image')
      || getMetaContent('twitter:image')
      || null;

    // Resolve relative image URLs
    if (image && !image.startsWith('http')) {
      try {
        image = new URL(image, finalUrl).href;
      } catch {
        image = null;
      }
    }

    if (image) {
      try {
        await assertSafeHttpUrl(image);
      } catch {
        image = null;
      }
    }

    const siteName = getMetaContent('og:site_name') || parsed.hostname;

    const data = {
      title: title ? title.slice(0, 200) : null,
      description: description ? description.slice(0, 300) : null,
      image,
      siteName,
      url: finalUrl,
    };

    // Cache result
    cache.set(url, { data, expiry: Date.now() + CACHE_TTL });

    // Prune old cache entries periodically
    if (cache.size > 500) {
      const now = Date.now();
      for (const [key, val] of cache) {
        if (val.expiry < now) cache.delete(key);
      }
    }

    res.json(data);
  } catch (error) {
    if (error.name === 'AbortError') {
      return res.json(emptyPreview());
    }
    if (error.status) {
      return res.status(error.status).json({ error: error.message });
    }
    console.error('Link preview error:', error);
    res.json(emptyPreview());
  }
}
