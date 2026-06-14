/**
 * Referências DOM centralizadas.
 * Mapeia todos os elementos da interface uma única vez para evitar
 * lookups repetidos e garantir consistência entre módulos.
 */

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

  // Dashboard
  emptyState: document.getElementById('empty-state'),
  analyticsResults: document.getElementById('analytics-results'),
  kpiTotal: document.getElementById('kpi-total'),
  kpiMaxJcr: document.getElementById('kpi-max-jcr'),
  kpiMaxCitescore: document.getElementById('kpi-max-citescore'),
  kpiPercentIndexed: document.getElementById('kpi-percent-indexed'),
  qualisChart: document.getElementById('qualis-chart'),
  indexersChart: document.getElementById('indexers-chart'),

  // Loading Overlay
  loadingOverlay: document.getElementById('loading-overlay'),
  loadingTitle: document.getElementById('loading-title'),
  loadingSubtitle: document.getElementById('loading-subtitle'),
  loadingIcon: document.getElementById('loading-icon'),

  // Modal de Seleção
  searchModal: document.getElementById('search-modal'),
  btnCloseModal: document.getElementById('btn-close-modal'),
  searchResultsList: document.getElementById('search-results-list'),

  // Abas de Resultados
  resultsTabs: document.getElementById('results-tabs'),
  tabTable: document.getElementById('tab-table'),
  tabAnalytics: document.getElementById('tab-analytics'),
  paneTable: document.getElementById('tab-content-table'),
  paneAnalytics: document.getElementById('tab-content-analytics'),

  // Seletor Segmentado (Sidebar)
  selectorSingle: document.getElementById('selector-single'),
  selectorBatch: document.getElementById('selector-batch'),
  selectorUpload: document.getElementById('selector-upload'),
  paneInputSingle: document.getElementById('input-pane-single'),
  paneInputBatch: document.getElementById('input-pane-batch'),
  paneInputUpload: document.getElementById('input-pane-upload'),

  // Container de Toasts
  toastContainer: document.getElementById('toast-container'),

  // Lista de Buscas Recentes
  recentSearchesList: document.getElementById('recent-searches-list')
};

export default dom;
