import {
  INTENCAO_CRITICA,
  NOTA_BAIXA_THRESHOLD,
  RECOMENDACAO_DETRACTORS,
  RECOMENDACAO_PROMOTORS,
} from '../src/survey/survey.constants';

// Pure-data assertions — guards against accidentally widening the alert
// triggers without touching the spec.
describe('survey alert thresholds', () => {
  it('flags only the two critical "intenção" values', () => {
    expect(INTENCAO_CRITICA).toEqual([
      'pensando_pausa',
      'considerando_no_continuar',
    ]);
  });

  it('uses ≤2 as the "nota baixa" threshold', () => {
    expect(NOTA_BAIXA_THRESHOLD).toBe(2);
  });

  it('NPS promoter / detractor sets are disjoint', () => {
    const overlap = RECOMENDACAO_PROMOTORS.filter((v) =>
      (RECOMENDACAO_DETRACTORS as readonly string[]).includes(v),
    );
    expect(overlap).toEqual([]);
  });
});
