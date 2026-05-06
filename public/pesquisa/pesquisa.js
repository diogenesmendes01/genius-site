// Genius Idiomas — student survey page.
// Server serves the same HTML for /pesquisa, /pesquisa/:token and (via
// 302) /p/:token, so this script reads the token from the URL itself.

(() => {
  'use strict';

  const MES_NOMBRE = {
    1: 'enero', 2: 'febrero', 3: 'marzo', 4: 'abril', 5: 'mayo', 6: 'junio',
    7: 'julio', 8: 'agosto', 9: 'septiembre', 10: 'octubre', 11: 'noviembre', 12: 'diciembre',
  };

  const states = {
    loading: document.getElementById('state-loading'),
    error:   document.getElementById('state-error'),
    intro:   document.getElementById('state-intro'),
    form:    document.getElementById('state-form'),
    thanks:  document.getElementById('state-thanks'),
  };
  const errorMsg = document.getElementById('errorMsg');
  const turmaName = document.getElementById('turmaName');
  const profName = document.getElementById('profName');
  const periodLabel = document.getElementById('periodLabel');
  const progressBar = document.getElementById('progressBar');
  const submitBtn = document.getElementById('submitBtn');
  const submitError = document.getElementById('submitError');
  const form = document.getElementById('surveyForm');

  function show(name) {
    for (const k of Object.keys(states)) {
      states[k].classList.toggle('hidden', k !== name);
    }
  }

  // ─── Token extraction ───
  function extractToken() {
    const m = window.location.pathname.match(/\/(?:pesquisa|p)\/([a-z0-9]+)/i);
    return m ? m[1] : null;
  }

  // ─── Rating widget ───
  function buildRatings() {
    document.querySelectorAll('.rating').forEach((container) => {
      const hidden = container.parentElement.querySelector('input[type="hidden"]');
      for (let i = 1; i <= 5; i++) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'rating__btn';
        btn.role = 'radio';
        btn.setAttribute('aria-checked', 'false');
        btn.dataset.value = String(i);
        btn.textContent = String(i);
        btn.addEventListener('click', () => {
          container.querySelectorAll('.rating__btn').forEach((b) =>
            b.setAttribute('aria-checked', 'false'),
          );
          btn.setAttribute('aria-checked', 'true');
          hidden.value = String(i);
        });
        container.appendChild(btn);
      }
    });
  }

  // ─── Section navigation ───
  let currentSection = 1;
  const totalSections = document.querySelectorAll('.section').length;

  function showSection(n) {
    document.querySelectorAll('.section').forEach((s) => {
      s.classList.toggle('hidden', Number(s.dataset.section) !== n);
    });
    currentSection = n;
    progressBar.style.width = ((n - 1) / (totalSections - 1)) * 100 + '%';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function validateSection(n) {
    const section = document.querySelector(`.section[data-section="${n}"]`);
    const required = section.querySelectorAll('input[required]');
    for (const inp of required) {
      if (!inp.value) {
        const q = inp.closest('.q');
        if (q) q.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return false;
      }
    }
    // Radio groups: check at least one checked per group with required.
    const radioGroups = new Set();
    section.querySelectorAll('input[type="radio"][required]').forEach((r) =>
      radioGroups.add(r.name),
    );
    for (const name of radioGroups) {
      const checked = section.querySelector(`input[name="${name}"]:checked`);
      if (!checked) {
        const group = section.querySelector(`.opts[data-name="${name}"]`);
        if (group) group.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return false;
      }
    }
    return true;
  }

  document.addEventListener('click', (ev) => {
    const target = ev.target.closest('[data-next], [data-prev]');
    if (!target) return;
    if (target.dataset.next !== undefined) {
      if (validateSection(currentSection)) showSection(currentSection + 1);
    } else {
      showSection(currentSection - 1);
    }
  });

  // ─── Submit ───
  async function submit(token) {
    submitError.classList.add('hidden');
    submitBtn.disabled = true;

    const data = Object.fromEntries(new FormData(form).entries());
    // FormData turns hidden inputs into strings; coerce numbers for the
    // server-side IsInt validators.
    data.nota_aulas = Number(data.nota_aulas);
    data.nota_professor = Number(data.nota_professor);
    data.nota_geral = Number(data.nota_geral);
    // Drop empty optional fields rather than sending "".
    for (const k of ['feedback_conteudo', 'feedback_professor', 'feedback_escola', 'situacao_pessoal']) {
      if (data[k] === '') delete data[k];
    }

    try {
      const resp = await fetch(`/api/pesquisa/${encodeURIComponent(token)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(data),
      });
      if (resp.status === 201 || resp.status === 200) {
        show('thanks');
        return;
      }
      const body = await resp.json().catch(() => ({}));
      const msg = Array.isArray(body.message)
        ? body.message.join(' · ')
        : body.message || 'No pudimos enviar tu respuesta. Intenta nuevamente.';
      submitError.textContent = msg;
      submitError.classList.remove('hidden');
    } catch (err) {
      submitError.textContent = 'Error de conexión. Verifica tu internet.';
      submitError.classList.remove('hidden');
    } finally {
      submitBtn.disabled = false;
    }
  }

  // ─── Boot ───
  async function boot() {
    buildRatings();

    const token = extractToken();
    if (!token) {
      show('intro');
      return;
    }

    try {
      const resp = await fetch(`/api/pesquisa/${encodeURIComponent(token)}/info`);
      if (resp.status === 404) {
        errorMsg.textContent = 'Este enlace no es válido.';
        show('error');
        return;
      }
      if (resp.status === 410) {
        const body = await resp.json().catch(() => ({}));
        errorMsg.textContent = body.message || 'Esta encuesta ya no está disponible.';
        show('error');
        return;
      }
      if (!resp.ok) throw new Error(`status ${resp.status}`);

      const info = await resp.json();
      turmaName.textContent = info.turma_nome || '—';
      profName.textContent = info.professor_nome || '—';
      const mes = MES_NOMBRE[info.mes_referencia] || info.mes_referencia;
      periodLabel.textContent = `Encuesta de ${mes} ${info.ano_referencia}`;

      show('form');
      showSection(1);

      form.addEventListener('submit', (ev) => {
        ev.preventDefault();
        if (!validateSection(currentSection)) return;
        submit(token);
      });
    } catch (err) {
      errorMsg.textContent = 'No pudimos cargar la encuesta. Intenta más tarde.';
      show('error');
    }
  }

  document.addEventListener('DOMContentLoaded', boot);
})();
