(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  document.querySelectorAll('[data-hero-gallery]').forEach((gallery) => {
    const slides = [...gallery.querySelectorAll('[data-hero-slide]')];
    const controls = gallery.querySelector('[data-hero-controls]');
    const toggle = gallery.querySelector('[data-hero-toggle]');
    const label = gallery.querySelector('[data-hero-toggle-label]');
    const selectors = [...gallery.querySelectorAll('[data-hero-select]')];
    const status = gallery.querySelector('[data-hero-status]');
    if (slides.length < 2 || !controls || !toggle || !label) return;

    const loads = new Map();
    const failed = new Set();
    let active = Math.max(0, slides.findIndex((slide) => slide.hasAttribute('data-active')));
    let paused = false;
    let hovering = false;
    let visible = typeof IntersectionObserver === 'undefined';
    let timer;
    let revision = 0;
    let pendingManual = false;
    let pointerAction;

    const loadSlide = (index) => {
      if (loads.has(index)) return loads.get(index);
      const image = slides[index];
      const promise = new Promise((resolve) => {
        let settled = false;
        const finish = async (loaded) => {
          if (settled) return;
          settled = true;
          image.removeEventListener('load', onLoad);
          image.removeEventListener('error', onError);
          if (loaded && image.decode) {
            try { await image.decode(); } catch { loaded = false; }
          }
          if (!loaded) {
            failed.add(index);
            if (selectors[index]) selectors[index].disabled = true;
          }
          resolve(loaded);
        };
        const onLoad = () => finish(image.naturalWidth > 0);
        const onError = () => finish(false);
        image.addEventListener('load', onLoad);
        image.addEventListener('error', onError);
        const source = image.getAttribute('data-src');
        if (source) {
          image.src = source;
          image.removeAttribute('data-src');
        }
        if (image.complete && image.getAttribute('src')) onLoad();
      });
      loads.set(index, promise);
      return promise;
    };

    // The original image remains the LCP resource. Extra requests wait for it.
    const initialReady = loadSlide(active);
    const canPlay = () => !paused && !hovering && visible && !document.hidden && !reducedMotion.matches;
    const updateLabel = () => {
      label.textContent = reducedMotion.matches ? 'Ver fotos' : paused ? 'Reanudar' : 'Pausar';
      toggle.setAttribute('aria-label', reducedMotion.matches
        ? 'Ver la siguiente foto' : paused ? 'Reanudar las fotos' : 'Pausar las fotos');
    };
    const schedule = () => {
      clearTimeout(timer);
      if (canPlay() && slides.some((_, index) => index !== active && !failed.has(index))) {
        timer = setTimeout(() => changePhoto((active + 1) % slides.length, false), 8000);
      }
      updateLabel();
    };
    const interrupt = (cancelManual = false) => {
      if (!pendingManual || cancelManual) {
        revision += 1;
        pendingManual = false;
      }
      schedule();
    };
    const changePhoto = async (index, manual) => {
      clearTimeout(timer);
      const request = ++revision;
      pendingManual = manual;
      await initialReady;
      for (let offset = 0; offset < (manual ? 1 : slides.length - 1); offset += 1) {
        const next = (index + offset) % slides.length;
        if (next === active) break;
        const loaded = await loadSlide(next);
        // A late download must not undo a newer selection or a pause.
        if (request !== revision || (!manual && !canPlay())) return;
        if (!loaded) continue;
        gallery.toggleAttribute('data-instant', manual || reducedMotion.matches);
        slides.forEach((slide, position) => {
          const selected = position === next;
          slide.toggleAttribute('data-active', selected);
          if (selected) slide.removeAttribute('aria-hidden');
          else slide.setAttribute('aria-hidden', 'true');
        });
        selectors.forEach((button, position) => button.setAttribute('aria-pressed', String(position === next)));
        active = next;
        pendingManual = false;
        if (status) status.textContent = manual ? `Foto ${next + 1} de ${slides.length}. ${slides[next].alt}` : '';
        schedule();
        return;
      }
      if (request !== revision) return;
      pendingManual = false;
      if (manual && status) status.textContent = 'No se pudo cargar esta foto. Puedes elegir otra.';
      schedule();
    };
    const selectManually = (index) => {
      paused = true;
      interrupt(true);
      if (index !== active) changePhoto(index, true);
    };

    selectors.forEach((button, index) => button.addEventListener('click', () => selectManually(index)));
    gallery.addEventListener('focusin', () => {
      paused = true;
      gallery.setAttribute('data-instant', '');
      interrupt();
    });
    gallery.addEventListener('pointerenter', (event) => {
      if (event.pointerType !== 'mouse') return;
      hovering = true;
      interrupt();
    });
    gallery.addEventListener('pointerleave', (event) => {
      if (event.pointerType !== 'mouse') return;
      hovering = false;
      interrupt();
    });
    // Preserve the requested action when a pointer click first focuses Pause.
    toggle.addEventListener('pointerdown', () => { pointerAction = !paused; });
    toggle.addEventListener('pointercancel', () => { pointerAction = undefined; });
    toggle.addEventListener('click', (event) => {
      if (reducedMotion.matches) {
        const next = slides.map((_, offset) => (active + offset + 1) % slides.length)
          .find((index) => index !== active && !failed.has(index));
        if (next !== undefined) selectManually(next);
      } else {
        paused = event.detail > 0 && pointerAction !== undefined ? pointerAction : !paused;
        interrupt(true);
      }
      pointerAction = undefined;
    });
    document.addEventListener('visibilitychange', () => interrupt());
    reducedMotion.addEventListener('change', () => {
      gallery.toggleAttribute('data-instant', reducedMotion.matches);
      interrupt();
    });
    if (typeof IntersectionObserver !== 'undefined') {
      new IntersectionObserver((entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        interrupt();
      }, { threshold: 0 }).observe(gallery);
    }

    gallery.toggleAttribute('data-instant', reducedMotion.matches);
    controls.hidden = false;
    updateLabel();
    initialReady.then(() => {
      slides.forEach((_, index) => { if (index !== active) loadSlide(index); });
      schedule();
    });
  });
})();
