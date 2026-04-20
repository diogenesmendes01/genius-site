/* ═══════════════════════════════════════════
   Genius Idiomas — Matrícula App
   ═══════════════════════════════════════════ */

const API_BASE = '/api/q10';

// ─── State ───
let currentStep = 1;
let catalogs = { programas: [], periodos: [], sedes: [] };
let enrollmentResult = null;

// Read tracking params from URL
const urlParams = new URLSearchParams(window.location.search);
const trackingRef = urlParams.get('ref') || '';
const asesor = urlParams.get('asesor') || '';

// ─── Init ───
document.addEventListener('DOMContentLoaded', () => {
  loadCatalogs();
  if (trackingRef) {
    reportTrackingStatus('opened');
  }
});

// ─── Load Catalogs ───
async function loadCatalogs() {
  try {
    const resp = await fetch(`${API_BASE}/catalogs`);
    if (!resp.ok) throw new Error('Error loading catalogs');
    catalogs = await resp.json();
    populateSelects();
  } catch (err) {
    console.warn('Could not load catalogs, using fallback:', err.message);
    populateFallback();
  }
}

function populateSelects() {
  const progSelect = document.getElementById('programa');
  const perSelect = document.getElementById('periodo');
  const sedeSelect = document.getElementById('sede');

  // Programs
  progSelect.innerHTML = '<option value="">— Selecciona un programa —</option>';
  (catalogs.programas || []).forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.Codigo || p.Id || p.id || '';
    opt.textContent = p.Nombre || p.nombre || p.Descripcion || 'Programa';
    progSelect.appendChild(opt);
  });

  // Periods
  perSelect.innerHTML = '<option value="">— Selecciona un período —</option>';
  (catalogs.periodos || []).forEach((p) => {
    const opt = document.createElement('option');
    opt.value = p.Codigo || p.Id || p.id || '';
    opt.textContent = p.Nombre || p.nombre || p.Descripcion || 'Período';
    perSelect.appendChild(opt);
  });

  // Locations
  sedeSelect.innerHTML = '<option value="">— Selecciona una sede —</option>';
  (catalogs.sedes || []).forEach((s) => {
    const opt = document.createElement('option');
    opt.value = s.Codigo || s.Id || s.id || '';
    opt.textContent = s.Nombre || s.nombre || 'Sede';
    sedeSelect.appendChild(opt);
  });
}

function populateFallback() {
  document.getElementById('programa').innerHTML =
    '<option value="">— No se pudieron cargar los programas —</option>';
  document.getElementById('periodo').innerHTML =
    '<option value="">— No se pudieron cargar los períodos —</option>';
  document.getElementById('sede').innerHTML =
    '<option value="">— No se pudieron cargar las sedes —</option>';
}

// ─── Tracking ───
async function reportTrackingStatus(status) {
  if (!trackingRef) return;
  try {
    await fetch(`${API_BASE}/tracking`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ref: trackingRef, status, asesor }),
    });
  } catch (err) {
    console.warn('Tracking update failed:', err.message);
  }
}

// ─── Navigation ───
function showStep(step, direction) {
  for (let i = 1; i <= 5; i++) {
    const section = document.getElementById(`step${i}`);
    section.classList.remove('card--enter-right', 'card--enter-left');
    if (i === step) {
      section.classList.remove('hidden');
      if (direction === 'forward') {
        section.classList.add('card--enter-right');
      } else if (direction === 'back') {
        section.classList.add('card--enter-left');
      }
    } else {
      section.classList.add('hidden');
    }
  }
  updateProgress(step);
  currentStep = step;
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

function updateProgress(step) {
  for (let i = 1; i <= 5; i++) {
    const circle = document.querySelector(`.progress__circle[data-step="${i}"]`);
    circle.classList.remove('active', 'completed');

    if (i < step) {
      circle.classList.add('completed');
      circle.innerHTML = '✓';
    } else if (i === step) {
      circle.classList.add('active');
      circle.innerHTML = i;
    } else {
      circle.innerHTML = i;
    }
  }

  for (let i = 1; i <= 4; i++) {
    const line = document.querySelector(`.progress__line[data-line="${i}"]`);
    line.classList.toggle('completed', i < step);
  }
}

function nextStep(current) {
  hideError();
  if (!validateStep(current)) return;

  if (current === 3) {
    buildSummary();
  }

  showStep(current + 1, 'forward');
}

function prevStep(current) {
  hideError();
  showStep(current - 1, 'back');
}

// ─── Validation ───
function validateStep(step) {
  clearValidation();

  if (step === 1) {
    let valid = true;

    if (!val('nombres')) { showFieldError('nombres'); valid = false; }
    if (!val('apellidos')) { showFieldError('apellidos'); valid = false; }
    if (!valEmail('email')) { showFieldError('email'); valid = false; }
    if (!val('telefono')) { showFieldError('telefono'); valid = false; }

    if (!valid) showError('Por favor completa todos los campos obligatorios.');
    return valid;
  }

  if (step === 2) {
    let valid = true;

    if (!val('numDocumento')) { showFieldError('numDocumento'); valid = false; }

    if (!valid) showError('Por favor ingresa tu número de documento.');
    return valid;
  }

  if (step === 3) {
    let valid = true;

    if (!val('programa')) { showFieldError('programa'); valid = false; }
    if (!val('periodo')) { showFieldError('periodo'); valid = false; }

    if (!valid) showError('Selecciona un programa y período académico.');
    return valid;
  }

  return true;
}

function val(id) {
  return document.getElementById(id).value.trim() !== '';
}

function valEmail(id) {
  const v = document.getElementById(id).value.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

function showFieldError(id) {
  const input = document.getElementById(id);
  const msg = document.getElementById(`err-${id}`);
  input.classList.add('error');
  if (msg) msg.classList.add('visible');
}

function clearValidation() {
  document.querySelectorAll('input.error, select.error').forEach((el) => el.classList.remove('error'));
  document.querySelectorAll('.error-msg.visible').forEach((el) => el.classList.remove('visible'));
}

function showError(msg) {
  const el = document.getElementById('alertError');
  el.textContent = msg;
  el.classList.add('visible');
}

function hideError() {
  document.getElementById('alertError').classList.remove('visible');
}

// ─── Summary ───
function buildSummary() {
  const data = getFormData();
  const progText = document.getElementById('programa').selectedOptions[0]?.textContent || '-';
  const perText = document.getElementById('periodo').selectedOptions[0]?.textContent || '-';
  const sedeText = document.getElementById('sede').selectedOptions[0]?.textContent || '-';

  const rows = [
    ['Nombres', data.personal.Nombres],
    ['Apellidos', data.personal.Apellidos],
    ['Correo', data.personal.Correo_electronico],
    ['Teléfono', data.personal.Telefono],
    ['Documento', `${data.personal.Tipo_documento} ${data.personal.Numero_documento}`],
    ['Nacionalidad', data.personal.Nacionalidad],
    ['Programa', progText],
    ['Período', perText],
    ['Sede', sedeText],
  ];

  if (asesor) rows.push(['Asesor', asesor]);
  if (trackingRef) rows.push(['Referencia', trackingRef]);

  const table = document.getElementById('summaryTable');
  table.innerHTML = rows
    .map(([label, value]) => `<tr><td>${label}</td><td>${value || '-'}</td></tr>`)
    .join('');
}

// ─── Collect Form Data ───
function getFormData() {
  return {
    ref: trackingRef || undefined,
    asesor: asesor || undefined,
    personal: {
      Nombres: document.getElementById('nombres').value.trim(),
      Apellidos: document.getElementById('apellidos').value.trim(),
      Correo_electronico: document.getElementById('email').value.trim(),
      Telefono: document.getElementById('telefono').value.trim(),
      Tipo_documento: document.getElementById('tipoDocumento').value,
      Numero_documento: document.getElementById('numDocumento').value.trim(),
      Nacionalidad: document.getElementById('nacionalidad').value,
    },
    program: {
      Codigo_programa: document.getElementById('programa').value,
      Codigo_periodo: document.getElementById('periodo').value,
      Codigo_sede: document.getElementById('sede').value || undefined,
    },
    payment: {
      Concepto_pago: 'Matrícula',
      Valor: 0, // Will be determined by Q10 backend
    },
  };
}

// ─── Submit ───
async function submitEnrollment() {
  hideError();

  const btn = document.getElementById('btnSubmit');
  btn.disabled = true;
  btn.innerHTML = '<span class="spinner"></span> Procesando...';

  const overlay = document.getElementById('loadingOverlay');
  overlay.classList.add('visible');

  const steps = [
    'Creando tu perfil de contacto...',
    'Registrando datos de estudiante...',
    'Inscribiendo en el programa...',
    'Generando matrícula...',
    'Creando orden de pago...',
  ];

  let stepIdx = 0;
  const stepInterval = setInterval(() => {
    stepIdx++;
    if (stepIdx < steps.length) {
      document.getElementById('loadingStep').textContent = steps[stepIdx];
    }
  }, 2000);

  try {
    const data = getFormData();
    const resp = await fetch(`${API_BASE}/enrollment`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    });

    const result = await resp.json();

    clearInterval(stepInterval);
    overlay.classList.remove('visible');

    if (!resp.ok || !result.success) {
      throw new Error(result.error || 'Error procesando la matrícula');
    }

    enrollmentResult = result;
    showPaymentStep(result);
    showStep(5, 'forward');

    // Update tracking
    reportTrackingStatus('filled');

  } catch (err) {
    clearInterval(stepInterval);
    overlay.classList.remove('visible');

    btn.disabled = false;
    btn.innerHTML = '✓ Confirmar Matrícula';

    showError(`Error: ${err.message}. Por favor intenta de nuevo.`);
  }
}

// ─── Payment Step ───
function showPaymentStep(result) {
  const box = document.getElementById('paymentBox');
  const pd = result.paymentDetails || {};

  box.innerHTML = `
    <div class="payment-box__icon">🎓</div>
    <div class="payment-box__title">¡Matrícula Exitosa!</div>
    <p style="color:#065F46; margin-bottom:1.5rem;">
      Tu inscripción ha sido procesada correctamente.
    </p>

    ${pd.amount > 0 ? `
      <div class="payment-box__amount">$${Number(pd.amount).toLocaleString('es')}</div>
      <div class="payment-box__detail">${pd.concept || 'Matrícula'}</div>
    ` : ''}

    <div class="payment-info">
      <div class="payment-info__row">
        <span class="payment-info__label">Referencia</span>
        <span class="payment-info__value">${result.ref || '-'}</span>
      </div>
      <div class="payment-info__row">
        <span class="payment-info__label">Orden de Pago</span>
        <span class="payment-info__value">${pd.orderId || '-'}</span>
      </div>
      ${pd.dueDate ? `
        <div class="payment-info__row">
          <span class="payment-info__label">Fecha de Vencimiento</span>
          <span class="payment-info__value">${pd.dueDate}</span>
        </div>
      ` : ''}
      <div class="payment-info__row">
        <span class="payment-info__label">Estudiante</span>
        <span class="payment-info__value">${document.getElementById('nombres').value} ${document.getElementById('apellidos').value}</span>
      </div>
      <div class="payment-info__row">
        <span class="payment-info__label">Correo</span>
        <span class="payment-info__value">${document.getElementById('email').value}</span>
      </div>
    </div>

    <div style="margin-top:2rem;">
      <p style="font-size:0.85rem; color:#6B7280;">
        Recibirás un correo electrónico con los detalles de tu matrícula y los datos de pago.
      </p>
    </div>
  `;
}
