/* Genius Dashboard — pure frontend helpers
 *
 * Browser-side counterpart to src/q10/dashboard/helpers.ts. The backend file
 * is TypeScript compiled for Node and can't be imported by the browser, so
 * pure presentational helpers that deserve to be reused across scripts live
 * here. Kept framework-free (no Chart.js / no DOM), just functions that
 * transform data for display.
 *
 * Loaded via <script src="/dashboard/helpers.js"></script> BEFORE
 * dashboard.js, so these are available on the global scope for the main
 * module to consume.
 */

/**
 * Reorder a CEFR distribution respecting `levelsOrder` (A1 → C2).
 * Any key not in the canonical order gets appended at the end so nothing
 * disappears if Q10 introduces a new level we haven't seen before.
 *
 * @param {Record<string, number>} raw - e.g. { B1: 10, A1: 5, A2: 8 }
 * @param {string[]} order - canonical CEFR order from the backend
 * @returns {Record<string, number>}
 */
function orderedCefr(raw, order) {
  const out = {};
  for (const lv of order) if (raw[lv] != null) out[lv] = raw[lv];
  for (const k of Object.keys(raw)) if (!(k in out)) out[k] = raw[k];
  return out;
}
