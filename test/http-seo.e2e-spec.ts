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

  describe.each(['get', 'head'] as const)('%s canonical request variants', (method) => {
    it.each([
      ['geniusidiomas.com:443', '/', '/'],
      ['geniusidiomas.com:80', '/metodologia.html', '/metodologia.html'],
      ['geniusidiomas.com:8443', '/sobre-nos.html', '/sobre-nos.html'],
      ['GENIUSIDIOMAS.COM:443', '/', '/'],
      ['www.geniusidiomas.com:443', '/index.html', '/'],
      ['www.geniusidiomas.com:8080', '/index.html', '/'],
      ['www.geniusidiomas.com', '//', '/'],
      ['geniusidiomas.com:443', '///', '/'],
      ['www.geniusidiomas.com:443', '//index.html', '/'],
      ['www.geniusidiomas.com', '///metodologia.html', '/metodologia.html'],
      ['geniusidiomas.com', '//curso-portugues-online.html', '/curso-portugues-online.html'],
    ])('consolidates Host %s and path %s to %s', async (host, path, destination) => {
      const query = '?utm_source=review&ref=curso%2Bonline&next=%2F%2Fexample.com';
      const response = await request(app.getHttpServer())[method](`${path}${query}`)
        .set('Host', host).expect(301);
      expect(response.headers.location).toBe(`https://www.geniusidiomas.com${destination}${query}`);
    });
  });

  it.each([
    'localhost:4181', '127.0.0.1:4181', '[::1]:4181', 'preview.example',
    'geniusidiomas.com.evil.example', 'geniusidiomas.com.evil.example:443',
    'geniusidiomas.com:443.evil.example', 'geniusidiomas.com:443:80',
  ])
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

  it.each(['/missing-page', '//missing-page', '///missing-page', '//evil.example/path', '/missing.css', '/api/missing', '/api'])
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

  it.each([
    ['get', '//matricula/', 200, /html/],
    ['head', '///matricula//', 200, /html/],
    ['get', '//matricula//success.html', 200, /html/],
    ['head', '///matricula/success.html', 200, /html/],
    ['get', '//dashboard/', 200, /html/],
    ['head', '///dashboard//', 200, /html/],
    ['get', '//dashboard//informe.html', 200, /html/],
    ['head', '///dashboard/informe.html', 200, /html/],
    ['get', '///encuesta//', 200, /html/],
    ['head', '//matricula//app.js', 200, /javascript/],
    ['get', '//api/health', 404, /json/],
    ['head', '//api/health', 404, /json/],
  ] as const)
  ('keeps noindex and routing behavior for %s %s', async (method, path, status, type) => {
    const response = await request(app.getHttpServer())[method](path)
      .set('Host', 'geniusidiomas.com').expect(status);
    expect(response.type).toMatch(type);
    expect(response.headers['x-robots-tag']).toBe('noindex');
    expect(response.headers.location).toBeUndefined();
    if (method === 'head') {
      expect(response.text).toBeUndefined();
    } else if (response.type === 'text/html') {
      expect(response.text).toMatch(/<meta\s+name="robots"[^>]*noindex/i);
    }
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
