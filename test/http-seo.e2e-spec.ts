import { INestApplication } from '@nestjs/common';
import request = require('supertest');
import { createTestApp } from './helpers/app';

describe('Public page discovery and operational URL indexing', () => {
  let app: INestApplication;

  beforeAll(async () => { app = await createTestApp(); });
  afterAll(async () => { await app.close(); });

  it.each(['/', '/metodologia.html', '/sobre-nos.html', '/curso-portugues-online.html'])
  ('serves %s as HTML without noindex on the canonical host', async (path) => {
    const response = await request(app.getHttpServer()).get(path)
      .set('Host', 'www.geniusidiomas.com').expect(200);
    expect(response.type).toBe('text/html');
    expect(response.headers['x-robots-tag']).toBeUndefined();
    expect(response.text).not.toMatch(/<meta\s+name="robots"[^>]*noindex/i);
  });

  it.each(['/', '/index.html', '/metodologia.html', '/sobre-nos.html', '/curso-portugues-online.html'])
  ('redirects only the apex marketing URL %s and preserves its exact query', async (path) => {
    const query = '?utm_source=busca&ref=curso%2Bonline&term=portugu%C3%A9s';
    const response = await request(app.getHttpServer()).get(`${path}${query}`)
      .set('Host', 'geniusidiomas.com').expect(301);
    expect(response.headers.location).toBe(
      `https://www.geniusidiomas.com${path === '/index.html' ? '/' : path}${query}`,
    );
  });

  it.each(['get', 'head'] as const)('normalizes a canonical index.html %s request', async (method) => {
    const response = await request(app.getHttpServer())[method]('/index.html?from=share')
      .set('Host', 'www.geniusidiomas.com').expect(301);
    expect(response.headers.location).toBe('https://www.geniusidiomas.com/?from=share');
  });

  it.each(['localhost:4181', '127.0.0.1:4181', 'preview.example', 'geniusidiomas.com.evil.example'])
  ('leaves previews and unrelated hosts unchanged: %s', async (host) => {
    const response = await request(app.getHttpServer()).get('/index.html')
      .set('Host', host).set('X-Forwarded-Host', 'geniusidiomas.com').expect(200);
    expect(response.headers.location).toBeUndefined();
  });

  it('does not redirect form submissions on the apex domain', async () => {
    const response = await request(app.getHttpServer()).post('/index.html')
      .set('Host', 'geniusidiomas.com').send({ example: 'form' }).expect(404);
    expect(response.headers.location).toBeUndefined();
  });

  it.each(['/missing-page', '//missing-page', '/missing.css', '/api/missing', '/api'])
  ('returns a real 404, not the homepage or a server error, for %s', async (path) => {
    const response = await request(app.getHttpServer()).get(path)
      .set('Host', 'geniusidiomas.com').expect(404);
    expect(response.type).toBe('application/json');
    expect(response.headers.location).toBeUndefined();
  });

  it.each(['/dashboard/', '/dashboard/informe.html', '/encuesta/', '/matricula/', '/matricula/success.html'])
  ('keeps %s available with noindex in its HTML and HTTP response', async (path) => {
    const response = await request(app.getHttpServer()).get(path)
      .set('Host', 'geniusidiomas.com').expect(200);
    expect(response.type).toBe('text/html');
    expect(response.headers['x-robots-tag']).toBe('noindex');
    expect(response.text).toMatch(/<meta\s+name="robots"[^>]*noindex/i);
    expect(response.headers.location).toBeUndefined();
  });

  it.each(['dashboard', 'encuesta', 'matricula'])
  ('preserves the static directory redirect for /%s', async (directory) => {
    const response = await request(app.getHttpServer()).get(`/${directory}`)
      .set('Host', 'geniusidiomas.com').expect(301);
    expect(response.headers.location).toBe(`/${directory}/`);
  });

  it('serves nested static assets rather than the homepage', async () => {
    const response = await request(app.getHttpServer()).get('/matricula/app.js').expect(200);
    expect(response.type).toMatch(/javascript/);
    expect(response.headers['x-robots-tag']).toBe('noindex');
  });

  it('preserves the public API response on the apex host and sets noindex', async () => {
    const response = await request(app.getHttpServer()).get('/api/health')
      .set('Host', 'geniusidiomas.com').expect(200);
    expect(response.body.status).toBe('ok');
    expect(response.headers['x-robots-tag']).toBe('noindex');
    expect(response.headers.location).toBeUndefined();
  });

  it('keeps public crawling open so HTML noindex can be observed', async () => {
    const response = await request(app.getHttpServer()).get('/robots.txt').expect(200);
    expect(response.text).toContain('User-agent: *');
    expect(response.text).toContain('Allow: /');
    expect(response.text).toContain('Sitemap: https://www.geniusidiomas.com/sitemap.xml');
    expect(response.text).not.toMatch(/Crawl-delay|Disallow:\s*\/(dashboard|encuesta|matricula)/i);
  });
});
