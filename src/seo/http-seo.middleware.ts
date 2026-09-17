import type { NextFunction, Request, Response } from 'express';

const canonicalOrigin = 'https://www.geniusidiomas.com';
const marketingPaths = new Set([
  '/',
  '/index.html',
  '/metodologia.html',
  '/sobre-nos.html',
  '/curso-portugues-online.html',
]);

/** Keep operational URLs out of search and consolidate public page aliases. */
export function httpSeo(req: Request, res: Response, next: NextFunction): void {
  if (/^\/(?:api|dashboard|encuesta|matricula)(?:\/|$)/i.test(req.path)) {
    res.setHeader('X-Robots-Tag', 'noindex');
  }

  // Only consolidate slash aliases of known marketing pages. Other routes
  // retain their original path and normal 404/API/static-file behavior.
  const marketingPath = req.path.replace(/\/{2,}/g, '/');
  if ((req.method !== 'GET' && req.method !== 'HEAD') || !marketingPaths.has(marketingPath)) {
    next();
    return;
  }

  // Use the actual Host header, not forwarded host input. Local previews and
  // operational routes keep their origin, cookies and request semantics.
  // Proxies may preserve an explicit port. Strip only a trailing numeric port,
  // so malformed authorities and unrelated domains cannot match the allowlist.
  const host = (req.headers.host ?? '').toLowerCase().replace(/:\d+$/, '');
  const isApex = host === 'geniusidiomas.com';
  const isCanonical = host === 'www.geniusidiomas.com';
  const pathname = marketingPath === '/index.html' ? '/' : marketingPath;
  if (!isApex && !(isCanonical && req.path !== pathname)) {
    next();
    return;
  }

  const queryStart = req.originalUrl.indexOf('?');
  const query = queryStart === -1 ? '' : req.originalUrl.slice(queryStart);
  res.redirect(301, `${canonicalOrigin}${pathname}${query}`);
}
