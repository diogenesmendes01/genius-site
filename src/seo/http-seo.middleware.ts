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

  if ((req.method !== 'GET' && req.method !== 'HEAD') || !marketingPaths.has(req.path)) {
    next();
    return;
  }

  // Use the actual Host header, not forwarded host input. Local previews and
  // operational routes keep their origin, cookies and request semantics.
  const host = (req.headers.host ?? '').toLowerCase();
  const isApex = host === 'geniusidiomas.com';
  const isCanonical = host === 'www.geniusidiomas.com';
  if (!isApex && !(isCanonical && req.path === '/index.html')) {
    next();
    return;
  }

  const queryStart = req.originalUrl.indexOf('?');
  const query = queryStart === -1 ? '' : req.originalUrl.slice(queryStart);
  const pathname = req.path === '/index.html' ? '/' : req.path;
  res.redirect(301, `${canonicalOrigin}${pathname}${query}`);
}
