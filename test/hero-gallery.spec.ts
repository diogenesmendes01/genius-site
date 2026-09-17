import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const galleryScript = readFileSync(join(__dirname, '../public/hero-gallery.js'), 'utf8');

class Events {
  private listeners = new Map<string, Set<(event: any) => void>>();
  addEventListener(type: string, listener: (event: any) => void) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type)!.add(listener);
  }
  removeEventListener(type: string, listener: (event: any) => void) {
    this.listeners.get(type)?.delete(listener);
  }
  emit(type: string, fields = {}) {
    this.listeners.get(type)?.forEach((listener) => listener(fields));
  }
}

class Element extends Events {
  attributes = new Map<string, string>();
  hidden = false;
  disabled = false;
  textContent = '';
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  hasAttribute(name: string) { return this.attributes.has(name); }
  removeAttribute(name: string) { this.attributes.delete(name); }
  toggleAttribute(name: string, value: boolean) {
    if (value) this.setAttribute(name, '');
    else this.removeAttribute(name);
  }
}

type LoadMode = 'loaded' | 'pending' | 'failed';
class Photo extends Element {
  complete = false;
  naturalWidth = 0;
  alt = 'Una clase de portugués en vivo.';
  decode = jest.fn(() => Promise.resolve());
  constructor(public mode: LoadMode, source: string, initial = false) {
    super();
    this.setAttribute(initial ? 'src' : 'data-src', source);
    if (initial && mode !== 'pending') this.finish(mode === 'loaded');
  }
  set src(source: string) {
    this.setAttribute('src', source);
    if (this.mode !== 'pending') this.finish(this.mode === 'loaded');
  }
  finish(success = true) {
    this.complete = true;
    this.naturalWidth = success ? 1672 : 0;
    this.emit(success ? 'load' : 'error');
  }
}

function setup({ reduced = false, initial = 'loaded' as LoadMode, extras = ['loaded', 'loaded'] as LoadMode[] } = {}) {
  const gallery = new Element();
  const controls = new Element();
  controls.hidden = true;
  const toggle = new Element();
  const label = new Element();
  const status = new Element();
  const slides = [new Photo(initial, 'first.webp', true), ...extras.map((mode, index) => new Photo(mode, `extra-${index}.webp`))];
  const buttons = slides.map(() => new Element());
  slides[0].setAttribute('data-active', '');
  buttons[0].setAttribute('aria-pressed', 'true');
  slides.slice(1).forEach((slide) => slide.setAttribute('aria-hidden', 'true'));
  const selectors: Record<string, Element[]> = {
    '[data-hero-slide]': slides,
    '[data-hero-controls]': [controls],
    '[data-hero-toggle]': [toggle],
    '[data-hero-toggle-label]': [label],
    '[data-hero-select]': buttons,
    '[data-hero-status]': [status],
  };
  Object.assign(gallery, {
    querySelector: (selector: string) => selectors[selector]?.[0] ?? null,
    querySelectorAll: (selector: string) => selectors[selector] ?? [],
  });
  const media = Object.assign(new Events(), { matches: reduced });
  const document = Object.assign(new Events(), {
    hidden: false,
    querySelectorAll: () => [gallery],
  });
  let intersection: (entries: any[]) => void;
  runInNewContext(galleryScript, {
    document,
    window: { matchMedia: () => media },
    setTimeout,
    clearTimeout,
    IntersectionObserver: class {
      constructor(callback: (entries: any[]) => void) { intersection = callback; }
      observe() {}
    },
  }, { filename: 'public/hero-gallery.js' });
  intersection!([{ isIntersecting: true }]);
  return {
    gallery, controls, toggle, label, status, slides, buttons, document,
    active: () => slides.findIndex((slide) => slide.hasAttribute('data-active')),
    motion(matches: boolean) { media.matches = matches; media.emit('change'); },
    visibility(hidden: boolean) { document.hidden = hidden; document.emit('visibilitychange'); },
    inView(isIntersecting: boolean) { intersection([{ isIntersecting }]); },
    hover(enter: boolean, pointerType = 'mouse') { gallery.emit(enter ? 'pointerenter' : 'pointerleave', { pointerType }); },
    choose(index: number) { buttons[index].emit('click', { detail: 1 }); },
    keyboardToggle() { toggle.emit('click', { detail: 0 }); },
    pointerToggle() {
      toggle.emit('pointerdown');
      gallery.emit('focusin');
      toggle.emit('click', { detail: 1 });
    },
  };
}

describe('hero photo gallery', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('waits for the first image before fetching extras, then changes only photos every eight seconds', async () => {
    const page = setup({ initial: 'pending' });
    expect(page.controls.hidden).toBe(false);
    expect(page.slides[1].getAttribute('src')).toBeNull();
    page.slides[0].finish();
    await jest.advanceTimersByTimeAsync(0);
    expect(page.slides[1].getAttribute('src')).toBe('extra-0.webp');
    await jest.advanceTimersByTimeAsync(7999);
    expect(page.active()).toBe(0);
    await jest.advanceTimersByTimeAsync(1);
    expect(page.active()).toBe(1);
    expect(page.status.textContent).toBe('');
    expect(page.slides[0].getAttribute('aria-hidden')).toBe('true');
    expect(page.slides[1].getAttribute('aria-hidden')).toBeNull();
    expect(page.buttons[1].getAttribute('aria-pressed')).toBe('true');
    await jest.advanceTimersByTimeAsync(8000);
    expect(page.active()).toBe(2);
  });

  it('pauses on mouse hover and restarts a full interval on leave, without treating touch as hover', async () => {
    const page = setup();
    await jest.advanceTimersByTimeAsync(3000);
    page.hover(true);
    await jest.advanceTimersByTimeAsync(16000);
    expect(page.active()).toBe(0);
    page.hover(false);
    page.hover(true, 'touch');
    await jest.advanceTimersByTimeAsync(8000);
    expect(page.active()).toBe(1);
  });

  it('keeps keyboard focus and manual selections paused until an explicit resume', async () => {
    const page = setup();
    page.gallery.emit('focusin');
    await jest.advanceTimersByTimeAsync(16000);
    expect(page.active()).toBe(0);
    expect(page.label.textContent).toBe('Reanudar');
    page.choose(2);
    await jest.advanceTimersByTimeAsync(0);
    expect(page.active()).toBe(2);
    expect(page.gallery.hasAttribute('data-instant')).toBe(true);
    expect(page.status.textContent).toContain('Foto 3 de 3');
    await jest.advanceTimersByTimeAsync(16000);
    expect(page.active()).toBe(2);
    page.keyboardToggle();
    await jest.advanceTimersByTimeAsync(8000);
    expect(page.active()).toBe(0);
    expect(page.gallery.hasAttribute('data-instant')).toBe(false);
  });

  it('does not accidentally resume when clicking Pause also focuses the control', async () => {
    const page = setup();
    page.pointerToggle();
    expect(page.label.textContent).toBe('Reanudar');
    await jest.advanceTimersByTimeAsync(16000);
    expect(page.active()).toBe(0);
    page.pointerToggle();
    await jest.advanceTimersByTimeAsync(8000);
    expect(page.active()).toBe(1);
  });

  it.each(['visibility', 'inView'])('suspends the timer while %s is inactive and preserves a manual pause', async (condition) => {
    const page = setup();
    await jest.advanceTimersByTimeAsync(4000);
    if (condition === 'visibility') page.visibility(true);
    else page.inView(false);
    await jest.advanceTimersByTimeAsync(20000);
    expect(page.active()).toBe(0);
    if (condition === 'visibility') page.visibility(false);
    else page.inView(true);
    await jest.advanceTimersByTimeAsync(7999);
    expect(page.active()).toBe(0);
    await jest.advanceTimersByTimeAsync(1);
    expect(page.active()).toBe(1);
    page.choose(2);
    await jest.advanceTimersByTimeAsync(0);
    page.visibility(true);
    page.visibility(false);
    page.inView(false);
    page.inView(true);
    await jest.advanceTimersByTimeAsync(16000);
    expect(page.active()).toBe(2);
  });

  it('honors reduced motion at startup and after live preference changes', async () => {
    const page = setup({ reduced: true });
    expect(page.label.textContent).toBe('Ver fotos');
    expect(page.gallery.hasAttribute('data-instant')).toBe(true);
    await jest.advanceTimersByTimeAsync(20000);
    expect(page.active()).toBe(0);
    page.motion(false);
    await jest.advanceTimersByTimeAsync(8000);
    expect(page.active()).toBe(1);
    expect(page.gallery.hasAttribute('data-instant')).toBe(false);
    page.motion(true);
    await jest.advanceTimersByTimeAsync(16000);
    expect(page.active()).toBe(1);
    page.keyboardToggle();
    await jest.advanceTimersByTimeAsync(0);
    expect(page.active()).toBe(2);
    expect(page.gallery.hasAttribute('data-instant')).toBe(true);
    page.motion(false);
    await jest.advanceTimersByTimeAsync(16000);
    expect(page.active()).toBe(2); // Manual choices remain paused after preference changes.
  });

  it('leaves the current photo visible until the next image has loaded and decoded', async () => {
    const page = setup({ extras: ['pending', 'loaded'] });
    let finishDecode!: () => void;
    page.slides[1].decode.mockImplementation(() => new Promise<void>((resolve) => { finishDecode = resolve; }));
    await jest.advanceTimersByTimeAsync(10000);
    expect(page.active()).toBe(0);
    page.slides[1].finish();
    await jest.advanceTimersByTimeAsync(0);
    expect(page.active()).toBe(0);
    finishDecode();
    await jest.advanceTimersByTimeAsync(0);
    expect(page.active()).toBe(1);
    await jest.advanceTimersByTimeAsync(7999);
    expect(page.active()).toBe(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(page.active()).toBe(2);
  });

  it('skips failed photos without blanking the hero or selecting their controls', async () => {
    const page = setup({ extras: ['failed', 'loaded'] });
    await jest.advanceTimersByTimeAsync(8000);
    expect(page.active()).toBe(2);
    expect(page.buttons[1].disabled).toBe(true);
    expect(page.buttons[1].getAttribute('aria-pressed')).not.toBe('true');
    await jest.advanceTimersByTimeAsync(8000);
    expect(page.active()).toBe(0);
  });

  it('ignores an obsolete slow download after a newer manual selection', async () => {
    const page = setup({ extras: ['pending', 'loaded'] });
    await jest.advanceTimersByTimeAsync(0);
    page.choose(1);
    await jest.advanceTimersByTimeAsync(0);
    page.choose(2);
    await jest.advanceTimersByTimeAsync(0);
    expect(page.active()).toBe(2);
    page.slides[1].finish();
    await jest.advanceTimersByTimeAsync(0);
    expect(page.active()).toBe(2);
    expect(page.status.textContent).toContain('Foto 3 de 3');
  });

  it('preserves a manual selection through hover, offscreen, and tab visibility changes while downloading', async () => {
    const page = setup({ extras: ['pending', 'loaded'] });
    await jest.advanceTimersByTimeAsync(0);
    page.choose(1);
    await jest.advanceTimersByTimeAsync(0);
    page.hover(true);
    page.hover(false);
    page.visibility(true);
    page.inView(false);
    page.slides[1].finish();
    await jest.advanceTimersByTimeAsync(0);
    expect(page.active()).toBe(1);
    page.visibility(false);
    page.inView(true);
    await jest.advanceTimersByTimeAsync(16000);
    expect(page.active()).toBe(1);
  });

  it('lets reduced-motion visitors advance past a failed photo', async () => {
    const page = setup({ reduced: true, extras: ['failed', 'loaded'] });
    await jest.advanceTimersByTimeAsync(0);
    page.keyboardToggle();
    await jest.advanceTimersByTimeAsync(0);
    expect(page.active()).toBe(2);
    page.keyboardToggle();
    await jest.advanceTimersByTimeAsync(0);
    expect(page.active()).toBe(0);
  });

  it('does not complete a pending automatic transition after being paused', async () => {
    const page = setup({ extras: ['pending', 'loaded'] });
    await jest.advanceTimersByTimeAsync(8000);
    page.gallery.emit('focusin');
    page.slides[1].finish();
    await jest.advanceTimersByTimeAsync(0);
    expect(page.active()).toBe(0);
    page.keyboardToggle();
    await jest.advanceTimersByTimeAsync(8000);
    expect(page.active()).toBe(1);
  });
});
