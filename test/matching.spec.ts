import {
  normalizePhone,
  phoneMatches,
  nameMatches,
} from '../src/q10/matching';

describe('normalizePhone', () => {
  it('strips non-digits from a Guatemalan-formatted number', () => {
    expect(normalizePhone('+502 5555-1234')).toBe('50255551234');
  });

  it('drops leading zero on local-format short numbers', () => {
    expect(normalizePhone('0445551234')).toBe('445551234');
  });

  it('returns empty string for empty input', () => {
    expect(normalizePhone('')).toBe('');
  });

  it('returns empty string for null / undefined', () => {
    expect(normalizePhone(null)).toBe('');
    expect(normalizePhone(undefined)).toBe('');
  });

  it('coerces non-string input (numbers, objects) instead of throwing', () => {
    // Q10 occasionally serializes phone fields as numbers — must not throw.
    expect(normalizePhone(50255551234 as unknown)).toBe('50255551234');
    // `0` gets stripped by the leading-zero rule (canonical empty), but the
    // important part is the call doesn't throw "replace is not a function".
    expect(() => normalizePhone(0 as unknown)).not.toThrow();
    // Objects coerce via their default String() representation — digits only.
    expect(normalizePhone({} as unknown)).toBe('');
  });

  it('keeps leading zero on numbers longer than 11 digits (likely intl)', () => {
    // 12-digit string starting with 0 should not have the 0 stripped,
    // to avoid mangling something that isn't really local format.
    expect(normalizePhone('012345678901')).toBe('012345678901');
  });
});

describe('phoneMatches', () => {
  it('returns true for exact match after normalization', () => {
    expect(phoneMatches('+502 5555-1234', '50255551234')).toBe(true);
  });

  it('matches when one number is prefixed with a country code', () => {
    expect(phoneMatches('+502 5555 1234', '55551234')).toBe(true);
    expect(phoneMatches('55551234', '+502 5555 1234')).toBe(true);
  });

  it('matches on last-8-digits fallback when prefixes differ', () => {
    // Different country+area code, but the last 8 digits line up — this
    // handles the "+1 305 5555-1234" vs "+502 5555-1234" ambiguity.
    expect(phoneMatches('13055551234', '50255551234')).toBe(true);
  });

  it('returns false for empty or null input on either side', () => {
    expect(phoneMatches('', '50255551234')).toBe(false);
    expect(phoneMatches('50255551234', '')).toBe(false);
    expect(phoneMatches(null, '50255551234')).toBe(false);
    expect(phoneMatches('50255551234', null)).toBe(false);
    expect(phoneMatches(undefined, undefined)).toBe(false);
  });

  it('returns false when numbers are clearly different', () => {
    expect(phoneMatches('50255551234', '50299998888')).toBe(false);
  });

  it('returns false when both normalized numbers are < 8 digits and differ', () => {
    // Too short to trigger the last-8 fallback, and no endsWith relationship.
    expect(phoneMatches('1234567', '7654321')).toBe(false);
  });
});

describe('nameMatches', () => {
  it('is accent-insensitive (María matches maria)', () => {
    expect(nameMatches({ Nombres: 'María' }, 'maria')).toBe(true);
  });

  it('matches partial words (Mari matches María López)', () => {
    expect(
      nameMatches(
        { Nombres: 'María Fernanda', Apellidos: 'López' },
        'Mari',
      ),
    ).toBe(true);
  });

  it('is word-order-independent (Lopez Maria matches Maria Lopez)', () => {
    expect(
      nameMatches(
        { Nombres: 'María', Apellidos: 'López' },
        'Lopez Maria',
      ),
    ).toBe(true);
  });

  it('returns false when search is empty', () => {
    expect(nameMatches({ Nombres: 'María' }, '')).toBe(false);
  });

  it('assembles the full name from Primer_nombre + Primer_apellido', () => {
    expect(
      nameMatches(
        {
          Primer_nombre: 'Carlos',
          Segundo_nombre: 'Alberto',
          Primer_apellido: 'García',
          Segundo_apellido: 'Morales',
        },
        'Carlos Garcia',
      ),
    ).toBe(true);
  });

  it('returns false when the record has no name fields at all', () => {
    expect(nameMatches({}, 'Maria')).toBe(false);
  });

  it('returns false when search words are absent from the record name', () => {
    expect(
      nameMatches(
        { Nombres: 'María', Apellidos: 'López' },
        'Roberto Estrada',
      ),
    ).toBe(false);
  });

  it('matches Nombre_completo field', () => {
    expect(
      nameMatches(
        { Nombre_completo: 'Ana Lucía Hernández Paz' },
        'ana hernandez',
      ),
    ).toBe(true);
  });

  it('matches when full name is wholly contained in the search', () => {
    // fullName.includes(search) branch — record name is shorter than search.
    expect(nameMatches({ Nombre: 'María' }, 'María del Carmen')).toBe(true);
  });
});
