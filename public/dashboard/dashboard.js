/* Genius Dashboard */

const API = '/api';
const AUTO_REFRESH_MS = 60_000;

// Currencies the dashboard knows how to display. Q10 stores all values in
// USD on this tenant (verified live), so we treat USD as the base and
// convert at display time only — see CurrencyService backend.
const SUPPORTED_CURRENCIES = ['USD', 'CRC', 'BRL'];
const CURRENCY_LOCALE = {
  USD: { locale: 'en-US', fractionDigits: 2 },
  CRC: { locale: 'es-CR', fractionDigits: 0 },  // colones rarely use decimals
  BRL: { locale: 'pt-BR', fractionDigits: 2 },
};

// Date picker state — `preset` controls which KPIs we send from/to for.
// Only Overview and Financial are date-sensitive; Academic + Turmas +
// Commercial are period-based on the server and ignore from/to.
const DATE_PICKER_APPLIES_TO = new Set(['overview', 'financial']);
const state = {
  user: null,
  charts: {},
  timer: null,
  activeTab: 'overview',
  // Cache per tab so switching back and forth doesn't re-hit /api. Invalidated
  // by refreshBtn or the 60s auto-timer.
  loaded: { overview: false, academic: false, turmas: false, financial: false, commercial: false },
  // Multi-currency state — `displayCurrency` is the user's view choice
  // (persisted in localStorage). `rates` is the USD-base table from
  // /api/dashboard/currency-rates, lazy-loaded on first auth'd render.
  displayCurrency: localStorage.getItem('genius:currency') || 'USD',
  rates: { USD: 1 },  // identity until /currency-rates resolves
  ratesFetchedAt: null,
  // Date picker — persisted in localStorage so the operator's last choice
  // survives reloads. `custom` adds from/to inputs.
  datePreset: localStorage.getItem('genius:datePreset') || 'month',
  customFrom: localStorage.getItem('genius:customFrom') || '',
  customTo: localStorage.getItem('genius:customTo') || '',
};

// ─── Elements ───
const el = (id) => document.getElementById(id);

// ─── Boot ───
document.addEventListener('DOMContentLoaded', async () => {
  el('year').textContent = new Date().getFullYear();
  bindEvents();
  await checkSession();
});

function bindEvents() {
  el('loginForm').addEventListener('submit', onLogin);
  el('logoutBtn').addEventListener('click', onLogout);
  el('refreshBtn').addEventListener('click', () => refreshActiveTab(true));

  // Currency selector — persisted, re-renders the active tab with the new
  // labels/conversions. No backend refetch needed; we just relabel.
  const sel = el('currencySelect');
  if (sel) {
    sel.value = state.displayCurrency;
    sel.addEventListener('change', (e) => {
      const next = e.target.value;
      if (!SUPPORTED_CURRENCIES.includes(next)) return;
      state.displayCurrency = next;
      localStorage.setItem('genius:currency', next);
      refreshActiveTab(false);
    });
  }

  // Date picker — presets (Hoy / Últimos 7 / Este mes / etc.) + custom range.
  // Only invalidates the date-sensitive tabs (overview/financial); the others
  // run off period data and ignore from/to.
  const preset = el('datePreset');
  const customWrap = el('customRangeWrap');
  const customFrom = el('customFrom');
  const customTo = el('customTo');
  if (preset) {
    preset.value = state.datePreset;
    syncCustomRangeVisibility();
    if (state.customFrom) customFrom.value = state.customFrom;
    if (state.customTo) customTo.value = state.customTo;
    preset.addEventListener('change', (e) => {
      state.datePreset = e.target.value;
      localStorage.setItem('genius:datePreset', state.datePreset);
      syncCustomRangeVisibility();
      onDateRangeChanged();
    });
    const debouncedDateChanged = debounce(onDateRangeChanged, 300);
    customFrom.addEventListener('change', (e) => {
      state.customFrom = e.target.value;
      localStorage.setItem('genius:customFrom', state.customFrom);
      if (state.datePreset === 'custom') debouncedDateChanged();
    });
    customTo.addEventListener('change', (e) => {
      state.customTo = e.target.value;
      localStorage.setItem('genius:customTo', state.customTo);
      if (state.datePreset === 'custom') debouncedDateChanged();
    });
  }

  // Mobile drawer — below 720px the header actions collapse behind a hamburger.
  const menuBtn = el('menuBtn');
  const actions = el('headerActions');
  if (menuBtn && actions) {
    menuBtn.addEventListener('click', () => {
      const open = actions.classList.toggle('open');
      menuBtn.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    // Close the drawer when tapping outside it (convenience on mobile).
    document.addEventListener('click', (e) => {
      if (!actions.classList.contains('open')) return;
      if (actions.contains(e.target) || menuBtn.contains(e.target)) return;
      actions.classList.remove('open');
      menuBtn.setAttribute('aria-expanded', 'false');
    });
  }

  // Tab navigation
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
}

function syncCustomRangeVisibility() {
  const wrap = el('customRangeWrap');
  if (!wrap) return;
  wrap.classList.toggle('hidden', state.datePreset !== 'custom');
}

function onDateRangeChanged() {
  // Invalidate the cache of every date-sensitive tab so a re-open re-fetches.
  for (const tab of DATE_PICKER_APPLIES_TO) state.loaded[tab] = false;
  if (DATE_PICKER_APPLIES_TO.has(state.activeTab)) refreshActiveTab(false);
}

function debounce(fn, ms) {
  let timer = null;
  return (...args) => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => fn(...args), ms);
  };
}

// Compute {from, to} in YYYY-MM-DD for the current preset.
// Returns {} for "all" — no params → backend uses its own default window.
function computeDateRange() {
  const today = new Date();
  const iso = (d) => {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  };
  const daysAgo = (n) => {
    const d = new Date(today);
    d.setDate(d.getDate() - n);
    return d;
  };
  switch (state.datePreset) {
    case 'today':  return { from: iso(today), to: iso(today) };
    case 'last7':  return { from: iso(daysAgo(6)), to: iso(today) };
    case 'month': {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: iso(first), to: iso(today) };
    }
    case 'last30': return { from: iso(daysAgo(29)), to: iso(today) };
    case 'last90': return { from: iso(daysAgo(89)), to: iso(today) };
    case 'year':   return { from: iso(daysAgo(364)), to: iso(today) };
    case 'custom': {
      if (state.customFrom && state.customTo) {
        return { from: state.customFrom, to: state.customTo };
      }
      return {};
    }
    default:
      console.warn('[dashboard] unknown datePreset:', state.datePreset);
      return {};
  }
}

// Approx days span of the current range — used for KPI hint text.
function currentRangeDays() {
  const r = computeDateRange();
  if (!r.from || !r.to) return 30;
  const d1 = new Date(r.from).getTime();
  const d2 = new Date(r.to).getTime();
  if (isNaN(d1) || isNaN(d2)) {
    console.warn('[dashboard] currentRangeDays: unparsable range', r);
    return 30;
  }
  return Math.max(1, Math.round((d2 - d1) / 86400000) + 1);
}

// ─── Exchange rates ───
async function loadRates() {
  try {
    const r = await fetch(`${API}/dashboard/currency-rates`, { credentials: 'include' });
    if (!r.ok) return;
    const d = await r.json();
    if (d.rates && typeof d.rates === 'object') {
      state.rates = d.rates;
      state.ratesFetchedAt = d.fetchedAt;
    }
  } catch {
    // Stay on identity rates — currency() falls back to a 1:1 conversion
    // if the requested currency isn't in the rates map.
  }
}

function switchTab(name) {
  if (state.activeTab === name) return;
  state.activeTab = name;
  document.querySelectorAll('.tab').forEach((t) => {
    t.classList.toggle('active', t.dataset.tab === name);
    t.setAttribute('aria-selected', t.dataset.tab === name ? 'true' : 'false');
  });
  document.querySelectorAll('.tab-panel').forEach((p) => {
    p.classList.toggle('hidden', p.id !== `tab-${name}`);
  });
  // Load lazily the first time the tab is opened.
  if (!state.loaded[name]) loadTab(name, false);
}

function refreshActiveTab(force) {
  loadTab(state.activeTab, force);
}

function loadTab(name, force) {
  if (name === 'overview') return loadOverview(force);
  if (name === 'academic') return loadAcademic(force);
  if (name === 'turmas') return loadTurmas(force);
  if (name === 'financial') return loadFinancial(force);
  if (name === 'commercial') return loadCommercial(force);
}

// ─── Auth flow ───
async function checkSession() {
  try {
    const resp = await fetch(`${API}/auth/me`, { credentials: 'include' });
    if (!resp.ok) throw new Error('no session');
    state.user = await resp.json();
    showApp();
  } catch {
    showLogin();
  }
}

async function onLogin(e) {
  e.preventDefault();
  const errorBox = el('loginError');
  errorBox.classList.remove('visible');

  const email = el('email').value.trim();
  const password = el('password').value;
  const btn = el('loginButton');
  btn.disabled = true;
  btn.textContent = 'Validando…';

  try {
    const resp = await fetch(`${API}/auth/login`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });
    const result = await resp.json();
    if (!resp.ok || !result.success) {
      throw new Error(result.message || 'Credenciales inválidas');
    }
    state.user = result.user;
    showApp();
  } catch (err) {
    errorBox.textContent = err.message || 'Error al iniciar sesión';
    errorBox.classList.add('visible');
  } finally {
    btn.disabled = false;
    btn.textContent = 'Ingresar';
  }
}

async function onLogout() {
  try {
    await fetch(`${API}/auth/logout`, {
      method: 'POST',
      credentials: 'include',
    });
  } catch { /* noop */ }
  stopAutoRefresh();
  state.user = null;
  showLogin();
}

// ─── View switching ───
function showLogin() {
  el('loginView').classList.remove('hidden');
  el('appView').classList.add('hidden');
  stopAutoRefresh();
}

function showApp() {
  el('loginView').classList.add('hidden');
  el('appView').classList.remove('hidden');
  el('userName').textContent = state.user?.name || state.user?.email || '—';
  // Fire rates in parallel — first paint can use identity rates if it loses
  // the race; the next tick re-renders with the real numbers.
  loadRates().then(() => refreshActiveTab(false));
  loadOverview(false);
  startAutoRefresh();
}

function startAutoRefresh() {
  stopAutoRefresh();
  // Auto-refresh only the active tab — don't burn Q10 quota on tabs the
  // operator isn't even looking at.
  state.timer = setInterval(() => refreshActiveTab(false), AUTO_REFRESH_MS);
}

function stopAutoRefresh() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
}

// ─── Common fetch helper ───
async function fetchTab(path, force) {
  setFreshness('Cargando datos del ERP…');
  try {
    if (force) {
      await fetch(`${API}/dashboard/refresh`, { method: 'POST', credentials: 'include' });
    }
    const resp = await fetch(path, { credentials: 'include' });
    if (resp.status === 401) { state.user = null; showLogin(); return null; }
    if (!resp.ok) throw new Error('Error al cargar datos');
    const data = await resp.json();
    setFreshness(`Actualizado a las ${new Date().toLocaleTimeString('es')}`);
    return data;
  } catch (err) {
    setFreshness(`Error: ${err.message || 'Error inesperado'}`);
    return null;
  }
}

// ─── Data loading ───
async function loadOverview(force) {
  setFreshness('Cargando datos del ERP…');
  try {
    if (force) {
      await fetch(`${API}/dashboard/refresh`, { method: 'POST', credentials: 'include' });
    }
    const r = computeDateRange();
    const params = new URLSearchParams();
    params.set('range', String(currentRangeDays()));
    if (r.from && r.to) {
      params.set('from', r.from);
      params.set('to', r.to);
    }
    const resp = await fetch(
      `${API}/dashboard/overview?${params.toString()}`,
      { credentials: 'include' },
    );
    if (resp.status === 401) {
      state.user = null;
      showLogin();
      return;
    }
    if (!resp.ok) throw new Error('Error al cargar datos');
    const data = await resp.json();
    render(data);
    state.loaded.overview = true;
    setFreshness(`Actualizado a las ${new Date().toLocaleTimeString('es')}`);
  } catch (err) {
    setFreshness(`Error: ${err.message || 'Error inesperado'}`);
  }
}

function setFreshness(msg) {
  el('freshness').textContent = msg;
}

// ─── Render ───
function render(data) {
  renderPartialBanner(data);
  renderKpis(data.kpis);
  renderFunnel(data.funnel, data.degraded);
  renderRevenueChart(data.charts.revenueByDay);
  renderStudentsChart(data.charts.newStudentsByDay);
  // Distribution charts moved to the Académico tab — overview no longer
  // returns `data.distributions`. Calling renderProgramsChart/Origins here
  // would crash with "Cannot read properties of undefined".
  renderRecentStudents(data.recent.students);
  renderPendingPayments(data.recent.pendingPayments);
  renderRateInfo();
}

function renderRateInfo() {
  // Footer hint: "Cotación: 1 USD = R$ 5,40 · open.er-api.com" so the
  // operator knows the conversion isn't magic — they can verify it.
  const code = state.displayCurrency;
  const target = el('rateInfo');
  if (!target) return;
  if (code === 'USD') {
    target.textContent = '';
    return;
  }
  const rate = state.rates[code];
  if (!rate) {
    target.textContent = '';
    return;
  }
  const cfg = CURRENCY_LOCALE[code] ?? CURRENCY_LOCALE.USD;
  const rateText = new Intl.NumberFormat(cfg.locale, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 4,
  }).format(rate);
  const symbol = { USD: '$', CRC: '₡', BRL: 'R$' }[code] ?? code;
  let when = '';
  if (state.ratesFetchedAt && state.ratesFetchedAt !== 'fallback') {
    const d = new Date(state.ratesFetchedAt);
    if (!isNaN(d.getTime())) when = ` · ${d.toLocaleDateString('es')}`;
  } else if (state.ratesFetchedAt === 'fallback') {
    when = ' · taxa de fallback';
  }
  target.textContent = `Cotación: 1 USD = ${symbol} ${rateText}${when}`;
}

function renderPartialBanner(data) {
  const banner = el('partialBanner');
  const detail = el('partialBannerDetail');
  if (!data.partial || !data.errors || Object.keys(data.errors).length === 0) {
    banner.classList.add('hidden');
    return;
  }
  const sources = Object.keys(data.errors).map((k) => `<code>${escapeHtml(k)}</code>`).join(', ');
  detail.innerHTML = ` — no pudimos cargar: ${sources}. Los KPIs que dependen de estas fuentes pueden estar incompletos.`;
  banner.classList.remove('hidden');
}

function renderScopeBanner(data) {
  const banner = el('scopeBanner');
  if (!banner) return;
  const title = el('scopeBannerTitle');
  const detail = el('scopeBannerDetail');
  const notice = data && data.scopeNotice;
  if (!notice || !notice.message) {
    banner.classList.add('hidden');
    return;
  }
  title.textContent = notice.title || 'Aviso';
  detail.textContent = ` — ${notice.message}`;
  banner.classList.remove('hidden');
}

/**
 * Format a USD-base amount in the user's chosen display currency.
 *
 * Q10 stores all monetary values in USD on this tenant (verified via live
 * probe of /pagos and /pagosPendientes). We multiply by the current rate
 * from /api/dashboard/currency-rates and let Intl.NumberFormat handle the
 * symbol + locale-aware grouping.
 */
function currency(usdAmount) {
  const code = state.displayCurrency;
  const rate = state.rates[code] ?? 1;  // 1:1 fallback if rate missing
  const value = (Number(usdAmount) || 0) * rate;
  const cfg = CURRENCY_LOCALE[code] ?? CURRENCY_LOCALE.USD;
  return new Intl.NumberFormat(cfg.locale, {
    style: 'currency',
    currency: code,
    maximumFractionDigits: cfg.fractionDigits,
  }).format(value);
}

function renderKpis(k) {
  // Build the KPI card list, skipping ones whose value is explicitly null
  // (backend uses null to signal "this KPI isn't reliable on this plan").
  const cards = [];
  cards.push({ label: 'Estudiantes activos', value: k.activeStudents, hint: `${k.totalStudents} matriculados`, accent: true });
  cards.push({ label: 'Nuevos en el rango', value: k.newStudentsInRange, hint: `${currentRangeDays()} días` });
  cards.push({ label: 'Nuevos este período', value: k.newEnrollmentsThisPeriod, hint: 'vs. renovados' });
  cards.push({ label: 'Contactos en CRM', value: k.totalContacts, hint: 'leads registrados' });
  cards.push({ label: 'Oportunidades', value: k.oppsTotal, hint: 'total en el CRM' });
  if (k.conversionRate != null) {
    cards.push({
      label: 'Tasa de conversión',
      value: `${k.conversionRate}%`,
      hint: 'ganadas / totales',
      variant: k.conversionRate >= 30 ? 'success' : '',
    });
  }
  cards.push({ label: 'Ingresos del período', value: currency(k.revenueInRange), hint: `${currentRangeDays()} días`, variant: 'success' });
  cards.push({ label: 'Deuda pendiente', value: currency(k.outstandingDebt), hint: `${k.ordersPending} cuotas abiertas`, variant: k.outstandingDebt > 0 ? 'danger' : '' });
  cards.push({ label: 'Alumnos con pago', value: k.studentsWithPaymentThisPeriod, hint: `de ${k.totalStudents} matrículas` });

  el('kpiGrid').innerHTML = cards
    .map((c) => {
      const variantClass = c.variant ? `kpi--${c.variant}` : '';
      const accentClass = c.accent ? 'kpi--accent' : '';
      return `
        <div class="kpi ${accentClass} ${variantClass}">
          <div class="kpi__label">${c.label}</div>
          <div class="kpi__value">${c.value}</div>
          <div class="kpi__hint">${c.hint}</div>
        </div>`;
    })
    .join('');
}

function renderFunnel(f, degraded) {
  // When the CRM is underused (few opportunities vs many enrollments) the
  // ratio-as-percentage is misleading. Backend flags that via `degraded` and
  // we show the absolute numbers only.
  const hidePercent = !!(degraded && degraded.conversionRate);
  const rate = (num, den) => (den > 0 ? Math.round((num / den) * 100) : 0);
  const stages = [
    {
      label: 'Oportunidades',
      value: f.opportunities,
      sub: 'Total en CRM',
    },
    {
      label: 'Matrículas',
      value: f.enrollments,
      sub: hidePercent ? 'Matriculados en el período' : `${rate(f.enrollments, f.opportunities)}% del total`,
    },
    {
      label: 'Con pago',
      value: f.paidEnrollments,
      sub: f.enrollments > 0 ? `${rate(f.paidEnrollments, f.enrollments)}% de matrículas` : '—',
      paid: true,
    },
  ];
  el('funnel').innerHTML = stages
    .map(
      (s) => `
      <div class="funnel__stage ${s.paid ? 'funnel__stage--paid' : ''}">
        <div class="funnel__label">${escapeHtml(s.label)}</div>
        <div class="funnel__value">${escapeHtml(String(s.value))}</div>
        <div class="funnel__rate">${escapeHtml(s.sub)}</div>
      </div>`,
    )
    .join('');
}

// ─── Charts ───
function destroyChart(id) {
  if (state.charts[id]) {
    state.charts[id].destroy();
    delete state.charts[id];
  }
}

function renderRevenueChart(series) {
  destroyChart('revenue');
  const ctx = el('revenueChart').getContext('2d');
  state.charts.revenue = new Chart(ctx, {
    type: 'line',
    data: {
      labels: series.map((p) => p.date.slice(5)),
      datasets: [{
        label: 'Ingresos',
        data: series.map((p) => p.value),
        borderColor: '#DCAF63',
        backgroundColor: 'rgba(220, 175, 99, 0.15)',
        tension: 0.3,
        fill: true,
        pointRadius: 2,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: { ticks: { callback: (v) => currency(v) } },
      },
    },
  });
}

function renderStudentsChart(series) {
  destroyChart('students');
  const ctx = el('studentsChart').getContext('2d');
  state.charts.students = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: series.map((p) => p.date.slice(5)),
      datasets: [{
        label: 'Nuevos',
        data: series.map((p) => p.value),
        backgroundColor: '#000E38',
        borderRadius: 6,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });
}

// ─── Tables ───
function renderRecentStudents(list) {
  const tbody = document.querySelector('#recentStudents tbody');
  if (!list?.length) {
    tbody.innerHTML = '<tr><td colspan="3" style="text-align:center;color:var(--gray-text)">Sin registros</td></tr>';
    return;
  }
  tbody.innerHTML = list
    .map((s) => {
      const name = `${s.Nombres ?? ''} ${s.Apellidos ?? ''}`.trim() || '—';
      const prog = s.Codigo_programa ?? s.Programa ?? '—';
      const estado = s.Estado ?? '—';
      const badge =
        String(estado).toLowerCase().includes('activ')
          ? 'badge--success'
          : String(estado).toLowerCase().includes('cancel')
          ? 'badge--danger'
          : 'badge--warning';
      return `<tr>
        <td>${escapeHtml(name)}</td>
        <td>${escapeHtml(prog)}</td>
        <td><span class="badge ${badge}">${escapeHtml(estado)}</span></td>
      </tr>`;
    })
    .join('');
}

function renderPendingPayments(list) {
  const tbody = document.querySelector('#pendingPayments tbody');
  if (!list?.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--gray-text)">Sin pagos pendientes</td></tr>';
    return;
  }
  tbody.innerHTML = list
    .map((p) => {
      const name = `${p.Nombres ?? ''} ${p.Apellidos ?? ''}`.trim() || '—';
      const due = p.Fecha_vencimiento ?? '—';
      const overdue = due !== '—' && new Date(due).getTime() < Date.now();
      return `<tr>
        <td>${escapeHtml(name)}</td>
        <td>${escapeHtml(p.Concepto ?? '—')}</td>
        <td>${escapeHtml(due)} ${overdue ? '<span class="badge badge--danger">Vencido</span>' : ''}</td>
        <td>${currency(p.Valor)}</td>
      </tr>`;
    })
    .join('');
}

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[c]));
}

// `orderedCefr` now lives in /dashboard/helpers.js — loaded before this
// script so it's available on the global scope.

// Render a simple `key: count` distribution as a horizontal bar chart.
function renderDistributionChart(canvasId, dist, colour = '#000E38') {
  destroyChart(canvasId);
  const ctx = el(canvasId).getContext('2d');
  const entries = Object.entries(dist).sort((a, b) => b[1] - a[1]);
  state.charts[canvasId] = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: entries.map(([k]) => k),
      datasets: [{
        data: entries.map(([, v]) => v),
        backgroundColor: colour,
        borderRadius: 6,
      }],
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { x: { beginAtZero: true, ticks: { stepSize: 1 } } },
    },
  });
}

function renderDonut(canvasId, dist, palette) {
  destroyChart(canvasId);
  const ctx = el(canvasId).getContext('2d');
  const labels = Object.keys(dist);
  const values = Object.values(dist);
  const colors = palette ?? ['#000E38', '#DCAF63', '#1a2456', '#EBC584', '#606060', '#FFF8EF'];
  state.charts[canvasId] = new Chart(ctx, {
    type: 'doughnut',
    data: { labels, datasets: [{ data: values, backgroundColor: colors }] },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
  });
}

function renderMonthlyLine(canvasId, series, colour, isMoney) {
  destroyChart(canvasId);
  const ctx = el(canvasId).getContext('2d');
  state.charts[canvasId] = new Chart(ctx, {
    type: 'line',
    data: {
      labels: series.map((s) => s.month),
      datasets: [{
        data: series.map((s) => s.value),
        borderColor: colour,
        backgroundColor: colour + '26',
        tension: 0.3,
        fill: true,
        pointRadius: 3,
      }],
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: {
        y: {
          beginAtZero: true,
          ticks: isMoney ? { callback: (v) => currency(v) } : { stepSize: 1 },
        },
      },
    },
  });
}

// ═════════════════ ACADEMIC TAB ═════════════════
async function loadAcademic(force) {
  const data = await fetchTab(`${API}/dashboard/academic`, force);
  if (!data) return;
  state.loaded.academic = true;

  const s = data.summary || {};
  el('academicKpis').innerHTML = [
    { label: 'Estudiantes matriculados', value: s.totalStudents, hint: s.currentPeriod || '—', accent: true },
    { label: 'Docentes activos', value: s.totalTeachers, hint: 'en la planta' },
    { label: 'Edad promedio', value: s.avgAge != null ? `${s.avgAge} años` : '—', hint: 'estudiantes activos' },
    { label: 'Retención', value: data.retention.retentionRate != null ? `${data.retention.retentionRate}%` : '—', hint: `${data.retention.retained} de ${data.retention.previousTotal}` },
  ].map(kpiCard).join('');

  // Retention funnel
  const r = data.retention;
  el('retention').innerHTML = [
    { label: 'Período anterior', value: r.previousTotal, sub: r.previousPeriod || '—' },
    { label: 'Retenidos', value: r.retained, sub: r.retentionRate != null ? `${r.retentionRate}% retención` : '—', paid: true },
    { label: 'Churn', value: r.churned, sub: r.churnRate != null ? `${r.churnRate}% salieron` : '—' },
    { label: 'Nuevos', value: r.newcomers, sub: 'entraron ahora' },
  ].map(funnelStage).join('');

  const dist = data.distributions || {};
  const prog = data.progression || {};
  const levelsOrder = prog.levelsOrder || [];

  // Distribution charts
  renderDonut('modalityChart', dist.byModality || {});
  renderDistributionChart('cityChart', dist.byCity || {}, '#DCAF63');
  renderDistributionChart(
    'cefrRegularChart',
    orderedCefr(prog.distributionRegular || {}, levelsOrder),
    '#DCAF63',
  );
  renderDistributionChart(
    'cefrIntensivoChart',
    orderedCefr(prog.distributionIntensivo || {}, levelsOrder),
    '#000E38',
  );
  renderDistributionChart('jornadaChart', dist.byJornada || {}, '#DCAF63');
  renderDonut('genderChart', dist.byGender || {});
  renderDistributionChart('ageChart', dist.byAge || {}, '#1a2456');

  // Risk flags table
  const riskBody = document.querySelector('#riskTable tbody');
  const riskFlags = data.riskFlags || [];
  if (!riskFlags.length) {
    riskBody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--gray-text)">Sin alumnos en riesgo</td></tr>';
  } else {
    riskBody.innerHTML = riskFlags.map((rf) => `
      <tr>
        <td>${escapeHtml(rf.nombre || '—')}</td>
        <td>${escapeHtml(rf.nivel || '—')}</td>
        <td>${escapeHtml(rf.modality || '—')}</td>
        <td>${escapeHtml(rf.curso || '—')}</td>
        <td>${escapeHtml(String(rf.mesesMatriculado ?? '—'))}</td>
        <td>${escapeHtml(rf.inasistencia != null ? `${rf.inasistencia}%` : '—')}</td>
        <td>${escapeHtml(rf.promedio != null ? String(rf.promedio) : '—')}</td>
        <td>${escapeHtml(Array.isArray(rf.flags) ? rf.flags.join(', ') : '—')}</td>
      </tr>`).join('');
  }

  // Teachers table (unchanged — 4 cols)
  const tbody = document.querySelector('#teachersTable tbody');
  if (!data.teachers.length) {
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--gray-text)">Sin docentes</td></tr>';
  } else {
    tbody.innerHTML = data.teachers.map((t) => `
      <tr>
        <td>${escapeHtml([t.Nombres, t.Apellidos].filter(Boolean).join(' ') || '—')}</td>
        <td>${escapeHtml(t.Email || '—')}</td>
        <td>${escapeHtml(t.Celular || '—')}</td>
        <td>${escapeHtml(t.Genero || '—')}</td>
      </tr>`).join('');
  }

  applyPartialBanner(data);
}

// ═════════════════ FINANCIAL TAB ═════════════════
async function loadFinancial(force) {
  const r = computeDateRange();
  const params = new URLSearchParams();
  params.set('months', '12');
  if (r.from && r.to) {
    params.set('from', r.from);
    params.set('to', r.to);
  }
  const data = await fetchTab(`${API}/dashboard/financial?${params.toString()}`, force);
  if (!data) return;
  state.loaded.financial = true;

  const s = data.summary || {};
  // LTV hint exposes the modality breakdown so the operator sees the two
  // contractual horizons feeding the headline average.
  const ltvHint = [
    s.ltvRegular != null ? `Reg: ${currency(s.ltvRegular)}` : null,
    s.ltvIntensivo != null ? `Int: ${currency(s.ltvIntensivo)}` : null,
  ].filter(Boolean).join(' · ') || `máx. ${currency(s.maxPaid)}`;
  // Deuda hint clarifies how many distinct debtors are behind the total
  // and how much "ghost debt" (unpaid enrollment proposals) we excluded.
  const debtHint = (() => {
    const parts = [];
    if (s.debtorsTotal != null) parts.push(`${s.debtorsTotal} deudores`);
    if (s.activeWithDebt != null) parts.push(`${s.activeWithDebt} activos`);
    const primary = parts.join(' · ');
    if (s.ghostDebt > 0) {
      return `${primary} · excl. ${currency(s.ghostDebt)} propuestas`;
    }
    return primary || 'sin deudores';
  })();
  el('financialKpis').innerHTML = [
    { label: 'Ingresos (12m)', value: currency(s.totalRevenue), hint: `${s.payingStudents} alumnos pagantes`, accent: true, variant: 'success' },
    { label: 'Ticket promedio', value: currency(s.avgTicket), hint: 'por pagante (12m)' },
    { label: 'LTV estimado', value: currency(s.ltvEstimated), hint: ltvHint },
    { label: 'Deuda pendiente', value: currency(s.outstandingDebt), hint: debtHint, variant: s.outstandingDebt > 0 ? 'danger' : '' },
    { label: 'Inadimplencia', value: s.inadimplenciaRate != null ? `${s.inadimplenciaRate}%` : '—', hint: 'de alumnos activos' },
    { label: 'Avance del período', value: s.projectionRate != null ? `${s.projectionRate}%` : '—', hint: 'pagado / proyectado' },
  ].map(kpiCard).join('');

  renderMonthlyLine('mrrChart', data.charts.revenueByMonth, '#DCAF63', true);
  renderDistributionChart('revenueByProgramChart', data.charts.revenueByConcept, '#DCAF63');
  renderDistributionChart('revenueByModalityChart', data.charts.revenueByModality, '#1a2456');

  // Top debtors table
  const debt = document.querySelector('#debtorsTable tbody');
  if (!data.tables.topDebtors.length) {
    debt.innerHTML = '<tr><td colspan="6" style="text-align:center;color:var(--gray-text)">Sin deudas registradas</td></tr>';
  } else {
    debt.innerHTML = data.tables.topDebtors.map((d) => `
      <tr>
        <td>${escapeHtml(d.estudiante)}</td>
        <td>${escapeHtml(d.concepto || '—')}</td>
        <td>${escapeHtml(d.periodo || '—')}</td>
        <td>${currency(d.total)}</td>
        <td>${currency(d.pagado)}</td>
        <td><strong>${currency(d.saldo)}</strong></td>
      </tr>`).join('');
  }

  // Recent payments
  const pay = document.querySelector('#recentPaymentsTable tbody');
  if (!data.tables.recentPayments.length) {
    pay.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--gray-text)">Sin pagos</td></tr>';
  } else {
    pay.innerHTML = data.tables.recentPayments.map((p) => `
      <tr>
        <td>${escapeHtml(p.fecha || '—')}</td>
        <td>${escapeHtml(p.estudiante || '—')}</td>
        <td>${escapeHtml(p.recibo || '—')}</td>
        <td>${currency(p.valor)}</td>
      </tr>`).join('');
  }

  applyPartialBanner(data);
}

// ═════════════════ TURMAS TAB ═════════════════
async function loadTurmas(force) {
  const data = await fetchTab(`${API}/dashboard/turmas`, force);
  if (!data) return;

  const s = data.summary || {};
  const dist = data.distributions || {};
  const alerts = data.alerts || {};
  const notes = data.notes || {};

  // Occupation variant: green ≥80, warning ≥50, danger below.
  const ocupVariant =
    s.ocupacionMedia == null ? ''
      : s.ocupacionMedia >= 80 ? 'success'
      : s.ocupacionMedia >= 50 ? 'warning'
      : 'danger';

  el('turmasKpis').innerHTML = [
    { label: 'Cursos activos', value: s.totalCursos ?? '—', hint: 'en el período', accent: true },
    { label: 'Ocupación media', value: s.ocupacionMedia != null ? `${s.ocupacionMedia}%` : '—', hint: 'matrículas / cupos', variant: ocupVariant },
    { label: 'Estudiantes matriculados', value: s.totalMatriculados ?? '—', hint: `de ${s.totalCupo ?? 0} cupos` },
    { label: 'Llenos (≥90%)', value: s.overbookedCount ?? 0, hint: 'cerca del tope', variant: (s.overbookedCount || 0) > 0 ? 'danger' : '' },
    { label: 'Bajo 5 alumnos', value: s.underbookedCount ?? 0, hint: 'cursos en riesgo', variant: (s.underbookedCount || 0) > 0 ? 'warning' : '' },
    { label: 'Sin estudiantes', value: s.emptyCount ?? 0, hint: 'cursos vacíos', variant: (s.emptyCount || 0) > 0 ? 'danger' : '' },
    { label: 'Docentes activos', value: s.docentesActivos ?? '—', hint: 'con carga' },
  ].map(kpiCard).join('');

  // Distribution charts
  renderDonut('turmasModalityChart', dist.byModality || {});
  renderDistributionChart('turmasCityChart', dist.byCity || {}, '#DCAF63');

  // Alert blocks
  const renderAlertList = (id, items) => {
    const target = el(id);
    if (!target) return;
    if (!items || !items.length) {
      target.innerHTML = '<div class="alert-item alert-item--empty">Ninguno</div>';
      return;
    }
    target.innerHTML = items.map((it) => {
      const mat = it.matriculados ?? 0;
      const cup = it.cupo ?? 0;
      const oc = it.ocupacion ?? null;
      return `<div class="alert-item"><strong>${escapeHtml(it.Nombre || '—')}</strong><span>${escapeHtml(String(mat))}/${escapeHtml(String(cup))} · ${oc != null ? escapeHtml(String(oc)) : '—'}%</span></div>`;
    }).join('');
  };
  renderAlertList('overbookedList', alerts.overbooked);
  renderAlertList('underbookedList', alerts.underbooked);
  renderAlertList('emptyList', alerts.empty);

  // Courses table
  const coursesBody = document.querySelector('#coursesTable tbody');
  const courses = data.courses || [];
  if (!courses.length) {
    coursesBody.innerHTML = '<tr><td colspan="8" style="text-align:center;color:var(--gray-text)">Sin cursos</td></tr>';
  } else {
    coursesBody.innerHTML = courses.map((c) => {
      const pct = c.ocupacion;
      let occupancyCell;
      if (pct == null) {
        occupancyCell = '—';
      } else {
        const band = pct >= 90 ? 'danger'
          : pct >= 50 ? 'success'
          : pct > 0 ? 'warning'
          : 'muted';
        occupancyCell = `<div class="occupancy">
          <div class="occupancy__bar"><div class="occupancy__fill occupancy__fill--${band}" style="width:${pct}%"></div></div>
          <span>${pct}%</span>
        </div>`;
      }
      return `<tr>
        <td>${escapeHtml(c.Nombre || '—')}</td>
        <td>${escapeHtml(c.Nivel || '—')}</td>
        <td>${escapeHtml(c.modality || '—')}</td>
        <td>${escapeHtml(c.Sede || '—')}</td>
        <td>${escapeHtml(c.Docente || '—')}</td>
        <td>${escapeHtml(String(c.matriculados ?? 0))}</td>
        <td>${escapeHtml(String(c.cupo ?? 0))}</td>
        <td>${occupancyCell}</td>
      </tr>`;
    }).join('');
  }

  // Teachers table
  const teachersBody = document.querySelector('#turmasTeachersTable tbody');
  const teachers = data.teachers || [];
  if (!teachers.length) {
    teachersBody.innerHTML = '<tr><td colspan="4" style="text-align:center;color:var(--gray-text)">Sin docentes</td></tr>';
  } else {
    teachersBody.innerHTML = teachers.map((t) => `
      <tr>
        <td>${escapeHtml(t.nombre || '—')}</td>
        <td>${escapeHtml(String(t.cursos ?? 0))}</td>
        <td>${escapeHtml(String(t.estudiantes ?? 0))}</td>
        <td>${escapeHtml(String(t.cupoTotal ?? 0))}</td>
      </tr>`).join('');
  }

  // Notes — render non-empty string values as bullet paragraphs.
  const notesTarget = el('turmasNotes');
  if (notesTarget) {
    const values = Object.values(notes).filter((v) => typeof v === 'string' && v.trim() !== '');
    if (!values.length) {
      notesTarget.innerHTML = '';
    } else {
      notesTarget.innerHTML = values.map((v) => `
        <p><svg class="icon icon--xs"><use href="#icon-alert"/></svg> ${escapeHtml(v)}</p>`).join('');
    }
  }

  applyPartialBanner(data);
  state.loaded.turmas = true;
}

// ═════════════════ COMMERCIAL TAB ═════════════════
async function loadCommercial(force) {
  const data = await fetchTab(`${API}/dashboard/commercial`, force);
  if (!data) return;
  state.loaded.commercial = true;

  const s = data.summary || {};
  el('commercialKpis').innerHTML = [
    { label: 'Oportunidades totales', value: s.totalOpportunities, hint: 'en el CRM', accent: true },
    { label: 'Contactos', value: s.totalContacts, hint: 'leads en base' },
    { label: 'Ganadas', value: s.won, hint: 'matriculadas', variant: 'success' },
    { label: 'Perdidas', value: s.lost, hint: 'no cerradas', variant: s.lost > 0 ? 'danger' : '' },
    { label: 'En progreso', value: s.inProgress, hint: 'negociando' },
    { label: 'Tasa de conversión', value: s.conversionRate != null ? `${s.conversionRate}%` : '—', hint: 'ganadas / total' },
    { label: 'Indicaciones', value: s.referralCount, hint: s.referralRate != null ? `${s.referralRate}% del total` : '—' },
    { label: 'Asesores activos', value: s.advisorCount, hint: 'con oportunidades' },
  ].map(kpiCard).join('');

  renderMonthlyLine('leadsChart', data.charts.leadsByMonth, '#000E38', false);
  renderDonut('stateChart', data.charts.byState);
  renderDistributionChart('originChart', data.charts.byOrigin, '#DCAF63');

  // Advisors
  const adv = document.querySelector('#advisorsTable tbody');
  adv.innerHTML = data.tables.advisors.length
    ? data.tables.advisors.map((a) => `<tr><td>${escapeHtml(a.nombre)}</td><td>${a.total}</td></tr>`).join('')
    : '<tr><td colspan="2" style="text-align:center;color:var(--gray-text)">Sin asesores</td></tr>';

  // Municipios
  const mun = document.querySelector('#municipiosTable tbody');
  mun.innerHTML = data.tables.topMunicipios.length
    ? data.tables.topMunicipios.map((m) => `<tr><td>${escapeHtml(m.municipio)}</td><td>${m.total}</td></tr>`).join('')
    : '<tr><td colspan="2" style="text-align:center;color:var(--gray-text)">Sin datos geográficos</td></tr>';

  // Recent opps
  const opps = document.querySelector('#oppsTable tbody');
  opps.innerHTML = data.tables.recentOpps.length
    ? data.tables.recentOpps.map((o) => `
        <tr>
          <td>${escapeHtml(o.fecha || '—')}</td>
          <td>${escapeHtml(o.nombre || '—')}</td>
          <td>${escapeHtml(o.origen || '—')}</td>
          <td>${escapeHtml(o.canal || '—')}</td>
          <td><span class="badge">${escapeHtml(o.estado)}</span></td>
          <td>${escapeHtml(o.asesor || '—')}</td>
        </tr>`).join('')
    : '<tr><td colspan="6" style="text-align:center;color:var(--gray-text)">Sin oportunidades registradas</td></tr>';

  applyPartialBanner(data);
}

// ─── Shared UI helpers for the new tabs ───
function kpiCard(c) {
  const variantClass = c.variant ? `kpi--${c.variant}` : '';
  const accentClass = c.accent ? 'kpi--accent' : '';
  return `
    <div class="kpi ${accentClass} ${variantClass}">
      <div class="kpi__label">${escapeHtml(c.label)}</div>
      <div class="kpi__value">${escapeHtml(String(c.value))}</div>
      <div class="kpi__hint">${escapeHtml(c.hint ?? '')}</div>
    </div>`;
}

function funnelStage(s) {
  return `
    <div class="funnel__stage ${s.paid ? 'funnel__stage--paid' : ''}">
      <div class="funnel__label">${escapeHtml(s.label)}</div>
      <div class="funnel__value">${escapeHtml(String(s.value))}</div>
      <div class="funnel__rate">${escapeHtml(s.sub ?? '')}</div>
    </div>`;
}

function applyPartialBanner(data) {
  // Each tab can toggle the banner; when the active tab has errors, show them.
  renderPartialBanner(data);
  renderScopeBanner(data);
  renderRateInfo();
}
