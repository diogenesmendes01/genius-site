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

function setup({ reduced = false, initial = 'loaded' as LoadMode, extras = ['loaded', 'loaded'] as LoadMode[], random = (): number => 0 } = {}) {
  const gallery = new Element();
  const toggle = new Element();
  toggle.hidden = true;
  const label = new Element();
  const slides = [new Photo(initial, 'first.webp', true), ...extras.map((mode, index) => new Photo(mode, `extra-${index}.webp`))];
  slides[0].setAttribute('data-active', '');
  slides.slice(1).forEach((slide) => slide.setAttribute('aria-hidden', 'true'));
  const selectors: Record<string, Element[]> = {
    '[data-hero-slide]': slides,
    '[data-hero-toggle]': [toggle],
    '[data-hero-toggle-label]': [label],
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
    Math: Object.assign(Object.create(Math), { random }),
    setTimeout,
    clearTimeout,
    IntersectionObserver: class {
      constructor(callback: (entries: any[]) => void) { intersection = callback; }
      observe() {}
    },
  }, { filename: 'public/hero-gallery.js' });
  intersection!([{ isIntersecting: true }]);
  return {
    gallery, toggle, label, slides, document,
    active: () => slides.findIndex((slide) => slide.hasAttribute('data-active')),
    motion(matches: boolean) { media.matches = matches; media.emit('change'); },
    visibility(hidden: boolean) { document.hidden = hidden; document.emit('visibilitychange'); },
    inView(isIntersecting: boolean) { intersection([{ isIntersecting }]); },
    escape() { document.emit('keydown', { key: 'Escape' }); },
    activateToggle() { toggle.emit('click'); },
  };
}

describe('ambient hero photos', () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it('prioritizes the initial image, then changes photos after a full six-second interval', async () => {
    const page = setup({ initial: 'pending' });
    expect(page.toggle.hidden).toBe(false);
    expect(page.slides[1].getAttribute('src')).toBeNull();
    await jest.advanceTimersByTimeAsync(9000);
    expect(page.active()).toBe(0);
    page.slides[0].finish();
    await jest.advanceTimersByTimeAsync(0);
    expect(page.slides[1].getAttribute('src')).toBe('extra-0.webp');
    await jest.advanceTimersByTimeAsync(5999);
    expect(page.active()).toBe(0);
    await jest.advanceTimersByTimeAsync(1);
    expect(page.active()).toBe(1);
    expect(page.slides[0].getAttribute('aria-hidden')).toBe('true');
    expect(page.slides[1].getAttribute('aria-hidden')).toBeNull();
  });

  it.each([0, 0.99])('randomizes the order without repeats and shows each remaining photo (random=%s)', async (randomValue) => {
    const page = setup({ random: () => randomValue });
    const seen = [page.active()];
    for (let i = 0; i < 8; i += 1) {
      await jest.advanceTimersByTimeAsync(6000);
      seen.push(page.active());
    }
    expect(seen[1]).toBe(randomValue === 0 ? 1 : 2);
    for (let index = 1; index < seen.length; index += 1) expect(seen[index]).not.toBe(seen[index - 1]);
    for (let index = 0; index < seen.length - 2; index += 2) {
      expect(new Set(seen.slice(index, index + 3)).size).toBe(3);
    }
  });

  it('keeps playing while hovering or focusing a hero link', async () => {
    const page = setup();
    page.gallery.emit('pointerenter', { pointerType: 'mouse' });
    page.gallery.emit('focusin');
    await jest.advanceTimersByTimeAsync(6000);
    expect(page.active()).toBe(1);
    page.gallery.emit('pointerleave', { pointerType: 'mouse' });
    await jest.advanceTimersByTimeAsync(6000);
    expect(page.active()).toBe(2);
  });

  it('pauses through Escape and the keyboard control, and resumes only on explicit activation', async () => {
    const page = setup();
    page.escape();
    expect(page.label.textContent).toBe('Reanudar animación');
    expect(page.toggle.getAttribute('aria-label')).toBe('Reanudar animación de las fotos');
    page.visibility(true);
    page.visibility(false);
    page.inView(false);
    page.inView(true);
    await jest.advanceTimersByTimeAsync(16000);
    expect(page.active()).toBe(0);
    page.activateToggle();
    expect(page.label.textContent).toBe('Pausar animación');
    await jest.advanceTimersByTimeAsync(6000);
    expect(page.active()).toBe(1);
    page.activateToggle();
    await jest.advanceTimersByTimeAsync(16000);
    expect(page.active()).toBe(1);
  });

  it.each(['hidden', 'offscreen'])('suspends playback while %s and restarts a full interval on return', async (condition) => {
    const page = setup();
    await jest.advanceTimersByTimeAsync(3000);
    if (condition === 'hidden') page.visibility(true);
    else page.inView(false);
    await jest.advanceTimersByTimeAsync(16000);
    expect(page.active()).toBe(0);
    if (condition === 'hidden') page.visibility(false);
    else page.inView(true);
    await jest.advanceTimersByTimeAsync(5999);
    expect(page.active()).toBe(0);
    await jest.advanceTimersByTimeAsync(1);
    expect(page.active()).toBe(1);
  });

  it('uses a slower reduced-motion cadence and responds to live preference changes', async () => {
    const page = setup({ reduced: true });
    await jest.advanceTimersByTimeAsync(9999);
    expect(page.active()).toBe(0);
    await jest.advanceTimersByTimeAsync(1);
    expect(page.active()).toBe(1);
    page.motion(false);
    await jest.advanceTimersByTimeAsync(6000);
    expect(page.active()).toBe(2);
    page.motion(true);
    await jest.advanceTimersByTimeAsync(6000);
    expect(page.active()).toBe(2);
    await jest.advanceTimersByTimeAsync(4000);
    expect(page.active()).toBe(0);
  });

  it('keeps the current image visible until the next photo has both loaded and decoded', async () => {
    const page = setup({ extras: ['pending', 'loaded'] });
    let finishDecode!: () => void;
    page.slides[1].decode.mockImplementation(() => new Promise<void>((resolve) => { finishDecode = resolve; }));
    await jest.advanceTimersByTimeAsync(9000);
    expect(page.active()).toBe(0);
    page.slides[1].finish();
    await jest.advanceTimersByTimeAsync(0);
    expect(page.active()).toBe(0);
    finishDecode();
    await jest.advanceTimersByTimeAsync(0);
    expect(page.active()).toBe(1);
    await jest.advanceTimersByTimeAsync(5999);
    expect(page.active()).toBe(1);
    await jest.advanceTimersByTimeAsync(1);
    expect(page.active()).toBe(2);
  });

  it.each(['load', 'decode'])('skips a photo after a %s failure without blanking the image', async (failure) => {
    const page = setup({ extras: ['pending', 'loaded'] });
    await jest.advanceTimersByTimeAsync(6000);
    if (failure === 'decode') page.slides[1].decode.mockRejectedValueOnce(new Error('Invalid image'));
    page.slides[1].finish(failure !== 'load');
    await jest.advanceTimersByTimeAsync(0);
    expect(page.active()).toBe(2);
    await jest.advanceTimersByTimeAsync(6000);
    expect(page.active()).toBe(0);
  });

  it('retains the initial photo and stops scheduling when every additional image fails', async () => {
    const page = setup({ extras: ['failed', 'failed'] });
    await jest.advanceTimersByTimeAsync(18000);
    expect(page.active()).toBe(0);
    expect(jest.getTimerCount()).toBe(0);
  });

  it.each(['pause', 'hidden', 'offscreen'])('ignores a late download after %s, retaining that photo for the next cycle', async (condition) => {
    const page = setup({ extras: ['pending', 'loaded'] });
    await jest.advanceTimersByTimeAsync(6000);
    if (condition === 'pause') page.escape();
    if (condition === 'hidden') page.visibility(true);
    if (condition === 'offscreen') page.inView(false);
    page.slides[1].finish();
    await jest.advanceTimersByTimeAsync(0);
    expect(page.active()).toBe(0);
    if (condition === 'pause') page.activateToggle();
    if (condition === 'hidden') page.visibility(false);
    if (condition === 'offscreen') page.inView(true);
    await jest.advanceTimersByTimeAsync(6000);
    expect(page.active()).toBe(1);
    await jest.advanceTimersByTimeAsync(6000);
    expect(page.active()).toBe(2);
  });
});
