/* Informe imprimible de la Encuesta de Satisfacción.
 * Lee los filtros de la URL (?nivel=&profesor=&canal=&from=&to=), pide los
 * agregados a GET /api/surveys/stats (cookie de admin) y arma un informe
 * pensado para imprimir / guardar como PDF desde el navegador. */

(function () {
  'use strict';

  var el = function (id) { return document.getElementById(id); };

  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  document.addEventListener('DOMContentLoaded', load);

  async function load() {
    var params = new URLSearchParams(window.location.search);
    try {
      var resp = await fetch('/api/surveys/stats?' + params.toString(), { credentials: 'include' });
      if (resp.status === 401) {
        el('statusBox').innerHTML =
          'Necesitas iniciar sesión para ver el informe. <a href="/dashboard/">Ir al dashboard</a> y vuelve a generar el informe desde la pestaña Encuesta.';
        return;
      }
      if (!resp.ok) throw new Error('HTTP ' + resp.status);
      render(await resp.json(), params);
    } catch (err) {
      el('statusBox').textContent = 'No pudimos cargar los datos: ' + (err.message || err);
    }
  }

  function render(data, params) {
    el('statusBox').hidden = true;
    el('report').hidden = false;

    /* ── meta ── */
    var filtros = [];
    if (params.get('nivel')) filtros.push('Nivel: ' + params.get('nivel'));
    if (params.get('profesor')) filtros.push('Profesor/a: ' + params.get('profesor'));
    if (params.get('canal')) filtros.push('Canal: ' + params.get('canal'));
    var periodo = params.get('from') && params.get('to')
      ? params.get('from') + ' → ' + params.get('to')
      : 'Todo el histórico';
    el('reportMeta').innerHTML =
      '<span>Generado: <strong>' + esc(new Date().toLocaleString('es')) + '</strong></span>' +
      '<span>Período: <strong>' + esc(periodo) + '</strong></span>' +
      '<span>Filtros: <strong>' + esc(filtros.length ? filtros.join(' · ') : 'ninguno') + '</strong></span>' +
      '<span>Respuestas: <strong>' + esc(data.total) + '</strong></span>';

    /* ── KPIs ── */
    var nps = data.nps || {};
    var npsTxt = nps.score == null ? '—' : (nps.score > 0 ? '+' + nps.score : String(nps.score));
    el('kpis').innerHTML = [
      { l: 'NPS', v: npsTxt, h: (nps.promoters || 0) + ' promotores · ' + (nps.detractors || 0) + ' detractores' },
      { l: 'Satisfacción', v: data.csatAvg != null ? data.csatAvg + ' / 5' : '—', h: 'promedio general' },
      { l: 'Respuestas', v: data.total || 0, h: (data.identified || 0) + ' identificadas' },
      { l: 'Aceptan contacto', v: data.contactOk || 0, h: 'para seguimiento' },
      { l: 'Testimonios', v: data.testimonioOk || 0, h: 'autorizados' },
      { l: 'Posibles duplicados', v: data.possibleDuplicates || 0, h: 'misma red/IP' },
    ].map(function (k) {
      return '<div class="kpi"><div class="l">' + esc(k.l) + '</div><div class="v">' + esc(k.v) + '</div><div class="h">' + esc(k.h) + '</div></div>';
    }).join('');

    /* ── NPS bar ── */
    var total = data.total || 0;
    if (total > 0) {
      var pct = function (n) { return Math.round(((n || 0) / total) * 100); };
      var seg = function (cls, n) {
        return n > 0 ? '<span class="' + cls + '" style="width:' + pct(n) + '%"></span>' : '';
      };
      el('npsBlock').innerHTML =
        '<div class="npsbar">' + seg('det', nps.detractors) + seg('pas', nps.passives) + seg('pro', nps.promoters) + '</div>' +
        '<div class="nps-legend">' +
        '<span><i style="background:#DC2626"></i>Detractores (0–6) <b>' + pct(nps.detractors) + '% · ' + (nps.detractors || 0) + '</b></span>' +
        '<span><i style="background:#6B7280"></i>Pasivos (7–8) <b>' + pct(nps.passives) + '% · ' + (nps.passives || 0) + '</b></span>' +
        '<span><i style="background:#059669"></i>Promotores (9–10) <b>' + pct(nps.promoters) + '% · ' + (nps.promoters || 0) + '</b></span>' +
        '</div>';
    } else {
      el('npsBlock').innerHTML = '<p style="color:#606060">Sin respuestas en el período seleccionado.</p>';
    }

    /* ── promedios (barras sobre 5) ── */
    var avgs = (data.averages || []).filter(function (a) { return a.avg != null; })
      .sort(function (a, b) { return b.avg - a.avg; });
    el('averages').innerHTML = avgs.length
      ? avgs.map(function (a) { return hbar(a.label, a.avg, 5, a.avg.toFixed(1), true); }).join('')
      : '<p style="color:#606060">Sin datos.</p>';

    /* ── distribuciones de selección única ── */
    var dists = data.distributions || {};
    el('distributions').innerHTML = Object.keys(dists).map(function (qid) {
      return distBlock(dists[qid].label, dists[qid].dist, false);
    }).join('');

    /* ── multi-selección ── */
    var multi = data.multi || {};
    el('multi').innerHTML = Object.keys(multi).map(function (qid) {
      return distBlock(multi[qid].label, multi[qid].dist, true);
    }).join('');

    /* ── profesores ── */
    var profs = data.professors || [];
    var rows = profs.map(function (p) {
      return '<tr><td>' + esc(p.profesor || '—') + '</td>' +
        '<td class="num">' + esc(p.count) + '</td>' +
        '<td class="num">' + esc(p.avgClaridad != null ? p.avgClaridad : '—') + '</td>' +
        '<td class="num">' + esc(p.avgPaciencia != null ? p.avgPaciencia : '—') + '</td>' +
        '<td class="num">' + esc(p.nps > 0 ? '+' + p.nps : p.nps) + '</td></tr>';
    });
    if (data.unidentified > 0) {
      rows.push('<tr><td style="color:#606060">Sin identificar</td><td class="num">' + esc(data.unidentified) + '</td><td class="num">—</td><td class="num">—</td><td class="num">—</td></tr>');
    }
    el('professors').innerHTML = rows.length
      ? '<table><thead><tr><th>Profesor/a</th><th class="num">Respuestas</th><th class="num">Prom. claridad</th><th class="num">Prom. paciencia</th><th class="num">NPS</th></tr></thead><tbody>' + rows.join('') + '</tbody></table>'
      : '<p style="color:#606060">Sin respuestas con profesor/a identificado.</p>';

    /* ── semanal ── */
    var weekly = data.weekly || [];
    var maxW = Math.max.apply(null, weekly.map(function (w) { return w.count; }).concat([1]));
    el('weekly').innerHTML = weekly.map(function (w) {
      return hbar('Semana del ' + w.week, w.count, maxW, String(w.count), false);
    }).join('');

    /* ── comentarios ── */
    var comments = data.comments || [];
    el('comments').innerHTML = comments.length
      ? comments.map(function (c) {
          var chips = [
            c.question, c.nivel ? 'Nivel ' + c.nivel : null,
            c.profesor ? 'Prof.: ' + c.profesor : null, c.canal,
            c.createdAt ? new Date(c.createdAt).toLocaleDateString('es') : null,
          ].filter(Boolean).map(function (m) { return '<span class="m">' + esc(m) + '</span>'; });
          if (c.testimonioOk) chips.push('<span class="m testi">★ Testimonio autorizado</span>');
          return '<div class="cmt"><p>"' + esc(c.text) + '"</p><div class="meta">' + chips.join('') + '</div></div>';
        }).join('')
      : '<p style="color:#606060">Sin comentarios en el período.</p>';

    el('reportFoot').textContent =
      'Informe generado desde el dashboard de Genius Idiomas · Encuesta de Satisfacción de Alumnos. ' +
      'Los promedios usan escala 1–5; el NPS va de −100 a +100. "Posibles duplicados" es solo un aviso (misma red/IP).';
  }

  function hbar(label, value, max, valueText, gold) {
    var width = Math.max(2, Math.round((value / max) * 100));
    return '<div class="hb"><span class="lbl">' + esc(label) + '</span>' +
      '<span class="track"><span class="fill' + (gold ? ' fill--gold' : '') + '" style="width:' + width + '%"></span></span>' +
      '<span class="val">' + esc(valueText) + '</span></div>';
  }

  function distBlock(title, dist, sortDesc) {
    var entries = Object.keys(dist).map(function (k) { return [k, dist[k]]; });
    if (sortDesc) entries.sort(function (a, b) { return b[1] - a[1]; });
    var max = Math.max.apply(null, entries.map(function (e) { return e[1]; }).concat([1]));
    var bars = entries.map(function (e) { return hbar(e[0], e[1], max, String(e[1]), false); }).join('');
    return '<div><h3>' + esc(title) + '</h3><div class="hb-list">' + (bars || '<p style="color:#606060">Sin datos.</p>') + '</div></div>';
  }
})();
