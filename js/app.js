/**
 * Controlador Principal da Aplicação
 */

import { loadDatabase, enrichAndClassify, normalizeISSN } from './enricher.js';
import { parseCSV, processCSVData, generateCSV, downloadFile } from './utils.js';
import { runTests } from './tests.js';

// Estado da Aplicação
const appState = {
  classifiedItems: [], // Itens atualmente mostrados na tabela de resultados
  dbSummary: { total: 0, items: [] },
  charts: {
    qualis: null,
    indexers: null
  }
};

// Elementos do DOM
const dom = {
  dbStatus: document.getElementById('db-status'),
  
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
  
  // Elementos do novo Dashboard
  emptyState: document.getElementById('empty-state'),
  analyticsResults: document.getElementById('analytics-results'),
  kpiTotal: document.getElementById('kpi-total'),
  kpiMaxJcr: document.getElementById('kpi-max-jcr'),
  kpiMaxCitescore: document.getElementById('kpi-max-citescore'),
  kpiPercentIndexed: document.getElementById('kpi-percent-indexed'),
  qualisChart: document.getElementById('qualis-chart'),
  indexersChart: document.getElementById('indexers-chart'),
  
  // Elementos do Overlay de Carregamento Premium
  loadingOverlay: document.getElementById('loading-overlay'),
  loadingTitle: document.getElementById('loading-title'),
  loadingSubtitle: document.getElementById('loading-subtitle'),
  loadingIcon: document.getElementById('loading-icon')
};

/**
 * Inicialização
 */
window.addEventListener('DOMContentLoaded', async () => {
  setupEventListeners();
  await initDatabase();
  initUnitTests();
  // Inicializa ícones Lucide
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
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
      ? '<i data-lucide="sun"></i> <span>Modo Claro</span>' 
      : '<i data-lucide="moon"></i> <span>Modo Escuro</span>';
    
    if (typeof lucide !== 'undefined') {
      lucide.createIcons();
    }
    
    // Atualiza gráficos se houver dados ativos, para refletir mudança de fontes/linhas de grade
    if (appState.classifiedItems.length > 0) {
      updateAnalytics();
    }
  });

  // Envio de ISSN Individual
  dom.singleIssnForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const rawIssn = dom.singleIssnInput.value.trim();
    if (!rawIssn) return;

    showLoadingState('Analisando ISSN', 'Consultando APIs e aplicando regras de extratos CAPES...', 'search');
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

    showLoadingState('Processando Lote', 'Analisando múltiplos ISSNs e calculando estatísticas...', 'layers');
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
    dom.dbStatus.textContent = `Base Conectada (${appState.dbSummary.total} revistas)`;
  } catch (error) {
    dom.dbStatus.textContent = 'Erro ao carregar banco';
    dom.dbStatus.style.background = 'var(--error-bg)';
    dom.dbStatus.style.color = 'var(--error)';
  }
}

/**
 * Inicializa e executa silenciosamente os Testes Unitários de Diagnóstico (exibindo no console)
 */
function initUnitTests() {
  try {
    const results = runTests();
    const passed = results.filter(r => r.passed);
    const failed = results.filter(r => !r.passed);

    console.group('🩺 Diagnóstico do Motor de Regras Qualis CAPES');
    console.info(`🟢 Testes que passaram: ${passed.length}/${results.length}`);
    
    if (failed.length > 0) {
      console.error(`🔴 Testes que falharam: ${failed.length}/${results.length}`);
      console.table(failed);
    } else {
      console.info('Sucesso Absoluto: Todos os cenários de classificação da CAPES passaram com 100% de exatidão!');
    }
    console.groupEnd();
  } catch (err) {
    console.error('Falha crítica ao executar a suíte de testes unitários:', err);
  }
}

/**
 * Lê e processa o arquivo CSV inserido pelo usuário
 */
function handleUploadedFile(file) {
  const reader = new FileReader();
  
  reader.onload = async (e) => {
    showLoadingState('Processando Planilha', 'Importando dados do arquivo CSV e enriquecendo periódicos...', 'file-spreadsheet');
    const text = e.target.result;
    const parsed = parseCSV(text);
    const records = processCSVData(parsed);

    let countNew = 0;
    for (const record of records) {
      const classified = await enrichAndClassify(record.issn);
      
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
 */
function addClassifiedItem(item) {
  const index = appState.classifiedItems.findIndex(existing => existing.issn === item.issn && existing.title === item.title);
  if (index !== -1) {
    appState.classifiedItems[index] = item;
  } else {
    appState.classifiedItems.unshift(item);
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
 * Recalcula métricas (KPIs) e atualiza gráficos dinamicamente
 */
function updateAnalytics() {
  const items = appState.classifiedItems;
  
  if (items.length === 0) {
    dom.emptyState.style.display = 'flex';
    dom.analyticsResults.style.display = 'none';
    
    // Destrói instâncias ativas do Chart.js
    if (appState.charts.qualis) {
      appState.charts.qualis.destroy();
      appState.charts.qualis = null;
    }
    if (appState.charts.indexers) {
      appState.charts.indexers.destroy();
      appState.charts.indexers = null;
    }
    return;
  }

  dom.emptyState.style.display = 'none';
  dom.analyticsResults.style.display = 'block';

  // 1. Calcular KPIs
  const total = items.length;
  dom.kpiTotal.textContent = total;

  let maxJcr = -1;
  let maxCiteScore = -1;
  let indexedCount = 0;

  items.forEach(item => {
    if (item.jcr !== null && item.jcr > maxJcr) {
      maxJcr = item.jcr;
    }
    if (item.citeScore !== null && item.citeScore > maxCiteScore) {
      maxCiteScore = item.citeScore;
    }
    // Verifica indexadores de qualidade
    const indexers = (item.indexers || []).map(idx => idx.toUpperCase());
    const hasJcr = item.jcr !== null && item.jcr > 0;
    if (indexers.includes('SCIELO') || indexers.includes('MEDLINE') || indexers.includes('SCOPUS') || hasJcr) {
      indexedCount++;
    }
  });

  dom.kpiMaxJcr.textContent = maxJcr >= 0 ? maxJcr.toFixed(2) : '-';
  dom.kpiMaxCitescore.textContent = maxCiteScore >= 0 ? maxCiteScore.toFixed(2) : '-';
  
  const percentIndexed = total > 0 ? Math.round((indexedCount / total) * 100) : 0;
  dom.kpiPercentIndexed.textContent = `${percentIndexed}%`;

  // 2. Coletar dados para os gráficos
  const qualisCounts = { A1: 0, A2: 0, A3: 0, A4: 0, A5: 0, A6: 0, A7: 0, A8: 0, NC: 0 };
  items.forEach(item => {
    const estrato = item.classification.estrato;
    if (qualisCounts[estrato] !== undefined) {
      qualisCounts[estrato]++;
    } else {
      qualisCounts.NC++;
    }
  });

  const indexerCounts = { 
    'SciELO': 0, 
    'Medline': 0, 
    'Scopus': 0, 
    'JCR (WoS)': 0, 
    'Latindex': 0, 
    'RIC/CUIDEN': 0,
    'LILACS': 0,
    'BDENF': 0,
    'CINAHL': 0,
    'RevEnf': 0
  };
  items.forEach(item => {
    const indexers = (item.indexers || []).map(idx => idx.toUpperCase());
    if (indexers.includes('SCIELO')) indexerCounts['SciELO']++;
    if (indexers.includes('MEDLINE')) indexerCounts['Medline']++;
    if (indexers.includes('SCOPUS')) indexerCounts['Scopus']++;
    if (item.jcr !== null && item.jcr > 0) indexerCounts['JCR (WoS)']++;
    if (indexers.includes('LATINDEX')) indexerCounts['Latindex']++;
    if (indexers.includes('CUIDEN') || indexers.includes('RIC/CUIDEN') || indexers.includes('RIC')) indexerCounts['RIC/CUIDEN']++;
    if (indexers.includes('LILACS')) indexerCounts['LILACS']++;
    if (indexers.includes('BDENF')) indexerCounts['BDENF']++;
    if (indexers.includes('CINAHL')) indexerCounts['CINAHL']++;
    if (indexers.includes('REVENF')) indexerCounts['RevEnf']++;
  });

  // 3. Renderizar gráficos
  renderQualisChart(qualisCounts);
  renderIndexersChart(indexerCounts);
}

/**
 * Renderiza o gráfico Donut de distribuição de Qualis
 */
function renderQualisChart(counts) {
  const canvas = dom.qualisChart;
  if (!canvas) return;
  
  const ctx = canvas.getContext('2d');
  if (appState.charts.qualis) {
    appState.charts.qualis.destroy();
  }

  const labels = [];
  const data = [];
  const colors = [];

  const colorMapping = {
    A1: '#f59e0b',
    A2: '#94a3b8',
    A3: '#b7791f',
    A4: '#db2777',
    A5: '#1d4ed8',
    A6: '#0891b2',
    A7: '#0f766e',
    A8: '#047857',
    NC: '#4b5563'
  };

  Object.entries(counts).forEach(([key, val]) => {
    if (val > 0) {
      labels.push(`Qualis ${key}`);
      data.push(val);
      colors.push(colorMapping[key]);
    }
  });

  if (data.length === 0) return;

  const isDark = !document.body.classList.contains('light-theme');

  appState.charts.qualis = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: labels,
      datasets: [{
        data: data,
        backgroundColor: colors,
        borderWidth: isDark ? 2 : 1,
        borderColor: isDark ? '#0b0f19' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'right',
          labels: {
            color: isDark ? '#f3f4f6' : '#0f172a',
            font: { family: 'Outfit', size: 12, weight: '500' }
          }
        },
        tooltip: {
          backgroundColor: isDark ? '#111827' : '#ffffff',
          titleColor: isDark ? '#f3f4f6' : '#0f172a',
          bodyColor: isDark ? '#9ca3af' : '#475569',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0,0,0,0.1)',
          borderWidth: 1,
          padding: 10,
          callbacks: {
            label: function(context) {
              const val = context.raw;
              const total = context.dataset.data.reduce((a, b) => a + b, 0);
              const percent = Math.round((val / total) * 100);
              return ` ${context.label}: ${val} (${percent}%)`;
            }
          }
        }
      },
      cutout: '65%'
    }
  });
}

/**
 * Renderiza o gráfico de barras horizontais de indexadores
 */
function renderIndexersChart(counts) {
  const canvas = dom.indexersChart;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (appState.charts.indexers) {
    appState.charts.indexers.destroy();
  }

  // Filtrar categorias que possuem ao menos 1 item para manter o gráfico focado
  const labels = [];
  const data = [];
  const backgroundColors = [];
  const hoverBackgroundColors = [];

  const indexerColors = {
    'SciELO': { bg: 'rgba(224, 70, 34, 0.85)', hover: '#e04622' },          // Vermelho-tijolo SciELO
    'Medline': { bg: 'rgba(0, 113, 188, 0.85)', hover: '#0071bc' },          // Azul MEDLINE/PubMed
    'Scopus': { bg: 'rgba(255, 111, 0, 0.85)', hover: '#ff6f00' },           // Laranja Scopus
    'JCR (WoS)': { bg: 'rgba(124, 58, 237, 0.85)', hover: '#7c3aed' },       // Roxo JCR
    'Latindex': { bg: 'rgba(0, 168, 107, 0.85)', hover: '#00a86b' },         // Verde Latindex
    'RIC/CUIDEN': { bg: 'rgba(132, 204, 22, 0.85)', hover: '#84cc16' },      // Verde limão CUIDEN
    'LILACS': { bg: 'rgba(6, 182, 212, 0.85)', hover: '#06b6d4' },           // Ciano LILACS
    'BDENF': { bg: 'rgba(20, 184, 166, 0.85)', hover: '#14b8a6' },           // Teal BDENF
    'CINAHL': { bg: 'rgba(2, 132, 199, 0.85)', hover: '#0284c7' },           // Azul CINAHL
    'RevEnf': { bg: 'rgba(219, 39, 119, 0.85)', hover: '#db2777' }           // Rosa RevEnf
  };

  Object.entries(counts).forEach(([key, val]) => {
    if (val > 0) {
      labels.push(key);
      data.push(val);
      const color = indexerColors[key] || { bg: 'rgba(99, 102, 241, 0.75)', hover: '#6366f1' };
      backgroundColors.push(color.bg);
      hoverBackgroundColors.push(color.hover);
    }
  });

  if (data.length === 0) return;

  const isDark = !document.body.classList.contains('light-theme');

  appState.charts.indexers = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: labels,
      datasets: [{
        label: 'Periódicos',
        data: data,
        backgroundColor: backgroundColors,
        hoverBackgroundColor: hoverBackgroundColors,
        borderRadius: 6,
        borderWidth: 0
      }]
    },
    options: {
      indexAxis: 'y',
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          backgroundColor: isDark ? '#111827' : '#ffffff',
          titleColor: isDark ? '#f3f4f6' : '#0f172a',
          bodyColor: isDark ? '#9ca3af' : '#475569',
          borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0,0,0,0.1)',
          borderWidth: 1,
          padding: 10
        }
      },
      scales: {
        x: {
          grid: { color: isDark ? 'rgba(255, 255, 255, 0.05)' : 'rgba(0, 0, 0, 0.05)' },
          ticks: {
            color: isDark ? '#9ca3af' : '#475569',
            stepSize: 1,
            precision: 0
          }
        },
        y: {
          grid: { display: false },
          ticks: {
            color: isDark ? '#f3f4f6' : '#0f172a',
            font: { family: 'Outfit', size: 12, weight: '500' }
          }
        }
      }
    }
  });
}

/**
 * Formata uma data no formato YYYY-MM-DD para DD/MM/YYYY.
 * @param {string} dateStr String contendo a data
 * @returns {string} Data formatada ou string vazia
 */
function formatDate(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('T')[0].split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

/**
 * Renderiza a Tabela de Resultados
 */
function renderResultsTable() {
  const filtered = getFilteredItems();
  
  // Sempre atualiza os KPIs e gráficos com base na lista geral da sessão
  updateAnalytics();

  dom.resultsTableBody.innerHTML = '';
  
  if (appState.classifiedItems.length === 0) {
    dom.resultsContainer.style.display = 'none';
    return;
  }

  dom.resultsContainer.style.display = 'block';

  if (filtered.length === 0) {
    dom.resultsTableBody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: var(--text-muted); padding: 30px;">
          Nenhum artigo correspondente aos filtros aplicados.
        </td>
      </tr>
    `;
    return;
  }

  filtered.forEach(item => {
    const row = document.createElement('tr');
    
    const indexersTags = item.indexers.map(idx => {
      const upperIdx = idx.toUpperCase();
      if (upperIdx === 'SCIELO' && item.scieloUpdatedAt) {
        return `<span class="indexer-tag" data-tooltip="Dado obtido de SciELO em ${formatDate(item.scieloUpdatedAt)}">${idx}</span>`;
      }
      if (upperIdx === 'LILACS' && item.lilacsUpdatedAt) {
        return `<span class="indexer-tag" data-tooltip="Dado obtido de LILACS em ${formatDate(item.lilacsUpdatedAt)}">${idx}</span>`;
      }
      if (upperIdx === 'BDENF' && item.lilacsUpdatedAt) {
        return `<span class="indexer-tag" data-tooltip="Dado obtido de BDENF em ${formatDate(item.lilacsUpdatedAt)}">${idx}</span>`;
      }
      if (upperIdx === 'LATINDEX' && item.latindexUpdatedAt) {
        return `<span class="indexer-tag" data-tooltip="Dado obtido de Latindex em ${formatDate(item.latindexUpdatedAt)}">${idx}</span>`;
      }
      return `<span class="indexer-tag">${idx}</span>`;
    }).join('');
    const cuidenVal = (item.metrics && item.metrics.cuiden) ? item.metrics.cuiden : null;

    row.innerHTML = `
      <td>
        <div style="font-weight: 500; color: var(--text-primary); max-width: 250px; overflow: hidden; text-overflow: ellipsis;" title="${item.title}">
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
        <div class="estrato-badge-container" data-tooltip="${item.classification.justification}">
          <span class="estrato-badge ${item.classification.estrato}">
            ${item.classification.estrato}
          </span>
          <i data-lucide="info" class="info-icon"></i>
        </div>
      </td>
    `;
    
    dom.resultsTableBody.appendChild(row);
  });

  // Re-inicializa os ícones Lucide na tabela dinâmica
  if (typeof lucide !== 'undefined') {
    lucide.createIcons();
  }
}

function showLoadingState(title = 'Processando Periódico', subtitle = 'Consultando bases oficiais e aplicando critérios CAPES...', iconName = 'search') {
  document.body.style.cursor = 'wait';
  if (dom.loadingOverlay) {
    dom.loadingTitle.textContent = title;
    dom.loadingSubtitle.textContent = subtitle;
    
    // Atualiza o ícone central
    if (dom.loadingIcon) {
      dom.loadingIcon.innerHTML = `<i data-lucide="${iconName}"></i>`;
      if (typeof lucide !== 'undefined') {
        lucide.createIcons({
          attrs: {
            class: 'lucide'
          },
          nameAttr: 'data-lucide',
          node: dom.loadingIcon
        });
      }
    }
    
    dom.loadingOverlay.classList.add('active');
  }
}

function hideLoadingState() {
  document.body.style.cursor = 'default';
  if (dom.loadingOverlay) {
    dom.loadingOverlay.classList.remove('active');
  }
}
