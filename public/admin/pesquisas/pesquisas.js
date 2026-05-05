// Genius admin — pesquisas SPA.
// Hash router with three views:
//   #/                                     → list of periods
//   #/period/:id                           → detail (KPIs, WhatsApp, alerts, per-class table)
//   #/period/:id/turma/:turma_codigo       → per-class responses

(() => {
  'use strict';

  const MES_PT = {
    1: 'janeiro', 2: 'fevereiro', 3: 'março', 4: 'abril', 5: 'maio', 6: 'junho',
    7: 'julho', 8: 'agosto', 9: 'setembro', 10: 'outubro', 11: 'novembro', 12: 'dezembro',
  };

  const ALERT_LABELS = {
    intencao_critica: 'Intenção de pausar / não continuar',
    nota_professor_baixa: 'Nota baixa para o professor',
    nota_aulas_baixa: 'Nota baixa para as aulas',
  };

  const app = document.getElementById('app');
  const generateModal = document.getElementById('generateModal');
  const genForm = document.getElementById('generateForm');
  const genError = document.getElementById('genError');
  const genSubmitBtn = document.getElementById('genSubmitBtn');

  // ─── HTTP helpers ───
  async function api(path, opts = {}) {
    const resp = await fetch(path, {
      credentials: 'include',
      headers: { 'Content-Type': 'application/json', ...(opts.headers ?? {}) },
      ...opts,
    });
    if (resp.status === 401) {
      window.location.href = '/dashboard';
      throw new Error('not authenticated');
    }
    const text = await resp.text();
    const body = text ? JSON.parse(text) : null;
    if (!resp.ok) {
      const err = new Error((body && body.message) || resp.statusText);
      err.status = resp.status;
      err.body = body;
      throw err;
    }
    return body;
  }

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  }

  function fmtMonth(mes, ano) {
    return `${MES_PT[mes] ?? mes}/${ano}`;
  }
  function fmtPercent(num, den) {
    if (!den) return '0%';
    return Math.round((num / den) * 100) + '%';
  }
  function fmtDate(iso) {
    if (!iso) return '—';
    const d = new Date(iso);
    return d.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
  }
  function kpiClass(value, kind) {
    if (value == null) return '';
    if (kind === 'nota') {
      if (value >= 4) return 'kpi--good';
      if (value >= 3) return 'kpi--warn';
      return 'kpi--bad';
    }
    if (kind === 'nps') {
      if (value >= 50) return 'kpi--good';
      if (value >= 0) return 'kpi--warn';
      return 'kpi--bad';
    }
    return '';
  }

  // ─── Router ───
  function parseHash() {
    const h = (window.location.hash || '#/').replace(/^#/, '');
    const parts = h.split('/').filter(Boolean);
    if (parts.length === 0) return { view: 'list' };
    if (parts[0] === 'period' && parts.length === 2) return { view: 'detail', id: parts[1] };
    if (parts[0] === 'period' && parts[2] === 'turma' && parts.length === 4) {
      return { view: 'turma', id: parts[1], turma: parts[3] };
    }
    return { view: 'list' };
  }

  async function render() {
    app.innerHTML = '<div class="loading">Carregando…</div>';
    const route = parseHash();
    try {
      if (route.view === 'list') await renderList();
      else if (route.view === 'detail') await renderDetail(route.id);
      else if (route.view === 'turma') await renderTurma(route.id, route.turma);
    } catch (err) {
      app.innerHTML = `<div class="alert alert--error">${escapeHtml(err.message || 'Erro')}</div>`;
    }
  }

  // ─── View: list ───
  async function renderList() {
    const periods = await api('/api/admin/pesquisas');

    if (periods.length === 0) {
      app.innerHTML = `
        <header class="page__header">
          <h1 class="page__title">Pesquisas de satisfação</h1>
          <button class="btn btn--primary" id="newBtn">Gerar pesquisa do mês</button>
        </header>
        <div class="empty">
          <p class="empty__title">Nenhuma pesquisa criada ainda</p>
          <p>Clique em <em>Gerar pesquisa do mês</em> para criar a primeira.</p>
        </div>
      `;
    } else {
      const cards = periods.map((p) => {
        const ratio = p.tokens_total > 0 ? p.tokens_respondidos / p.tokens_total : 0;
        return `
          <a class="card" href="#/period/${encodeURIComponent(p.id)}">
            <span class="card__title">${escapeHtml(MES_PT[p.mes_referencia] ?? p.mes_referencia)} · ${escapeHtml(p.ano_referencia)}</span>
            <div class="card__bar"><div style="width:${(ratio * 100).toFixed(0)}%"></div></div>
            <div class="card__stats">
              <span><strong>${p.tokens_respondidos}</strong> / ${p.tokens_total} respondidas</span>
              <span>${fmtPercent(p.tokens_respondidos, p.tokens_total)}</span>
            </div>
            <div class="card__stats">
              <span>Gerada por ${escapeHtml(p.gerado_por)}</span>
              <span>${fmtDate(p.criado_em).split(',')[0]}</span>
            </div>
          </a>
        `;
      }).join('');

      app.innerHTML = `
        <header class="page__header">
          <h1 class="page__title">Pesquisas de satisfação</h1>
          <button class="btn btn--primary" id="newBtn">Gerar pesquisa do mês</button>
        </header>
        <div class="cards">${cards}</div>
      `;
    }

    document.getElementById('newBtn').addEventListener('click', openGenerateModal);
  }

  // ─── View: detail ───
  async function renderDetail(periodId) {
    const [detail, wa] = await Promise.all([
      api(`/api/admin/pesquisas/${encodeURIComponent(periodId)}`),
      api(`/api/admin/pesquisas/${encodeURIComponent(periodId)}/mensagens-whatsapp`),
    ]);

    const s = detail.summary;

    const kpis = `
      <div class="kpis">
        <div class="kpi">
          <div class="kpi__label">Respondidas</div>
          <div class="kpi__value">${s.respondidas} / ${s.tokens_total}</div>
          <div class="kpi__sub">${s.taxa_resposta}%</div>
        </div>
        <div class="kpi ${kpiClass(s.media_aulas, 'nota')}">
          <div class="kpi__label">Média aulas</div>
          <div class="kpi__value">${s.media_aulas ?? '—'}</div>
          <div class="kpi__sub">de 5</div>
        </div>
        <div class="kpi ${kpiClass(s.media_professor, 'nota')}">
          <div class="kpi__label">Média professor</div>
          <div class="kpi__value">${s.media_professor ?? '—'}</div>
          <div class="kpi__sub">de 5</div>
        </div>
        <div class="kpi ${kpiClass(s.media_geral, 'nota')}">
          <div class="kpi__label">Média geral</div>
          <div class="kpi__value">${s.media_geral ?? '—'}</div>
          <div class="kpi__sub">de 5</div>
        </div>
        <div class="kpi ${kpiClass(s.nps, 'nps')}">
          <div class="kpi__label">NPS</div>
          <div class="kpi__value">${s.nps ?? '—'}</div>
          <div class="kpi__sub">−100 a +100</div>
        </div>
      </div>
    `;

    const waBlocks = wa.turmas.map((t) => `
      <div class="wa-block">
        <div class="wa-block__head">
          <span class="wa-block__title">${escapeHtml(t.turma_nome)}${t.professor_nome ? ' · Prof. ' + escapeHtml(t.professor_nome) : ''}</span>
          <span class="wa-block__count">${t.alunos_count} aluno${t.alunos_count === 1 ? '' : 's'}</span>
          <button class="btn btn--ghost btn--small" data-copy="wa-${escapeHtml(t.turma_codigo)}">Copiar</button>
        </div>
        <textarea class="wa-block__msg" id="wa-${escapeHtml(t.turma_codigo)}" rows="${Math.min(8, t.alunos_count + 2)}" readonly>${escapeHtml(t.mensagem)}</textarea>
      </div>
    `).join('');

    const turmasRows = detail.por_turma.map((t) => `
      <tr>
        <td>
          <a class="table-link" href="#/period/${encodeURIComponent(periodId)}/turma/${encodeURIComponent(t.turma_codigo)}">
            ${escapeHtml(t.turma_nome)}
          </a>
          ${t.professor_nome ? `<div style="color:var(--gray-text);font-size:0.8rem">Prof. ${escapeHtml(t.professor_nome)}</div>` : ''}
        </td>
        <td>${t.respondidas} / ${t.alunos_count}</td>
        <td>${fmtPercent(t.respondidas, t.alunos_count)}</td>
        <td>${t.media_aulas ?? '—'}</td>
        <td>${t.media_professor ?? '—'}</td>
        <td>${t.media_geral ?? '—'}</td>
      </tr>
    `).join('');

    const alertsBlock = detail.alertas.length === 0
      ? ''
      : `
        <div class="alerts">
          <div class="alerts__head">Alertas (${detail.alertas.length})</div>
          ${detail.alertas.map((a) => `
            <div class="alert-row">
              <span class="alert-row__tipo">${escapeHtml(ALERT_LABELS[a.tipo] ?? a.tipo)}</span>
              <span style="flex:1">Turma ${escapeHtml(a.turma_codigo)} · ${escapeHtml(a.detalhe)}</span>
              <span style="color:var(--gray-text);font-size:0.8rem">${fmtDate(a.criado_em)}</span>
            </div>
          `).join('')}
        </div>
      `;

    app.innerHTML = `
      <div class="crumb"><a href="#/">Pesquisas</a> / ${escapeHtml(fmtMonth(detail.period.mes_referencia, detail.period.ano_referencia))}</div>
      <header class="page__header">
        <h1 class="page__title" style="text-transform:capitalize">${escapeHtml(fmtMonth(detail.period.mes_referencia, detail.period.ano_referencia))}</h1>
      </header>
      ${kpis}

      <div class="tabs" role="tablist">
        <button class="tab" role="tab" aria-selected="true"  data-tab="whatsapp">Mensagens WhatsApp</button>
        <button class="tab" role="tab" aria-selected="false" data-tab="turmas">Por turma</button>
        ${detail.alertas.length ? '<button class="tab" role="tab" aria-selected="false" data-tab="alertas">Alertas</button>' : ''}
      </div>

      <div class="tab-pane" data-pane="whatsapp">
        ${waBlocks || '<div class="empty">Sem mensagens.</div>'}
      </div>
      <div class="tab-pane hidden" data-pane="turmas">
        <div class="table-wrap"><table>
          <thead><tr>
            <th>Turma</th><th>Respondidas</th><th>%</th>
            <th>Média aulas</th><th>Média professor</th><th>Média geral</th>
          </tr></thead>
          <tbody>${turmasRows}</tbody>
        </table></div>
      </div>
      <div class="tab-pane hidden" data-pane="alertas">${alertsBlock}</div>
    `;

    // Tab switching
    app.querySelectorAll('.tab').forEach((btn) => {
      btn.addEventListener('click', () => {
        app.querySelectorAll('.tab').forEach((b) => b.setAttribute('aria-selected', String(b === btn)));
        const which = btn.dataset.tab;
        app.querySelectorAll('.tab-pane').forEach((p) => p.classList.toggle('hidden', p.dataset.pane !== which));
      });
    });

    // Copy to clipboard
    app.querySelectorAll('[data-copy]').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const ta = document.getElementById(btn.dataset.copy);
        try {
          await navigator.clipboard.writeText(ta.value);
          const old = btn.textContent;
          btn.textContent = 'Copiado!';
          setTimeout(() => { btn.textContent = old; }, 1500);
        } catch {
          ta.select(); document.execCommand('copy');
        }
      });
    });
  }

  // ─── View: turma detail ───
  async function renderTurma(periodId, turmaCodigo) {
    const detail = await api(
      `/api/admin/pesquisas/${encodeURIComponent(periodId)}/turma/${encodeURIComponent(turmaCodigo)}`,
    );

    const responsesHtml = detail.respostas.length === 0
      ? '<div class="empty"><p class="empty__title">Nenhuma resposta ainda</p></div>'
      : detail.respostas.map((r) => {
          const feedbacks = [
            ['Conteúdo', r.feedback_conteudo],
            ['Professor', r.feedback_professor],
            ['Escola', r.feedback_escola],
            ['Situação pessoal', r.situacao_pessoal],
          ].filter(([, v]) => v).map(([label, v]) => `
            <div class="feedback">
              <div class="feedback__label">${label}</div>
              ${escapeHtml(v)}
            </div>
          `).join('');
          return `
            <article class="response-card">
              <header class="response-card__head">
                <strong>Resposta anônima</strong>
                <span class="response-card__date">${fmtDate(r.respondido_em)}</span>
              </header>
              <div class="scores">
                <span class="score">Aulas <strong>${r.nota_aulas}</strong></span>
                <span class="score">Professor <strong>${r.nota_professor}</strong></span>
                <span class="score">Geral <strong>${r.nota_geral}</strong></span>
                <span class="score">Recomendaria: <strong>${escapeHtml(r.recomendacao)}</strong></span>
                <span class="score">Intenção: <strong>${escapeHtml(r.intencao_continuar)}</strong></span>
              </div>
              <div class="scores" style="margin-top:0.4rem">
                <span class="score">Progresso: <strong>${escapeHtml(r.progresso)}</strong></span>
                <span class="score">Ritmo: <strong>${escapeHtml(r.ritmo)}</strong></span>
                <span class="score">Pontualidade: <strong>${escapeHtml(r.pontualidade)}</strong></span>
                <span class="score">Tarefas: <strong>${escapeHtml(r.tarefas)}</strong></span>
                <span class="score">Atendimento: <strong>${escapeHtml(r.atendimento)}</strong></span>
              </div>
              ${feedbacks}
            </article>
          `;
        }).join('');

    app.innerHTML = `
      <div class="crumb">
        <a href="#/">Pesquisas</a> /
        <a href="#/period/${encodeURIComponent(periodId)}">${escapeHtml(fmtMonth(detail.period.mes_referencia, detail.period.ano_referencia))}</a> /
        ${escapeHtml(detail.turma.turma_nome)}
      </div>
      <header class="page__header">
        <h1 class="page__title">${escapeHtml(detail.turma.turma_nome)}</h1>
      </header>
      <div class="kpis">
        ${detail.turma.professor_nome ? `
          <div class="kpi">
            <div class="kpi__label">Professor</div>
            <div class="kpi__value" style="font-size:1.05rem">${escapeHtml(detail.turma.professor_nome)}</div>
          </div>` : ''}
        <div class="kpi">
          <div class="kpi__label">Respondidas</div>
          <div class="kpi__value">${detail.respondidas} / ${detail.alunos_count}</div>
          <div class="kpi__sub">${fmtPercent(detail.respondidas, detail.alunos_count)}</div>
        </div>
      </div>
      ${responsesHtml}
    `;
  }

  // ─── Generate modal ───
  function openGenerateModal() {
    genError.classList.add('hidden');
    genForm.reset();
    const now = new Date();
    genForm.elements.mes.value = now.getMonth() + 1;
    genForm.elements.ano.value = now.getFullYear();
    generateModal.classList.remove('hidden');
  }
  function closeGenerateModal() {
    generateModal.classList.add('hidden');
  }
  generateModal.addEventListener('click', (ev) => {
    if (ev.target.matches('[data-close]')) closeGenerateModal();
  });
  genForm.addEventListener('submit', async (ev) => {
    ev.preventDefault();
    genError.classList.add('hidden');
    genSubmitBtn.disabled = true;

    const data = Object.fromEntries(new FormData(genForm).entries());
    const payload = {
      mes: Number(data.mes),
      ano: Number(data.ano),
      validade_dias: Number(data.validade_dias) || 7,
    };

    try {
      const resp = await api('/api/admin/pesquisas/gerar', {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      closeGenerateModal();
      window.location.hash = `#/period/${resp.period.id}`;
    } catch (err) {
      const msg = (err.body && err.body.message) || err.message || 'Erro';
      genError.textContent = Array.isArray(msg) ? msg.join(' · ') : msg;
      genError.classList.remove('hidden');
    } finally {
      genSubmitBtn.disabled = false;
    }
  });

  // ─── Logout ───
  document.getElementById('logoutBtn').addEventListener('click', async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    } finally {
      window.location.href = '/dashboard';
    }
  });

  // ─── Boot ───
  window.addEventListener('hashchange', render);
  render();
})();
