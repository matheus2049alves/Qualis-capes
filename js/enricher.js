/**
 * Módulo de Busca e Enriquecimento de Dados
 * Carrega a base de dados de periódicos e realiza buscas inteligentes por ISSN.
 */

import { classifyJournal } from './engine.js';

let journalsDatabase = null;

/**
 * Normaliza um ISSN para o formato padrão "XXXX-XXXX".
 * Aceita formatos como "1234-5678", "12345678", "1234 5678" ou "ISSN 1234-5678".
 * @param {string} issn ISSN de entrada
 * @returns {string} ISSN normalizado ou string vazia se inválido
 */
export function normalizeISSN(issn) {
  if (typeof issn !== 'string') return '';
  // Filtra apenas números e a letra X (dígito verificador de ISSN)
  const cleaned = issn.replace(/[^0-9Xx]/g, '').toUpperCase();
  if (cleaned.length === 8) {
    return `${cleaned.substring(0, 4)}-${cleaned.substring(4)}`;
  }
  // ISSN inválido: retorna vazio para evitar chaves malformadas
  return '';
}

/**
 * Carrega a base de dados de periódicos a partir do arquivo JSON.
 * @returns {Promise<Object>} A base de dados carregada
 */
export async function loadDatabase() {
  if (journalsDatabase !== null) {
    return journalsDatabase;
  }

  try {
    const response = await fetch('data/journals.json');
    if (!response.ok) {
      throw new Error(`Erro ao carregar banco de dados local: ${response.statusText}`);
    }
    const data = await response.json();
    
    // Normalizar as chaves do banco carregado para garantir busca perfeita
    journalsDatabase = {};
    for (const rawIssn in data) {
      const norm = normalizeISSN(rawIssn);
      if (norm) {
        journalsDatabase[norm] = data[rawIssn];
      }
    }
    return journalsDatabase;
  } catch (error) {
    console.error('Falha ao inicializar banco de dados de periódicos:', error);
    // Retorna banco vazio em caso de erro para não travar a aplicação
    journalsDatabase = {};
    return journalsDatabase;
  }
}

/**
 * Permite que a base de dados seja definida dinamicamente (útil para testes ou dados customizados)
 * @param {Object} data Objeto contendo os dados das revistas
 */
export function setDatabase(data) {
  journalsDatabase = {};
  for (const rawIssn in data) {
    const norm = normalizeISSN(rawIssn);
    if (norm) {
      journalsDatabase[norm] = data[rawIssn];
    }
  }
}

/**
 * Busca o CiteScore de um ISSN via API Elsevier (proxy local).
 * Retorna null se a API falhar ou não encontrar.
 * @param {string} issn ISSN normalizado (XXXX-XXXX)
 * @returns {Promise<number|null>} CiteScore ou null
 */
async function fetchCiteScoreFromAPI(issn) {
  try {
    const response = await fetch(`/api/citescore/${issn}`);
    if (!response.ok) return null;
    
    const data = await response.json();
    return data.citeScore ?? null;
  } catch (error) {
    // API indisponível — segue sem CiteScore
    console.warn(`[CiteScore API] Falha para ${issn}:`, error.message);
    return null;
  }
}

/**
 * Busca indexações no SciELO e RevEnf via API SciELO (proxy local).
 * @param {string} issn ISSN normalizado (XXXX-XXXX)
 * @returns {Promise<{scielo: boolean, revenf: boolean, title: string|null, updated_at: string|null}>}
 */
async function fetchSciELOFromAPI(issn) {
  try {
    const response = await fetch(`/api/scielo/${issn}`);
    if (!response.ok) return { scielo: false, revenf: false, title: null, updated_at: null };
    
    return await response.json();
  } catch (error) {
    console.warn(`[SciELO API] Falha para ${issn}:`, error.message);
    return { scielo: false, revenf: false, title: null, updated_at: null };
  }
}

/**
 * Busca indexações no LILACS e BDENF via API LILACS (proxy local).
 * @param {string} issn ISSN normalizado (XXXX-XXXX)
 * @returns {Promise<{lilacs: boolean, bdenf: boolean, title: string|null, updated_at: string|null}>}
 */
async function fetchLILACSFromAPI(issn) {
  try {
    const response = await fetch(`/api/lilacs/${issn}`);
    if (!response.ok) return { lilacs: false, bdenf: false, title: null, updated_at: null };
    
    return await response.json();
  } catch (error) {
    console.warn(`[LILACS/BDENF API] Falha para ${issn}:`, error.message);
    return { lilacs: false, bdenf: false, title: null, updated_at: null };
  }
}

/**
 * Busca indexações no Latindex via portal Latindex (proxy local).
 * @param {string} issn ISSN normalizado (XXXX-XXXX)
 * @returns {Promise<{latindex: boolean, title: string|null, updated_at: string|null}>}
 */
async function fetchLatindexFromAPI(issn) {
  try {
    const response = await fetch(`/api/latindex/${issn}`);
    if (!response.ok) return { latindex: false, title: null, updated_at: null };
    
    return await response.json();
  } catch (error) {
    console.warn(`[Latindex API] Falha para ${issn}:`, error.message);
    return { latindex: false, title: null, updated_at: null };
  }
}

/**
 * Consulta os dados de um periódico pelo ISSN e aplica a classificação.
 * Se o CiteScore não existe no banco local, busca da API Elsevier sob demanda.
 * Também consulta as APIs SciELO, LILACS e Latindex se as indexações locais estiverem ausentes.
 * @param {string} rawIssn ISSN digitado ou importado
 * @returns {Promise<Object>} Dados consolidados da revista e classificação
 */
export async function enrichAndClassify(rawIssn) {
  const db = await loadDatabase();
  const normalized = normalizeISSN(rawIssn);
  
  let dbRecord = db[normalized];
  
  if (!dbRecord) {
    // Tenta buscar no SciELO, LILACS ou Latindex antes de dar como Não Classificado
    if (normalized) {
      const [scieloData, lilacsData, latindexData] = await Promise.all([
        fetchSciELOFromAPI(normalized),
        fetchLILACSFromAPI(normalized),
        fetchLatindexFromAPI(normalized)
      ]);

      if (scieloData.scielo || lilacsData.lilacs || lilacsData.bdenf || latindexData.latindex) {
        dbRecord = {
          title: scieloData.title || lilacsData.title || latindexData.title || 'Periódico da Rede BVS/SciELO/Latindex',
          area: (scieloData.revenf || lilacsData.bdenf) ? 'Enfermagem' : 'Outras Áreas',
          jcr: null,
          citeScore: null,
          indexers: [],
          metrics: { cuiden: null }
        };
        
        if (scieloData.scielo) {
          dbRecord.indexers.push('SCIELO');
          dbRecord.scieloUpdatedAt = scieloData.updated_at;
          if (scieloData.revenf) {
            dbRecord.indexers.push('RevEnf');
          }
        }
        if (lilacsData.lilacs) {
          dbRecord.indexers.push('LILACS');
          dbRecord.lilacsUpdatedAt = lilacsData.updated_at;
        }
        if (lilacsData.bdenf) {
          dbRecord.indexers.push('BDENF');
          dbRecord.lilacsUpdatedAt = lilacsData.updated_at;
        }
        if (latindexData.latindex) {
          dbRecord.indexers.push('LATINDEX');
          dbRecord.latindexUpdatedAt = latindexData.updated_at;
        }

        // Registra no banco em memória para consultas subsequentes
        db[normalized] = dbRecord;
      }
    }

    if (!dbRecord) {
      return {
        issn: normalized || rawIssn || 'N/A',
        title: 'Periódico Não Identificado na Base',
        area: 'Outras Áreas',
        jcr: null,
        citeScore: null,
        indexers: [],
        metrics: { cuiden: null },
        classification: {
          estrato: 'NC',
          justification: 'ISSN não encontrado na base de dados de referência local nem no SciELO/LILACS/Latindex.'
        }
      };
    }
  }

  // Se o periódico não possui certas indexações localmente, consulta as APIs de enriquecimento em paralelo
  const localIndexers = (dbRecord.indexers || []).map(idx => idx.toUpperCase());
  if (normalized) {
    const promises = [];
    const needSciELO = !localIndexers.includes('SCIELO') && !localIndexers.includes('REVENF');
    const needLILACSOrBDENF = !localIndexers.includes('LILACS') && !localIndexers.includes('BDENF');
    const needLatindex = !localIndexers.includes('LATINDEX');

    if (needSciELO) {
      promises.push(fetchSciELOFromAPI(normalized).then(data => ({ type: 'scielo', data })));
    }
    if (needLILACSOrBDENF) {
      promises.push(fetchLILACSFromAPI(normalized).then(data => ({ type: 'lilacs', data })));
    }
    if (needLatindex) {
      promises.push(fetchLatindexFromAPI(normalized).then(data => ({ type: 'latindex', data })));
    }

    if (promises.length > 0) {
      const results = await Promise.all(promises);
      results.forEach(res => {
        if (res.type === 'scielo' && res.data.scielo) {
          if (!dbRecord.indexers) dbRecord.indexers = [];
          if (!dbRecord.indexers.includes('SCIELO')) {
            dbRecord.indexers.push('SCIELO');
          }
          dbRecord.scieloUpdatedAt = res.data.updated_at;
          if (res.data.revenf && !dbRecord.indexers.includes('RevEnf')) {
            dbRecord.indexers.push('RevEnf');
            dbRecord.area = 'Enfermagem'; // Coleção RevEnf garante área de Enfermagem
          }
          console.log(`[SciELO API] ${normalized} atualizado: SciELO=${res.data.scielo}, RevEnf=${res.data.revenf}`);
        } else if (res.type === 'lilacs' && (res.data.lilacs || res.data.bdenf)) {
          if (!dbRecord.indexers) dbRecord.indexers = [];
          if (res.data.lilacs && !dbRecord.indexers.includes('LILACS')) {
            dbRecord.indexers.push('LILACS');
          }
          if (res.data.bdenf && !dbRecord.indexers.includes('BDENF')) {
            dbRecord.indexers.push('BDENF');
            dbRecord.area = 'Enfermagem'; // Coleção BDENF garante área de Enfermagem
          }
          dbRecord.lilacsUpdatedAt = res.data.updated_at;
          console.log(`[LILACS/BDENF API] ${normalized} atualizado: LILACS=${res.data.lilacs}, BDENF=${res.data.bdenf}`);
        } else if (res.type === 'latindex' && res.data.latindex) {
          if (!dbRecord.indexers) dbRecord.indexers = [];
          if (!dbRecord.indexers.includes('LATINDEX')) {
            dbRecord.indexers.push('LATINDEX');
          }
          dbRecord.latindexUpdatedAt = res.data.updated_at;
          console.log(`[Latindex API] ${normalized} atualizado: LATINDEX=${res.data.latindex}`);
        }
      });
    }
  }

  // Se CiteScore não existe no banco local, busca da API sob demanda
  if (dbRecord.citeScore == null) {
    const apiCiteScore = await fetchCiteScoreFromAPI(normalized);
    if (apiCiteScore != null) {
      dbRecord.citeScore = apiCiteScore;
      console.log(`[CiteScore API] ${normalized}: ${apiCiteScore}`);
    }
  }

  // Classifica usando o motor de decisão
  const classification = classifyJournal(dbRecord);

  return {
    issn: normalized,
    title: dbRecord.title || 'Sem Título',
    area: dbRecord.area || 'Outras Áreas',
    jcr: dbRecord.jcr,
    citeScore: dbRecord.citeScore,
    indexers: dbRecord.indexers || [],
    metrics: dbRecord.metrics || { cuiden: null },
    classification: classification,
    // Propaga as datas da última consulta oficial para a renderização do front
    scieloUpdatedAt: dbRecord.scieloUpdatedAt || null,
    lilacsUpdatedAt: dbRecord.lilacsUpdatedAt || null,
    latindexUpdatedAt: dbRecord.latindexUpdatedAt || null
  };
}
