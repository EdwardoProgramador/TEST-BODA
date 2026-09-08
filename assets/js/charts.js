/* ==========================================================================
   charts.js — Capa sobre Chart.js: tema, plugins y constructores de gráficas.

   Nada aquí usa Chart.register(): los plugins se pasan por instancia, que es
   lo que evita el error "plugin already registered" al re-dibujar.
   ========================================================================== */
(function (global) {
  'use strict';
  var PN = global.PN = global.PN || {};
  var S = PN.stats, fmt = PN.fmt;
  var C = PN.charts = {};

  var registry = {};

  C.applyTheme = function () {
    if (!global.Chart) return;
    global.Chart.defaults.color = '#5a7a99';
    global.Chart.defaults.font = { family: 'DM Mono, monospace', size: 11 };
    global.Chart.defaults.animation = { duration: 320 };
  };

  C.TOOLTIP = { backgroundColor: '#0e1318', borderColor: '#243447', borderWidth: 1,
                titleColor: '#e8edf5', bodyColor: '#8aa0b8', padding: 10, displayColors: true };
  C.SCALE = { grid: { color: 'rgba(30,45,61,.5)' },
              ticks: { color: '#5a7a99', font: { family: 'DM Mono', size: 10 } } };

  /** Eje con título. */
  C.axis = function (title, extra) {
    var a = { grid: { color: 'rgba(30,45,61,.5)' },
              ticks: { color: '#5a7a99', font: { family: 'DM Mono', size: 10 } } };
    if (title) a.title = { display: true, text: title, color: '#5a7a99', font: { family: 'DM Mono', size: 10 } };
    return Object.assign(a, extra || {});
  };

  C.legend = function (show, position) {
    return { display: show !== false, position: position || 'top',
             labels: { color: '#5a7a99', font: { family: 'DM Mono', size: 9 },
                       boxWidth: 14, padding: 10, usePointStyle: true } };
  };

  /** Destruye la gráfica registrada bajo esa clave (idempotente). */
  C.destroy = function (key) {
    if (registry[key]) { try { registry[key].destroy(); } catch (e) {} delete registry[key]; }
  };
  C.get = function (key) { return registry[key]; };

  var warned = false;
  /** Aviso visible (una sola vez) si Chart.js no llegó a cargar. */
  function libMissing() {
    if (warned) return;
    warned = true;
    var b = document.getElementById('dataBanner');
    if (b) {
      b.className = 'banner demo';
      b.innerHTML = '<span>⚠</span><span>No se pudo cargar <b>assets/vendor/chart.umd.min.js</b>, ' +
        'así que las gráficas no se dibujan. Los datos y las tablas siguen siendo correctos. ' +
        'Verifica que la carpeta <code>assets/vendor/</code> viajó junto a los HTML.</span>';
    }
  }

  /** Crea la gráfica y la registra. Destruye la anterior con la misma clave. */
  C.render = function (key, canvasId, config) {
    C.destroy(key);
    var el = document.getElementById(canvasId);
    if (!el) return null;
    if (typeof global.Chart !== 'function') { libMissing(); return null; }
    registry[key] = new global.Chart(el.getContext('2d'), config);
    return registry[key];
  };

  /* ── Plugin: líneas verticales de hitos ─────────────────────────────── */

  /**
   * Dibuja una línea punteada en la frontera entre la última semana previa
   * al hito y la primera semana ya con la mejora (de ahí el −0.5 de offset).
   * @param {Array<{mes:number,week:string}>} weeks eje X en orden
   */
  C.milestonePlugin = function (weeks) {
    var hits = [];
    PN.MILESTONES.forEach(function (ms, idx) {
      for (var i = 0; i < weeks.length; i++) {
        if (weeks[i].mes === ms.firstWeek.mes && weeks[i].week === ms.firstWeek.week) {
          hits.push({ pos: i - 0.5, color: ms.color, label: ms.label, row: idx });
          break;
        }
      }
    });
    if (!hits.length) return null;
    return {
      id: 'pn-milestones',
      afterDatasetsDraw: function (chart) {
        var ctx = chart.ctx, area = chart.chartArea, xs = chart.scales.x;
        if (!area || !xs) return;
        hits.forEach(function (h) {
          var x = xs.getPixelForValue(h.pos);
          if (!isFinite(x) || x < area.left || x > area.right) return;
          ctx.save();
          ctx.setLineDash([5, 4]); ctx.strokeStyle = h.color; ctx.lineWidth = 1.5;
          ctx.beginPath(); ctx.moveTo(x, area.top); ctx.lineTo(x, area.bottom); ctx.stroke();
          ctx.setLineDash([]);
          ctx.fillStyle = h.color; ctx.font = 'bold 8px DM Mono, monospace';
          ctx.textAlign = x > (area.left + area.right) / 2 ? 'right' : 'left';
          ctx.fillText(h.label, x + (ctx.textAlign === 'right' ? -6 : 6), area.top + 12 + h.row * 12);
          ctx.restore();
        });
      }
    };
  };

  /* ── Recorte de escala ──────────────────────────────────────────────── */

  /**
   * Recorta valores a un tope para que un outlier extremo no aplaste la
   * serie, devolviendo también qué puntos quedaron recortados para poder
   * marcarlos (triángulo ámbar) y decir el valor real en el tooltip.
   */
  C.cap = function (values, max) {
    return {
      values: values.map(function (v) { return v == null ? null : Math.min(v, max); }),
      flags:  values.map(function (v) { return v != null && v > max; }),
      real: values
    };
  };

  /* ── Botón "ocultar todo" ───────────────────────────────────────────── */
  C.bindHideAll = function (key, btnId) {
    var btn = document.getElementById(btnId);
    if (!btn) return;
    btn.onclick = function () {
      var ch = registry[key];
      if (!ch) return;
      var allHidden = ch.data.datasets.every(function (_, i) { return ch.getDatasetMeta(i).hidden; });
      ch.data.datasets.forEach(function (_, i) { ch.getDatasetMeta(i).hidden = !allHidden; });
      ch.update();
      btn.textContent = allHidden ? '● Ocultar todo' : '○ Mostrar todo';
      btn.classList.toggle('all-hidden', !allHidden);
    };
  };

  /* ── Box plot real (caja + bigotes + outliers) ──────────────────────── */

  /**
   * @param {string} key
   * @param {string} canvasId
   * @param {Array<{label:string, values:number[], color?:string}>} groups
   * @param {{yTitle?:string, xTitle?:string, format?:function}} [opts]
   */
  C.boxPlot = function (key, canvasId, groups, opts) {
    opts = opts || {};
    var fmtV = opts.format || function (v) { return v.toFixed(1); };
    var stats = groups.map(function (g) { return S.boxStats(g.values); });
    var keep = [];
    groups.forEach(function (g, i) { if (stats[i]) keep.push(i); });
    var labels = keep.map(function (i) { return groups[i].label; });
    var st = keep.map(function (i) { return stats[i]; });
    var colors = keep.map(function (i, n) { return groups[i].color || PN.PALETTE[n % PN.PALETTE.length]; });

    // La barra flotante es la caja intercuartil; el resto lo dibuja el plugin.
    var boxPlugin = {
      id: 'pn-box',
      afterDatasetsDraw: function (chart) {
        var ctx = chart.ctx, y = chart.scales.y;
        var meta = chart.getDatasetMeta(0);
        if (!meta || !y) return;
        meta.data.forEach(function (bar, i) {
          if (chart.getDatasetMeta(0).hidden) return;
          var s = st[i]; if (!s) return;
          var cx = bar.x, half = (bar.width || 20) / 2;
          ctx.save();
          ctx.strokeStyle = colors[i]; ctx.lineWidth = 1.5;
          // Bigote inferior y superior, hasta el dato real más extremo dentro de las vallas
          [[s.q1, s.whiskerLow], [s.q3, s.whiskerHigh]].forEach(function (pair) {
            var from = y.getPixelForValue(pair[0]), to = y.getPixelForValue(pair[1]);
            ctx.beginPath(); ctx.moveTo(cx, from); ctx.lineTo(cx, to); ctx.stroke();
            ctx.beginPath(); ctx.moveTo(cx - half * 0.45, to); ctx.lineTo(cx + half * 0.45, to); ctx.stroke();
          });
          // Mediana: trazo claro sobre el relleno para que se lea sin ambigüedad
          var my = y.getPixelForValue(s.median);
          ctx.lineWidth = 3.5; ctx.strokeStyle = '#0e1318';
          ctx.beginPath(); ctx.moveTo(cx - half, my); ctx.lineTo(cx + half, my); ctx.stroke();
          ctx.lineWidth = 2; ctx.strokeStyle = '#e8edf5';
          ctx.beginPath(); ctx.moveTo(cx - half, my); ctx.lineTo(cx + half, my); ctx.stroke();
          ctx.strokeStyle = colors[i];
          // Outliers de Tukey
          ctx.fillStyle = '#ff6b6b';
          s.outliers.forEach(function (v) {
            var py = y.getPixelForValue(v);
            if (py < chart.chartArea.top - 2 || py > chart.chartArea.bottom + 2) return;
            ctx.beginPath(); ctx.arc(cx, py, 2.4, 0, Math.PI * 2); ctx.fill();
          });
          ctx.restore();
        });
      }
    };

    var maxWhisker = Math.max.apply(null, st.map(function (s) { return s.whiskerHigh; }));
    var minWhisker = Math.min.apply(null, st.map(function (s) { return s.whiskerLow; }));
    var pad = (maxWhisker - minWhisker) * 0.12 || 1;

    return C.render(key, canvasId, {
      type: 'bar',
      plugins: [boxPlugin],
      data: { labels: labels, datasets: [{
        label: 'Q1–Q3',
        // Barra flotante: Chart.js espera el par [inicio, fin], no base + longitud.
        // Con `base` + (q3−q1) la caja se dibujaba de q1 a (q3−q1) y la mediana
        // acababa fuera de su propia caja.
        data: st.map(function (s) { return [s.q1, s.q3]; }),
        backgroundColor: colors.map(function (c) { return c + '55'; }),
        borderColor: colors, borderWidth: 1.5, borderRadius: 2,
        barPercentage: 0.6, categoryPercentage: 0.8
      }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: Object.assign({}, C.TOOLTIP, { callbacks: {
            title: function (it) { return labels[it[0].dataIndex]; },
            label: function (c) {
              var s = st[c.dataIndex];
              return [
                'Tiempo típico (mediana): ' + fmtV(s.median),
                '25 % más rápidas por debajo de: ' + fmtV(s.q1),
                '25 % más lentas por encima de: ' + fmtV(s.q3),
                'Rango habitual: ' + fmtV(s.whiskerLow) + ' – ' + fmtV(s.whiskerHigh),
                'Casos fuera de patrón: ' + s.outliers.length + ' de ' + s.n,
                'Dispersión (IQR): ' + fmtV(s.iqr)
              ];
            }
          } })
        },
        scales: {
          x: C.axis(opts.xTitle || null, { ticks: { color: '#5a7a99', font: { family: 'DM Mono', size: 9 }, maxRotation: 40 } }),
          y: C.axis(opts.yTitle || null, {
            min: Math.max(0, minWhisker - pad), suggestedMax: maxWhisker + pad,
            ticks: Object.assign({}, C.SCALE.ticks, opts.yTicks || {})
          })
        }
      }
    });
  };

  /* ── Carta de control I-MR ──────────────────────────────────────────── */

  /**
   * @param {Array<{label:string, full:string, value:number|null, n:number}>} points
   * @param {{yTitle?:string, format?:function, weeks?:Array, seriesLabel?:string}} [opts]
   */
  C.controlChart = function (key, canvasId, points, opts) {
    opts = opts || {};
    var fmtV = opts.format || function (v) { return v.toFixed(1) + ' min'; };
    var values = points.map(function (p) { return p.value; });
    var present = values.filter(function (v) { return v != null && isFinite(v); });
    var limits = S.controlLimitsIMR(present, { floorAtZero: opts.floorAtZero });
    if (!limits) return null;
    var flags = S.nelsonRules(values.map(function (v) { return v == null ? NaN : v; }), limits);

    var cap = S.axisCap(present.concat([limits.ucl]), 0.95, 1.25, limits.ucl * 1.05);
    var capped = C.cap(values, cap);
    var ms = opts.weeks ? C.milestonePlugin(opts.weeks) : null;

    var chart = C.render(key, canvasId, {
      type: 'line',
      plugins: ms ? [ms] : [],
      data: {
        labels: points.map(function (p) { return p.label; }),
        datasets: [
          { label: opts.seriesLabel || 'Valor semanal', data: capped.values,
            borderColor: opts.color || '#00e5b4', backgroundColor: 'transparent', borderWidth: 2.5,
            tension: 0.2, spanGaps: false,
            pointRadius: values.map(function (v, i) { return v == null ? 0 : (flags[i].length ? 7 : 4); }),
            pointStyle: capped.flags.map(function (f) { return f ? 'triangle' : 'circle'; }),
            pointBackgroundColor: values.map(function (v, i) {
              if (v == null) return 'transparent';
              if (capped.flags[i]) return '#ffc947';
              return flags[i].length ? '#ff6b6b' : (opts.color || '#00e5b4');
            }) },
          { label: 'Límite superior (LCS)', data: points.map(function () { return Math.min(limits.ucl, cap); }),
            borderColor: '#ff6b6b', borderDash: [6, 3], borderWidth: 1.5, pointRadius: 0, fill: false },
          { label: 'Línea central', data: points.map(function () { return limits.cl; }),
            borderColor: '#ffc947', borderDash: [4, 3], borderWidth: 1.5, pointRadius: 0, fill: false },
          { label: 'Límite inferior (LCI)', data: points.map(function () { return limits.lcl; }),
            borderColor: '#ff6b6b', borderDash: [6, 3], borderWidth: 1.5, pointRadius: 0, fill: false }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: C.legend(true),
          tooltip: Object.assign({}, C.TOOLTIP, { callbacks: {
            title: function (it) { return points[it[0].dataIndex].full || points[it[0].dataIndex].label; },
            label: function (c) {
              if (c.datasetIndex !== 0) return c.dataset.label + ': ' + fmtV(c.raw);
              var i = c.dataIndex, v = values[i];
              if (v == null) return 'Sin datos esa semana';
              var out = [fmtV(v) + '  (' + points[i].n + ' guías)'];
              if (capped.flags[i]) out.push('⚠ fuera de la escala visible');
              if (flags[i].indexOf(1) >= 0) out.push('⚠ Fuera de control: excede los límites 3σ');
              if (flags[i].indexOf(2) >= 0) out.push('⚠ 9 semanas seguidas del mismo lado: el proceso se desplazó');
              if (!flags[i].length) out.push('✓ Dentro de variación normal');
              return out;
            }
          } })
        },
        scales: {
          x: C.axis('SEMANA', { ticks: { color: '#5a7a99', font: { family: 'DM Mono', size: 8 }, maxRotation: 45 } }),
          y: C.axis(opts.yTitle || null, { min: opts.yMin != null ? opts.yMin : 0, max: cap,
                                           ticks: Object.assign({}, C.SCALE.ticks, opts.yTicks || {}) })
        }
      }
    });
    return { chart: chart, limits: limits, flags: flags, cap: cap };
  };

  /* ── Pareto ─────────────────────────────────────────────────────────── */

  /**
   * @param {Array<{label:string, value:number, n:number}>} items ya ordenados desc
   * @param {{valueLabel:string, format?:function}} opts
   */
  C.pareto = function (key, canvasId, items, opts) {
    opts = opts || {};
    var fmtV = opts.format || function (v) { return v.toFixed(0); };
    var total = items.reduce(function (s, it) { return s + it.value; }, 0);
    var cum = 0;
    var pct = items.map(function (it) { cum += it.value; return total ? +(cum / total * 100).toFixed(1) : 0; });
    var reach80 = pct.findIndex(function (p) { return p >= 80; });

    return C.render(key, canvasId, {
      type: 'bar',
      data: {
        labels: items.map(function (it) { return it.label; }),
        datasets: [
          { label: opts.valueLabel || 'Valor', data: items.map(function (it) { return it.value; }),
            backgroundColor: items.map(function (_, i) {
              return (reach80 >= 0 && i <= reach80) ? 'rgba(0,229,180,.6)' : 'rgba(90,122,153,.35)'; }),
            borderColor: items.map(function (_, i) {
              return (reach80 >= 0 && i <= reach80) ? '#00e5b4' : '#5a7a99'; }),
            borderWidth: 1.5, borderRadius: 4, yAxisID: 'y', order: 2 },
          { label: '% acumulado', data: pct, type: 'line', borderColor: '#f97316', borderWidth: 2,
            pointBackgroundColor: '#f97316', pointRadius: 3, tension: 0.25, fill: false, yAxisID: 'y2', order: 1 }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: C.legend(true),
          tooltip: Object.assign({}, C.TOOLTIP, { callbacks: {
            label: function (c) {
              if (c.datasetIndex === 1) return c.raw + ' % acumulado';
              var it = items[c.dataIndex];
              return [(opts.valueLabel || 'Valor') + ': ' + fmtV(it.value), it.n + ' guías'];
            }
          } })
        },
        scales: {
          x: C.axis(opts.xTitle || null, { ticks: { color: '#5a7a99', font: { family: 'DM Mono', size: 9 }, maxRotation: 45 } }),
          y: C.axis(opts.yTitle || null, { beginAtZero: true }),
          y2: { position: 'right', min: 0, max: 100, grid: { display: false },
                ticks: { color: '#f97316', font: { family: 'DM Mono', size: 9 },
                         callback: function (v) { return v + '%'; } } }
        }
      }
    });
  };

  /* ── Histograma con curvas teóricas ─────────────────────────────────── */

  C.histogram = function (key, canvasId, values, opts) {
    opts = opts || {};
    var upper = opts.max != null ? opts.max : S.quantile(values, 0.98);
    var inRange = values.filter(function (v) { return v <= upper; });
    var h = S.histogram(inRange, { width: opts.width, maxBins: opts.maxBins || 20 });
    var norm = S.expectedNormal(h.bins, inRange);
    var logn = S.expectedLognormal(h.bins, inRange);
    var excluded = values.length - inRange.length;

    var ds = [{ label: 'Guías observadas', data: h.bins.map(function (b) { return b.count; }),
                backgroundColor: 'rgba(0,229,180,.45)', borderColor: '#00e5b4', borderWidth: 1.5,
                borderRadius: 3, order: 3 }];
    if (logn) ds.push({ label: 'Log-normal ajustada', type: 'line', data: logn.counts,
                        borderColor: '#00e5b4', borderWidth: 2, pointRadius: 0, tension: 0.4, fill: false, order: 1 });
    if (norm) ds.push({ label: 'Normal ajustada', type: 'line', data: norm.counts,
                        borderColor: '#ffc947', borderDash: [5, 4], borderWidth: 1.5,
                        pointRadius: 0, tension: 0.4, fill: false, order: 2 });

    var chart = C.render(key, canvasId, {
      type: 'bar',
      data: { labels: h.bins.map(function (b) { return opts.labelFn ? opts.labelFn(b) : (b.lo + '–' + b.hi); }), datasets: ds },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: C.legend(true),
          tooltip: Object.assign({}, C.TOOLTIP, { callbacks: {
            label: function (c) {
              return c.datasetIndex === 0 ? c.raw + ' guías'
                   : c.dataset.label + ': ' + (+c.raw).toFixed(1) + ' esperadas';
            }
          } })
        },
        scales: {
          x: C.axis(opts.xTitle || null, { ticks: { color: '#5a7a99', font: { family: 'DM Mono', size: 9 }, maxRotation: 45 } }),
          y: C.axis('N° DE GUÍAS', { beginAtZero: true })
        }
      }
    });
    return { chart: chart, hist: h, excluded: excluded, upper: upper, normal: norm, lognormal: logn };
  };

  /* ── Línea genérica multi-serie ─────────────────────────────────────── */

  C.lines = function (key, canvasId, labels, datasets, opts) {
    opts = opts || {};
    var ms = opts.weeks ? C.milestonePlugin(opts.weeks) : null;
    return C.render(key, canvasId, {
      type: 'line',
      plugins: ms ? [ms] : [],
      data: { labels: labels, datasets: datasets },
      options: Object.assign({
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: C.legend(opts.legend !== false),
          tooltip: Object.assign({}, C.TOOLTIP, opts.tooltip || {})
        },
        scales: {
          x: C.axis(opts.xTitle || null, { ticks: { color: '#5a7a99', font: { family: 'DM Mono', size: 9 }, maxRotation: 45 } }),
          y: C.axis(opts.yTitle || null, opts.y || { beginAtZero: true })
        }
      }, opts.extra || {})
    });
  };

  C.bars = function (key, canvasId, labels, datasets, opts) {
    opts = opts || {};
    return C.render(key, canvasId, {
      type: 'bar',
      data: { labels: labels, datasets: datasets },
      options: Object.assign({
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: C.legend(opts.legend === true),
          tooltip: Object.assign({}, C.TOOLTIP, opts.tooltip || {})
        },
        scales: {
          x: C.axis(opts.xTitle || null, { stacked: !!opts.stacked,
              ticks: { color: '#5a7a99', font: { family: 'DM Mono', size: 9 }, maxRotation: opts.rotate || 45 } }),
          y: C.axis(opts.yTitle || null, Object.assign({ beginAtZero: true, stacked: !!opts.stacked }, opts.y || {}))
        }
      }, opts.extra || {})
    });
  };

})(typeof window !== 'undefined' ? window : globalThis);
