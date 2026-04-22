/* Genius Dashboard */

const API = '/api';
const AUTO_REFRESH_MS = 60_000;

const state = {
  user: null,
  rangeDays: 30,
  charts: {},
  timer: null,
  activeTab: 'overview',
  // Cache per tab so switching back and forth doesn't re-hit /api. Invalidated
  // by refreshBtn or the 60s auto-timer.
  loaded: { overview: false, academic: false, financial: false, commercial: false },
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
  el('rangeSelect').addEventListener('change', (e) => {
    state.rangeDays = Number(e.target.value);
    // Range only affects Overview; other tabs ignore it.
    state.loaded.overview = false;
    if (state.activeTab === 'overview') loadOverview(false);
  });

  // Tab navigation
  document.querySelectorAll('.tab').forEach((btn) => {
    btn.addEventListener('click', () => switchTab(btn.dataset.tab));
  });
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
  // Range picker is only meaningful on the Overview tab.
  el('rangeSelect').style.display = name === 'overview' ? '' : 'none';
  // Load lazily the first time the tab is opened.
  if (!state.loaded[name]) loadTab(name, false);
}

function refreshActiveTab(force) {
  loadTab(state.activeTab, force);
}

function loadTab(name, force) {
  if (name === 'overview') return loadOverview(force);
  if (name === 'academic') return loadAcademic(force);
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
    setFreshness(`⚠ ${err.message || 'Error inesperado'}`);
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
    const resp = await fetch(
      `${API}/dashboard/overview?range=${state.rangeDays}`,
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
    setFreshness(`⚠ ${err.message || 'Error inesperado'}`);
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
  renderProgramsChart(data.distributions.studentsByProgram);
  renderOriginsChart(data.distributions.opportunitiesByOrigin);
  renderRecentStudents(data.recent.students);
  renderPendingPayments(data.recent.pendingPayments);
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

function currency(n) {
  // GTQ symbol happens to be "Q" — matches the Spanish-speaking institution context.
  return new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency: 'GTQ',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
}

function renderKpis(k) {
  // Build the KPI card list, skipping ones whose value is explicitly null
  // (backend uses null to signal "this KPI isn't reliable on this plan").
  const cards = [];
  cards.push({ label: 'Estudiantes activos', value: k.activeStudents, hint: `${k.totalStudents} matriculados`, accent: true });
  cards.push({ label: 'Nuevos en el rango', value: k.newStudentsInRange, hint: `${state.rangeDays} días` });
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
  cards.push({ label: 'Ingresos del período', value: currency(k.revenueInRange), hint: `${state.rangeDays} días`, variant: 'success' });
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

function renderProgramsChart(dist) {
  destroyChart('programs');
  const ctx = el('programsChart').getContext('2d');
  const labels = Object.keys(dist);
  const values = Object.values(dist);
  state.charts.programs = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels,
      datasets: [{
        data: values,
        backgroundColor: ['#000E38', '#DCAF63', '#1a2456', '#EBC584', '#606060', '#FFF8EF'],
      }],
    },
    options: { responsive: true, plugins: { legend: { position: 'bottom' } } },
  });
}

function renderOriginsChart(dist) {
  destroyChart('origins');
  const ctx = el('originsChart').getContext('2d');
  state.charts.origins = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: Object.keys(dist),
      datasets: [{
        data: Object.values(dist),
        backgroundColor: '#DCAF63',
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

  // Charts
  renderDistributionChart('jornadaChart', data.distributions.byJornada, '#DCAF63');
  renderDistributionChart('nivelChart', data.distributions.byNivel, '#000E38');
  renderDonut('genderChart', data.distributions.byGender);
  renderDistributionChart('ageChart', data.distributions.byAge, '#1a2456');

  // Teachers table
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
  const data = await fetchTab(`${API}/dashboard/financial?months=12`, force);
  if (!data) return;
  state.loaded.financial = true;

  const s = data.summary || {};
  el('financialKpis').innerHTML = [
    { label: 'Ingresos (12m)', value: currency(s.totalRevenue), hint: `${s.payingStudents} alumnos pagantes`, accent: true, variant: 'success' },
    { label: 'Ticket promedio', value: currency(s.avgTicket), hint: 'por pagante (12m)' },
    { label: 'LTV aproximado', value: currency(s.ltvApprox), hint: `máx. ${currency(s.maxPaid)}` },
    { label: 'Deuda pendiente', value: currency(s.outstandingDebt), hint: `${s.activeWithDebt || 0} alumnos activos con saldo`, variant: s.outstandingDebt > 0 ? 'danger' : '' },
    { label: 'Inadimplencia', value: s.inadimplenciaRate != null ? `${s.inadimplenciaRate}%` : '—', hint: 'de alumnos activos' },
    { label: 'Avance del período', value: s.projectionRate != null ? `${s.projectionRate}%` : '—', hint: 'pagado / proyectado' },
  ].map(kpiCard).join('');

  renderMonthlyLine('mrrChart', data.charts.revenueByMonth, '#DCAF63', true);
  renderDistributionChart('revenueByProgramChart', data.charts.revenueByConcept, '#DCAF63');

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
}
