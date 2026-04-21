/**
 * Phone + name matching helpers, ported from the Q10 WhatsApp plugin
 * (background/service-worker.js). Used whenever we need to reconcile a
 * WhatsApp contact against Q10's `usuarios`/`contactos`/`oportunidades`
 * records, which store phone numbers and names in inconsistent shapes.
 *
 * Keep behaviour in lock-step with the plugin — downstream searches and
 * opportunity lookups depend on the exact same matching semantics.
 */

// Combining diacritics block U+0300..U+036F — stripped after NFD
// decomposition so "María" becomes "Maria".
const COMBINING_DIACRITICS = /[̀-ͯ]/g;

/**
 * Strips everything but digits and drops a leading "0" for local-format
 * numbers (e.g. Guatemalan mobile dialled inside country as `0 4512 3489`).
 *
 * Real-world case: the same contact may appear as `+502 5555-1234`,
 * `5555 1234`, or `045551234` depending on who typed it — this folds all
 * three into a comparable canonical form.
 */
export function normalizePhone(raw: string | null | undefined): string {
  let digits = (raw || '').replace(/\D/g, '');
  // Remove leading 0 (local format) — only for short-ish numbers to avoid
  // stripping the first digit of a legitimate international number.
  if (digits.startsWith('0') && digits.length <= 11) digits = digits.slice(1);
  return digits;
}

/**
 * Returns true when two phone values belong to the same person.
 *
 * Real-world case: country code and area code vary between how the CRM
 * stored the number and how WhatsApp surfaces it. The last-8-digits
 * fallback handles varying country code + area code formats (e.g.
 * `+50255551234` in Q10 vs `55551234` saved as a local contact).
 */
export function phoneMatches(
  contactPhone: unknown,
  searchPhone: unknown,
): boolean {
  const a = normalizePhone(contactPhone as string | null | undefined);
  const b = normalizePhone(searchPhone as string | null | undefined);
  if (!a || !b) return false;
  // Exact match on canonical digits.
  if (a === b) return true;
  // One contains the other — handles country-code prefix differences.
  if (a.endsWith(b) || b.endsWith(a)) return true;
  // Last 8 digits match handles varying country code + area code formats.
  if (a.length >= 8 && b.length >= 8 && a.slice(-8) === b.slice(-8)) {
    return true;
  }
  return false;
}

/**
 * Returns true when `searchName` matches the person represented by
 * `record`, using accent-insensitive, word-order-independent fuzzy match.
 *
 * Real-world case: the WhatsApp display name is "Maria Lopez" but Q10
 * stores it as `Primer_nombre="María"` + `Primer_apellido="López"` (or
 * `Nombres` + `Apellidos`, depending on the endpoint). Accent-insensitive
 * (NFD + strip U+0300..U+036F) and word-order-independent matching lets
 * us pair them up regardless of how the record is shaped.
 */
export function nameMatches(
  record: Record<string, unknown>,
  searchName: string,
): boolean {
  if (!searchName) return false;
  const search = searchName
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '');

  // Build full name from record fields — different Q10 endpoints expose
  // name components under different keys, so we union them all.
  const parts = [
    record.Nombres,
    record.Apellidos,
    record.Primer_nombre,
    record.Segundo_nombre,
    record.Primer_apellido,
    record.Segundo_apellido,
    record.Nombre,
    record.nombre,
    record.Nombre_completo,
  ].filter(Boolean) as string[];

  const fullName = parts
    .join(' ')
    .toLowerCase()
    .normalize('NFD')
    .replace(COMBINING_DIACRITICS, '');

  if (!fullName) return false;

  // Exact match.
  if (fullName === search) return true;

  // Full name contains search or search contains full name.
  if (fullName.includes(search) || search.includes(fullName)) return true;

  // Match by parts: all search words must appear somewhere in the full
  // name. Ignores single-char tokens to avoid false positives from
  // initials. Word-order-independent handles "Maria Lopez" vs
  // "Lopez Maria" and partial matches handle "Mari" vs "Maria".
  const searchWords = search.split(/\s+/).filter((w) => w.length > 1);
  const nameWords = fullName.split(/\s+/);
  const allMatch = searchWords.every((sw) =>
    nameWords.some((nw) => nw.includes(sw) || sw.includes(nw)),
  );

  return allMatch && searchWords.length > 0;
}
