import { generateToken } from '../src/survey/token-generator';

describe('generateToken', () => {
  it('produces 12-char tokens by default', () => {
    expect(generateToken()).toHaveLength(12);
  });

  it('respects a custom length', () => {
    expect(generateToken(8)).toHaveLength(8);
    expect(generateToken(20)).toHaveLength(20);
  });

  it('only emits letters and digits from the safe alphabet', () => {
    // Excludes 0, 1, l, i, o, vowels — verifies our easy-to-type contract.
    const safe = /^[23456789bcdfghjkmnpqrstvwxyz]+$/;
    for (let i = 0; i < 50; i++) {
      expect(generateToken()).toMatch(safe);
    }
  });

  it('generates unique tokens with negligible collision rate', () => {
    const tokens = new Set<string>();
    for (let i = 0; i < 5000; i++) tokens.add(generateToken());
    // 28^12 ≈ 2.3e17 — collisions in 5k draws are vanishingly unlikely.
    expect(tokens.size).toBe(5000);
  });
});
