/**
 * GENIUS ACADEMIA DE LENGUAS - LANDING PAGE
 * JavaScript for interactive features
 */

// ============================================
// SMOOTH SCROLL
// ============================================
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function (e) {
    e.preventDefault();
    const target = document.querySelector(this.getAttribute('href'));
    if (target) {
      const headerOffset = 80;
      const elementPosition = target.getBoundingClientRect().top;
      const offsetPosition = elementPosition + window.pageYOffset - headerOffset;

      window.scrollTo({
        top: offsetPosition,
        behavior: 'smooth'
      });
    }
  });
});

// ============================================
// FORM VALIDATION & SUBMISSION
// ============================================
const contactForm = document.getElementById('contactForm');

if (contactForm) {
  contactForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    // Get form data
    const formData = new FormData(contactForm);
    const data = {
      name: formData.get('name'),
      email: formData.get('email'),
      phone: formData.get('phone'),
      course: formData.get('course'),
      country: 'central-america'
    };

    // Validate
    if (!validateForm(data)) {
      return;
    }

    // Submit (integrate with your backend)
    try {
      const submitButton = contactForm.querySelector('button[type="submit"]');
      const originalText = submitButton.innerHTML;

      // Loading state
      submitButton.disabled = true;
      submitButton.innerHTML = 'Enviando...';

      // Call API
      const response = await fetch('/api/leads', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(data)
      });

      const result = await response.json();

      if (response.ok && result.success) {
        // Success
        submitButton.innerHTML = '¡Enviado! ✓';
        submitButton.style.background = 'linear-gradient(135deg, #10B981, #059669)';

        // Reset form
        setTimeout(() => {
          contactForm.reset();
          submitButton.disabled = false;
          submitButton.innerHTML = originalText;
          submitButton.style.background = '';

          // Show success message
          alert('¡Gracias! Te contactaremos pronto para tu clase gratuita.');
        }, 2000);

        // Send to analytics
        if (typeof gtag !== 'undefined') {
          gtag('event', 'form_submission', {
            event_category: 'engagement',
            event_label: 'contact_form'
          });
        }
      } else {
        throw new Error(result.message || 'Error al enviar formulario');
      }

    } catch (error) {
      console.error('Form submission error:', error);

      // Reset button
      const submitButton = contactForm.querySelector('button[type="submit"]');
      submitButton.disabled = false;
      submitButton.innerHTML = submitButton.innerHTML.includes('Enviando')
        ? 'Reservar Clase Gratis'
        : submitButton.innerHTML;

      alert('Hubo un error. Por favor intenta de nuevo o contáctanos vía WhatsApp.');
    }
  });
}

function validateForm(data) {
  // Name validation
  if (data.name.length < 2) {
    alert('Por favor ingresa tu nombre completo');
    return false;
  }

  // Email validation
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(data.email)) {
    alert('Por favor ingresa un email válido');
    return false;
  }

  // Phone validation
  if (data.phone.length < 8) {
    alert('Por favor ingresa un número de teléfono válido');
    return false;
  }

  // Course validation
  if (!data.course) {
    alert('Por favor selecciona un curso de interés');
    return false;
  }

  return true;
}

// ============================================
// SCROLL ANIMATIONS
// ============================================
const observerOptions = {
  threshold: 0.1,
  rootMargin: '0px 0px -100px 0px'
};

const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('fade-in');
      observer.unobserve(entry.target);
    }
  });
}, observerOptions);

// Observe all sections for animation
document.addEventListener('DOMContentLoaded', () => {
  const sections = document.querySelectorAll('.methodology-card, .course-card, .testimonial-card');
  sections.forEach(section => observer.observe(section));
});

// ============================================
// HEADER SCROLL BEHAVIOR
// ============================================
let lastScroll = 0;
const header = document.querySelector('.header');

window.addEventListener('scroll', () => {
  const currentScroll = window.pageYOffset;

  // Add shadow on scroll
  if (currentScroll > 10) {
    header.style.boxShadow = '0 4px 6px -1px rgba(0, 0, 0, 0.1)';
  } else {
    header.style.boxShadow = '0 1px 2px 0 rgba(0, 0, 0, 0.05)';
  }

  lastScroll = currentScroll;
});

// ============================================
// MOBILE MENU
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  const mobileToggle = document.querySelector('.mobile-menu-toggle');
  const mobileNav = document.querySelector('.header__nav');
  const mobileOverlay = document.querySelector('.mobile-menu-overlay');
  const navLinks = document.querySelectorAll('.header__nav a');

  if (mobileToggle && mobileNav && mobileOverlay) {
    // Toggle menu
    mobileToggle.addEventListener('click', () => {
      const isActive = mobileNav.classList.contains('active');

      if (isActive) {
        closeMenu();
      } else {
        openMenu();
      }
    });

    // Close menu when clicking overlay
    mobileOverlay.addEventListener('click', closeMenu);

    // Close menu when clicking nav links
    navLinks.forEach(link => {
      link.addEventListener('click', closeMenu);
    });

    // Close menu on ESC key
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && mobileNav.classList.contains('active')) {
        closeMenu();
      }
    });

    function openMenu() {
      mobileToggle.classList.add('active');
      mobileNav.classList.add('active');
      mobileOverlay.classList.add('active');
      mobileToggle.setAttribute('aria-expanded', 'true');
      document.body.style.overflow = 'hidden';
    }

    function closeMenu() {
      mobileToggle.classList.remove('active');
      mobileNav.classList.remove('active');
      mobileOverlay.classList.remove('active');
      mobileToggle.setAttribute('aria-expanded', 'false');
      document.body.style.overflow = '';
    }

    // Close menu on window resize to desktop
    window.addEventListener('resize', debounce(() => {
      if (window.innerWidth > 767 && mobileNav.classList.contains('active')) {
        closeMenu();
      }
    }, 250));
  }
});

// ============================================
// STATS COUNTER ANIMATION
// ============================================
function animateCounter(element, target, duration = 2000) {
  const start = 0;
  const increment = target / (duration / 16);
  let current = start;

  const timer = setInterval(() => {
    current += increment;
    if (current >= target) {
      element.textContent = formatStatNumber(target);
      clearInterval(timer);
    } else {
      element.textContent = formatStatNumber(Math.floor(current));
    }
  }, 16);
}

function formatStatNumber(num) {
  if (num >= 10000) {
    return (num / 1000).toFixed(0) + ',000+';
  }
  return num.toString();
}

// Animate stats when visible
const statsObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      const statNumbers = entry.target.querySelectorAll('.stat__number');
      statNumbers.forEach((stat, index) => {
        const text = stat.textContent;
        if (text.includes('+')) {
          const number = parseInt(text.replace(/[^0-9]/g, ''));
          if (index === 0) animateCounter(stat, 10000); // 10,000+ Alumnos
        }
      });
      statsObserver.unobserve(entry.target);
    }
  });
}, { threshold: 0.5 });

const heroStats = document.querySelector('.hero__stats');
if (heroStats) {
  statsObserver.observe(heroStats);
}

// ============================================
// WHATSAPP FLOATING BUTTON (Optional)
// ============================================
function createWhatsAppButton() {
  const whatsappUrl = 'https://wa.me/50671784096';

  const button = document.createElement('a');
  button.href = whatsappUrl;
  button.target = '_blank';
  button.rel = 'noopener noreferrer';
  button.className = 'whatsapp-float';
  button.setAttribute('aria-label', 'Contactar por WhatsApp');
  button.innerHTML = `
    <svg width="32" height="32" viewBox="0 0 24 24" fill="white">
      <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413Z"/>
    </svg>
  `;

  // Add styles
  const style = document.createElement('style');
  style.textContent = `
    @keyframes whatsapp-shake {
      0%, 100% { transform: translateX(0) rotate(0deg); }
      10%, 30%, 50%, 70%, 90% { transform: translateX(-5px) rotate(-5deg); }
      20%, 40%, 60%, 80% { transform: translateX(5px) rotate(5deg); }
    }

    @keyframes whatsapp-bounce {
      0%, 20%, 50%, 80%, 100% { transform: translateY(0); }
      40% { transform: translateY(-15px); }
      60% { transform: translateY(-7px); }
    }

    @keyframes whatsapp-pulse {
      0% { box-shadow: 0 0 0 0 rgba(37, 211, 102, 0.7); }
      70% { box-shadow: 0 0 0 15px rgba(37, 211, 102, 0); }
      100% { box-shadow: 0 0 0 0 rgba(37, 211, 102, 0); }
    }

    .whatsapp-float {
      position: fixed;
      bottom: 2rem;
      right: 2rem;
      width: 60px;
      height: 60px;
      background: #25D366;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transition: all 0.3s ease;
      z-index: 999;
      cursor: pointer;
      animation: whatsapp-pulse 2s infinite, whatsapp-bounce 3s ease-in-out 2s infinite;
    }

    .whatsapp-float:hover {
      transform: scale(1.15);
      box-shadow: 0 6px 20px rgba(0, 0, 0, 0.2);
      animation: whatsapp-shake 0.5s ease-in-out;
    }

    @media (max-width: 768px) {
      .whatsapp-float {
        bottom: 1rem;
        right: 1rem;
        width: 52px;
        height: 52px;
      }

      .whatsapp-float svg {
        width: 28px;
        height: 28px;
      }
    }
  `;

  document.head.appendChild(style);
  document.body.appendChild(button);
}

// Enable WhatsApp floating button
window.addEventListener('DOMContentLoaded', createWhatsAppButton);

// ============================================
// ANALYTICS & TRACKING
// ============================================
function trackEvent(category, action, label) {
  if (typeof gtag !== 'undefined') {
    gtag('event', action, {
      event_category: category,
      event_label: label
    });
  }
  console.log('Event tracked:', { category, action, label });
}

// Track CTA clicks
document.querySelectorAll('.btn--primary').forEach(btn => {
  btn.addEventListener('click', () => {
    trackEvent('engagement', 'cta_click', btn.textContent.trim());
  });
});

// Track course card interactions
document.querySelectorAll('.course-card').forEach((card, index) => {
  card.addEventListener('click', () => {
    const courseTitle = card.querySelector('.course-card__title').textContent;
    trackEvent('courses', 'course_view', courseTitle);
  });
});

// ============================================
// PERFORMANCE MONITORING
// ============================================
window.addEventListener('load', () => {
  // Log page load time
  if (window.performance) {
    const perfData = window.performance.timing;
    const pageLoadTime = perfData.loadEventEnd - perfData.navigationStart;
    console.log(`Page loaded in ${pageLoadTime}ms`);
  }
});

// ============================================
// ERROR HANDLING
// ============================================
window.addEventListener('error', (e) => {
  console.error('JavaScript Error:', e.message);
  // Send to error tracking service if available
});

// ============================================
// UTILITY FUNCTIONS
// ============================================
function debounce(func, wait) {
  let timeout;
  return function executedFunction(...args) {
    const later = () => {
      clearTimeout(timeout);
      func(...args);
    };
    clearTimeout(timeout);
    timeout = setTimeout(later, wait);
  };
}

function throttle(func, limit) {
  let inThrottle;
  return function(...args) {
    if (!inThrottle) {
      func.apply(this, args);
      inThrottle = true;
      setTimeout(() => inThrottle = false, limit);
    }
  };
}

// ============================================
// HERO ALTERNATING ANIMATION
// ============================================
document.addEventListener('DOMContentLoaded', () => {
  const heroText = document.querySelector('.hero__text');
  const heroImage = document.querySelector('.hero__image');
  const indicators = document.querySelectorAll('.hero__indicator');

  if (heroText && heroImage && indicators.length > 0) {
    let currentSlide = 0;
    let autoplayInterval;

    function showSlide(index) {
      if (index === 0) {
        // Mostrar texto
        heroText.classList.remove('hero-hidden');
        heroImage.classList.add('hero-hidden');
      } else {
        // Mostrar imagem
        heroText.classList.add('hero-hidden');
        heroImage.classList.remove('hero-hidden');
      }

      // Atualizar indicadores
      indicators.forEach((indicator, i) => {
        if (i === index) {
          indicator.classList.add('active');
        } else {
          indicator.classList.remove('active');
        }
      });

      currentSlide = index;
    }

    function nextSlide() {
      currentSlide = (currentSlide + 1) % 2;
      showSlide(currentSlide);
    }

    // Autoplay a cada 5 segundos
    function startAutoplay() {
      autoplayInterval = setInterval(nextSlide, 5000);
    }

    function stopAutoplay() {
      clearInterval(autoplayInterval);
    }

    // Click nos indicadores
    indicators.forEach((indicator, index) => {
      indicator.addEventListener('click', () => {
        stopAutoplay();
        showSlide(index);
        startAutoplay();
      });
    });

    // Iniciar autoplay
    startAutoplay();
  }
});

// ============================================
// CONSOLE WELCOME MESSAGE
// ============================================
console.log('%cGENIUS Academia de Lenguas', 'font-size: 24px; font-weight: bold; color: #000E38;');
console.log('%c¡Aprende Português con nosotros!', 'font-size: 14px; color: #DCAF63;');
console.log('Website: https://geniusacademia.com');
