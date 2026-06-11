/**
 * Motor de Decisão para Classificação Qualis CAPES
 * Aplica as regras de negócio em cascata (de A1 a A8 e NC)
 */

/**
 * Classifica um periódico com base em suas métricas e indexadores.
 * @param {Object} journal Objeto contendo dados do periódico
 * @param {string} journal.title Título do periódico
 * @param {string} journal.area Área do periódico ('Enfermagem' ou 'Outras Áreas')
 * @param {number|null} journal.jcr Índice JCR (impacto)
 * @param {number|null} journal.citeScore Índice CiteScore
 * @param {string[]} journal.indexers Lista de indexadores (ex: ['MEDLINE', 'SCIELO'])
 * @param {Object} [journal.metrics] Métricas específicas adicionais
 * @param {number|null} [journal.metrics.cuiden] Índice CUIDEN
 * @returns {Object} Resultado da classificação { estrato: string, justification: string }
 */
export function classifyJournal(journal) {
  if (!journal) {
    return { estrato: 'NC', justification: 'Periódico não cadastrado na base de referência.' };
  }

  const area = journal.area || 'Outras Áreas';
  const jcr = typeof journal.jcr === 'number' ? journal.jcr : null;
  const citeScore = typeof journal.citeScore === 'number' ? journal.citeScore : null;
  const indexers = Array.isArray(journal.indexers) 
    ? journal.indexers.map(idx => idx.trim().toUpperCase()) 
    : [];
  const cuiden = (journal.metrics && typeof journal.metrics.cuiden === 'number') 
    ? journal.metrics.cuiden 
    : null;

  // Função auxiliar para verificar presença de indexadores
  const hasIndexer = (name) => indexers.includes(name.toUpperCase());

  if (area === 'Enfermagem') {
    // --- CENÁRIO A: ENFERMAGEM ---
    
    // A1: JCR >= 1.8 OU CiteScore >= 2.9
    if (jcr !== null && jcr >= 1.8) {
      return { estrato: 'A1', justification: `JCR = ${jcr.toFixed(2)} (>= 1.8)` };
    }
    if (citeScore !== null && citeScore >= 2.9) {
      return { estrato: 'A1', justification: `CiteScore = ${citeScore.toFixed(2)} (>= 2.9)` };
    }

    // A2: JCR entre 1.1 e 1.7 OU CiteScore entre 1.8 e 2.8
    if (jcr !== null && jcr >= 1.1 && jcr <= 1.7) {
      return { estrato: 'A2', justification: `JCR = ${jcr.toFixed(2)} (entre 1.1 e 1.7)` };
    }
    if (citeScore !== null && citeScore >= 1.8 && citeScore <= 2.8) {
      return { estrato: 'A2', justification: `CiteScore = ${citeScore.toFixed(2)} (entre 1.8 e 2.8)` };
    }

    // A3: JCR entre 0.6 e 1.0 OU CiteScore entre 0.7 e 1.7 OU MEDLINE
    if (jcr !== null && jcr >= 0.6 && jcr <= 1.0) {
      return { estrato: 'A3', justification: `JCR = ${jcr.toFixed(2)} (entre 0.6 e 1.0)` };
    }
    if (citeScore !== null && citeScore >= 0.7 && citeScore <= 1.7) {
      return { estrato: 'A3', justification: `CiteScore = ${citeScore.toFixed(2)} (entre 0.7 e 1.7)` };
    }
    if (hasIndexer('MEDLINE')) {
      return { estrato: 'A3', justification: 'Indexado no MEDLINE' };
    }

    // A4: JCR entre 0.1 e 0.5 OU CiteScore entre 0.1 e 0.6 OU SCIELO OU RevEnf
    if (jcr !== null && jcr >= 0.1 && jcr <= 0.5) {
      return { estrato: 'A4', justification: `JCR = ${jcr.toFixed(2)} (entre 0.1 e 0.5)` };
    }
    if (citeScore !== null && citeScore >= 0.1 && citeScore <= 0.6) {
      return { estrato: 'A4', justification: `CiteScore = ${citeScore.toFixed(2)} (entre 0.1 e 0.6)` };
    }
    if (hasIndexer('SCIELO')) {
      return { estrato: 'A4', justification: 'Indexado no SCIELO' };
    }
    if (hasIndexer('REVENF')) {
      return { estrato: 'A4', justification: 'Indexado no RevEnf' };
    }

    // A5: LILACS OU BDENF
    if (hasIndexer('LILACS')) {
      return { estrato: 'A5', justification: 'Indexado no LILACS' };
    }
    if (hasIndexer('BDENF')) {
      return { estrato: 'A5', justification: 'Indexado no BDENF' };
    }

    // A6: RIC/CUIDEN >= 1.5
    if (hasIndexer('RIC/CUIDEN') || hasIndexer('CUIDEN')) {
      if (cuiden !== null && cuiden >= 1.5) {
        return { estrato: 'A6', justification: `Indexado no RIC/CUIDEN com índice = ${cuiden.toFixed(2)} (>= 1.5)` };
      }
    }

    // A7: CINAHL OU RIC/CUIDEN entre 0.1 e 1.4
    if (hasIndexer('CINAHL')) {
      return { estrato: 'A7', justification: 'Indexado no CINAHL' };
    }
    if (hasIndexer('RIC/CUIDEN') || hasIndexer('CUIDEN')) {
      if (cuiden !== null && cuiden >= 0.1 && cuiden <= 1.4) {
        return { estrato: 'A7', justification: `Indexado no RIC/CUIDEN com índice = ${cuiden.toFixed(2)} (entre 0.1 e 1.4)` };
      }
    }

    // A8: Latindex
    if (hasIndexer('LATINDEX')) {
      return { estrato: 'A8', justification: 'Indexado no Latindex' };
    }

  } else {
    // --- CENÁRIO B: OUTRAS ÁREAS ---

    // A1: JCR >= 5 OU CiteScore >= 5
    if (jcr !== null && jcr >= 5.0) {
      return { estrato: 'A1', justification: `JCR = ${jcr.toFixed(2)} (>= 5.0)` };
    }
    if (citeScore !== null && citeScore >= 5.0) {
      return { estrato: 'A1', justification: `CiteScore = ${citeScore.toFixed(2)} (>= 5.0)` };
    }

    // A2: JCR entre 4.0 e 4.9 OU CiteScore entre 4.0 e 4.9
    if (jcr !== null && jcr >= 4.0 && jcr <= 4.9) {
      return { estrato: 'A2', justification: `JCR = ${jcr.toFixed(2)} (entre 4.0 e 4.9)` };
    }
    if (citeScore !== null && citeScore >= 4.0 && citeScore <= 4.9) {
      return { estrato: 'A2', justification: `CiteScore = ${citeScore.toFixed(2)} (entre 4.0 e 4.9)` };
    }

    // A3: JCR entre 3.0 e 3.9 OU CiteScore entre 3.0 e 3.9
    if (jcr !== null && jcr >= 3.0 && jcr <= 3.9) {
      return { estrato: 'A3', justification: `JCR = ${jcr.toFixed(2)} (entre 3.0 e 3.9)` };
    }
    if (citeScore !== null && citeScore >= 3.0 && citeScore <= 3.9) {
      return { estrato: 'A3', justification: `CiteScore = ${citeScore.toFixed(2)} (entre 3.0 e 3.9)` };
    }

    // A4: JCR entre 2.0 e 2.9 OU CiteScore entre 2.0 e 2.9
    if (jcr !== null && jcr >= 2.0 && jcr <= 2.9) {
      return { estrato: 'A4', justification: `JCR = ${jcr.toFixed(2)} (entre 2.0 e 2.9)` };
    }
    if (citeScore !== null && citeScore >= 2.0 && citeScore <= 2.9) {
      return { estrato: 'A4', justification: `CiteScore = ${citeScore.toFixed(2)} (entre 2.0 e 2.9)` };
    }

    // A5: JCR entre 1.0 e 1.9 OU CiteScore entre 0.1 e 1.9 OU MEDLINE
    if (jcr !== null && jcr >= 1.0 && jcr <= 1.9) {
      return { estrato: 'A5', justification: `JCR = ${jcr.toFixed(2)} (entre 1.0 e 1.9)` };
    }
    if (citeScore !== null && citeScore >= 0.1 && citeScore <= 1.9) {
      return { estrato: 'A5', justification: `CiteScore = ${citeScore.toFixed(2)} (entre 0.1 e 1.9)` };
    }
    if (hasIndexer('MEDLINE')) {
      return { estrato: 'A5', justification: 'Indexado no MEDLINE' };
    }

    // A6: JCR entre 0.1 e 0.9 OU SCIELO
    if (jcr !== null && jcr >= 0.1 && jcr <= 0.9) {
      return { estrato: 'A6', justification: `JCR = ${jcr.toFixed(2)} (entre 0.1 e 0.9)` };
    }
    if (hasIndexer('SCIELO')) {
      return { estrato: 'A6', justification: 'Indexado no SCIELO' };
    }

    // A7: LILACS
    if (hasIndexer('LILACS')) {
      return { estrato: 'A7', justification: 'Indexado no LILACS' };
    }

    // A8: Latindex
    if (hasIndexer('LATINDEX')) {
      return { estrato: 'A8', justification: 'Indexado no Latindex' };
    }
  }

  // Se não atendeu a nenhuma condição anterior
  return { estrato: 'NC', justification: 'Não classificada nas bases de referência CAPES.' };
}
