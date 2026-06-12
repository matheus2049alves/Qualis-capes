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
 * Consulta os dados de um periódico pelo ISSN e aplica a classificação.
 * Se o CiteScore não existe no banco local, busca da API Elsevier sob demanda.
 * @param {string} rawIssn ISSN digitado ou importado
 * @returns {Promise<Object>} Dados consolidados da revista e classificação
 */
export async function enrichAndClassify(rawIssn) {
  const db = await loadDatabase();
  const normalized = normalizeISSN(rawIssn);
  
  const dbRecord = db[normalized];

  if (!dbRecord) {
    // Retorna registro padrão "Não Classificado" caso não encontre
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
        justification: 'ISSN não encontrado na base de dados de referência local.'
      }
    };
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
    classification: classification
  };
}
