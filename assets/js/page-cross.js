/* ==========================================================================
   page-cross.js — Cross Data: cruza ambos reportes por número de guía.
   Pregunta central: ¿cuando los documentos llegan tarde, el equipo tarda más?
   ========================================================================== */
(function (global) {
  'use strict';
  var PN = global.PN, S = PN.stats, C = PN.charts, ui = PN.ui, store = PN.store, fmt = PN.fmt;
  var $ = ui.$;
  var state = { colorBy: 'p' };

  function init() {
    store.init();
    C.applyTheme();
    ui.mount({ report: 'x', onPeriod: renderAll });
    $('xCB').onchange = function () { state.colorBy = this.value; drawScatter(); };
    renderAll();
  }

  function renderAll() { drawKPIs(); drawScatter(); drawPareto(); drawWeekly(); }

  function pairs() {
    return store.crossPairs().filter(function (p) { return p.docs != null; });
  }

  /* ── KPIs ───────────────────────────────────────────────────────────── */
  function drawKPIs() {
    var all = store.crossPairs();
    var p = pairs();
    var host = $('kpiGrid');
    if (!all.length) { host.innerHTML = '<div class="empty"><span class="e-ico">📭</span><p>Sin guías cruzables en este periodo</p></div>'; return; }

    var horas = p.map(function (x) { return x.docs; });
    var mins  = p.map(function (x) { return x.minutos; });
    var pear = S.pearson(horas, mins);
    var spear = S.spearman(horas, mins);

    var hintR = '<b style="color:#f97316">CORRELACIÓN</b><br><br>' +
      'Pearson mide relación lineal; Spearman mide relación monótona sobre rangos y aguanta ' +
      'los outliers, por eso aquí manda Spearman.<br><br>' +
      'r cerca de 0 = las dos cosas no se mueven juntas.<br>' +
      'El p-valor dice si lo observado podría deberse al azar: p &gt; 0.05 significa que ni siquiera ' +
      'se distingue del ruido.';

    var cards = [
      { c: '#f97316', lbl: 'Guías en ambos reportes', val: fmt.int(all.length),
        sub: p.length + ' con hora de recepción utilizable' },
      { c: '#4d7cfe', lbl: 'Hora media de llegada', val: horas.length ? fmt.hour(S.mean(horas)) : '—',
        sub: 'mediana ' + (horas.length ? fmt.hour(S.median(horas)) : '—') + ' hrs' },
      { c: '#00e5b4', lbl: 'Mediana de elaboración', val: mins.length ? Math.round(S.median(mins)) + ' min' : '—',
        sub: 'sobre las guías cruzadas' },
      { c: '#f97316', lbl: 'Correlación ℹ',
        val: spear ? spear.r.toFixed(3) : '—',
        sub: spear ? ('Spearman ρ · ' + S.formatP(spear.p) + ' · n = ' + spear.n) : 'muestra insuficiente',
        hint: hintR }
    ];
    host.innerHTML = cards.map(function (k) {
      return '<div class="kpi"><div class="klbl">' + k.lbl + '</div>' +
             '<div class="kval">' + k.val + '</div><div class="ksub">' + k.sub + '</div></div>';
    }).join('');
    host.querySelectorAll('.kpi').forEach(function (el, i) {
      el.style.setProperty('--kc', cards[i].c);
      if (cards[i].hint) { el.setAttribute('data-hint', cards[i].hint); el.style.cursor = 'help'; }
    });

    // Veredicto explícito
    var v = $('xVerdict');
    if (!spear || !pear) { v.className = 'verdict warn'; v.innerHTML = 'Muestra insuficiente para concluir.'; return; }
    var hay = spear.p < 0.05 && Math.abs(spear.r) >= 0.2;
    v.className = 'verdict ' + (hay ? 'warn' : 'ok');
    v.innerHTML = '<span class="v-tag">' + (hay ? 'Sí hay relación' : 'No hay relación') + '</span>' +
      'Con <b>n = ' + spear.n + '</b> parejas, Spearman ρ = <b>' + spear.r.toFixed(3) + '</b> (' +
      S.describeR(spear.r) + '), ' + S.formatP(spear.p) + '. Pearson r = ' + pear.r.toFixed(3) +
      ' (' + S.formatP(pear.p) + '), que explica apenas el <b>' + (pear.r2 * 100).toFixed(1) +
      '%</b> de la variación.<br><br>' +
      (hay
        ? 'La hora de llegada de los documentos sí mueve el tiempo de elaboración: vale la pena atacar los retrasos de Shipping.'
        : 'La hora a la que llegan los documentos <b>no explica</b> cuánto tarda el equipo en elaborar. ' +
          'El tiempo de elaboración depende del propio proceso (herramientas, tipo de embarque, incidencias), ' +
          'no de que Shipping entregue antes o después. Esto justifica que las mejoras se hayan hecho del lado ' +
          'de la elaboración y no presionando a Shipping.');
  }

  /* ── Scatter con recta de regresión ─────────────────────────────────── */
  function drawScatter() {
    var p = pairs();
    if (!p.length) { C.destroy('xs'); return; }
    var groups = {};
    p.forEach(function (x) {
      var k = state.colorBy === 'p' ? x.persona
            : state.colorBy === 't' ? x.tipo
            : PN.MONTHS[x.mes];
      (groups[k] = groups[k] || []).push(x);
    });
    var capY = S.axisCap(p.map(function (x) { return x.minutos; }), 0.97, 1.3, 60);

    var datasets = Object.keys(groups).map(function (k, i) {
      var color = state.colorBy === 'p' ? store.colorFor(k) : PN.PALETTE[i % PN.PALETTE.length];
      return {
        label: k.split(',')[0].slice(0, 18), type: 'scatter',
        backgroundColor: color + '99', borderColor: color, borderWidth: 1, pointRadius: 4,
        data: groups[k].map(function (x) {
          return { x: x.docs, y: Math.min(x.minutos, capY), _r: x };
        })
      };
    });

    var reg = S.linreg(p.map(function (x) { return x.docs; }), p.map(function (x) { return x.minutos; }));
    if (reg) {
      var xs = p.map(function (x) { return x.docs; });
      var x0 = Math.min.apply(null, xs), x1 = Math.max.apply(null, xs);
      datasets.push({
        label: 'Recta de ajuste', type: 'line', borderColor: '#ffc947', borderDash: [6, 3],
        borderWidth: 2, pointRadius: 0, fill: false,
        data: [{ x: x0, y: Math.min(reg.intercept + reg.slope * x0, capY) },
               { x: x1, y: Math.min(reg.intercept + reg.slope * x1, capY) }]
      });
    }

    C.destroy('xs');
    C.render('xs', 'xSC', {
      type: 'scatter',
      data: { datasets: datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: C.legend(true),
          tooltip: Object.assign({}, C.TOOLTIP, { callbacks: { label: function (c) {
            if (!c.raw._r) return 'Ajuste lineal';
            var r = c.raw._r;
            return ['Guía ' + r.guia + ' · ' + r.persona.split(' ')[0],
                    'Docs a las ' + fmt.hour(r.docs) + ' hrs',
                    'Elaboración: ' + r.minutos.toFixed(1) + ' min' + (r.minutos > capY ? ' ⚠ fuera de escala' : ''),
                    r.tipo];
          } } })
        },
        scales: {
          x: C.axis('HORA DE LLEGADA DE DOCS', { ticks: { color: '#4d7cfe',
              font: { family: 'DM Mono', size: 10 }, callback: function (v) { return fmt.hour(v); } } }),
          y: C.axis('MINUTOS DE ELABORACIÓN', { beginAtZero: true, max: capY })
        }
      }
    });
    $('xscNote').innerHTML = reg
      ? 'Pendiente de la recta: <b>' + reg.slope.toFixed(1) + ' min por cada hora de retraso</b>. ' +
        'Si la nube no sigue la recta, la pendiente no significa nada — mírala junto al coeficiente de arriba.'
      : '';
  }

  /* ── Pareto combinado ───────────────────────────────────────────────── */
  function drawPareto() {
    var p = store.crossPairs();
    if (!p.length) { C.destroy('xp'); return; }
    var g = {};
    p.forEach(function (x) {
      var k = x.tipo || '—';
      var e = g[k] = g[k] || { n: 0, min: 0, tarde: 0 };
      e.n++; e.min += x.minutos;
      if (x.docs != null && x.docs > 7) e.tarde++;
    });
    var items = Object.keys(g).map(function (k) {
      return { label: k.split(',')[0].slice(0, 16), n: g[k].n, value: g[k].min, tarde: g[k].tarde };
    }).sort(function (a, b) { return b.value - a.value; });

    C.destroy('xp');
    var total = items.reduce(function (s, i) { return s + i.value; }, 0), cum = 0;
    var pct = items.map(function (i) { cum += i.value; return +(cum / total * 100).toFixed(1); });
    C.render('xp', 'xPA', {
      type: 'bar',
      data: { labels: items.map(function (i) { return i.label; }), datasets: [
        { label: 'Minutos totales de elaboración', data: items.map(function (i) { return Math.round(i.value); }),
          backgroundColor: 'rgba(249,115,22,.45)', borderColor: '#f97316', borderWidth: 1.5,
          borderRadius: 4, yAxisID: 'y', order: 3 },
        { label: 'Guías con docs después de las 07:00', data: items.map(function (i) { return i.tarde; }),
          backgroundColor: 'rgba(77,124,254,.5)', borderColor: '#4d7cfe', borderWidth: 1.5,
          borderRadius: 4, yAxisID: 'y2', order: 2 },
        { label: '% acumulado del tiempo', data: pct, type: 'line', borderColor: '#ffc947',
          borderWidth: 2, pointRadius: 3, tension: 0.25, fill: false, yAxisID: 'y3', order: 1 }
      ] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: C.legend(true), tooltip: Object.assign({}, C.TOOLTIP, { callbacks: {
          label: function (c) {
            var it = items[c.dataIndex];
            if (c.datasetIndex === 0) return Math.round(it.value) + ' min en total (' + it.n + ' guías)';
            if (c.datasetIndex === 1) return it.tarde + ' de ' + it.n + ' guías con docs tardíos';
            return c.raw + ' % acumulado';
          } } }) },
        scales: {
          x: C.axis('TIPO DE EMBARQUE', { ticks: { color: '#5a7a99', font: { family: 'DM Mono', size: 8 }, maxRotation: 45 } }),
          y: C.axis('MINUTOS', { beginAtZero: true }),
          y2: { display: false, beginAtZero: true },
          y3: { position: 'right', min: 0, max: 100, grid: { display: false },
                ticks: { color: '#ffc947', font: { family: 'DM Mono', size: 9 },
                         callback: function (v) { return v + '%'; } } }
        }
      }
    });
  }

  /* ── Correlación a nivel semana ─────────────────────────────────────── */
  function drawWeekly() {
    var wg = {};
    store.weeklyGlobal().forEach(function (r) { wg[r.mes + '|' + r.week_label] = r; });
    var pts = [];
    store.shippingWeekly().forEach(function (s) {
      var t = wg[s.mes + '|' + s.week_label];
      if (t && s.dec_docs != null) {
        pts.push({ x: s.dec_docs, y: t.median_minutes, label: PN.longWeek(s.mes, s.week_label), n: t.count });
      }
    });
    if (pts.length < 3) { C.destroy('xc'); return; }
    var cor = S.spearman(pts.map(function (p) { return p.x; }), pts.map(function (p) { return p.y; }));

    C.destroy('xc');
    C.render('xc', 'xCR', {
      type: 'scatter',
      data: { datasets: [{ label: 'Semanas', data: pts,
        backgroundColor: 'rgba(249,115,22,.6)', borderColor: '#f97316', pointRadius: 6, borderWidth: 1.5 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: Object.assign({}, C.TOOLTIP, { callbacks: {
          label: function (c) {
            return [c.raw.label, 'Docs: ' + fmt.hour(c.raw.x) + ' hrs',
                    'Mediana de elaboración: ' + c.raw.y.toFixed(1) + ' min (' + c.raw.n + ' guías)'];
          } } }) },
        scales: {
          x: C.axis('HORA MEDIA DE DOCS', { ticks: { color: '#4d7cfe', font: { family: 'DM Mono', size: 9 },
              callback: function (v) { return fmt.hour(v); } } }),
          y: C.axis('MEDIANA SEMANAL (min)', { beginAtZero: true })
        }
      }
    });
    $('xcrNote').innerHTML = cor
      ? 'A nivel semana: Spearman ρ = <b>' + cor.r.toFixed(3) + '</b> (' + S.describeR(cor.r) + '), ' +
        S.formatP(cor.p) + ' con ' + cor.n + ' semanas. Agregar por semana reduce el ruido de cada guía, ' +
        'pero también deja muy pocos puntos: conviene leerlo junto al scatter de arriba, no en lugar de él.'
      : '';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})(typeof window !== 'undefined' ? window : globalThis);
