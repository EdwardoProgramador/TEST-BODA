/* ==========================================================================
   page-shipping.js — Reporte "Recepción de Documentos Shipping".
   A qué hora llegan los documentos y los datos de transporte cada día.
   ========================================================================== */
(function (global) {
  'use strict';
  var PN = global.PN, S = PN.stats, C = PN.charts, ui = PN.ui, store = PN.store, fmt = PN.fmt;
  var $ = ui.$;

  var DOCS = '#4d7cfe', TRANS = '#00e5b4';
  var state = {
    tab: 'tabOp', section: 'cc',
    detMonth: '', detWeek: '', detDay: '',
    ccSerie: 'docs', bpGroup: 'tipo', paMetric: 'docs'
  };
  var SECTIONS = [
    { id: 'cc', label: 'Carta de control' },
    { id: 'bp', label: 'Box plot' },
    { id: 'pa', label: 'Pareto' },
    { id: 'td', label: 'Tendencia' },
    { id: 'di', label: 'Distribución' }
  ];

  function init() {
    store.init();
    C.applyTheme();
    ui.mount({ report: 'm', onPeriod: renderAll });
    ui.mainTabs('mainTabs', ['tabOp', 'tabSt'], function (t) {
      state.tab = t; if (t === 'tabSt') renderStats();
    });
    ui.sectionNav('statNav', SECTIONS, state.section, function (id) {
      state.section = id; ui.showSection('statSections', 'ss-' + id); renderStats();
    });
    ui.showSection('statSections', 'ss-' + state.section);

    $('ccSerie').onchange = function () { state.ccSerie = this.value; drawControl(); };
    $('bpGrp').onchange   = function () { state.bpGroup = this.value; drawBoxPlot(); };
    $('paMetric').onchange = function () { state.paMetric = this.value; drawPareto(); };
    ['mMes', 'mSem', 'mDia'].forEach(function (id) {
      $(id).onchange = function () {
        if (id === 'mMes') { state.detMonth = this.value; state.detWeek = ''; state.detDay = ''; }
        if (id === 'mSem') { state.detWeek = this.value; state.detDay = ''; }
        if (id === 'mDia') { state.detDay = this.value; }
        buildDetailFilters(); drawDetail();
      };
    });
    renderAll();
  }

  function renderAll() {
    drawKPIs(); drawTrend(); drawVolume(); drawSummary();
    buildDetailFilters(); drawDetail();
    if (state.tab === 'tabSt') renderStats();
  }
  function renderStats() {
    if (state.section === 'cc') drawControl();
    else if (state.section === 'bp') drawBoxPlot();
    else if (state.section === 'pa') drawPareto();
    else if (state.section === 'td') drawTendency();
    else if (state.section === 'di') drawDistribution();
  }

  /* ── KPIs mensuales ─────────────────────────────────────────────────── */
  function drawKPIs() {
    var rows = store.shippingMonthly();
    if (store.period !== 'all') rows = rows.filter(function (r) { return r.mes === store.period; });
    var host = $('kpiGrid');
    if (!rows.length) { host.innerHTML = '<div class="empty"><span class="e-ico">📭</span><p>Sin recepciones en este periodo</p></div>'; return; }
    host.innerHTML = rows.map(function (m) {
      return '<div class="kpi" style="--kc:' + DOCS + '">' +
        '<div class="klbl">' + m.mes_nombre + '</div>' +
        '<div class="mkrow"><div class="mkdot" style="background:' + DOCS + '"></div>' +
          '<span class="mklbl">Recepción de docs</span>' +
          '<span class="mktime" style="color:' + DOCS + '">' + fmt.hour(m.dec_docs) + '</span></div>' +
        '<div class="mkrow"><div class="mkdot" style="background:' + TRANS + '"></div>' +
          '<span class="mklbl">Datos de transporte</span>' +
          '<span class="mktime" style="color:' + TRANS + '">' + fmt.hour(m.dec_trans) + '</span></div>' +
        '<div class="mkcnt">' + m.n_guias + ' guías · ' + m.n_docs + ' con hora de docs</div></div>';
    }).join('');
  }

  /* ── Hora promedio por semana ───────────────────────────────────────── */
  function drawTrend() {
    var series = store.shippingSeries();
    var all = [];
    series.forEach(function (p) { if (p.docs != null) all.push(p.docs); if (p.trans != null) all.push(p.trans); });
    if (!all.length) { C.destroy('mtrend'); return; }
    var lo = Math.floor((Math.min.apply(null, all) - 0.3) * 4) / 4;
    var hi = Math.ceil((Math.max.apply(null, all) + 0.3) * 4) / 4;

    C.lines('mtrend', 'mTrend', series.map(function (p) { return p.label; }), [
      { label: 'Recepción de docs', data: series.map(function (p) { return p.docs; }),
        borderColor: DOCS, backgroundColor: 'rgba(77,124,254,.10)', borderWidth: 2.5,
        pointRadius: 4, tension: 0.3, fill: true, spanGaps: false },
      { label: 'Datos de transporte', data: series.map(function (p) { return p.trans; }),
        borderColor: TRANS, backgroundColor: 'rgba(0,229,180,.07)', borderWidth: 2.5,
        pointRadius: 4, tension: 0.3, fill: true, spanGaps: false }
    ], {
      weeks: series, xTitle: 'SEMANA', yTitle: 'HORA DEL DÍA',
      y: { min: lo, max: hi, ticks: { color: '#5a7a99', font: { family: 'DM Mono', size: 10 },
           stepSize: 0.25, callback: function (v) { return fmt.hour(v); } } },
      tooltip: { callbacks: {
        title: function (it) { return series[it[0].dataIndex].full; },
        label: function (c) {
          if (c.raw == null) return c.dataset.label + ': sin registro';
          var p = series[c.dataIndex];
          return c.dataset.label + ': ' + fmt.hour(c.raw) + ' hrs  (' + p.n + ' guías · ' + p.rango + ')';
        } } }
    });
  }

  /* ── Volumen (sólo con un mes seleccionado) ─────────────────────────── */
  function drawVolume() {
    var wrap = $('volWrap');
    if (store.period === 'all') { wrap.classList.add('hidden'); C.destroy('mdia'); C.destroy('mvm'); return; }
    wrap.classList.remove('hidden');

    var rows = store.m();
    var dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    var counts = [0, 0, 0, 0, 0];
    rows.forEach(function (r) {
      if (!r.fecha_docs) return;
      var d = new Date(r.fecha_docs + 'T00:00:00').getDay();
      if (d >= 1 && d <= 5) counts[d - 1]++;
    });
    var cs = [DOCS, TRANS, '#a78bfa', '#ffc947', '#ff6b6b'];
    C.bars('mdia', 'mDiaChart', dias, [{ data: counts,
      backgroundColor: cs.map(function (c) { return c + '99'; }), borderColor: cs,
      borderWidth: 2, borderRadius: 6 }],
      { xTitle: 'DÍA DE LA SEMANA', yTitle: 'N° DE GUÍAS', rotate: 0,
        tooltip: { callbacks: { label: function (c) { return c.raw + ' guías'; } } } });

    var wk = store.shippingWeekly().filter(function (r) { return r.mes === store.period; });
    C.bars('mvm', 'mVM', wk.map(function (r) { return r.week_label + ' · ' + r.rango; }),
      [{ data: wk.map(function (r) { return r.n_guias; }),
         backgroundColor: 'rgba(77,124,254,.5)', borderColor: DOCS, borderWidth: 1.5, borderRadius: 4 }],
      { xTitle: 'SEMANA', yTitle: 'N° DE GUÍAS', rotate: 25,
        tooltip: { callbacks: { label: function (c) { return c.raw + ' guías'; } } } });
  }

  /* ── Resumen semanal ────────────────────────────────────────────────── */
  function drawSummary() {
    var weekly = store.shippingWeekly();
    var monthly = store.shippingMonthly();
    if (store.period !== 'all') {
      weekly = weekly.filter(function (r) { return r.mes === store.period; });
      monthly = monthly.filter(function (r) { return r.mes === store.period; });
    }
    var tb = $('mSumTbl');
    if (!weekly.length) { tb.innerHTML = ui.emptyRow(6); return; }
    var byMonth = {};
    weekly.forEach(function (r) { (byMonth[r.mes] = byMonth[r.mes] || []).push(r); });
    var html = '';
    Object.keys(byMonth).sort(function (a, b) { return a - b; }).forEach(function (m) {
      var last = '';
      byMonth[m].forEach(function (r) {
        html += '<tr>' +
          '<td>' + (r.mes_nombre !== last ? '<strong>' + r.mes_nombre + '</strong>' : '') + '</td>' +
          '<td style="color:var(--mt)">' + r.week_label + '</td>' +
          '<td style="color:var(--mt);font-size:9px">' + r.rango + '</td>' +
          '<td class="c">' + r.n_guias + '</td>' +
          '<td class="c" style="color:' + DOCS + ';font-weight:700">' + fmt.hour(r.dec_docs) + '</td>' +
          '<td class="c" style="color:' + TRANS + ';font-weight:700">' + fmt.hour(r.dec_trans) + '</td></tr>';
        last = r.mes_nombre;
      });
      var mm = monthly.filter(function (x) { return x.mes === +m; })[0];
      if (mm) {
        html += '<tr style="background:rgba(255,255,255,.04);border-top:1px solid rgba(255,255,255,.15)">' +
          '<td style="color:var(--mt);font-size:9px;font-style:italic">promedio</td>' +
          '<td colspan="2" style="font-weight:700;color:var(--tx)">Promedio de ' + mm.mes_nombre + '</td>' +
          '<td class="c" style="font-weight:700">' + mm.n_guias + '</td>' +
          '<td class="c" style="color:' + DOCS + ';font-weight:800;font-size:13px">' + fmt.hour(mm.dec_docs) + '</td>' +
          '<td class="c" style="color:' + TRANS + ';font-weight:800;font-size:13px">' + fmt.hour(mm.dec_trans) + '</td></tr>' +
          '<tr style="height:6px"><td colspan="6" style="border:none;padding:0"></td></tr>';
      }
    });
    tb.innerHTML = html;
  }

  /* ── Detalle ────────────────────────────────────────────────────────── */
  function detailRows() {
    var rows = store.m();
    if (state.detMonth) rows = rows.filter(function (r) { return r.mes === +state.detMonth; });
    if (state.detWeek)  rows = rows.filter(function (r) { return r.mes + '|' + r.week_label === state.detWeek; });
    if (state.detDay)   rows = rows.filter(function (r) { return r.fecha_docs === state.detDay; });
    return rows.slice().sort(function (a, b) {
      return (a.fecha_docs || '') < (b.fecha_docs || '') ? -1
           : (a.fecha_docs || '') > (b.fecha_docs || '') ? 1
           : (+a.GUIANUMBER || 0) - (+b.GUIANUMBER || 0);
    });
  }
  function buildDetailFilters() {
    var base = store.m();
    ui.fillSelect('mMes', Array.from(new Set(base.map(function (r) { return r.mes; })))
      .sort(function (a, b) { return a - b; })
      .map(function (m) { return { value: m, label: PN.MONTHS[m] }; }), state.detMonth, 'Todos los meses');
    var afterM = state.detMonth ? base.filter(function (r) { return r.mes === +state.detMonth; }) : base;
    var weeks = {};
    afterM.forEach(function (r) { weeks[r.mes + '|' + r.week_label] = r; });
    ui.fillSelect('mSem', Object.keys(weeks).sort().map(function (k) {
      var r = weeks[k];
      return { value: k, label: (state.detMonth ? '' : PN.MONTHS[r.mes] + ' — ') + r.week_label +
               ' (' + PN.weekRange(r.mes, r.week_label) + ')' };
    }), state.detWeek, 'Todas las semanas');
    var afterW = state.detWeek ? afterM.filter(function (r) { return r.mes + '|' + r.week_label === state.detWeek; }) : afterM;
    ui.fillDayOptions('mDia', afterW, 'fecha_docs', state.detDay);
  }
  function drawDetail() {
    var rows = detailRows();
    var tb = $('mDetTbl');
    if (!rows.length) { tb.innerHTML = ui.emptyRow(8); return; }
    tb.innerHTML = rows.map(function (r, i) {
      var tarde = r.dec_docs != null && r.dec_docs >= 8;
      var nota = r.nota_fecha;
      return '<tr' + (i % 2 ? ' style="background:rgba(255,255,255,.02)"' : '') +
        (nota ? ' data-comment="' + ui.esc(nota) + '"' : '') + '>' +
        '<td style="font-weight:700;color:' + DOCS + '">' + ui.esc(r.GUIANUMBER) + '</td>' +
        '<td>' + ui.esc(r.fecha_docs || '—') + '</td>' +
        '<td style="color:var(--mt);font-size:9px">' + ui.esc(r.SHIPMENTTYPE || '—') + '</td>' +
        '<td style="color:var(--mt)">' + ui.esc(r.week_label) + '</td>' +
        '<td style="color:var(--mt)">' + (PN.MONTHS[r.mes] || '—') + '</td>' +
        '<td class="c" style="color:' + (tarde ? '#ffc947' : DOCS) + ';font-weight:700">' +
          (r.hora_docs ? r.hora_docs + ' hrs' : '—') + '</td>' +
        '<td class="c" style="color:' + TRANS + ';font-weight:700">' +
          (r.hora_trans ? r.hora_trans + ' hrs' : '—') + '</td>' +
        '<td style="font-size:9px;color:#ffc947">' + (nota ? '⚠' : '') + '</td></tr>';
    }).join('');
  }

  /* ── Estadístico: carta de control ──────────────────────────────────── */
  function drawControl() {
    var series = store.shippingSeries('all');
    var key = state.ccSerie === 'docs' ? 'docs' : 'trans';
    var pts = series.map(function (p) {
      return { label: p.label, full: p.full, value: p[key], n: p.n };
    });
    var present = pts.map(function (p) { return p.value; }).filter(function (v) { return v != null; });
    if (present.length < 3) { $('mccNote').textContent = 'Sin suficientes semanas.'; return; }

    var res = C.controlChart('mcc', 'mCC', pts, {
      weeks: series, yTitle: 'HORA DEL DÍA',
      color: state.ccSerie === 'docs' ? DOCS : TRANS,
      seriesLabel: state.ccSerie === 'docs' ? 'Hora media de recepción de docs' : 'Hora media de datos de transporte',
      format: function (v) { return fmt.hour(v) + ' hrs'; },
      floorAtZero: false,
      yTicks: { callback: function (v) { return fmt.hour(v); }, stepSize: 0.25 }
    });
    C.bindHideAll('mcc', 'hbMCC');
    if (!res) return;
    // El eje de horas no arranca en 0: se ajusta al rango real de la serie.
    var ch = res.chart;
    ch.options.scales.y.min = Math.floor((Math.min(res.limits.lcl, Math.min.apply(null, present)) - 0.15) * 4) / 4;
    ch.options.scales.y.max = Math.ceil((Math.max(res.limits.ucl, Math.max.apply(null, present)) + 0.15) * 4) / 4;
    ch.update();

    var r1 = res.flags.filter(function (f) { return f.indexOf(1) >= 0; }).length;
    var r2 = res.flags.filter(function (f) { return f.indexOf(2) >= 0; }).length;
    $('mccNote').innerHTML =
      'Límites I-MR sobre la hora media semanal: LC = <b>' + fmt.hour(res.limits.cl) + '</b>, ' +
      'LCS = <b>' + fmt.hour(res.limits.ucl) + '</b>, LCI = <b>' + fmt.hour(res.limits.lcl) + '</b> ' +
      '(σ̂ = ' + (res.limits.sigma * 60).toFixed(1) + ' min). ' +
      'Regla 1 (fuera de 3σ): <b>' + r1 + '</b> semana(s) · Regla 2 (nueve seguidas del mismo lado): <b>' + r2 + '</b>. ' +
      'Antes estos límites se recortaban a mano entre las 04:00 y las 12:00, lo que los volvía decorativos; ' +
      'ahora salen del propio proceso.';
  }

  /* ── Box plot ───────────────────────────────────────────────────────── */
  function drawBoxPlot() {
    var rows = store.m();
    var gd = {}, gt = {};
    rows.forEach(function (r) {
      var k = state.bpGroup === 'tipo' ? (r.SHIPMENTTYPE || '—') : PN.MONTHS[r.mes];
      if (r.dec_docs != null)  (gd[k] = gd[k] || []).push(r.dec_docs);
      if (r.dec_trans != null) (gt[k] = gt[k] || []).push(r.dec_trans);
    });
    var keys = Object.keys(gd).filter(function (k) { return gd[k].length >= 3; });
    if (state.bpGroup === 'mes') keys.sort(function (a, b) {
      return PN.MONTH_LIST.findIndex(function (m) { return PN.MONTHS[m] === a; }) -
             PN.MONTH_LIST.findIndex(function (m) { return PN.MONTHS[m] === b; }); });
    else keys.sort(function (a, b) { return S.median(gd[b]) - S.median(gd[a]); });

    var groups = [];
    keys.forEach(function (k) {
      groups.push({ label: k.slice(0, 18) + ' · docs', values: gd[k], color: DOCS });
      if (gt[k] && gt[k].length >= 3) groups.push({ label: k.slice(0, 18) + ' · trans', values: gt[k], color: TRANS });
    });
    C.boxPlot('mbp', 'mBP', groups, {
      yTitle: 'HORA DEL DÍA',
      format: function (v) { return fmt.hour(v) + ' hrs'; },
      yTicks: { callback: function (v) { return fmt.hour(v); }, stepSize: 0.25 }
    });
    $('mbpNote').textContent = 'Cada grupo aparece dos veces: azul la recepción de documentos, verde los datos de transporte. ' +
      'Caja alta = llega tarde; caja ancha = llegada irregular. Se omiten los grupos con menos de 3 guías.';
  }

  /* ── Pareto ─────────────────────────────────────────────────────────── */
  function drawPareto() {
    var rows = store.m();
    var key = state.paMetric === 'docs' ? 'dec_docs' : 'dec_trans';
    var g = {};
    rows.forEach(function (r) {
      if (r[key] == null) return;
      (g[r.SHIPMENTTYPE || '—'] = g[r.SHIPMENTTYPE || '—'] || []).push(r[key]);
    });
    // Se mide el retraso frente a las 06:00, que es la referencia operativa:
    // así el Pareto suma "horas de retraso acumuladas" y no horas del reloj.
    var BASE = 6;
    var items = Object.keys(g).map(function (k) {
      var v = g[k];
      var retraso = v.reduce(function (s, h) { return s + Math.max(0, h - BASE); }, 0);
      return { label: k.split(',')[0].slice(0, 18), n: v.length, value: retraso, media: S.mean(v) };
    }).filter(function (it) { return it.value > 0; })
      .sort(function (a, b) { return b.value - a.value; });

    C.pareto('mpa', 'mPA', items, {
      valueLabel: 'Horas de retraso acumuladas', yTitle: 'HORAS ACUMULADAS SOBRE LAS 06:00',
      xTitle: 'TIPO DE EMBARQUE',
      format: function (v) { return v.toFixed(1) + ' h'; }
    });
    $('mpaNote').textContent = 'Se acumula el retraso sobre las 06:00 hrs (referencia operativa), no la hora del reloj: ' +
      'así un tipo con muchas guías ligeramente tarde pesa lo que realmente cuesta, y no se compara contra la medianoche.';
  }

  /* ── Tendencia ──────────────────────────────────────────────────────── */
  function drawTendency() {
    var series = store.shippingSeries('all');
    var vd = series.map(function (p) { return p.docs; });
    var vt = series.map(function (p) { return p.trans; });
    var td = S.movingAverage(vd.map(function (v) { return v == null ? NaN : v; }), 3, true);
    var tt = S.movingAverage(vt.map(function (v) { return v == null ? NaN : v; }), 3, true);
    var all = vd.concat(vt).filter(function (v) { return v != null; });
    var lo = Math.floor((Math.min.apply(null, all) - 0.2) * 4) / 4;
    var hi = Math.ceil((Math.max.apply(null, all) + 0.2) * 4) / 4;

    C.lines('mtd', 'mTD', series.map(function (p) { return p.label; }), [
      { label: 'Docs (real)', data: vd, borderColor: DOCS, backgroundColor: 'rgba(77,124,254,.08)',
        borderWidth: 2, pointRadius: 3, tension: 0.2, fill: true, spanGaps: false },
      { label: 'Docs (tendencia MA3)', data: td, borderColor: DOCS, borderDash: [6, 3],
        borderWidth: 1.5, pointRadius: 0, tension: 0.4, fill: false, spanGaps: true },
      { label: 'Transporte (real)', data: vt, borderColor: TRANS, backgroundColor: 'rgba(0,229,180,.06)',
        borderWidth: 2, pointRadius: 3, tension: 0.2, fill: true, spanGaps: false },
      { label: 'Transporte (tendencia MA3)', data: tt, borderColor: TRANS, borderDash: [6, 3],
        borderWidth: 1.5, pointRadius: 0, tension: 0.4, fill: false, spanGaps: true }
    ], {
      weeks: series, xTitle: 'SEMANA', yTitle: 'HORA DEL DÍA',
      y: { min: lo, max: hi, ticks: { color: '#5a7a99', font: { family: 'DM Mono', size: 10 },
           stepSize: 0.25, callback: function (v) { return fmt.hour(v); } } },
      tooltip: { callbacks: {
        title: function (it) { return series[it[0].dataIndex].full; },
        label: function (c) { return c.dataset.label + ': ' + (c.raw == null ? '—' : fmt.hour(c.raw) + ' hrs'); } } }
    });
    C.bindHideAll('mtd', 'hbMTD');

    function delta(t) {
      var a = t.findIndex(function (v) { return v != null; });
      var b = t.length - 1 - t.slice().reverse().findIndex(function (v) { return v != null; });
      return (a >= 0 && b >= 0 && a !== b) ? t[b] - t[a] : null;
    }
    var dd = delta(td), dt = delta(tt);
    $('mtdNote').innerHTML = 'Media móvil de 3 semanas centrada. ' +
      (dd != null ? 'Docs: ' + (dd < 0 ? 'llegan <b>' + Math.abs(dd * 60).toFixed(0) + ' min más temprano</b>' :
                                        'llegan <b>' + (dd * 60).toFixed(0) + ' min más tarde</b>') + ' de principio a fin. ' : '') +
      (dt != null ? 'Transporte: ' + (dt < 0 ? Math.abs(dt * 60).toFixed(0) + ' min más temprano.' :
                                              (dt * 60).toFixed(0) + ' min más tarde.') : '');
  }

  /* ── Distribución ───────────────────────────────────────────────────── */
  function drawDistribution() {
    var rows = store.m();
    var docs = rows.map(function (r) { return r.dec_docs; }).filter(function (v) { return v != null; });
    var trans = rows.map(function (r) { return r.dec_trans; }).filter(function (v) { return v != null; });
    var opts = { width: 0.25, maxBins: 24, xTitle: 'HORA DEL DÍA',
                 labelFn: function (b) { return fmt.hour(b.lo); } };
    C.histogram('mdi1', 'mDI1', docs, opts);
    C.histogram('mdi2', 'mDI2', trans, opts);
    var d1 = S.describe(docs), d2 = S.describe(trans);
    $('mdiNote').innerHTML =
      'Bins de 15 minutos. Docs: mediana <b>' + fmt.hour(d1.median) + '</b> (mitad central entre ' +
      fmt.hour(d1.q1) + ' y ' + fmt.hour(d1.q3) + ', n = ' + d1.n + '). ' +
      'Transporte: mediana <b>' + fmt.hour(d2.median) + '</b> (' + fmt.hour(d2.q1) + '–' + fmt.hour(d2.q3) +
      ', n = ' + d2.n + '). Las recepciones a partir de las ' + PN.SHIPPING_CUTOFF_HOUR + ':00 hrs no entran en los promedios.';
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})(typeof window !== 'undefined' ? window : globalThis);
