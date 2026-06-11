/**
 * Controlador Principal da Aplicação
 */

import { loadDatabase, enrichAndClassify, normalizeISSN } from './enricher.js';
import { parseCSV, processCSVData, generateCSV, downloadFile } from './utils.js';
import { runTests } from './tests.js';

// Estado da Aplicação
const appState = {
  classifiedItems: [], // Itens atualmente mostrados na tabela de resultados
  dbSummary: { total: 0, items: [] }
};

// Elementos do DOM
const dom = {
  dbStatus: document.getElementById('db-status'),
  dbPreviewList: document.getElementById('db-preview-list'),
  
  singleIssnForm: document.getElementById('single-issn-form'),
  singleIssnInput: document.getElementById('single-issn-input'),
  
  batchIssnForm: document.getElementById('batch-issn-form'),
  batchIssnInput: document.getElementById('batch-issn-input'),
  
  dropzone: document.getElementById('dropzone'),
  fileInput: document.getElementById('file-input'),
  
  resultsContainer: document.getElementById('results-container'),
  resultsTableBody: document.getElementById('results-table-body'),
  
  searchBox: document.getElementById('search-box'),
  filterEstrato: document.getElementById('filter-estrato'),
  btnExport: document.getElementById('btn-export'),
  btnClear: document.getElementById('btn-clear'),
  
  themeToggle: document.getElementById('theme-toggle'),
  
  testsSummary: document.getElementById('tests-summary'),
  testsGrid: document.getElementById('tests-results-grid'),
  passedCount: document.getElementById('passed-count'),
  failedCount: document.getElementById('failed-count')
};

/**
 * Inicialização
 */
window.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await initDatabase();
  initUnitTests();
});

/**
 * Registra todos os manipuladores de eventos da página
 */
function setupEventListeners() {
  // Alternador de tema
  dom.themeToggle.addEventListener('click', () => {
    document.body.classList.toggle('light-theme');
    const isLight = document.body.classList.contains('light-theme');
    dom.themeToggle.innerHTML = isLight 
      ? '☀️ Modo Claro' 
      : '🌙 Modo Escuro';
  });

  // Envio de ISSN Individual
  dom.singleIssnForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawIssn = dom.singleIssnInput.value.trim();
    if (!rawIssn) return;

    showLoadingState();
    const classified = await enrichAndClassify(rawIssn);
    addClassifiedItem(classified);
    
    dom.singleIssnInput.value = '';
    hideLoadingState();
    renderResultsTable();
  });

  // Envio de Lote de ISSNs
  dom.batchIssnForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const batchText = dom.batchIssnInput.value.trim();
    if (!batchText) return;

    showLoadingState();
    // Divide por nova linha, vírgula, ponto e vírgula ou espaço
    const rawIssns = batchText.split(/[\n,;\s]+/).map(i => i.trim()).filter(i => i !== '');
    
    for (const rawIssn of rawIssns) {
      const classified = await enrichAndClassify(rawIssn);
      addClassifiedItem(classified);
    }

    dom.batchIssnInput.value = '';
    hideLoadingState();
    renderResultsTable();
  });

  // Drag & Drop do CSV
  const dropzone = dom.dropzone;
  
  dropzone.addEventListener('click', () => dom.fileInput.click());
  
  dom.fileInput.addEventListener('change', (e) => {
    if (e.target.files.length > 0) {
      handleUploadedFile(e.target.files[0]);
    }
  });

  dropzone.addEventListener('dragover', (e) => {
    e.preventDefault();
    dropzone.classList.add('dragover');
  });

  dropzone.addEventListener('dragleave', () => {
    dropzone.classList.remove('dragover');
  });

  dropzone.addEventListener('drop', (e) => {
    e.preventDefault();
    dropzone.classList.remove('dragover');
    if (e.dataTransfer.files.length > 0) {
      handleUploadedFile(e.dataTransfer.files[0]);
    }
  });

  // Busca e Filtros
  dom.searchBox.addEventListener('input', () => renderResultsTable());
  dom.filterEstrato.addEventListener('change', () => renderResultsTable());

  // Limpar e Exportar
  dom.btnClear.addEventListener('click', () => {
    appState.classifiedItems = [];
    renderResultsTable();
  });

  dom.btnExport.addEventListener('click', () => {
    if (appState.classifiedItems.length === 0) return;
    const filtered = getFilteredItems();
    const csvContent = generateCSV(filtered);
    const dateStr = new Date().toISOString().slice(0, 10);
    downloadFile(csvContent, `qualis_classificado_${dateStr}.csv`, 'text/csv');
  });
}

/**
 * Inicializa a Base de Dados e exibe status na interface
 */
async function initDatabase() {
  try {
    const db = await loadDatabase();
    const entries = Object.entries(db);
    appState.dbSummary.total = entries.length;
    appState.dbSummary.items = entries.map(([issn, value]) => ({
      issn,
      title: value.title,
      area: value.area,
      jcr: value.jcr,
      citeScore: value.citeScore
    }));

    // Atualiza o Badge de Status
    dom.dbStatus.textContent = `Banco Ativo (${appState.dbSummary.total} revistas)`;
    
    // Renderiza uma lista resumida das revistas no painel lateral
    renderDatabasePreview();
  } catch (error) {
    dom.dbStatus.textContent = 'Erro ao carregar banco';
    dom.dbStatus.style.background = 'var(--error-bg)';
    dom.dbStatus.style.color = 'var(--error)';
  }
}

/**
 * Inicializa a exibição de Testes Unitários
 */
function initUnitTests() {
  const results = runTests();
  const passed = results.filter(r => r.passed);
  const failed = results.filter(r => !r.passed);

  dom.passedCount.textContent = passed.length;
  dom.failedCount.textContent = failed.length;

  dom.testsGrid.innerHTML = '';
  results.forEach(test => {
    const card = document.createElement('div');
    card.className = `test-card ${test.passed ? 'passed' : 'failed'}`;
    
    card.innerHTML = `
      <div class="test-header">
        <span>${test.name}</span>
        <span class="test-status ${test.passed ? 'passed' : 'failed'}">${test.passed ? 'Passou' : 'Falhou'}</span>
      </div>
      <div>Esperado: <strong>${test.expected}</strong> | Obtido: <strong>${test.actual}</strong></div>
      <div class="text-muted" style="font-size: 11px;">Métrica: ${test.justification}</div>
    `;
    dom.testsGrid.appendChild(card);
  });
}

/**
 * Renderiza a visualização das revistas cadastradas no banco de dados local
 */
function renderDatabasePreview() {
  dom.dbPreviewList.innerHTML = '';
  
  // Mostra as primeiras 30 revistas cadastradas
  const itemsToShow = appState.dbSummary.items.slice(0, 30);
  
  itemsToShow.forEach(item => {
    const el = document.createElement('div');
    el.className = 'db-item';
    
    const details = [];
    if (item.jcr !== null) details.push(`JCR: ${item.jcr}`);
    if (item.citeScore !== null) details.push(`CS: ${item.citeScore}`);
    
    el.innerHTML = `
      <div class="db-item-title" title="${item.title}">${item.title}</div>
      <div class="db-item-details">${item.issn} | ${item.area} ${details.length > 0 ? '(' + details.join(', ') + ')' : ''}</div>
    `;
    dom.dbPreviewList.appendChild(el);
  });
}

/**
 * Lê e processa o arquivo CSV inserido pelo usuário
 * @param {File} file Arquivo carregado
 */
function handleUploadedFile(file) {
  const reader = new FileReader();
  
  reader.onload = async (e) => {
    showLoadingState();
    const text = e.target.result;
    const parsed = parseCSV(text);
    const records = processCSVData(parsed);

    let countNew = 0;
    for (const record of records) {
      const classified = await enrichAndClassify(record.issn);
      
      // Se tivermos um título no CSV que seja mais relevante do que o genérico do mock do enriquecedor, mantemos
      if (record.title && record.title !== 'Artigo Importado' && classified.title === 'Periódico Não Identificado na Base') {
        classified.title = record.title;
      } else if (record.title && record.title !== 'Artigo Importado' && classified.title) {
        classified.title = `${record.title} (${classified.title})`;
      }

      addClassifiedItem(classified);
      countNew++;
    }

    hideLoadingState();
    renderResultsTable();
    alert(`${countNew} artigos importados e classificados com sucesso!`);
  };

  reader.readAsText(file);
}

/**
 * Adiciona um item classificado ao estado se ele já não existir
 * para evitar duplicações na tela na mesma sessão.
 * @param {Object} item 
 */
function addClassifiedItem(item) {
  // Evita duplicar exatamente o mesmo ISSN de forma desnecessária
  const index = appState.classifiedItems.findIndex(existing => existing.issn === item.issn && existing.title === item.title);
  if (index !== -1) {
    // Atualiza o item se já existir
    appState.classifiedItems[index] = item;
  } else {
    appState.classifiedItems.unshift(item); // Adiciona no início da lista
  }
}

/**
 * Filtra a lista de classificados com base no campo de busca e estrato selecionado
 */
function getFilteredItems() {
  const searchVal = dom.searchBox.value.toLowerCase().trim();
  const filterVal = dom.filterEstrato.value;

  return appState.classifiedItems.filter(item => {
    const matchesSearch = item.issn.toLowerCase().includes(searchVal) || 
                          item.title.toLowerCase().includes(searchVal);
    const matchesFilter = filterVal === 'ALL' || item.classification.estrato === filterVal;
    return matchesSearch && matchesFilter;
  });
}

/**
 * Renderiza a Tabela de Resultados
 */
function renderResultsTable() {
  const filtered = getFilteredItems();
  
  dom.resultsTableBody.innerHTML = '';
  
  if (filtered.length === 0) {
    dom.resultsTableBody.innerHTML = `
      <tr>
        <td colspan="8" style="text-align: center; color: var(--text-muted); padding: 30px;">
          Nenhum artigo processado ou correspondente aos filtros aplicados.
        </td>
      </tr>
    `;
    dom.resultsContainer.style.display = 'none';
    return;
  }

  dom.resultsContainer.style.display = 'block';

  filtered.forEach(item => {
    const row = document.createElement('tr');
    
    const indexersTags = item.indexers.map(idx => `<span class="indexer-tag">${idx}</span>`).join('');
    const cuidenVal = (item.metrics && item.metrics.cuiden) ? item.metrics.cuiden : null;

    row.innerHTML = `
      <td>
        <div style="font-weight: 500; color: var(--text-primary); max-width: 250px; overflow: hidden; text-overflow: ellipsis;">
          ${item.title}
        </div>
      </td>
      <td style="font-family: monospace; font-size: 13px;">${item.issn}</td>
      <td>
        <span class="area-badge ${item.area === 'Enfermagem' ? 'enfermagem' : 'outras'}">
          ${item.area}
        </span>
      </td>
      <td>${item.jcr !== null ? item.jcr.toFixed(2) : '-'}</td>
      <td>${item.citeScore !== null ? item.citeScore.toFixed(2) : '-'}</td>
      <td>
        <div style="max-width: 200px;">
          ${indexersTags || '-'}
          ${cuidenVal !== null ? `<br><span class="indexer-tag">CUIDEN: ${cuidenVal.toFixed(2)}</span>` : ''}
        </div>
      </td>
      <td>
        <span class="estrato-badge ${item.classification.estrato}">
          ${item.classification.estrato}
        </span>
      </td>
      <td>
        <div class="justification-cell">
          ${item.classification.justification}
        </div>
      </td>
    `;
    
    dom.resultsTableBody.appendChild(row);
  });
}

function showLoadingState() {
  document.body.style.cursor = 'wait';
}

function hideLoadingState() {
  document.body.style.cursor = 'default';
}
