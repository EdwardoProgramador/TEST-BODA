/**
 * builders.js — Constructores de configuración de Chart.js.
 *
 * Cada función devuelve un objeto de configuración; ningún builder toca el DOM.
 * Dibujar es responsabilidad de <ChartCanvas>. Así la forma de cada gráfica se
 * puede probar sin navegador y React controla el ciclo de vida.
 */

import PN from '../lib/calendar.js';
import S from '../lib/stats.js';
import { hour } from '../lib/format.js';

/* ── Tema ────────────────────────────────────────────────────────────────── */

export const TOOLTIP = {
  backgroundColor: '#0e1318',
  borderColor: '#243447',
  borderWidth: 1,
  titleColor: '#e8edf5',
  bodyColor: '#8aa0b8',
  padding: 10
};

const TICKS = { color: '#5a7a99', font: { family: 'DM Mono', size: 10 } };

export function axis(title, extra = {}) {
  const a = { grid: { color: 'rgba(30,45,61,.5)' }, ticks: { ...TICKS } };
  if (title) {
    a.title = { display: true, text: title, color: '#5a7a99', font: { family: 'DM Mono', size: 10 } };
  }
  return { ...a, ...extra };
}

export function legend(display = true, position = 'top') {
  return {
    display,
    position,
    labels: {
      color: '#5a7a99',
      font: { family: 'DM Mono', size: 9 },
      boxWidth: 14,
      padding: 10,
      usePointStyle: true
    }
  };
}

/* ── Hitos ───────────────────────────────────────────────────────────────── */

/**
 * Línea vertical en la frontera entre la última semana previa al hito y la
 * primera semana que ya lo tiene (de ahí el −0.5 sobre el índice).
 */
export function milestonePlugin(weeks) {
  const hits = [];
  PN.MILESTONES.forEach((ms, row) => {
    const i = weeks.findIndex((w) => w.mes === ms.firstWeek.mes && w.week === ms.firstWeek.week);
    if (i >= 0) hits.push({ pos: i - 0.5, color: ms.color, label: ms.label, row });
  });
  if (!hits.length) return null;

  return {
    id: 'pn-milestones',
    afterDatasetsDraw(chart) {
      const { ctx, chartArea: area, scales } = chart;
      if (!area || !scales.x) return;
      hits.forEach((h) => {
        const x = scales.x.getPixelForValue(h.pos);
        if (!isFinite(x) || x < area.left || x > area.right) return;
        ctx.save();
        ctx.setLineDash([5, 4]);
        ctx.strokeStyle = h.color;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(x, area.top);
        ctx.lineTo(x, area.bottom);
        ctx.stroke();
        ctx.setLineDash([]);
        ctx.fillStyle = h.color;
        ctx.font = 'bold 8px DM Mono, monospace';
        const right = x > (area.left + area.right) / 2;
        ctx.textAlign = right ? 'right' : 'left';
        ctx.fillText(h.label, x + (right ? -6 : 6), area.top + 12 + h.row * 12);
        ctx.restore();
      });
    }
  };
}

/* ── Recorte de escala ───────────────────────────────────────────────────── */

/**
 * Recorta a un tope para que un outlier extremo no aplaste la serie, marcando
 * qué puntos quedaron recortados para poder señalarlos y decir el valor real.
 */
export function cap(values, max) {
  return {
    values: values.map((v) => (v == null ? null : Math.min(v, max))),
    flags: values.map((v) => v != null && v > max),
    real: values
  };
}

/* ── Box plot ────────────────────────────────────────────────────────────── */

/**
 * Box plot completo. La caja es una barra flotante [q1, q3] y el plugin dibuja
 * bigotes, mediana y outliers, que la versión anterior calculaba sin pintar.
 */
export function boxPlotConfig(groups, opts = {}) {
  const fmtV = opts.format || ((v) => v.toFixed(1));
  const valid = groups.map((g) => ({ g, s: S.boxStats(g.values) })).filter((x) => x.s);
  if (!valid.length) return null;

  const labels = valid.map((x) => x.g.label);
  const st = valid.map((x) => x.s);
  const colors = valid.map((x, i) => x.g.color || PN.PALETTE[i % PN.PALETTE.length]);

  const boxPlugin = {
    id: 'pn-box',
    afterDatasetsDraw(chart) {
      const { ctx, scales } = chart;
      const meta = chart.getDatasetMeta(0);
      if (!meta || meta.hidden || !scales.y) return;
      const y = scales.y;
      meta.data.forEach((bar, i) => {
        const s = st[i];
        if (!s) return;
        const cx = bar.x;
        const half = (bar.width || 20) / 2;
        ctx.save();
        ctx.strokeStyle = colors[i];
        ctx.lineWidth = 1.5;
        // Bigotes: hasta el dato real más extremo dentro de las vallas de Tukey
        [[s.q1, s.whiskerLow], [s.q3, s.whiskerHigh]].forEach(([from, to]) => {
          const py0 = y.getPixelForValue(from);
          const py1 = y.getPixelForValue(to);
          ctx.beginPath(); ctx.moveTo(cx, py0); ctx.lineTo(cx, py1); ctx.stroke();
          ctx.beginPath();
          ctx.moveTo(cx - half * 0.45, py1);
          ctx.lineTo(cx + half * 0.45, py1);
          ctx.stroke();
        });
        // Mediana, con contorno oscuro para que se lea sobre el relleno
        const my = y.getPixelForValue(s.median);
        ctx.lineWidth = 3.5; ctx.strokeStyle = '#0e1318';
        ctx.beginPath(); ctx.moveTo(cx - half, my); ctx.lineTo(cx + half, my); ctx.stroke();
        ctx.lineWidth = 2; ctx.strokeStyle = '#e8edf5';
        ctx.beginPath(); ctx.moveTo(cx - half, my); ctx.lineTo(cx + half, my); ctx.stroke();
        // Outliers formales
        ctx.fillStyle = '#ff6b6b';
        s.outliers.forEach((v) => {
          const py = y.getPixelForValue(v);
          if (py < chart.chartArea.top - 2 || py > chart.chartArea.bottom + 2) return;
          ctx.beginPath(); ctx.arc(cx, py, 2.4, 0, Math.PI * 2); ctx.fill();
        });
        ctx.restore();
      });
    }
  };

  const hi = Math.max(...st.map((s) => s.whiskerHigh));
  const lo = Math.min(...st.map((s) => s.whiskerLow));
  const pad = (hi - lo) * 0.12 || 1;

  return {
    type: 'bar',
    plugins: [boxPlugin],
    data: {
      labels,
      datasets: [{
        label: 'Q1–Q3',
        // Chart.js espera el par [inicio, fin]; con base + longitud la mediana
        // acababa dibujada fuera de su propia caja.
        data: st.map((s) => [s.q1, s.q3]),
        backgroundColor: colors.map((c) => c + '55'),
        borderColor: colors,
        borderWidth: 1.5,
        borderRadius: 2,
        barPercentage: 0.6,
        categoryPercentage: 0.8
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: { display: false },
        tooltip: {
          ...TOOLTIP,
          callbacks: {
            title: (it) => labels[it[0].dataIndex],
            label: (c) => {
              const s = st[c.dataIndex];
              return [
                `Tiempo típico (mediana): ${fmtV(s.median)}`,
                `25 % más rápidas por debajo de: ${fmtV(s.q1)}`,
                `25 % más lentas por encima de: ${fmtV(s.q3)}`,
                `Rango habitual: ${fmtV(s.whiskerLow)} – ${fmtV(s.whiskerHigh)}`,
                `Casos fuera de patrón: ${s.outliers.length} de ${s.n}`,
                `Dispersión (IQR): ${fmtV(s.iqr)}`
              ];
            }
          }
        }
      },
      scales: {
        x: axis(opts.xTitle, { ticks: { ...TICKS, font: { family: 'DM Mono', size: 9 }, maxRotation: 40 } }),
        y: axis(opts.yTitle, {
          min: Math.max(opts.floorAtZero === false ? -Infinity : 0, lo - pad),
          suggestedMax: hi + pad,
          ticks: { ...TICKS, ...(opts.yTicks || {}) }
        })
      }
    }
  };
}

/* ── Carta de control I-MR ───────────────────────────────────────────────── */

export function controlChartConfig(points, opts = {}) {
  const fmtV = opts.format || ((v) => `${v.toFixed(1)} min`);
  const values = points.map((p) => p.value);
  const present = values.filter((v) => v != null && isFinite(v));
  const limits = S.controlLimitsIMR(present, { floorAtZero: opts.floorAtZero });
  if (!limits) return null;

  const flags = S.nelsonRules(values.map((v) => (v == null ? NaN : v)), limits);
  const top = S.axisCap(present.concat([limits.ucl]), 0.95, 1.25, limits.ucl * 1.05);
  const c = cap(values, top);
  const ms = opts.weeks ? milestonePlugin(opts.weeks) : null;

  const yMin = opts.yMin != null
    ? opts.yMin
    : opts.floorAtZero === false
      ? Math.floor((Math.min(limits.lcl, ...present) - 0.15) * 4) / 4
      : 0;
  const yMax = opts.floorAtZero === false
    ? Math.ceil((Math.max(limits.ucl, ...present) + 0.15) * 4) / 4
    : top;

  const config = {
    type: 'line',
    plugins: ms ? [ms] : [],
    data: {
      labels: points.map((p) => p.label),
      datasets: [
        {
          label: opts.seriesLabel || 'Valor semanal',
          data: c.values,
          borderColor: opts.color || '#00e5b4',
          backgroundColor: 'transparent',
          borderWidth: 2.5,
          tension: 0.2,
          spanGaps: false,
          pointRadius: values.map((v, i) => (v == null ? 0 : flags[i].length ? 7 : 4)),
          pointStyle: c.flags.map((f) => (f ? 'triangle' : 'circle')),
          pointBackgroundColor: values.map((v, i) => {
            if (v == null) return 'transparent';
            if (c.flags[i]) return '#ffc947';
            return flags[i].length ? '#ff6b6b' : opts.color || '#00e5b4';
          })
        },
        {
          label: 'Límite superior (LCS)',
          data: points.map(() => Math.min(limits.ucl, yMax)),
          borderColor: '#ff6b6b', borderDash: [6, 3], borderWidth: 1.5, pointRadius: 0, fill: false
        },
        {
          label: 'Línea central',
          data: points.map(() => limits.cl),
          borderColor: '#ffc947', borderDash: [4, 3], borderWidth: 1.5, pointRadius: 0, fill: false
        },
        {
          label: 'Límite inferior (LCI)',
          data: points.map(() => limits.lcl),
          borderColor: '#ff6b6b', borderDash: [6, 3], borderWidth: 1.5, pointRadius: 0, fill: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: legend(true),
        tooltip: {
          ...TOOLTIP,
          callbacks: {
            title: (it) => points[it[0].dataIndex].full || points[it[0].dataIndex].label,
            label: (ctx) => {
              if (ctx.datasetIndex !== 0) return `${ctx.dataset.label}: ${fmtV(ctx.raw)}`;
              const i = ctx.dataIndex;
              const v = values[i];
              if (v == null) return 'Sin datos esa semana';
              const out = [`${fmtV(v)}  (${points[i].n} guías)`];
              if (c.flags[i]) out.push('⚠ fuera de la escala visible');
              if (flags[i].includes(1)) out.push('⚠ Fuera de control: excede los límites 3σ');
              if (flags[i].includes(2)) out.push('⚠ Nueve semanas seguidas del mismo lado: el proceso se desplazó');
              if (!flags[i].length) out.push('✓ Dentro de variación normal');
              return out;
            }
          }
        }
      },
      scales: {
        x: axis('SEMANA', { ticks: { ...TICKS, font: { family: 'DM Mono', size: 8 }, maxRotation: 45 } }),
        y: axis(opts.yTitle, { min: yMin, max: yMax, ticks: { ...TICKS, ...(opts.yTicks || {}) } })
      }
    }
  };

  return { config, limits, flags, cap: top };
}

/* ── Pareto ──────────────────────────────────────────────────────────────── */

export function paretoConfig(items, opts = {}) {
  const fmtV = opts.format || ((v) => v.toFixed(0));
  const total = items.reduce((s, it) => s + it.value, 0);
  let cum = 0;
  const pct = items.map((it) => {
    cum += it.value;
    return total ? +((cum / total) * 100).toFixed(1) : 0;
  });
  const reach80 = pct.findIndex((p) => p >= 80);

  return {
    type: 'bar',
    data: {
      labels: items.map((it) => it.label),
      datasets: [
        {
          label: opts.valueLabel || 'Valor',
          data: items.map((it) => it.value),
          backgroundColor: items.map((_, i) =>
            reach80 >= 0 && i <= reach80 ? 'rgba(0,229,180,.6)' : 'rgba(90,122,153,.35)'
          ),
          borderColor: items.map((_, i) => (reach80 >= 0 && i <= reach80 ? '#00e5b4' : '#5a7a99')),
          borderWidth: 1.5, borderRadius: 4, yAxisID: 'y', order: 2
        },
        {
          label: '% acumulado', data: pct, type: 'line',
          borderColor: '#f97316', borderWidth: 2, pointBackgroundColor: '#f97316',
          pointRadius: 3, tension: 0.25, fill: false, yAxisID: 'y2', order: 1
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: legend(true),
        tooltip: {
          ...TOOLTIP,
          callbacks: {
            label: (c) => {
              if (c.datasetIndex === 1) return `${c.raw} % acumulado`;
              const it = items[c.dataIndex];
              return [`${opts.valueLabel || 'Valor'}: ${fmtV(it.value)}`, `${it.n} guías`];
            }
          }
        }
      },
      scales: {
        x: axis(opts.xTitle, { ticks: { ...TICKS, font: { family: 'DM Mono', size: 9 }, maxRotation: 45 } }),
        y: axis(opts.yTitle, { beginAtZero: true }),
        y2: {
          position: 'right', min: 0, max: 100, grid: { display: false },
          ticks: { color: '#f97316', font: { family: 'DM Mono', size: 9 }, callback: (v) => `${v}%` }
        }
      }
    }
  };
}

/* ── Histograma con curvas ajustadas ─────────────────────────────────────── */

export function histogramConfig(values, opts = {}) {
  const upper = opts.max != null ? opts.max : S.quantile(values, 0.98);
  const inRange = values.filter((v) => v <= upper);
  if (!inRange.length) return null;

  const h = S.histogram(inRange, { width: opts.width, maxBins: opts.maxBins || 20 });
  const norm = S.expectedNormal(h.bins, inRange);
  const logn = S.expectedLognormal(h.bins, inRange);

  const datasets = [{
    label: 'Guías observadas',
    data: h.bins.map((b) => b.count),
    backgroundColor: 'rgba(0,229,180,.45)', borderColor: '#00e5b4',
    borderWidth: 1.5, borderRadius: 3, order: 3
  }];
  if (logn) datasets.push({
    label: 'Log-normal ajustada', type: 'line', data: logn.counts,
    borderColor: '#00e5b4', borderWidth: 2, pointRadius: 0, tension: 0.4, fill: false, order: 1
  });
  if (norm) datasets.push({
    label: 'Normal ajustada', type: 'line', data: norm.counts,
    borderColor: '#ffc947', borderDash: [5, 4], borderWidth: 1.5,
    pointRadius: 0, tension: 0.4, fill: false, order: 2
  });

  return {
    hist: h, normal: norm, lognormal: logn,
    excluded: values.length - inRange.length, upper,
    config: {
      type: 'bar',
      data: { labels: h.bins.map((b) => (opts.labelFn ? opts.labelFn(b) : `${b.lo}–${b.hi}`)), datasets },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
          legend: legend(true),
          tooltip: {
            ...TOOLTIP,
            callbacks: {
              label: (c) =>
                c.datasetIndex === 0
                  ? `${c.raw} guías`
                  : `${c.dataset.label}: ${(+c.raw).toFixed(1)} esperadas`
            }
          }
        },
        scales: {
          x: axis(opts.xTitle, { ticks: { ...TICKS, font: { family: 'DM Mono', size: 9 }, maxRotation: 45 } }),
          y: axis('N° DE GUÍAS', { beginAtZero: true })
        }
      }
    }
  };
}

/* ── Genéricos ───────────────────────────────────────────────────────────── */

export function lineConfig(labels, datasets, opts = {}) {
  const ms = opts.weeks ? milestonePlugin(opts.weeks) : null;
  return {
    type: 'line',
    plugins: ms ? [ms] : [],
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: legend(opts.legend !== false),
        tooltip: { ...TOOLTIP, ...(opts.tooltip || {}) }
      },
      scales: {
        x: axis(opts.xTitle, { ticks: { ...TICKS, font: { family: 'DM Mono', size: 9 }, maxRotation: 45 } }),
        y: axis(opts.yTitle, opts.y || { beginAtZero: true })
      },
      ...(opts.extra || {})
    }
  };
}

export function barConfig(labels, datasets, opts = {}) {
  return {
    type: 'bar',
    plugins: opts.plugins || [],
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: legend(opts.legend === true),
        tooltip: { ...TOOLTIP, ...(opts.tooltip || {}) }
      },
      scales: {
        x: axis(opts.xTitle, {
          stacked: !!opts.stacked,
          ticks: { ...TICKS, font: { family: 'DM Mono', size: 9 }, maxRotation: opts.rotate ?? 45 }
        }),
        y: axis(opts.yTitle, { beginAtZero: true, stacked: !!opts.stacked, ...(opts.y || {}) })
      },
      ...(opts.extra || {})
    }
  };
}

export { hour };
