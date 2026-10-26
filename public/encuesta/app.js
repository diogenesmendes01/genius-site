/* Encuesta / pesquisa — wizard config-driven, multi-survey.
 *
 * Las etapas, preguntas y textos de interfaz NO viven aquí: se cargan de
 * GET /api/surveys/config?survey=<key> (fuente única: src/surveys/*.ts).
 * La página indica qué encuesta es con <body data-survey="alumnos|equipe">.
 * Este archivo solo sabe renderizar cada tipo de pregunta, mantener el
 * estado (con localStorage, para que un refresh no pierda nada) y enviar el
 * payload a POST /api/surveys.
 */

(function () {
  'use strict';

  var API = '/api/surveys';
  var SURVEY_KEY = (document.body.getAttribute('data-survey') || 'alumnos').trim();
  // v2 (2026-10): new steps/questions — a v1 draft or "done" mark left in
  // storage would restore answers to questions that no longer exist or block
  // the new round, so every key carries the survey + version.
  var STORAGE_KEY = 'genius:survey:' + SURVEY_KEY + ':v2';
  var DONE_KEY = 'genius:survey:' + SURVEY_KEY + ':done:v2';
  var DONE_COOKIE = 'genius_survey_' + SURVEY_KEY + '_v2';
  var DONE_COOKIE_MAX_AGE = 60 * 60 * 24 * 180; // 180 días

  var BOOLEAN_RADIOS = { contacto_ok: 'contactoOk' };
  var CONSENT_FIELDS = { testimonio_ok: 'testimonioOk' };

  /* Textos del cascarón; el config de cada encuesta los sobreescribe
   * (la de alumnos en español, la del equipo en portugués). */
  var ui = {
    loading: 'Cargando encuesta…',
    loadError: 'No pudimos cargar la encuesta. Por favor recarga la página o inténtalo más tarde.',
    forbidden: 'Este enlace no es válido. Pide a Genius el enlace correcto de la encuesta.',
    back: '← Atrás',
    next: 'Continuar →',
    submit: 'Enviar respuestas',
    sending: 'Enviando…',
    requiredAlert: 'Por favor responde las preguntas marcadas con * antes de continuar.',
    tooMany: 'Demasiados envíos seguidos. Espera un minuto e inténtalo de nuevo.',
    sendError: 'Hubo un error al enviar tus respuestas. Por favor inténtalo de nuevo.',
    thanksTitle: '¡Gracias por tu opinión!',
    thanksBody: 'Tus respuestas fueron enviadas. Cada comentario nos ayuda a hacer de Genius una mejor experiencia para ti.',
    doneTitle: 'Ya respondiste esta encuesta',
    doneBody: '¡Gracias por tu opinión! Solo se puede responder una vez por persona.',
    privacy: 'Tus respuestas se guardan de forma segura y solo el equipo de Genius puede verlas.',
    charHint: 'máx. {n} caracteres',
  };

  // A page can pre-set the strings shown BEFORE the config arrives (load
  // error / invalid link) in its own language: <body data-ui-forbidden="…">.
  Object.keys(document.body.dataset).forEach(function (k) {
    if (k.indexOf('ui') === 0 && k.length > 2) {
      var key = k.charAt(2).toLowerCase() + k.slice(3);
      ui[key] = document.body.dataset[k];
    }
  });

  var steps = [];
  var controllers = {};
  var state = { answers: {}, step: 0, submitted: false };

  var el = function (id) { return document.getElementById(id); };
  var host, progBar, navRow, btnBack, btnNext, stepAlert;

  document.addEventListener('DOMContentLoaded', init);

  async function init() {
    el('year').textContent = new Date().getFullYear();
    host = el('stepHost');
    progBar = el('progBar');
    navRow = el('navRow');
    btnBack = el('btnBack');
    btnNext = el('btnNext');
    stepAlert = el('stepAlert');

    btnNext.addEventListener('click', onNext);
    btnBack.addEventListener('click', onBack);

    // Ya respondió antes (marca en localStorage o cookie): no reabrimos el
    // wizard. Evita el doble envío accidental — no es un candado absoluto.
    if (alreadyDone()) {
      el('loadingBox').classList.add('hidden');
      renderDoneScreen();
      return;
    }

    try {
      var cfgUrl = API + '/config?survey=' + encodeURIComponent(SURVEY_KEY);
      var token = readToken();
      if (token) cfgUrl += '&t=' + encodeURIComponent(token);
      var resp = await fetch(cfgUrl);
      if (resp.status === 403) {
        el('loadingBox').textContent = ui.forbidden;
        return;
      }
      if (!resp.ok) throw new Error('config ' + resp.status);
      var data = await resp.json();
      steps = data.steps || [];
      if (data.ui) Object.keys(data.ui).forEach(function (k) { ui[k] = data.ui[k]; });
      if (data.ui && data.ui.lang) document.documentElement.lang = data.ui.lang;
      btnBack.textContent = ui.back;
    } catch (err) {
      el('loadingBox').textContent = ui.loadError;
      return;
    }

    steps.forEach(function (s) {
      s.questions.forEach(function (q) {
        if (q.showIf) controllers[q.showIf.id] = true;
      });
    });

    restoreState();
    el('loadingBox').classList.add('hidden');
    navRow.classList.remove('hidden');
    renderStep();
  }

  /* ── estado + persistencia ── */
  function saveState() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        answers: state.answers,
        step: state.step,
      }));
    } catch (e) { /* modo privado sin storage: seguimos solo en memoria */ }
  }

  function restoreState() {
    try {
      var raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      var saved = JSON.parse(raw);
      if (saved && typeof saved === 'object') {
        state.answers = saved.answers || {};
        var step = Number(saved.step);
        if (Number.isInteger(step) && step >= 0 && step < steps.length) {
          state.step = step;
        }
      }
    } catch (e) { /* estado corrupto: empezamos de cero */ }
  }

  function setAnswer(id, val) {
    var empty = val === undefined || val === null || val === '' ||
      (Array.isArray(val) && val.length === 0);
    if (empty) delete state.answers[id];
    else state.answers[id] = val;
    saveState();
    if (controllers[id]) renderStep();
  }

  function isVisible(q) {
    if (!q.showIf) return true;
    var v = state.answers[q.showIf.id];
    if (q.showIf.equals !== undefined) return v === q.showIf.equals;
    if (q.showIf.includes !== undefined) {
      return Array.isArray(v) && v.indexOf(q.showIf.includes) !== -1;
    }
    if (Array.isArray(q.showIf.oneOf)) return q.showIf.oneOf.indexOf(v) !== -1;
    return true;
  }

  /* ── progreso ── */
  function renderProgress() {
    progBar.innerHTML = '';
    steps.forEach(function (s, i) {
      var done = i < state.step || state.submitted;
      var st = document.createElement('div');
      st.className = 'prog-step' +
        (i === state.step && !state.submitted ? ' active' : '') +
        (done ? ' done' : '');
      var c = document.createElement('div');
      c.className = 'prog-circle';
      c.textContent = done ? '✓' : (i + 1);
      var l = document.createElement('div');
      l.className = 'prog-label';
      l.textContent = s.label;
      st.appendChild(c);
      st.appendChild(l);
      progBar.appendChild(st);
      if (i < steps.length - 1) {
        var line = document.createElement('div');
        line.className = 'prog-line' + (done ? ' done' : '');
        progBar.appendChild(line);
      }
    });
  }

  /* ── renderers por tipo ── */
  var renderers = {
    nps: function (q, box) {
      var grid = document.createElement('div');
      grid.className = 'nps';
      for (var i = 0; i <= 10; i++) {
        (function (v) {
          var b = document.createElement('button');
          b.type = 'button';
          b.textContent = v;
          if (state.answers[q.id] === v) b.classList.add('sel');
          b.addEventListener('click', function () {
            selectOnly(grid, b);
            setAnswer(q.id, v);
            box.classList.remove('missing');
          });
          grid.appendChild(b);
        })(i);
      }
      box.appendChild(grid);
      if (q.ends) {
        var ends = document.createElement('div');
        ends.className = 'scale-ends';
        ends.appendChild(spanText(q.ends[0]));
        ends.appendChild(spanText(q.ends[1]));
        box.appendChild(ends);
      }
    },

    stars: function (q, box) {
      var row = document.createElement('div');
      row.className = 'stars';
      var cap = document.createElement('p');
      cap.className = 'scale-caption';
      cap.innerHTML = '&nbsp;';
      var cur = state.answers[q.id] || 0;
      if (cur && q.labels) cap.textContent = q.labels[cur - 1];
      for (var s = 1; s <= 5; s++) {
        (function (v) {
          var b = document.createElement('button');
          b.type = 'button';
          b.textContent = '★';
          b.setAttribute('aria-label', v + ' de 5');
          if (v <= cur) b.classList.add('sel');
          b.addEventListener('click', function () {
            row.querySelectorAll('button').forEach(function (x, idx) {
              x.classList.toggle('sel', idx < v);
            });
            if (q.labels) cap.textContent = q.labels[v - 1];
            setAnswer(q.id, v);
            box.classList.remove('missing');
          });
          row.appendChild(b);
        })(s);
      }
      box.appendChild(row);
      box.appendChild(cap);
    },

    scale5: function (q, box) {
      var grid = document.createElement('div');
      grid.className = 'scale5';
      var cap = document.createElement('p');
      cap.className = 'scale-caption';
      cap.innerHTML = '&nbsp;';
      var cur = state.answers[q.id];
      if (cur && q.labels) cap.textContent = q.labels[cur - 1];
      for (var i = 1; i <= 5; i++) {
        (function (v) {
          var b = document.createElement('button');
          b.type = 'button';
          b.textContent = v;
          if (cur === v) b.classList.add('sel');
          b.addEventListener('click', function () {
            selectOnly(grid, b);
            if (q.labels) cap.textContent = q.labels[v - 1];
            setAnswer(q.id, v);
            box.classList.remove('missing');
          });
          grid.appendChild(b);
        })(i);
      }
      box.appendChild(grid);
      if (q.labels) {
        var ends = document.createElement('div');
        ends.className = 'scale-ends s5';
        ends.appendChild(spanText(q.labels[0]));
        ends.appendChild(spanText(q.labels[4]));
        box.appendChild(ends);
      }
      box.appendChild(cap);
      // "No aplica" escape hatch (e.g. "No he necesitado ayuda"): stored as
      // text, so it never drags the average down or up.
      if (q.optOut) {
        var opt = document.createElement('button');
        opt.type = 'button';
        opt.className = 'scale-optout';
        opt.textContent = q.optOut;
        if (cur === q.optOut) opt.classList.add('sel');
        opt.addEventListener('click', function () {
          grid.querySelectorAll('button').forEach(function (x) { x.classList.remove('sel'); });
          cap.innerHTML = '&nbsp;';
          opt.classList.add('sel');
          setAnswer(q.id, q.optOut);
          box.classList.remove('missing');
        });
        grid.querySelectorAll('button').forEach(function (b) {
          b.addEventListener('click', function () { opt.classList.remove('sel'); });
        });
        box.appendChild(opt);
      }
    },

    radio: function (q, box) {
      var isCards = q.variant === 'cards';
      var wrap = document.createElement('div');
      wrap.className = isCards ? 'rc-grid' : 'rl';
      (q.options || []).forEach(function (o) {
        var b = document.createElement('button');
        b.type = 'button';
        b.textContent = o;
        if (state.answers[q.id] === o) b.classList.add('sel');
        b.addEventListener('click', function () {
          selectOnly(wrap, b);
          setAnswer(q.id, o);
          box.classList.remove('missing');
        });
        wrap.appendChild(b);
      });
      box.appendChild(wrap);
    },

    checks: function (q, box) {
      var grid = document.createElement('div');
      grid.className = 'ckgrid';
      var cur = state.answers[q.id] || [];
      (q.options || []).forEach(function (o) {
        var lab = document.createElement('label');
        lab.className = 'chk';
        var inp = document.createElement('input');
        inp.type = 'checkbox';
        inp.checked = cur.indexOf(o) !== -1;
        inp.addEventListener('change', function () {
          var arr = (state.answers[q.id] || []).slice();
          if (inp.checked) {
            if (arr.indexOf(o) === -1) arr.push(o);
          } else {
            arr = arr.filter(function (x) { return x !== o; });
          }
          setAnswer(q.id, arr);
        });
        var sp = document.createElement('span');
        sp.textContent = o;
        lab.appendChild(inp);
        lab.appendChild(sp);
        grid.appendChild(lab);
      });
      box.appendChild(grid);
    },

    text: function (q, box) {
      var inp = document.createElement('input');
      inp.className = 's-input';
      inp.type = 'text';
      inp.maxLength = q.maxLength || 120;
      inp.placeholder = q.placeholder || '';
      inp.style.maxWidth = '380px';
      inp.value = state.answers[q.id] || '';
      inp.addEventListener('input', function () { setAnswer(q.id, inp.value.trim()); });
      box.appendChild(inp);
    },

    textarea: function (q, box) {
      var ta = document.createElement('textarea');
      ta.className = 's-textarea';
      ta.maxLength = q.maxLength || 500;
      ta.placeholder = q.placeholder || '';
      ta.value = state.answers[q.id] || '';
      ta.addEventListener('input', function () { setAnswer(q.id, ta.value.trim()); });
      box.appendChild(ta);
      var hint = document.createElement('p');
      hint.className = 'char-hint';
      hint.textContent = ui.charHint.replace('{n}', String(q.maxLength || 500));
      box.appendChild(hint);
    },

    selects: function (q, box) {
      var grid = document.createElement('div');
      grid.className = 'sel-grid';
      (q.selects || []).forEach(function (s) {
        var cell = document.createElement('div');
        var lab = document.createElement('label');
        lab.className = 'fld-label';
        lab.textContent = s.label;
        if (s.required) {
          var star = document.createElement('span');
          star.className = 'st';
          star.textContent = ' *';
          lab.appendChild(star);
        }
        lab.setAttribute('for', 'sel_' + s.id);
        var sel = document.createElement('select');
        sel.className = 's-select';
        sel.id = 'sel_' + s.id;
        (s.options || []).forEach(function (o, idx) {
          var op = document.createElement('option');
          op.value = idx === 0 ? '' : o;
          op.textContent = o;
          sel.appendChild(op);
        });
        sel.value = state.answers[s.id] || '';
        sel.addEventListener('change', function () { setAnswer(s.id, sel.value); });
        cell.appendChild(lab);
        cell.appendChild(sel);
        grid.appendChild(cell);
      });
      box.appendChild(grid);
    },

    consent: function (q, box) {
      (q.checks || []).forEach(function (c) {
        var lab = document.createElement('label');
        lab.className = 'chk';
        var inp = document.createElement('input');
        inp.type = 'checkbox';
        inp.checked = !!state.answers[c.id];
        inp.addEventListener('change', function () {
          setAnswer(c.id, inp.checked ? true : undefined);
        });
        var sp = document.createElement('span');
        sp.textContent = c.label;
        lab.appendChild(inp);
        lab.appendChild(sp);
        box.appendChild(lab);
      });
    },
  };

  /* ── etapa ── */
  function renderStep() {
    hideAlert();
    host.innerHTML = '';
    renderProgress();

    if (state.submitted) {
      navRow.classList.add('hidden');
      var thanks = document.createElement('section');
      thanks.className = 's-card';
      thanks.innerHTML =
        '<div class="thanks">' +
        '  <div class="big">🎉</div>' +
        '  <h2></h2>' +
        '  <p></p>' +
        '</div>';
      thanks.querySelector('h2').textContent = ui.thanksTitle;
      thanks.querySelector('p').textContent = ui.thanksBody;
      host.appendChild(thanks);
      return;
    }

    navRow.classList.remove('hidden');
    var step = steps[state.step];
    var card = document.createElement('section');
    card.className = 's-card';

    var h = document.createElement('h2');
    h.className = 's-sec';
    h.textContent = step.title;
    card.appendChild(h);
    if (step.sub) {
      var sub = document.createElement('p');
      sub.className = 's-sec-sub';
      sub.textContent = step.sub;
      card.appendChild(sub);
    }

    step.questions.forEach(function (q) {
      if (!isVisible(q) || !renderers[q.type]) return;
      var box = document.createElement('div');
      box.className = 'q' + (q.showIf ? ' reveal' : '');
      box.dataset.qid = q.id;
      if (q.text) {
        var p = document.createElement('p');
        p.className = 'q-text';
        p.textContent = q.text;
        if (q.required) {
          var st = document.createElement('span');
          st.className = 'st';
          st.textContent = ' *';
          p.appendChild(st);
        }
        box.appendChild(p);
      }
      renderers[q.type](q, box);
      card.appendChild(box);
    });

    host.appendChild(card);

    if (state.step === steps.length - 1) {
      var priv = document.createElement('p');
      priv.className = 's-privacy';
      priv.textContent = ui.privacy;
      host.appendChild(priv);
    }

    btnBack.disabled = state.step === 0;
    btnNext.textContent = state.step === steps.length - 1 ? ui.submit : ui.next;
  }

  function validateStep() {
    var step = steps[state.step];
    var missing = [];
    step.questions.forEach(function (q) {
      if (!isVisible(q)) return;
      if (q.type === 'selects') {
        var lacking = (q.selects || []).some(function (s) {
          return s.required && !state.answers[s.id];
        });
        if (lacking) missing.push(q.id);
        return;
      }
      if (!q.required) return;
      if (state.answers[q.id] === undefined) missing.push(q.id);
    });
    host.querySelectorAll('.q').forEach(function (elq) {
      elq.classList.toggle('missing', missing.indexOf(elq.dataset.qid) !== -1);
    });
    if (missing.length) {
      showAlert(ui.requiredAlert);
      var first = host.querySelector('.q.missing');
      if (first) first.scrollIntoView({ behavior: 'smooth', block: 'center' });
    } else {
      hideAlert();
    }
    return missing.length === 0;
  }

  async function onNext() {
    if (!validateStep()) return;
    if (state.step < steps.length - 1) {
      state.step += 1;
      saveState();
      renderStep();
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    await submit();
  }

  function onBack() {
    if (state.step === 0) return;
    state.step -= 1;
    saveState();
    renderStep();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  /* ── envío ── */
  function buildPayload() {
    var payload = { survey: SURVEY_KEY, answers: {} };
    var token = readToken();
    if (token) payload.token = token;

    steps.forEach(function (s) {
      s.questions.forEach(function (q) {
        if (q.store === 'ui') return;

        if (q.type === 'selects') {
          (q.selects || []).forEach(function (sel) {
            var v = state.answers[sel.id];
            if (v) payload[sel.id] = v;
          });
          return;
        }
        if (q.type === 'consent') {
          (q.checks || []).forEach(function (c) {
            var field = CONSENT_FIELDS[c.id];
            if (field) payload[field] = state.answers[c.id] === true;
          });
          return;
        }
        if (BOOLEAN_RADIOS[q.id]) {
          var val = state.answers[q.id];
          if (val !== undefined) payload[BOOLEAN_RADIOS[q.id]] = val === 'Sí';
          return;
        }

        var answered = isVisible(q) ? state.answers[q.id] : undefined;
        if (answered === undefined) return;

        if (q.store === 'column') {
          // Column questions are named after the API field (csat, nps,
          // modalidad, rol, nombre…).
          payload[q.id] = answered;
        } else {
          payload.answers[q.id] = answered;
        }
      });
    });

    var canal = readCanal();
    if (canal) payload.canal = canal;

    var hp = el('website');
    if (hp && hp.value) payload.website = hp.value;

    return payload;
  }

  function readCanal() {
    try {
      var src = new URLSearchParams(window.location.search).get('src') || '';
      src = src.trim().slice(0, 40);
      return /^[a-z0-9_-]+$/i.test(src) ? src : '';
    } catch (e) {
      return '';
    }
  }

  /* Token de acceso (?t=) para encuestas que lo exigen (p. ej. equipo). */
  function readToken() {
    try {
      var t = new URLSearchParams(window.location.search).get('t') || '';
      return t.trim().slice(0, 120);
    } catch (e) {
      return '';
    }
  }

  async function submit() {
    btnNext.disabled = true;
    btnNext.textContent = ui.sending;
    try {
      var resp = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(buildPayload()),
      });
      if (resp.status === 429) throw new Error(ui.tooMany);
      if (resp.status === 403) throw new Error(ui.forbidden);
      var result = await resp.json().catch(function () { return {}; });
      if (!resp.ok || !result.success) throw new Error(ui.sendError);
      state.submitted = true;
      markDone();
      try { localStorage.removeItem(STORAGE_KEY); } catch (e) { /* noop */ }
      renderStep();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } catch (err) {
      showAlert(err.message || ui.sendError);
    } finally {
      btnNext.disabled = false;
      if (!state.submitted) btnNext.textContent = ui.submit;
    }
  }

  /* ── control de "ya respondiste" ── */
  function alreadyDone() {
    try {
      if (localStorage.getItem(DONE_KEY)) return true;
    } catch (e) { /* storage bloqueado: nos queda la cookie */ }
    return new RegExp('(?:^|;\\s*)' + DONE_COOKIE + '=1').test(document.cookie);
  }

  function markDone() {
    try { localStorage.setItem(DONE_KEY, new Date().toISOString()); } catch (e) { /* noop */ }
    document.cookie = DONE_COOKIE + '=1; max-age=' + DONE_COOKIE_MAX_AGE + '; path=/; SameSite=Lax';
  }

  function renderDoneScreen() {
    progBar.classList.add('hidden');
    navRow.classList.add('hidden');
    host.innerHTML =
      '<section class="s-card">' +
      '  <div class="thanks">' +
      '    <div class="big">✅</div>' +
      '    <h2></h2>' +
      '    <p></p>' +
      '  </div>' +
      '</section>';
    host.querySelector('h2').textContent = ui.doneTitle;
    host.querySelector('p').textContent = ui.doneBody;
  }

  /* ── helpers ── */
  function selectOnly(container, button) {
    container.querySelectorAll('button').forEach(function (x) { x.classList.remove('sel'); });
    button.classList.add('sel');
  }

  function spanText(text) {
    var sp = document.createElement('span');
    sp.textContent = text;
    return sp;
  }

  function showAlert(msg) {
    stepAlert.textContent = msg;
    stepAlert.classList.add('visible');
  }

  function hideAlert() {
    stepAlert.classList.remove('visible');
  }
})();
