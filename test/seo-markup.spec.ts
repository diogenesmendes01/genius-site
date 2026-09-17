import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// These checks inspect the HTML that crawlers and no-JavaScript visitors receive,
// complementing the HTTP/indexation tests and the accordion behaviour tests.
const publicDir = join(__dirname, '../public');
const origin = 'https://www.geniusidiomas.com';
const pages = ['index.html', 'metodologia.html', 'sobre-nos.html', 'curso-portugues-online.html'];
const read = (file: string) => readFileSync(join(publicDir, file), 'utf8');
const canonicalFor = (file: string) => `${origin}/${file === 'index.html' ? '' : file}`;
const tags = (html: string, name: string) => html.match(new RegExp(`<${name}\\b[^>]*>`, 'gi')) ?? [];
const decode = (value: string) => value
  .replace(/&#(x[\da-f]+|\d+);/gi, (_, code: string) => String.fromCodePoint(code[0].toLowerCase() === 'x' ? parseInt(code.slice(1), 16) : Number(code)))
  .replace(/&(amp|quot|apos|lt|gt|nbsp);/g, (_, name: string) => ({ amp: '&', quot: '"', apos: "'", lt: '<', gt: '>', nbsp: ' ' })[name]);
const attr = (tag: string, name: string): string | null => {
  const value = tag.match(new RegExp(`\\s${name}\\s*=\\s*(["'])(.*?)\\1`, 'i'));
  if (value) return decode(value[2]);
  return new RegExp(`\\s${name}(?=[\\s>])`, 'i').test(tag) ? '' : null;
};
const hasClass = (tag: string, className: string) => (attr(tag, 'class') ?? '').split(/\s+/).includes(className);
const metadata = (html: string, name: string) => tags(html, 'meta')
  .filter((tag) => attr(tag, 'name') === name || attr(tag, 'property') === name)
  .map((tag) => attr(tag, 'content'));
const title = (html: string) => decode(html.match(/<title\b[^>]*>([\s\S]*?)<\/title>/i)?.[1] ?? '').trim();
const canonical = (html: string) => tags(html, 'link').filter((tag) => attr(tag, 'rel') === 'canonical').map((tag) => attr(tag, 'href'));
const visibleText = (html: string) => decode(html
  .replace(/<(script|style)\b[^>]*>[\s\S]*?<\/\1>/gi, '')
  .replace(/<!--[\s\S]*?-->/g, '')
  .replace(/<[^>]+>/g, ' '))
  .replace(/\s+/g, ' ').trim();
const graph = (html: string): Record<string, any>[] => {
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter((match) => attr(`<script ${match[1]}>`, 'type') === 'application/ld+json');
  expect(scripts.length).toBeGreaterThan(0);
  return scripts.flatMap((match) => {
    const data = JSON.parse(match[2]);
    expect(data['@context']).toBe('https://schema.org');
    expect(Array.isArray(data['@graph'])).toBe(true);
    return data['@graph'];
  });
};
const isType = (node: Record<string, any>, type: string) => [node['@type']].flat().includes(type);
const walkObjects = (value: any): Record<string, any>[] => {
  if (value === null || typeof value !== 'object') return [];
  return [value, ...Object.values(value).flatMap(walkObjects)];
};
const localFile = (url: URL) => {
  const pathname = decodeURIComponent(url.pathname);
  return pathname.endsWith('/') ? `${pathname.slice(1)}index.html` : pathname.slice(1);
};

describe.each(pages)('search markup in %s', (file) => {
  it('exposes one Spanish page with a canonical and consistent search/share metadata', () => {
    const html = read(file);
    const pageTitle = title(html);
    const description = metadata(html, 'description');
    expect(tags(html, 'h1')).toHaveLength(1);
    expect(attr(tags(html, 'html')[0], 'lang')).toMatch(/^es(?:-|$)/);
    expect(pageTitle).toMatch(/GENIUS/);
    expect(description).toHaveLength(1);
    expect(description[0]?.trim()).toBeTruthy();
    expect(canonical(html)).toEqual([canonicalFor(file)]);

    const robots = metadata(html, 'robots');
    expect(robots).toHaveLength(1);
    const directives = robots[0]!.toLowerCase().split(',').map((part) => part.trim());
    expect(directives).toEqual(expect.arrayContaining(['index', 'follow', 'max-image-preview:large']));
    expect(directives).not.toContain('noindex');
    expect(directives).not.toContain('nosnippet');

    expect(metadata(html, 'og:url')).toEqual([canonicalFor(file)]);
    expect(metadata(html, 'twitter:url')).toEqual([canonicalFor(file)]);
    expect(metadata(html, 'og:title')).toEqual([pageTitle]);
    expect(metadata(html, 'twitter:title')).toEqual([pageTitle]);
    // Share descriptions may be tailored to social media, but must be nonempty
    // and consistent across the two social card formats.
    expect(metadata(html, 'og:description')).toHaveLength(1);
    expect(metadata(html, 'og:description')[0]?.trim()).toBeTruthy();
    expect(metadata(html, 'twitter:description')).toEqual(metadata(html, 'og:description'));
    expect(metadata(html, 'twitter:card')).toEqual(['summary_large_image']);
    expect(metadata(html, 'og:image')).toHaveLength(1);
    expect(metadata(html, 'twitter:image')).toEqual(metadata(html, 'og:image'));
    const imageUrl = new URL(metadata(html, 'og:image')[0]!);
    expect(imageUrl.origin).toBe(origin);
    expect(existsSync(join(publicDir, localFile(imageUrl)))).toBe(true);
    expect(metadata(html, 'og:image:alt')[0]?.trim()).toBeTruthy();
    expect(metadata(html, 'twitter:image:alt')[0]?.trim()).toBeTruthy();
  });

  it('connects the page, website and the same real school in parseable structured data', () => {
    const html = read(file);
    const nodes = graph(html);
    const organizations = nodes.filter((node) => isType(node, 'EducationalOrganization'));
    const websites = nodes.filter((node) => isType(node, 'WebSite'));
    const webPages = nodes.filter((node) => isType(node, 'WebPage') || isType(node, 'AboutPage'));
    expect(organizations).toHaveLength(1);
    expect(websites).toHaveLength(1);
    expect(webPages).toHaveLength(1);
    const [organization] = organizations;
    const [website] = websites;
    const [page] = webPages;
    expect(organization['@id']).toBe(`${origin}/#organization`);
    expect(organization.url).toBe(`${origin}/`);
    expect(organization.sameAs).toContain('https://www.instagram.com/geniusacademiadelenguas/');
    expect(website['@id']).toBe(`${origin}/#website`);
    expect(website.publisher).toEqual({ '@id': organization['@id'] });
    expect(page.url).toBe(canonicalFor(file));
    expect(page.name).toBe(title(html));
    expect(page.description).toBe(metadata(html, 'description')[0]);
    expect(page.inLanguage).toMatch(/^es(?:-|$)/);
    expect(page.isPartOf).toEqual({ '@id': website['@id'] });
    expect(page.publisher).toEqual({ '@id': organization['@id'] });

    // No verified physical address, rating or public price has been supplied.
    // Keep those claims out of machine-readable data until real evidence exists.
    const fields = walkObjects(nodes).flatMap((node) => Object.keys(node));
    expect(fields).not.toEqual(expect.arrayContaining(['address']));
    expect(fields).not.toEqual(expect.arrayContaining(['aggregateRating']));
    expect(fields).not.toEqual(expect.arrayContaining(['reviewRating']));
    expect(fields).not.toEqual(expect.arrayContaining(['price']));
    expect(fields).not.toEqual(expect.arrayContaining(['lowPrice']));
    expect(fields).not.toEqual(expect.arrayContaining(['highPrice']));
  });

  it('links to existing local destinations and real fragment targets', () => {
    const html = read(file);
    const internalLinks = tags(html, 'a')
      .map((tag) => attr(tag, 'href'))
      .filter((href): href is string => href !== null)
      .map((href) => new URL(href, canonicalFor(file)))
      .filter((url) => url.origin === origin);
    expect(internalLinks.length).toBeGreaterThan(0);
    const failures: string[] = [];
    internalLinks.forEach((url) => {
      const destination = localFile(url);
      if (!existsSync(join(publicDir, destination))) {
        failures.push(`Missing destination: ${url.href}`);
        return;
      }
      if (!url.hash || !destination.endsWith('.html')) return;
      const targetHtml = read(destination);
      const anchors = [...targetHtml.matchAll(/<[a-z][^>]*>/gi)]
        .flatMap(([tag]) => [attr(tag, 'id'), /^<a\s/i.test(tag) ? attr(tag, 'name') : null]);
      if (!anchors.includes(decodeURIComponent(url.hash.slice(1)))) failures.push(`Missing fragment: ${url.href}`);
    });
    expect(failures).toEqual([]);
  });
});

describe('marketing discovery contracts', () => {
  it('gives each indexable page a distinct title, description and canonical', () => {
    const html = pages.map(read);
    expect(new Set(html.map(title)).size).toBe(pages.length);
    expect(new Set(html.map((page) => metadata(page, 'description')[0])).size).toBe(pages.length);
    expect(new Set(html.flatMap(canonical)).size).toBe(pages.length);
  });

  it('resolves structured-data identity references across the public pages', () => {
    const nodes = pages.flatMap((file) => graph(read(file)));
    const allObjects = walkObjects(nodes);
    const definitions = new Set(allObjects.filter((node) => node['@type'] && node['@id']).map((node) => node['@id']));
    const unresolved = allObjects.filter((node) => node['@id'] && !node['@type'] && !definitions.has(node['@id']));
    expect(unresolved).toEqual([]);
    const schoolDefinitions = nodes.filter((node) => isType(node, 'EducationalOrganization'));
    schoolDefinitions.forEach((node) => expect(node).toEqual(schoolDefinitions[0]));
  });

  it('describes one course with four visible study rhythms and a separate private-class service', () => {
    const guide = read('curso-portugues-online.html');
    const nodes = graph(guide);
    const courses = nodes.filter((node) => isType(node, 'Course'));
    const services = nodes.filter((node) => isType(node, 'Service'));
    expect(courses).toHaveLength(1);
    expect(services).toHaveLength(1);
    expect(courses[0].provider).toEqual({ '@id': `${origin}/#organization` });
    expect(services[0].provider).toEqual({ '@id': `${origin}/#organization` });
    expect(courses[0].hasCourseInstance).toHaveLength(4);
    const text = visibleText(guide);
    const rhythms = courses[0].hasCourseInstance;
    const names = rhythms.map((instance: Record<string, any>) => instance.name);
    expect(new Set(names).size).toBe(4);
    rhythms.forEach((instance: Record<string, any>) => {
      expect(isType(instance, 'CourseInstance')).toBe(true);
      expect(instance.courseMode).toBeTruthy();
      expect(instance.name).toBeTruthy();
      expect(text.toLowerCase()).toContain(instance.name.toLowerCase());
      const instanceUrl = new URL(instance.url);
      expect(`${instanceUrl.origin}${instanceUrl.pathname}`).toBe(canonicalFor('curso-portugues-online.html'));
      expect(instanceUrl.hash).toBeTruthy();
      const ids = [...guide.matchAll(/<[a-z][^>]*>/gi)].map(([tag]) => attr(tag, 'id'));
      expect(ids).toContain(decodeURIComponent(instanceUrl.hash.slice(1)));
    });
    pages.filter((file) => file !== 'curso-portugues-online.html').forEach((file) => {
      expect(graph(read(file)).filter((node) => isType(node, 'Course') || isType(node, 'Service'))).toHaveLength(0);
    });
  });

  it('lists only the canonical, indexable marketing pages in the sitemap', () => {
    const sitemap = read('sitemap.xml');
    const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => decode(match[1]));
    expect(urls.sort()).toEqual(pages.map(canonicalFor).sort());
    urls.forEach((href) => {
      const url = new URL(href);
      expect(url.origin).toBe(origin);
      expect(url.hash).toBe('');
      expect(url.search).toBe('');
      const html = read(localFile(url));
      expect(canonical(html)).toEqual([href]);
      expect(metadata(html, 'robots')[0]).not.toMatch(/noindex/i);
    });
    expect(read('robots.txt')).toContain(`Sitemap: ${origin}/sitemap.xml`);
  });

  it('ships FAQ answers readable before JavaScript initializes the accordion', () => {
    const html = read('index.html');
    const triggers = tags(html, 'button').filter((tag) => hasClass(tag, 'faq-trigger'));
    const panels = tags(html, 'div').filter((tag) => hasClass(tag, 'faq-panel'));
    expect(triggers.length).toBeGreaterThan(0);
    expect(panels).toHaveLength(triggers.length);
    triggers.forEach((trigger) => {
      expect(attr(trigger, 'aria-expanded')).toBe('true');
      const panel = panels.find((tag) => attr(tag, 'id') === attr(trigger, 'aria-controls'));
      expect(panel).toBeDefined();
      expect(attr(panel!, 'hidden')).toBeNull();
      expect(attr(panel!, 'inert')).toBeNull();
      expect(attr(panel!, 'aria-hidden')).not.toBe('true');
      expect(attr(panel!, 'aria-labelledby')).toBe(attr(trigger, 'id'));
      const remainder = html.slice(html.indexOf(panel!) + panel!.length);
      const paragraph = remainder.match(/<p\b[^>]*>([\s\S]*?)<\/p>/i)?.[1] ?? '';
      expect(visibleText(paragraph)).toBeTruthy();
    });
    const questions = [...html.matchAll(/<button\b[^>]*class="faq-trigger"[^>]*>([\s\S]*?)<\/button>/gi)]
      .map((match) => visibleText(match[1]));
    expect(questions.some((question) => /celpe|caple/i.test(question))).toBe(false);
  });
});
