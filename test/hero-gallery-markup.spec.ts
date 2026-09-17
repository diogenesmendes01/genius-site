import { createHash } from 'node:crypto';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

// The gallery behaviour is covered against a modelled DOM in hero-gallery.spec.ts.
// These checks guard the other half of the contract: that the shipped pages still
// expose the hooks that script reads, and that the cache-busting versions on the
// stylesheet links still describe the files they point at.
const publicDir = join(__dirname, '../public');
const pages = ['index.html', 'metodologia.html', 'sobre-nos.html'];
const read = (name: string) => readFileSync(join(publicDir, name), 'utf8');

const tags = (html: string, name: string): string[] => html.match(new RegExp(`<${name}\\b[^>]*>`, 'g')) ?? [];
const attr = (tag: string, name: string) => {
  const valued = tag.match(new RegExp(`\\s${name}="([^"]*)"`));
  if (valued) return valued[1];
  return new RegExp(`\\s${name}(?=[\\s>])`).test(tag) ? '' : null;
};
const version = (asset: string) => createHash('sha256').update(readFileSync(join(publicDir, asset))).digest('hex').slice(0, 10);

describe.each(pages)('hero gallery markup in %s', (page) => {
  const html = read(page);
  const slides = tags(html, 'img').filter((tag) => attr(tag, 'data-hero-slide') !== null);

  it('loads the gallery script and wraps the hero in a single gallery root', () => {
    expect(html).toContain('<script src="hero-gallery.js" defer></script>');
    expect(tags(html, 'div').concat(tags(html, 'section')).filter((tag) => attr(tag, 'data-hero-gallery') !== null)).toHaveLength(1);
  });

  it('ships enough slides for a sequence, with exactly one marked active', () => {
    // The script gives up on a hero with fewer than two slides.
    expect(slides.length).toBeGreaterThanOrEqual(2);
    expect(slides.filter((tag) => attr(tag, 'data-active') !== null)).toHaveLength(1);
  });

  it('gives the active slide priority and defers the rest behind data-src', () => {
    slides.forEach((tag) => {
      const active = attr(tag, 'data-active') !== null;
      const source = active ? attr(tag, 'src') : attr(tag, 'data-src');
      expect(source).toBeTruthy();
      expect(existsSync(join(publicDir, source!))).toBe(true);
      // A queued slide must not carry src, or it would compete with the LCP image.
      expect(attr(tag, active ? 'data-src' : 'src')).toBeNull();
      expect(attr(tag, 'fetchpriority')).toBe(active ? 'high' : 'low');
      expect(attr(tag, 'aria-hidden')).toBe(active ? null : 'true');
      expect(attr(tag, 'alt')).toBeTruthy();
    });
  });

  it('exposes the accessible pause control the script reveals', () => {
    const toggles = tags(html, 'button').filter((tag) => attr(tag, 'data-hero-toggle') !== null);
    expect(toggles).toHaveLength(1);
    expect(attr(toggles[0], 'hidden')).toBe('');
    expect(tags(html, 'span').filter((tag) => attr(tag, 'data-hero-toggle-label') !== null)).toHaveLength(1);
  });

  it('keeps every versioned stylesheet link in step with the file on disk', () => {
    const links = tags(html, 'link').filter((tag) => attr(tag, 'rel') === 'stylesheet' && attr(tag, 'href')?.includes('?v='));
    expect(links.length).toBeGreaterThan(0);
    links.forEach((tag) => {
      const [asset, query] = attr(tag, 'href')!.split('?v=');
      expect(query).toBe(version(asset));
    });
  });
});

describe('hero gallery styling hooks', () => {
  const css = readFileSync(join(publicDir, 'landing.css'), 'utf8');

  it('frames the practice scene through a class instead of its file name', () => {
    expect(css).toContain('.hero-slide-practice');
    // Asset names change between revisions; the framing rule must not depend on one.
    expect(css).not.toMatch(/\[src[$^*]?=/);
    pages.forEach((page) => expect(read(page)).toContain('class="hero-slide hero-slide-practice"'));
  });
});
