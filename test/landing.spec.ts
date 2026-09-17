import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { runInNewContext } from 'node:vm';

const landingScript = readFileSync(join(__dirname, '../public/landing.js'), 'utf8');

// Only the browser surfaces used by the script are modeled. Animations stay
// pending until cancelled, so preference changes can be tested mid-transition.
class Events {
  private listeners = new Map<string, Array<(event: any) => void>>();
  addEventListener(type: string, listener: (event: any) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) || []), listener]);
  }
  emit(type: string, fields = {}) {
    const event = { preventDefault: jest.fn(), ...fields };
    this.listeners.get(type)?.forEach((listener) => listener(event));
    return event;
  }
}

class Element extends Events {
  attributes = new Map<string, string>();
  dataset: Record<string, string> = {};
  style: any = { scrollBehavior: 'smooth', removeProperty: jest.fn() };
  children: Element[] = [];
  parentElement?: Element;
  hidden = false;
  inert = false;
  scrollHeight = 120;
  hash = '#destination';
  getBoundingClientRect = () => ({ top: 820, left: 0, height: 120 });
  scrollIntoView = jest.fn();
  focus = jest.fn();
  animate = jest.fn((_keyframes: any, _options: any) => {
    const animation = {
      onfinish: null as (() => void) | null,
      oncancel: null as (() => void) | null,
      cancel: jest.fn(() => animation.oncancel?.()),
    };
    return animation;
  });
  setAttribute(name: string, value: string) { this.attributes.set(name, value); }
  getAttribute(name: string) { return this.attributes.get(name) ?? null; }
  removeAttribute(name: string) { this.attributes.delete(name); }
  toggleAttribute(name: string, enabled: boolean) {
    if (enabled) this.setAttribute(name, '');
    else this.removeAttribute(name);
  }
}

function setup({ width = 1280, reduced = false } = {}) {
  const documentEvents = new Events();
  const windowEvents = new Events();
  const media = Object.assign(new Events(), { matches: reduced });
  const root = new Element();
  const scrollHeightReads = jest.fn(() => 4800);
  Object.defineProperty(root, 'scrollHeight', { get: scrollHeightReads });
  const hero = new Element();
  const image = new Element();
  const sticky = new Element();
  sticky.hidden = true;
  const primary = new Element();
  const anchor = new Element();
  const destination = new Element();
  const faq = new Element();
  faq.setAttribute('aria-controls', 'answer');
  faq.setAttribute('aria-expanded', 'true');
  const answer = new Element();
  answer.hidden = false;
  const group = new Element();
  const cards = Array.from({ length: 4 }, () => new Element());
  group.children = cards;
  cards.forEach((card) => { card.parentElement = group; });
  const selectors: Record<string, Element[]> = {
    'a[href^="#"]': [anchor],
    '.faq-trigger': [faq],
    '.mobile-cta': [sticky],
    'main [data-primary]': [primary],
    '.hero-copy': [hero],
    '.class-visual': [image],
    '.steps-grid, .course-grid, .feature-grid': [group],
    '.steps-grid > li, .course, .private-layout, .method-grid > div, .inner-reveal': cards,
  };
  const ids = { destination, answer, 'contact-status': new Element() };
  const document = Object.assign(documentEvents, {
    documentElement: root,
    body: new Element(),
    activeElement: null as Element | null,
    querySelector: (selector: string) => selectors[selector]?.[0] ?? null,
    querySelectorAll: (selector: string) => selectors[selector] ?? [],
    getElementById: (id: string) => ids[id] ?? null,
  });
  cards.forEach((card) => {
    card.focus.mockImplementation(() => { document.activeElement = card; });
  });
  const observers: Observer[] = [];
  class Observer {
    targets = new Set<Element>();
    constructor(private callback: (entries: any[]) => void) { observers.push(this); }
    observe(element: Element) { this.targets.add(element); }
    unobserve(element: Element) { this.targets.delete(element); }
    emit(entries: any[]) { this.callback(entries); }
  }
  const resizeCallbacks: Array<() => void> = [];
  const frames = new Map<number, () => void>();
  let frameId = 0;
  const context = {
    document,
    window: { matchMedia: () => media },
    innerWidth: width,
    innerHeight: 800,
    scrollY: 0,
    addEventListener: windowEvents.addEventListener.bind(windowEvents),
    getComputedStyle: () => ({ display: 'block', opacity: '1' }),
    IntersectionObserver: Observer,
    ResizeObserver: class {
      constructor(callback: () => void) { resizeCallbacks.push(callback); }
      observe() {}
    },
    requestAnimationFrame: jest.fn((callback: () => void) => {
      frames.set(++frameId, callback);
      return frameId;
    }),
    setTimeout,
    clearTimeout,
  };
  runInNewContext(landingScript, context, { filename: 'public/landing.js' });
  const reveal = observers.find((observer) => observer.targets.has(cards[0]))!;
  const primaryObserver = observers.find((observer) => observer.targets.has(primary))!;
  return {
    document, windowEvents, root, hero, image, cards, faq, answer, anchor,
    destination, sticky, primary, primaryObserver, context, frames,
    scrollHeightReads, resizeCallbacks,
    motion(matches: boolean) { media.matches = matches; media.emit('change'); },
    enter(items: Element[], top = 820) {
      reveal.emit(items.map((target, index) => ({
        target, isIntersecting: true, boundingClientRect: { top, left: index * 320 },
      })));
    },
    flushFrame() {
      const callbacks = [...frames.values()];
      frames.clear();
      callbacks.forEach((callback) => callback());
    },
  };
}

describe('landing page browser behavior', () => {
  it('enhances initially readable FAQ answers into a collapsed, interactive accordion', () => {
    const page = setup();
    expect(page.faq.getAttribute('aria-expanded')).toBe('false');
    expect(page.answer.hidden).toBe(true);
    expect(page.answer.inert).toBe(true);
    expect(page.answer.animate).not.toHaveBeenCalled();
    page.faq.emit('click', { detail: 0 });
    expect(page.faq.getAttribute('aria-expanded')).toBe('true');
    expect(page.answer.hidden).toBe(false);
    expect(page.answer.inert).toBe(false);
  });

  it.each(['PageDown', ' '])('%s keeps future scroll entries available', (key) => {
    const page = setup();
    page.document.emit('keydown', { key });
    page.enter([page.cards[0]]);
    expect(page.cards[0].animate).toHaveBeenCalledTimes(1);
  });

  it('does not fade a card receiving keyboard focus; pointer navigation can reveal later cards', () => {
    const page = setup();
    page.enter([page.cards[0]]);
    const inFlight = page.cards[0].animate.mock.results[0].value;
    page.document.emit('keydown', { key: 'Tab' });
    page.cards[0].focus();
    expect(page.document.activeElement).toBe(page.cards[0]);
    expect(inFlight.cancel).toHaveBeenCalledTimes(1);
    page.enter([page.cards[1]]);
    expect(page.cards[1].animate).not.toHaveBeenCalled();
    page.document.emit('pointerdown');
    page.enter([page.cards[2]]);
    expect(page.cards[2].animate).toHaveBeenCalledTimes(1);
  });

  it.each([1280, 390])('only staggers cards entering together in a desktop row (width %i)', (width) => {
    const page = setup({ width });
    page.enter(page.cards.slice(0, 2));
    expect(page.cards[0].animate.mock.calls[0][1].delay).toBe(0);
    expect(page.cards[1].animate.mock.calls[0][1].delay).toBe(width > 767 ? 100 : 0);
    page.enter([page.cards[3]]);
    expect(page.cards[3].animate.mock.calls[0][1].delay).toBe(0);
  });

  it('never fades content that is already inside the viewport', () => {
    const page = setup();
    page.enter([page.cards[0]], 120);
    expect(page.cards[0].animate).not.toHaveBeenCalled();
  });

  it('cancels entries and FAQ motion when reduced motion is enabled, and restores future transitions', () => {
    const page = setup();
    page.enter([page.cards[0]]);
    page.faq.emit('click', { detail: 1 });
    const animations = [page.hero, page.image, page.cards[0], page.answer]
      .map((element) => element.animate.mock.results[0].value);
    page.motion(true);
    animations.forEach((animation) => expect(animation.cancel).toHaveBeenCalledTimes(1));
    expect(page.answer.hidden).toBe(false);
    expect(page.faq.attributes.has('data-instant')).toBe(true);
    page.motion(false);
    expect(page.faq.attributes.has('data-instant')).toBe(false);
    page.faq.emit('click', { detail: 1 });
    expect(page.answer.animate).toHaveBeenCalledTimes(2);
    page.enter([page.cards[1]]);
    expect(page.cards[1].animate).toHaveBeenCalledTimes(1);
  });

  it('allows future scroll entries after an initial reduced-motion preference is turned off', () => {
    const page = setup({ reduced: true });
    expect(page.hero.animate).not.toHaveBeenCalled();
    page.enter([page.cards[0]]);
    expect(page.cards[0].animate).not.toHaveBeenCalled();
    page.motion(false);
    page.enter([page.cards[1]]);
    expect(page.cards[1].animate).toHaveBeenCalledTimes(1);
  });

  it.each([
    { detail: 0, reduced: false },
    { detail: 1, reduced: true },
  ])('overrides CSS smooth scrolling for immediate anchor navigation (%j)', ({ detail, reduced }) => {
    const page = setup({ reduced });
    page.destination.scrollIntoView.mockImplementation((options) => {
      expect(options.behavior).toBe('auto');
      expect(page.root.style.scrollBehavior).toBe('auto');
    });
    const event = page.anchor.emit('click', { detail });
    expect(page.destination.scrollIntoView).toHaveBeenCalledTimes(1);
    expect(page.root.style.scrollBehavior).toBe('smooth');
    expect(event.preventDefault).toHaveBeenCalledTimes(1);
    expect(page.destination.focus).toHaveBeenCalledTimes(detail === 0 ? 1 : 0);
  });

  it('preserves the native anchor if custom scrolling fails', () => {
    const page = setup();
    page.destination.scrollIntoView.mockImplementation(() => { throw new Error('unsupported'); });
    const event = page.anchor.emit('click', { detail: 0 });
    expect(event.preventDefault).not.toHaveBeenCalled();
    expect(page.root.style.scrollBehavior).toBe('smooth');
  });

  it('coalesces sticky updates and avoids page-height reads on desktop or when a primary CTA is visible', () => {
    const page = setup();
    expect(page.scrollHeightReads).not.toHaveBeenCalled();
    page.windowEvents.emit('scroll');
    page.flushFrame();
    expect(page.scrollHeightReads).not.toHaveBeenCalled();
    page.context.innerWidth = 390;
    page.context.scrollY = 1800;
    for (let i = 0; i < 5; i++) page.windowEvents.emit('scroll');
    page.windowEvents.emit('resize');
    page.document.emit('toggle');
    page.resizeCallbacks.forEach((callback) => callback());
    expect(page.frames.size).toBe(1);
    page.flushFrame();
    expect(page.scrollHeightReads).toHaveBeenCalledTimes(1);
    expect(page.sticky.hidden).toBe(false);
    page.primaryObserver.emit([{ target: page.primary, isIntersecting: true }]);
    page.flushFrame();
    expect(page.sticky.hidden).toBe(true);
    expect(page.scrollHeightReads).toHaveBeenCalledTimes(1);
  });
});
