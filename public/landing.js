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
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    keyboardNavigation = true;
    entryAnimations.forEach((animation) => animation.cancel());
  });
  document.addEventListener('pointerdown', () => { keyboardNavigation = false; }, { passive: true });

  document.querySelectorAll('a[href^="#"]').forEach((link) => {
    link.addEventListener('click', (event) => {
      const target = document.getElementById(link.hash.slice(1));
      if (!target) return;
      const immediate = reducedMotion.matches || event.detail === 0;
      const rootStyle = document.documentElement.style;
      const previousBehavior = rootStyle.scrollBehavior;
      if (immediate) rootStyle.scrollBehavior = 'auto';
      try {
        target.scrollIntoView({ behavior: immediate ? 'auto' : 'smooth' });
      } catch {
        // Preserve the native anchor when a browser cannot perform the custom scroll.
        return;
      } finally {
        if (immediate) rootStyle.scrollBehavior = previousBehavior;
      }
      event.preventDefault();
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
    // Answers are readable in the HTML when JavaScript is unavailable.
    // Collapse only after the accordion behavior has been initialized.
    setFaq(trigger, false, true);
    trigger.addEventListener('click', (event) => {
      const expanded = trigger.getAttribute('aria-expanded') !== 'true';
      faqTriggers.forEach((other) => {
        if (other !== trigger && other.getAttribute('aria-expanded') === 'true') setFaq(other, false, event.detail === 0);
      });
      setFaq(trigger, expanded, event.detail === 0);
    });
  });
  reducedMotion.addEventListener('change', () => {
    if (!reducedMotion.matches) {
      faqTriggers.forEach((trigger) => trigger.removeAttribute('data-instant'));
      return;
    }
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
  let stickyFrame = 0;
  const updateSticky = () => {
    stickyFrame = 0;
    if (innerWidth > 767 || visiblePrimary.size > 0) {
      if (!sticky.hidden) sticky.hidden = true;
      return;
    }
    const length = document.documentElement.scrollHeight - innerHeight;
    const pastThreshold = length > 0 && scrollY / length >= .4;
    const hidden = !pastThreshold;
    if (sticky.hidden !== hidden) sticky.hidden = hidden;
  };
  const scheduleSticky = () => {
    if (!stickyFrame) stickyFrame = requestAnimationFrame(updateSticky);
  };
  const primaryObserver = new IntersectionObserver((entries) => {
    entries.forEach(({ target, isIntersecting }) => {
      if (isIntersecting) visiblePrimary.add(target);
      else visiblePrimary.delete(target);
    });
    scheduleSticky();
  });
  document.querySelectorAll('main [data-primary]').forEach((button) => primaryObserver.observe(button));
  addEventListener('scroll', scheduleSticky, { passive: true });
  addEventListener('resize', scheduleSticky, { passive: true });
  document.addEventListener('toggle', scheduleSticky, true);
  if (typeof ResizeObserver !== 'undefined') {
    new ResizeObserver(scheduleSticky).observe(document.body);
  }
  updateSticky();

  const heroCopy = document.querySelector('.hero-copy');
  const heroElements = getComputedStyle(heroCopy).display === 'contents'
    ? [...heroCopy.children, document.querySelector('.class-visual')]
    : [heroCopy, document.querySelector('.class-visual')];
  heroElements.forEach((element) => animateEntry(element, [
    { opacity: 0, transform: 'translateY(12px)' },
    { opacity: 1, transform: 'translateY(0)' },
  ], { duration: 500 }));

  const reveal = new IntersectionObserver((entries) => {
    const rows = new Map();
    const entering = entries.filter(({ isIntersecting }) => isIntersecting)
      .sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top || a.boundingClientRect.left - b.boundingClientRect.left);
    entering.forEach(({ target, boundingClientRect }) => {
      reveal.unobserve(target);
      if (keyboardNavigation || reducedMotion.matches || !target.animate) return;
      // Start below the viewport; never fade out content the visitor can already read.
      if (boundingClientRect.top < innerHeight) return;
      const parent = target.parentElement;
      const previous = rows.get(parent);
      const column = previous && Math.abs(previous.top - boundingClientRect.top) < 8 ? previous.column + 1 : 0;
      rows.set(parent, { top: boundingClientRect.top, column });
      const delay = innerWidth > 767 ? Math.min(column * 100, 200) : 0;
      animateEntry(target, [{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay });
    });
  }, { threshold: 0, rootMargin: '0px 0px 80px 0px' });
  document.querySelectorAll('.steps-grid > li, .course, .private-layout, .method-grid > div, .inner-reveal').forEach((element) => reveal.observe(element));
})();
