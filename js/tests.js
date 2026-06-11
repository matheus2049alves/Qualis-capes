/**
 * Suíte de Testes Unitários para o Motor de Classificação CAPES
 */

import { classifyJournal } from './engine.js';

/**
 * Executa todos os testes unitários e retorna os resultados.
 * @returns {Object[]} Resultados dos testes [{ name, passed, expected, actual, justification }]
 */
export function runTests() {
  const tests = [
    // === CENÁRIO A: ENFERMAGEM ===
    {
      name: 'Enfermagem: A1 por JCR >= 1.8',
      journal: { area: 'Enfermagem', jcr: 1.8, citeScore: null, indexers: [] },
      expected: 'A1'
    },
    {
      name: 'Enfermagem: A1 por CiteScore >= 2.9',
      journal: { area: 'Enfermagem', jcr: null, citeScore: 2.9, indexers: [] },
      expected: 'A1'
    },
    {
      name: 'Enfermagem: A2 por JCR entre 1.1 e 1.7',
      journal: { area: 'Enfermagem', jcr: 1.5, citeScore: null, indexers: [] },
      expected: 'A2'
    },
    {
      name: 'Enfermagem: A2 por CiteScore entre 1.8 e 2.8',
      journal: { area: 'Enfermagem', jcr: null, citeScore: 2.2, indexers: [] },
      expected: 'A2'
    },
    {
      name: 'Enfermagem: A3 por JCR entre 0.6 e 1.0',
      journal: { area: 'Enfermagem', jcr: 0.8, citeScore: null, indexers: [] },
      expected: 'A3'
    },
    {
      name: 'Enfermagem: A3 por CiteScore entre 0.7 e 1.7',
      journal: { area: 'Enfermagem', jcr: null, citeScore: 1.2, indexers: [] },
      expected: 'A3'
    },
    {
      name: 'Enfermagem: A3 por indexação MEDLINE',
      journal: { area: 'Enfermagem', jcr: null, citeScore: null, indexers: ['MEDLINE'] },
      expected: 'A3'
    },
    {
      name: 'Enfermagem: A4 por JCR entre 0.1 e 0.5',
      journal: { area: 'Enfermagem', jcr: 0.3, citeScore: null, indexers: [] },
      expected: 'A4'
    },
    {
      name: 'Enfermagem: A4 por CiteScore entre 0.1 e 0.6',
      journal: { area: 'Enfermagem', jcr: null, citeScore: 0.4, indexers: [] },
      expected: 'A4'
    },
    {
      name: 'Enfermagem: A4 por indexação SCIELO',
      journal: { area: 'Enfermagem', jcr: null, citeScore: null, indexers: ['SCIELO'] },
      expected: 'A4'
    },
    {
      name: 'Enfermagem: A4 por indexação RevEnf',
      journal: { area: 'Enfermagem', jcr: null, citeScore: null, indexers: ['RevEnf'] },
      expected: 'A4'
    },
    {
      name: 'Enfermagem: A5 por indexação LILACS',
      journal: { area: 'Enfermagem', jcr: null, citeScore: null, indexers: ['LILACS'] },
      expected: 'A5'
    },
    {
      name: 'Enfermagem: A5 por indexação BDENF',
      journal: { area: 'Enfermagem', jcr: null, citeScore: null, indexers: ['BDENF'] },
      expected: 'A5'
    },
    {
      name: 'Enfermagem: A6 por RIC/CUIDEN >= 1.5',
      journal: { area: 'Enfermagem', jcr: null, citeScore: null, indexers: ['RIC/CUIDEN'], metrics: { cuiden: 1.5 } },
      expected: 'A6'
    },
    {
      name: 'Enfermagem: A6 não se aplica se RIC/CUIDEN < 1.5',
      journal: { area: 'Enfermagem', jcr: null, citeScore: null, indexers: ['RIC/CUIDEN'], metrics: { cuiden: 1.4 } },
      expected: 'A7' // cai para o próximo estrato que é A7 (0.1 a 1.4)
    },
    {
      name: 'Enfermagem: A7 por CINAHL',
      journal: { area: 'Enfermagem', jcr: null, citeScore: null, indexers: ['CINAHL'] },
      expected: 'A7'
    },
    {
      name: 'Enfermagem: A7 por RIC/CUIDEN entre 0.1 e 1.4',
      journal: { area: 'Enfermagem', jcr: null, citeScore: null, indexers: ['RIC/CUIDEN'], metrics: { cuiden: 0.8 } },
      expected: 'A7'
    },
    {
      name: 'Enfermagem: A8 por Latindex',
      journal: { area: 'Enfermagem', jcr: null, citeScore: null, indexers: ['Latindex'] },
      expected: 'A8'
    },
    {
      name: 'Enfermagem: NC quando sem indexadores/métricas',
      journal: { area: 'Enfermagem', jcr: null, citeScore: null, indexers: [] },
      expected: 'NC'
    },
    {
      name: 'Enfermagem: Regra do melhor caso (JCR A4 + MEDLINE A3)',
      journal: { area: 'Enfermagem', jcr: 0.2, citeScore: null, indexers: ['MEDLINE'] },
      expected: 'A3' // O melhor estrato é A3 por MEDLINE, embora JCR 0.2 dê A4
    },
    {
      name: 'Enfermagem: Regra do melhor caso (JCR A1 + Latindex A8)',
      journal: { area: 'Enfermagem', jcr: 2.1, citeScore: null, indexers: ['Latindex'] },
      expected: 'A1' // O melhor estrato é A1 por JCR, embora Latindex dê A8
    },

    // === CENÁRIO B: OUTRAS ÁREAS ===
    {
      name: 'Outras Áreas: A1 por JCR >= 5.0',
      journal: { area: 'Outras Áreas', jcr: 5.2, citeScore: null, indexers: [] },
      expected: 'A1'
    },
    {
      name: 'Outras Áreas: A1 por CiteScore >= 5.0',
      journal: { area: 'Outras Áreas', jcr: null, citeScore: 5.0, indexers: [] },
      expected: 'A1'
    },
    {
      name: 'Outras Áreas: A2 por JCR entre 4.0 e 4.9',
      journal: { area: 'Outras Áreas', jcr: 4.5, citeScore: null, indexers: [] },
      expected: 'A2'
    },
    {
      name: 'Outras Áreas: A2 por CiteScore entre 4.0 e 4.9',
      journal: { area: 'Outras Áreas', jcr: null, citeScore: 4.1, indexers: [] },
      expected: 'A2'
    },
    {
      name: 'Outras Áreas: A3 por JCR entre 3.0 e 3.9',
      journal: { area: 'Outras Áreas', jcr: 3.2, citeScore: null, indexers: [] },
      expected: 'A3'
    },
    {
      name: 'Outras Áreas: A3 por CiteScore entre 3.0 e 3.9',
      journal: { area: 'Outras Áreas', jcr: null, citeScore: 3.9, indexers: [] },
      expected: 'A3'
    },
    {
      name: 'Outras Áreas: A4 por JCR entre 2.0 e 2.9',
      journal: { area: 'Outras Áreas', jcr: 2.0, citeScore: null, indexers: [] },
      expected: 'A4'
    },
    {
      name: 'Outras Áreas: A4 por CiteScore entre 2.0 e 2.9',
      journal: { area: 'Outras Áreas', jcr: null, citeScore: 2.7, indexers: [] },
      expected: 'A4'
    },
    {
      name: 'Outras Áreas: A5 por JCR entre 1.0 e 1.9',
      journal: { area: 'Outras Áreas', jcr: 1.1, citeScore: null, indexers: [] },
      expected: 'A5'
    },
    {
      name: 'Outras Áreas: A5 por CiteScore entre 0.1 e 1.9',
      journal: { area: 'Outras Áreas', jcr: null, citeScore: 0.1, indexers: [] },
      expected: 'A5'
    },
    {
      name: 'Outras Áreas: A5 por indexação MEDLINE',
      journal: { area: 'Outras Áreas', jcr: null, citeScore: null, indexers: ['MEDLINE'] },
      expected: 'A5'
    },
    {
      name: 'Outras Áreas: A6 por JCR entre 0.1 e 0.9',
      journal: { area: 'Outras Áreas', jcr: 0.5, citeScore: null, indexers: [] },
      expected: 'A6'
    },
    {
      name: 'Outras Áreas: A6 por indexação SCIELO',
      journal: { area: 'Outras Áreas', jcr: null, citeScore: null, indexers: ['SCIELO'] },
      expected: 'A6'
    },
    {
      name: 'Outras Áreas: A7 por indexação LILACS',
      journal: { area: 'Outras Áreas', jcr: null, citeScore: null, indexers: ['LILACS'] },
      expected: 'A7'
    },
    {
      name: 'Outras Áreas: A8 por indexação Latindex',
      journal: { area: 'Outras Áreas', jcr: null, citeScore: null, indexers: ['Latindex'] },
      expected: 'A8'
    },
    {
      name: 'Outras Áreas: NC quando sem indexadores/métricas',
      journal: { area: 'Outras Áreas', jcr: null, citeScore: null, indexers: [] },
      expected: 'NC'
    },
    {
      name: 'Outras Áreas: Regra do melhor caso (JCR A6 + MEDLINE A5)',
      journal: { area: 'Outras Áreas', jcr: 0.5, citeScore: null, indexers: ['MEDLINE'] },
      expected: 'A5' // O melhor estrato é A5 por MEDLINE, embora JCR 0.5 dê A6
    }
  ];

  return tests.map(test => {
    try {
      const result = classifyJournal(test.journal);
      const passed = result.estrato === test.expected;
      return {
        name: test.name,
        passed: passed,
        expected: test.expected,
        actual: result.estrato,
        justification: result.justification
      };
    } catch (error) {
      return {
        name: test.name,
        passed: false,
        expected: test.expected,
        actual: 'ERROR',
        justification: error.message
      };
    }
  });
}
