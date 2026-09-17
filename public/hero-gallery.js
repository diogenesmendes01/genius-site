(() => {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  document.querySelectorAll('[data-hero-gallery]').forEach((gallery) => {
    const slides = [...gallery.querySelectorAll('[data-hero-slide]')];
    const toggle = gallery.querySelector('[data-hero-toggle]');
    const label = gallery.querySelector('[data-hero-toggle-label]');
    if (slides.length < 2 || !toggle || !label) return;

    const loads = new Map();
    const failed = new Set();
    let active = Math.max(0, slides.findIndex((slide) => slide.hasAttribute('data-active')));
    let paused = false;
    let ready = false;
    let visible = typeof IntersectionObserver === 'undefined';
    let timer;
    let revision = 0;
    let remaining = [];

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
          if (!loaded) failed.add(index);
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

    const canPlay = () => ready && !paused && visible && !document.hidden;
    const schedule = () => {
      clearTimeout(timer);
      if (canPlay() && slides.some((_, index) => index !== active && !failed.has(index))) {
        timer = setTimeout(changePhoto, reducedMotion.matches ? 10000 : 6000);
      }
      label.textContent = paused ? 'Reanudar animación' : 'Pausar animación';
      toggle.setAttribute('aria-label', `${label.textContent} de las fotos`);
    };
    const interrupt = () => {
      revision += 1;
      schedule();
    };
    const nextPhoto = () => {
      remaining = remaining.filter((index) => index !== active && !failed.has(index));
      if (!remaining.length) {
        remaining = slides.map((_, index) => index).filter((index) => index !== active && !failed.has(index));
        // Shuffle the remaining photos; show each before choosing a fresh order.
        for (let i = remaining.length - 1; i > 0; i -= 1) {
          const other = Math.floor(Math.random() * (i + 1));
          [remaining[i], remaining[other]] = [remaining[other], remaining[i]];
        }
      }
      return remaining[remaining.length - 1];
    };
    const changePhoto = async () => {
      const request = ++revision;
      let next = nextPhoto();
      while (next !== undefined && canPlay()) {
        const loaded = await loadSlide(next);
        // Downloads may finish while the page is hidden or the loop is paused.
        if (request !== revision || !canPlay()) return;
        remaining = remaining.filter((index) => index !== next);
        if (loaded) {
          slides.forEach((slide, index) => {
            slide.toggleAttribute('data-active', index === next);
            if (index === next) slide.removeAttribute('aria-hidden');
            else slide.setAttribute('aria-hidden', 'true');
          });
          active = next;
          schedule();
          return;
        }
        next = nextPhoto();
      }
      schedule();
    };

    toggle.addEventListener('click', () => {
      paused = !paused;
      interrupt();
    });
    document.addEventListener('keydown', (event) => {
      if (event.key !== 'Escape') return;
      paused = true;
      interrupt();
    });
    document.addEventListener('visibilitychange', interrupt);
    reducedMotion.addEventListener('change', interrupt);
    if (typeof IntersectionObserver !== 'undefined') {
      new IntersectionObserver((entries) => {
        visible = entries.some((entry) => entry.isIntersecting);
        interrupt();
      }, { threshold: 0 }).observe(gallery);
    }

    toggle.hidden = false;
    schedule();
    // The original image keeps LCP priority; other requests start afterwards.
    loadSlide(active).then(() => {
      ready = true;
      slides.forEach((_, index) => { if (index !== active) loadSlide(index); });
      schedule();
    });
  });
})();
