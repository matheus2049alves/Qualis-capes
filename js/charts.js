/**
 * Módulo de Renderização de Gráficos (Chart.js)
 * Responsável por gráficos Donut (Qualis) e Barras (Indexadores).
 */

import dom from './dom.js';
import appState from './state.js';

/**
 * Recalcula métricas (KPIs) e atualiza gráficos dinamicamente.
 */
export function updateAnalytics() {
  const items = appState.classifiedItems;

  if (items.length === 0) {
    dom.emptyState.style.display = 'flex';
    dom.analyticsResults.style.display = 'none';

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
    'SciELO': 0, 'Medline': 0, 'Scopus': 0, 'JCR (WoS)': 0, 'Latindex': 0,
    'RIC/CUIDEN': 0, 'LILACS': 0, 'BDENF': 0, 'CINAHL': 0, 'RevEnf': 0
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
 * Renderiza o gráfico Donut de distribuição de Qualis.
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
    A1: '#f59e0b', A2: '#94a3b8', A3: '#b7791f', A4: '#db2777',
    A5: '#1d4ed8', A6: '#0891b2', A7: '#0f766e', A8: '#047857', NC: '#4b5563'
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
      labels,
      datasets: [{
        data,
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
            label: function (context) {
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
 * Renderiza o gráfico de barras horizontais de indexadores.
 */
function renderIndexersChart(counts) {
  const canvas = dom.indexersChart;
  if (!canvas) return;

  const ctx = canvas.getContext('2d');
  if (appState.charts.indexers) {
    appState.charts.indexers.destroy();
  }

  const labels = [];
  const data = [];
  const backgroundColors = [];
  const hoverBackgroundColors = [];

  const indexerColors = {
    'SciELO': { bg: 'rgba(224, 70, 34, 0.85)', hover: '#e04622' },
    'Medline': { bg: 'rgba(0, 113, 188, 0.85)', hover: '#0071bc' },
    'Scopus': { bg: 'rgba(255, 111, 0, 0.85)', hover: '#ff6f00' },
    'JCR (WoS)': { bg: 'rgba(124, 58, 237, 0.85)', hover: '#7c3aed' },
    'Latindex': { bg: 'rgba(0, 168, 107, 0.85)', hover: '#00a86b' },
    'RIC/CUIDEN': { bg: 'rgba(132, 204, 22, 0.85)', hover: '#84cc16' },
    'LILACS': { bg: 'rgba(6, 182, 212, 0.85)', hover: '#06b6d4' },
    'BDENF': { bg: 'rgba(20, 184, 166, 0.85)', hover: '#14b8a6' },
    'CINAHL': { bg: 'rgba(2, 132, 199, 0.85)', hover: '#0284c7' },
    'RevEnf': { bg: 'rgba(219, 39, 119, 0.85)', hover: '#db2777' }
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
      labels,
      datasets: [{
        label: 'Periódicos',
        data,
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
          ticks: { color: isDark ? '#9ca3af' : '#475569', stepSize: 1, precision: 0 }
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
