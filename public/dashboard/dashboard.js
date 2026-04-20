/* Genius Dashboard */

const API = '/api';
const AUTO_REFRESH_MS = 60_000;

const state = {
  user: null,
  rangeDays: 30,
  charts: {},
  timer: null,
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
  el('refreshBtn').addEventListener('click', () => loadOverview(true));
  el('rangeSelect').addEventListener('change', (e) => {
    state.rangeDays = Number(e.target.value);
    loadOverview(false);
  });
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
  state.timer = setInterval(() => loadOverview(false), AUTO_REFRESH_MS);
}

function stopAutoRefresh() {
  if (state.timer) clearInterval(state.timer);
  state.timer = null;
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
  renderKpis(data.kpis);
  renderFunnel(data.funnel);
  renderRevenueChart(data.charts.revenueByDay);
  renderStudentsChart(data.charts.newStudentsByDay);
  renderProgramsChart(data.distributions.studentsByProgram);
  renderOriginsChart(data.distributions.opportunitiesByOrigin);
  renderRecentStudents(data.recent.students);
  renderPendingPayments(data.recent.pendingPayments);
}

function currency(n) {
  return new Intl.NumberFormat('es-GT', {
    style: 'currency',
    currency: 'GTQ',
    maximumFractionDigits: 0,
  }).format(Number(n) || 0);
}

function renderKpis(k) {
  const cards = [
    { label: 'Estudiantes activos', value: k.activeStudents, hint: `${k.totalStudents} totales`, accent: true },
    { label: 'Nuevos en el rango', value: k.newStudentsInRange, hint: `${state.rangeDays} días` },
    { label: 'Oportunidades abiertas', value: k.oppsOpen, hint: `${k.oppsWon} ganadas · ${k.oppsLost} perdidas` },
    { label: 'Tasa de conversión', value: `${k.conversionRate}%`, hint: 'ganadas / totales', variant: k.conversionRate >= 30 ? 'success' : '' },
    { label: 'Ingresos del período', value: currency(k.revenueInRange), hint: `${state.rangeDays} días`, variant: 'success' },
    { label: 'Deuda pendiente', value: currency(k.outstandingDebt), hint: `${k.overduePending} vencidas`, variant: k.overduePending > 0 ? 'danger' : '' },
    { label: 'Órdenes pendientes', value: k.ordersPending, hint: 'sin pago registrado' },
    { label: 'Negocios activos', value: k.activeDeals, hint: 'en el pipeline' },
  ];

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

function renderFunnel(f) {
  const rate = (num, den) => (den > 0 ? Math.round((num / den) * 100) : 0);
  const stages = [
    { label: 'Oportunidades', value: f.opportunities, sub: 'Total en CRM' },
    { label: 'Matrículas', value: f.enrollments, sub: `${rate(f.enrollments, f.opportunities)}% del total` },
    { label: 'Pagadas', value: f.paidEnrollments, sub: `${rate(f.paidEnrollments, f.enrollments)}% del total`, paid: true },
  ];
  el('funnel').innerHTML = stages
    .map(
      (s) => `
      <div class="funnel__stage ${s.paid ? 'funnel__stage--paid' : ''}">
        <div class="funnel__label">${s.label}</div>
        <div class="funnel__value">${s.value}</div>
        <div class="funnel__rate">${s.sub}</div>
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
