(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const easing = 'cubic-bezier(0.23, 1, 0.32, 1)';
  const entryAnimations = new Set();
  const animateEntry = (element, keyframes, options) => {
    if (reducedMotion.matches || !element.animate) return;
    const animation = element.animate(keyframes, { easing, fill: 'backwards', ...options });
    entryAnimations.add(animation);
    animation.onfinish = animation.oncancel = () => entryAnimations.delete(animation);
  };
  let keyboardNavigation = false;
  document.addEventListener('keydown', () => { keyboardNavigation = true; });
  document.addEventListener('pointerdown', () => { keyboardNavigation = false; }, { passive: true });

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const target = document.getElementById(link.hash.slice(1));
      if (!target) return;
      event.preventDefault();
      target.scrollIntoView({ behavior: reducedMotion.matches || event.detail === 0 ? 'instant' : 'smooth' });
      if (event.detail === 0) {
        target.setAttribute('tabindex', '-1');
        target.focus({ preventScroll: true });
      }
    });
  });

  const pendingContacts = new Map();
  const contactStatus = document.getElementById('contact-status');
  const resetContact = (link) => {
    clearTimeout(pendingContacts.get(link));
    pendingContacts.delete(link);
    link.removeAttribute('aria-busy');
    link.removeAttribute('aria-disabled');
    link.removeAttribute('aria-label');
    if (pendingContacts.size === 0) contactStatus.textContent = '';
  };
  document.querySelectorAll('[data-whatsapp]').forEach((link) => {
    link.addEventListener('click', (event) => {
      if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
      if (pendingContacts.has(link)) {
        event.preventDefault();
        return;
      }
      link.setAttribute('aria-busy', 'true');
      link.setAttribute('aria-disabled', 'true');
      link.setAttribute('aria-label', 'Abriendo WhatsApp…');
      contactStatus.textContent = 'Abriendo WhatsApp…';
      // Keep the native link action synchronous, so the browser can open the chat.
      pendingContacts.set(link, setTimeout(() => resetContact(link), 1800));
    });
  });
  addEventListener('pageshow', () => [...pendingContacts.keys()].forEach(resetContact));

  const faqTriggers = [...document.querySelectorAll('.faq-trigger')];
  const faqAnimations = new Map();
  const setFaq = (trigger, expanded, instant = false) => {
    const panel = document.getElementById(trigger.getAttribute('aria-controls'));
    const fromHeight = panel.hidden ? 0 : panel.getBoundingClientRect().height;
    const fromOpacity = panel.hidden ? 0 : Number(getComputedStyle(panel).opacity);
    const previous = faqAnimations.get(panel);
    if (previous) {
      previous.onfinish = null;
      previous.cancel();
      faqAnimations.delete(panel);
    }
    trigger.toggleAttribute('data-instant', instant || reducedMotion.matches);
    trigger.setAttribute('aria-expanded', String(expanded));
    panel.inert = !expanded;
    const finish = () => {
      panel.hidden = !expanded;
      panel.style.removeProperty('overflow');
      faqAnimations.delete(panel);
    };
    if (instant || reducedMotion.matches || !panel.animate) {
      finish();
      return;
    }
    panel.hidden = false;
    panel.style.overflow = 'hidden';
    const animation = panel.animate([
      { height: `${fromHeight}px`, opacity: fromOpacity },
      { height: `${expanded ? panel.scrollHeight : 0}px`, opacity: expanded ? 1 : 0 },
    ], { duration: 200, easing });
    faqAnimations.set(panel, animation);
    animation.onfinish = finish;
  };
  faqTriggers.forEach((trigger) => {
    trigger.addEventListener('click', (event) => {
      const expanded = trigger.getAttribute('aria-expanded') !== 'true';
      faqTriggers.forEach((other) => {
        if (other !== trigger && other.getAttribute('aria-expanded') === 'true') setFaq(other, false, event.detail === 0);
      });
      setFaq(trigger, expanded, event.detail === 0);
    });
  });
  reducedMotion.addEventListener('change', () => {
    if (!reducedMotion.matches) return;
    entryAnimations.forEach((animation) => animation.cancel());
    faqTriggers.forEach((trigger) => setFaq(trigger, trigger.getAttribute('aria-expanded') === 'true', true));
  });

  const tabs = [...document.querySelectorAll('[role="tab"]')];
  const selectStory = (tab) => {
    tabs.forEach((item) => {
      const selected = item === tab;
      item.setAttribute('aria-selected', String(selected));
      item.tabIndex = selected ? 0 : -1;
      document.getElementById(item.getAttribute('aria-controls')).hidden = !selected;
    });
  };
  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => selectStory(tab));
    tab.addEventListener('keydown', (event) => {
      if (event.altKey || event.ctrlKey || event.metaKey) return;
      let next;
      if (event.key === 'ArrowRight') next = (index + 1) % tabs.length;
      if (event.key === 'ArrowLeft') next = (index - 1 + tabs.length) % tabs.length;
      if (event.key === 'Home') next = 0;
      if (event.key === 'End') next = tabs.length - 1;
      if (next === undefined) return;
      event.preventDefault();
      selectStory(tabs[next]);
      tabs[next].focus();
    });
  });

  const sticky = document.querySelector('.mobile-cta');
  const visiblePrimary = new Set();
  const updateSticky = () => {
    const length = document.documentElement.scrollHeight - innerHeight;
    const pastThreshold = length > 0 && scrollY / length >= .4;
    sticky.hidden = !pastThreshold || innerWidth > 767 || visiblePrimary.size > 0;
  };
  const primaryObserver = new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      if (isIntersecting) visiblePrimary.add(target);
      else visiblePrimary.delete(target);
    });
    updateSticky();
  });
  document.querySelectorAll('main [data-primary]').forEach((button) => primaryObserver.observe(button));
  addEventListener('scroll', updateSticky, { passive: true });
  addEventListener('resize', updateSticky, { passive: true });
  updateSticky();

  if (reducedMotion.matches) return;
  const heroCopy = document.querySelector('.hero-copy');
  const heroElements = getComputedStyle(heroCopy).display === 'contents'
    ? [...heroCopy.children, document.querySelector('.class-visual')]
    : [heroCopy, document.querySelector('.class-visual')];
  heroElements.forEach((element) => animateEntry(element, [
    { opacity: 0, transform: 'translateY(12px)' },
    { opacity: 1, transform: 'translateY(0)' },
  ], { duration: 500 }));

  const stagger = new WeakMap();
  document.querySelectorAll('.steps-grid, .course-grid, .feature-grid').forEach((group) => {
    [...group.children].forEach((element, index) => stagger.set(element, index * 100));
  });
  const reveal = new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      if (!isIntersecting) return;
      reveal.unobserve(target);
      if (keyboardNavigation || reducedMotion.matches || !target.animate) return;
      animateEntry(target, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: stagger.get(target) || 0 });
    });
  }, { threshold: .12 });
  document.querySelectorAll('.steps-grid > li, .course, .private-layout, .method-grid > div, .inner-reveal').forEach((element) => reveal.observe(element));
})();
