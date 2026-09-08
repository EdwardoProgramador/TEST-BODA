/* ==========================================================================
   page-tiempos.js — Reporte "Documentación Import/Export".
   Elaboración de factura → Solicitud de carta porte.
   ========================================================================== */
(function (global) {
  'use strict';
  var PN = global.PN, S = PN.stats, C = PN.charts, ui = PN.ui, store = PN.store, fmt = PN.fmt;
  var $ = ui.$;

  var state = {
    tab: 'tabOp',
    section: 'ad',
    trendStat: 'median',
    linePerson: 'Equipo',
    detPerson: 'Equipo',
    detType: '', detMonth: '', detWeek: '', detDay: '',
    volPerson: 'all',
    ccStat: 'median',
    bpGroup: 'p',
    paGroup: 't', paMetric: 'n',
    extraOpen: false
  };

  var SECTIONS = [
    { id: 'ad', label: 'Antes / Después' },
    { id: 'cc', label: 'Carta de control' },
    { id: 'bp', label: 'Box plot' },
    { id: 'pa', label: 'Pareto' },
    { id: 'di', label: 'Distribución' },
    { id: 'sr', label: 'Serie de tiempo' }
  ];

  /* ── Arranque ───────────────────────────────────────────────────────── */
  function init() {
    store.init();
    C.applyTheme();
    ui.mount({ report: 't', onPeriod: renderAll });

    ui.mainTabs('mainTabs', ['tabOp', 'tabSt'], function (tab) {
      state.tab = tab;
      if (tab === 'tabSt') renderStats();
    });
    ui.sectionNav('statNav', SECTIONS, state.section, function (id) {
      state.section = id;
      ui.showSection('statSections', 'ss-' + id);
      renderStats();
    });
    ui.showSection('statSections', 'ss-' + state.section);

    $('trendStat').onchange = function () { state.trendStat = this.value; drawTrend(); };
    $('ccStat').onchange   = function () { state.ccStat = this.value; drawControl(); };
    $('bpGrp').onchange    = function () { state.bpGroup = this.value; drawBoxPlot(); };
    $('paGrp').onchange    = function () { state.paGroup = this.value; drawPareto(); };
    $('paMetric').onchange = function () { state.paMetric = this.value; drawPareto(); };
    ['sST', 'sMes', 'sSem', 'sDia'].forEach(function (id) {
      $(id).onchange = function () {
        if (id === 'sST')  { state.detType = this.value; state.detMonth = ''; state.detWeek = ''; state.detDay = ''; }
        if (id === 'sMes') { state.detMonth = this.value; state.detWeek = ''; state.detDay = ''; }
        if (id === 'sSem') { state.detWeek = this.value; state.detDay = ''; }
        if (id === 'sDia') { state.detDay = this.value; }
        buildDetailFilters(); drawDetail();
      };
    });
    ui.collapsible('xtraHdr', 'xtraBody', function () { state.extraOpen = true; drawExtra(); });

    renderAll();
  }

  function renderAll() {
    drawKPIs();
    drawTrend();
    buildLineTabs(); drawLines();
    buildDetailTabs(); buildDetailFilters(); drawDetail();
    if (state.extraOpen) drawExtra();
    if (state.tab === 'tabSt') renderStats();
  }

  function renderStats() {
    if (state.section === 'ad') drawBeforeAfter();
    else if (state.section === 'cc') drawControl();
    else if (state.section === 'bp') drawBoxPlot();
    else if (state.section === 'pa') drawPareto();
    else if (state.section === 'di') drawDistribution();
    else if (state.section === 'sr') drawSeries();
  }

  /* ── KPIs ───────────────────────────────────────────────────────────── */
  var HINT_MED = '<b style="color:#4d7cfe">MEDIANA</b><br><br>El valor que parte a la mitad: la mitad de las guías ' +
    'tardó menos y la mitad más. Un solo caso de 4 000 min no la mueve, por eso es la métrica principal del reporte.';
  var HINT_AVG = '<b style="color:#ffc947">PROMEDIO</b><br><br>Suma de minutos entre número de guías. ' +
    'Un incidente aislado lo dispara: en enero el paro de KN llevó el promedio semanal a 818 min ' +
    'mientras la mediana apenas se movió. Sirve de referencia, no de indicador.';
  var HINT_IQR = '<b style="color:#a78bfa">RANGO INTERCUARTIL (IQR)</b><br><br>Distancia entre el percentil 25 y el 75: ' +
    'dentro de ese rango cae la mitad central de las guías. Mide consistencia — cuanto más chico, más predecible el proceso.';

  function drawKPIs() {
    var rows = store.t();
    var v = rows.map(function (r) { return r.diff_minutes; });
    var d = S.describe(v);
    var host = $('kpiGrid');
    if (!v.length) { host.innerHTML = '<div class="empty"><span class="e-ico">📭</span><p>Sin guías en este periodo</p></div>'; return; }

    var cards = [
      { c: '#00e5b4', lbl: 'Total de guías', val: fmt.int(d.n), sub: 'registros con factura y carta porte' },
      { c: '#4d7cfe', lbl: 'Mediana ℹ', val: Math.round(d.median) + ' min', sub: 'tiempo típico · no la mueven los outliers', hint: HINT_MED },
      { c: '#ffc947', lbl: 'Promedio ℹ', val: Math.round(d.mean) + ' min', sub: 'incluye outliers extremos', hint: HINT_AVG },
      { c: '#a78bfa', lbl: 'Consistencia (IQR) ℹ', val: Math.round(d.iqr) + ' min',
        sub: 'la mitad central cae entre ' + Math.round(d.q1) + ' y ' + Math.round(d.q3) + ' min', hint: HINT_IQR }
    ];

    if (store.period !== 'all') {
      var prev = store.period - 1;
      var prevRows = store.tiempos.filter(function (r) { return r.mes === prev; });
      if (prevRows.length >= 5) {
        var pm = S.median(prevRows.map(function (r) { return r.diff_minutes; }));
        var pct = pm > 0 ? (d.median - pm) / pm * 100 : 0;
        var mejor = pct < 0, igual = Math.abs(pct) < 0.5;
        cards[3] = { c: igual ? '#5a7a99' : (mejor ? '#00e5b4' : '#ff6b6b'),
          lbl: 'vs ' + PN.MONTHS[prev],
          val: (igual ? '→ ' : mejor ? '↓ ' : '↑ ') + Math.abs(pct).toFixed(1) + '%',
          sub: (igual ? 'sin cambio' : mejor ? 'mejora' : 'aumento') + ' en la mediana (' + Math.round(pm) + ' → ' + Math.round(d.median) + ' min)' };
      }
    }

    host.innerHTML = cards.map(function (k) {
      return '<div class="kpi" style="--kc:' + k.c + '"' + (k.hint ? ' data-hint="' + ui.esc(k.hint) + '" style2 ' : '') + '>' +
             '<div class="klbl">' + k.lbl + '</div><div class="kval">' + k.val + '</div>' +
             '<div class="ksub">' + k.sub + '</div></div>';
    }).join('');
    // data-hint necesita ir en el nodo, no dentro del style
    host.querySelectorAll('.kpi').forEach(function (el, i) {
      if (cards[i].hint) { el.setAttribute('data-hint', cards[i].hint); el.style.cursor = 'help'; }
      el.style.setProperty('--kc', cards[i].c);
    });
  }

  /* ── Tendencia semanal global ───────────────────────────────────────── */
  function drawTrend() {
    var series = store.weeklySeries({ stat: state.trendStat });
    var vals = series.map(function (p) { return p.value; });
    var present = vals.filter(function (v) { return v != null; });
    if (!present.length) { C.destroy('trend'); return; }
    var cap = S.axisCap(present, 0.95, 1.3, 30);
    var capped = C.cap(vals, cap);

    C.lines('trend', 'cTrend', series.map(function (p) { return p.label; }), [{
      label: state.trendStat === 'median' ? 'Mediana semanal' : 'Promedio semanal',
      data: capped.values, borderColor: '#00e5b4', backgroundColor: 'rgba(0,229,180,.10)',
      borderWidth: 2.5, tension: 0.3, fill: true, spanGaps: false,
      pointRadius: vals.map(function (v) { return v == null ? 0 : 5; }),
      pointStyle: capped.flags.map(function (f) { return f ? 'triangle' : 'circle'; }),
      pointBackgroundColor: capped.flags.map(function (f) { return f ? '#ffc947' : '#00e5b4'; })
    }], {
      weeks: series, legend: false, xTitle: 'SEMANA', yTitle: 'MINUTOS',
      y: { beginAtZero: true, max: cap, ticks: { color: '#5a7a99', font: { family: 'DM Mono', size: 10 },
           stepSize: S.axisStep(cap) } },
      tooltip: { callbacks: {
        title: function (it) { return series[it[0].dataIndex].full; },
        label: function (c) {
          var p = series[c.dataIndex];
          if (p.value == null) return 'Sin guías esa semana';
          var out = ['Mediana: ' + p.median.toFixed(1) + ' min',
                     'Promedio: ' + p.avg.toFixed(1) + ' min',
                     p.count + ' guías · ' + p.rango];
          if (capped.flags[c.dataIndex]) out.push('⚠ fuera de la escala visible');
          return out;
        } } }
    });
    $('trendNote').textContent = state.trendStat === 'median'
      ? 'Se grafica la mediana: es lo que representa a una semana típica.'
      : 'Se grafica el promedio: los picos de enero y mayo son incidentes puntuales, no el ritmo normal.';
  }

  /* ── Evolución semanal por persona ──────────────────────────────────── */
  function buildLineTabs() {
    var items = [{ value: 'Equipo', label: 'Equipo', color: '#ffc947' }];
    store.people().forEach(function (p) {
      items.push({ value: p, label: p.split(' ')[0], title: p, color: store.colorFor(p) });
    });
    ui.tabs('lineTabs', items, state.linePerson, function (v) {
      state.linePerson = v; buildLineTabs(); drawLines();
    });
  }

  function drawLines() {
    var weeks = PN.allWeeks(store.period);
    var labels = weeks.map(function (w) { return PN.shortWeek(w.mes, w.week); });
    var people = state.linePerson === 'Equipo' ? store.people() : [state.linePerson];
    var seriesByPerson = {}, all = [];
    people.forEach(function (p) {
      var s = store.weeklySeries({ stat: 'median', persona: p });
      seriesByPerson[p] = s;
      s.forEach(function (pt) { if (pt.value != null) all.push(pt.value); });
    });
    if (!all.length) { C.destroy('lines'); return; }
    var cap = S.axisCap(all, 0.95, 1.3, 20);

    var datasets = people.filter(function (p) {
      return seriesByPerson[p].some(function (pt) { return pt.value != null; });
    }).map(function (p) {
      var s = seriesByPerson[p], color = store.colorFor(p);
      var vals = s.map(function (pt) { return pt.value; });
      var capped = C.cap(vals, cap);
      return {
        label: p.split(' ')[0], _person: p, _real: vals,
        data: capped.values, borderColor: color, backgroundColor: 'transparent',
        borderWidth: state.linePerson === 'Equipo' ? 2 : 2.5, tension: 0.28, fill: false, spanGaps: false,
        pointRadius: vals.map(function (v, i) { return v == null ? 0 : (capped.flags[i] ? 6 : 3.5); }),
        pointStyle: capped.flags.map(function (f) { return f ? 'triangle' : 'circle'; }),
        pointBackgroundColor: capped.flags.map(function (f) { return f ? '#ffc947' : color; })
      };
    });

    C.lines('lines', 'cLines', labels, datasets, {
      weeks: weeks, xTitle: 'SEMANA', yTitle: 'MEDIANA (min)',
      legend: state.linePerson === 'Equipo',
      y: { beginAtZero: true, max: cap, ticks: { color: '#5a7a99', font: { family: 'DM Mono', size: 10 },
           stepSize: S.axisStep(cap) } },
      tooltip: { callbacks: {
        title: function (it) { return weeks[it[0].dataIndex] ? PN.longWeek(weeks[it[0].dataIndex].mes, weeks[it[0].dataIndex].week) : ''; },
        label: function (c) {
          var real = c.dataset._real[c.dataIndex];
          if (real == null) return c.dataset.label + ': sin guías';
          var pt = seriesByPerson[c.dataset._person][c.dataIndex];
          return c.dataset.label + ': ' + real.toFixed(1) + ' min (' + pt.count + ' guías)' +
                 (real > cap ? ' ⚠ fuera de escala' : '');
        } } }
    });
  }

  /* ── Detalle por guía ───────────────────────────────────────────────── */
  function buildDetailTabs() {
    var items = [{ value: 'Equipo', label: 'Equipo', color: '#ffc947' }];
    store.people().forEach(function (p) {
      items.push({ value: p, label: p.split(' ')[0], title: p, color: store.colorFor(p) });
    });
    ui.tabs('detTabs', items, state.detPerson, function (v) {
      state.detPerson = v; state.detType = ''; state.detMonth = ''; state.detWeek = ''; state.detDay = '';
      buildDetailTabs(); buildDetailFilters(); drawDetail();
    });
  }

  function detailBase() {
    var rows = store.t();
    if (state.detPerson !== 'Equipo') rows = rows.filter(function (r) { return r.persona === state.detPerson; });
    return rows;
  }
  function detailRows() {
    var rows = detailBase();
    if (state.detType)  rows = rows.filter(function (r) { return r.SHIPMENTTYPE === state.detType; });
    if (state.detMonth) rows = rows.filter(function (r) { return r.mes === +state.detMonth; });
    if (state.detWeek)  rows = rows.filter(function (r) { return r.mes + '|' + r.week_label === state.detWeek; });
    if (state.detDay)   rows = rows.filter(function (r) { return r.fecha_str === state.detDay; });
    return rows.slice().sort(function (a, b) {
      return a.fecha_str < b.fecha_str ? -1 : a.fecha_str > b.fecha_str ? 1
           : (+a.GUIANUMBER || 0) - (+b.GUIANUMBER || 0);
    });
  }

  function buildDetailFilters() {
    var base = detailBase();
    ui.fillSelect('sST', Array.from(new Set(base.map(function (r) { return r.SHIPMENTTYPE; }))).sort(),
                  state.detType, 'Todos los tipos');
    var afterType = state.detType ? base.filter(function (r) { return r.SHIPMENTTYPE === state.detType; }) : base;
    ui.fillSelect('sMes', Array.from(new Set(afterType.map(function (r) { return r.mes; })))
                    .sort(function (a, b) { return a - b; })
                    .map(function (m) { return { value: m, label: PN.MONTHS[m] }; }),
                  state.detMonth, 'Todos los meses');
    var afterMonth = state.detMonth ? afterType.filter(function (r) { return r.mes === +state.detMonth; }) : afterType;
    var weeks = {};
    afterMonth.forEach(function (r) { weeks[r.mes + '|' + r.week_label] = r; });
    ui.fillSelect('sSem', Object.keys(weeks).sort().map(function (k) {
      var r = weeks[k];
      return { value: k, label: (state.detMonth ? '' : PN.MONTHS[r.mes] + ' — ') + r.week_label +
                                ' (' + PN.weekRange(r.mes, r.week_label) + ')' };
    }), state.detWeek, 'Todas las semanas');
    var afterWeek = state.detWeek ? afterMonth.filter(function (r) { return r.mes + '|' + r.week_label === state.detWeek; }) : afterMonth;
    ui.fillDayOptions('sDia', afterWeek, 'fecha_str', state.detDay);
  }

  function drawDetail() {
    var rows = detailRows();
    var mins = rows.map(function (r) { return r.diff_minutes; });
    $('avgV').textContent = mins.length ? Math.round(S.median(mins)) + ' min' : '— min';
    $('avgS').textContent = mins.length
      ? 'mediana · promedio ' + Math.round(S.mean(mins)) + ' min · ' + mins.length + ' guías'
      : 'sin guías';

    var cap = mins.length ? S.axisCap(mins, 0.95, 1.25, 30) : 60;
    var capped = C.cap(mins, cap);
    var outer = $('detOuter');
    outer.style.width = Math.max(outer.parentElement.clientWidth || 800, rows.length * 26) + 'px';

    C.bars('detail', 'cDet', rows.map(function (r) { return r.GUIANUMBER; }), [{
      data: capped.values,
      backgroundColor: rows.map(function (r, i) {
        return capped.flags[i] ? 'rgba(255,201,71,.55)' : store.colorFor(r.persona) + '77'; }),
      borderColor: rows.map(function (r, i) {
        return capped.flags[i] ? '#ffc947' : store.colorFor(r.persona); }),
      borderWidth: rows.map(function (r) { return r.comment ? 2.2 : 1.2; }), borderRadius: 3
    }], {
      xTitle: null, yTitle: 'MINUTOS', rotate: 60,
      y: { beginAtZero: true, max: cap, ticks: { color: '#5a7a99', font: { family: 'DM Mono', size: 10 },
           stepSize: S.axisStep(cap) } },
      tooltip: { callbacks: {
        title: function (it) {
          var r = rows[it[0].dataIndex];
          return 'Guía ' + r.GUIANUMBER + ' · ' + r.persona.split(' ')[0];
        },
        label: function (c) {
          var r = rows[c.dataIndex], out = [r.diff_minutes.toFixed(1) + ' min · ' + r.fecha_str];
          if (capped.flags[c.dataIndex]) out.push('⚠ fuera de la escala visible');
          out.push(r.SHIPMENTTYPE);
          if (r.comment) out.push('💬 ' + r.comment.slice(0, 90) + (r.comment.length > 90 ? '…' : ''));
          return out;
        } } }
    });

    var tb = $('detTbl');
    if (!rows.length) { tb.innerHTML = ui.emptyRow(6); return; }
    var box = S.boxStats(mins);
    tb.innerHTML = rows.map(function (r) {
      var esOut = box && (r.diff_minutes < box.lowFence || r.diff_minutes > box.highFence);
      var color = esOut ? '#ffc947' : store.colorFor(r.persona);
      return '<tr' + (r.comment ? ' data-comment="' + ui.esc(r.comment) + '" style="cursor:help"' : '') + '>' +
        '<td style="color:' + color + ';font-weight:700">' + ui.esc(r.GUIANUMBER) + (esOut ? ' ⚠' : '') + '</td>' +
        '<td>' + (state.detPerson === 'Equipo'
            ? '<span style="color:' + store.colorFor(r.persona) + ';font-size:9px">' + ui.esc(r.persona.split(' ')[0]) + '</span><br>' : '') +
          r.fecha_str + '</td>' +
        '<td style="color:var(--mt);font-size:9px">' + ui.esc(r.SHIPMENTTYPE) + '</td>' +
        '<td style="color:var(--mt)">' + ui.esc(r.week_label) + '</td>' +
        '<td class="r" style="color:' + color + ';font-weight:700">' + r.diff_minutes.toFixed(1) + '</td>' +
        '<td class="c">' + (r.comment ? '💬' : '') + '</td></tr>';
    }).join('') +
    (box ? '<tr><td colspan="6" style="color:var(--mt);font-size:9px;padding:8px 12px">' +
      '⚠ marca las guías fuera de las vallas de Tukey (menos de ' + box.lowFence.toFixed(0) +
      ' o más de ' + box.highFence.toFixed(0) + ' min) — anómalas frente a este mismo conjunto.</td></tr>' : '');
  }

  /* ── Datos extra ────────────────────────────────────────────────────── */
  function drawExtra() {
    var rows = store.t();
    var people = store.people(rows);

    // Mediana + promedio por persona
    var groups = people.map(function (p) {
      return { p: p, v: rows.filter(function (r) { return r.persona === p; }).map(function (r) { return r.diff_minutes; }) };
    }).filter(function (g) { return g.v.length; })
      .sort(function (a, b) { return S.median(a.v) - S.median(b.v); });

    C.bars('person', 'cPerson', groups.map(function (g) { return g.p.split(' ')[0]; }), [
      { label: 'Mediana', data: groups.map(function (g) { return +S.median(g.v).toFixed(1); }),
        backgroundColor: groups.map(function (g) { return store.colorFor(g.p) + '99'; }),
        borderColor: groups.map(function (g) { return store.colorFor(g.p); }), borderWidth: 2, borderRadius: 5 },
      { label: 'Promedio', type: 'line', data: groups.map(function (g) { return +S.mean(g.v).toFixed(1); }),
        borderColor: '#ffc947', borderDash: [4, 3], borderWidth: 1.5, pointRadius: 4,
        pointBackgroundColor: '#ffc947', tension: 0.25, fill: false }
    ], { legend: true, xTitle: 'PERSONA', yTitle: 'MINUTOS', rotate: 0,
         tooltip: { callbacks: { label: function (c) {
           var g = groups[c.dataIndex];
           return c.datasetIndex === 0
             ? 'Mediana: ' + c.raw + ' min (' + g.v.length + ' guías)'
             : 'Promedio: ' + c.raw + ' min';
         } } } });

    // Volumen por persona
    C.render('vol', 'cVol', {
      type: 'doughnut',
      data: { labels: groups.map(function (g) { return g.p.split(' ')[0]; }),
        datasets: [{ data: groups.map(function (g) { return g.v.length; }),
          backgroundColor: groups.map(function (g) { return store.colorFor(g.p) + 'cc'; }),
          borderColor: '#080b10', borderWidth: 3 }] },
      options: { responsive: true, maintainAspectRatio: false, cutout: '58%',
        plugins: { legend: C.legend(true, 'bottom'),
          tooltip: Object.assign({}, C.TOOLTIP, { callbacks: { label: function (c) {
            var tot = groups.reduce(function (s, g) { return s + g.v.length; }, 0);
            return c.label + ': ' + c.raw + ' guías (' + (c.raw / tot * 100).toFixed(1) + '%)';
          } } }) } }
    });

    buildVolTabs();
    drawVolTypes();

    // Histograma general
    var mins = rows.map(function (r) { return r.diff_minutes; });
    var h = C.histogram('hist', 'cHist', mins, { xTitle: 'MINUTOS',
      labelFn: function (b) { return b.lo + '–' + b.hi; } });
    if (h) {
      $('histNote').textContent = 'Bins de ' + h.hist.width + ' min (regla de Freedman–Diaconis). ' +
        (h.excluded ? h.excluded + ' guías por encima de ' + Math.round(h.upper) + ' min quedan fuera del recorte visual.' : '');
    }
  }

  function buildVolTabs() {
    var items = [{ value: 'all', label: 'Todos', color: '#5a7a99' }];
    store.people().forEach(function (p) {
      items.push({ value: p, label: p.split(' ')[0], title: p, color: store.colorFor(p) });
    });
    ui.tabs('volTabs', items, state.volPerson, function (v) {
      state.volPerson = v; buildVolTabs(); drawVolTypes();
    });
  }

  function drawVolTypes() {
    var data = store.volumeByType(state.volPerson);
    var color = state.volPerson === 'all' ? null : store.colorFor(state.volPerson);
    C.bars('voltype', 'cVT', data.map(function (d) { return d.type; }), [{
      data: data.map(function (d) { return d.count; }),
      backgroundColor: data.map(function (_, i) { return (color || PN.PALETTE[i % PN.PALETTE.length]) + '99'; }),
      borderColor: data.map(function (_, i) { return color || PN.PALETTE[i % PN.PALETTE.length]; }),
      borderWidth: 1.5, borderRadius: 4
    }], { xTitle: 'TIPO DE EMBARQUE', yTitle: 'N° DE GUÍAS', rotate: 55,
          tooltip: { callbacks: { label: function (c) { return c.raw + ' guías'; } } } });
  }

  /* ── Antes / Después ────────────────────────────────────────────────── */

  // Muestra el entero cuando lo es y un decimal cuando no, para no redondear
  // una mediana de 16.5 a "17" ni presentarla como "16".
  function nice(v) {
    if (v == null || isNaN(v)) return '—';
    return Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(1);
  }

  function drawBeforeAfter() {
    var periods = PN.PERIODS.map(function (p) {
      var rows = store.byPeriodId(p.id);
      return { def: p, rows: rows, v: rows.map(function (r) { return r.diff_minutes; }) };
    });

    // Tarjetas con mediana e intervalo de confianza bootstrap
    $('adBoxes').innerHTML = periods.map(function (pp) {
      if (!pp.v.length) return '<div class="stat-box"><div class="sb-lbl">' + pp.def.label + '</div><div class="sb-val">—</div></div>';
      var med = S.median(pp.v);
      var ci = S.bootstrapCI(pp.v, S.median, { iterations: 4000 });
      return '<div class="stat-box" style="border-color:' + pp.def.color + '44">' +
        '<div class="sb-lbl" style="color:' + pp.def.color + '">' + pp.def.label + '</div>' +
        '<div class="sb-range">' + pp.def.desc + ' · ' + pp.def.tone + '</div>' +
        '<div class="sb-val" style="color:' + pp.def.color + '">' + nice(med) + '</div>' +
        '<div class="sb-unit">minutos (mediana)</div>' +
        (ci ? '<div class="sb-ci">IC 95 %: ' + ci.lower.toFixed(1) + ' – ' + ci.upper.toFixed(1) + ' min</div>' : '') +
        '<div class="sb-ci">' + pp.v.length + ' guías</div></div>';
    }).join('');

    // Barras semanales coloreadas por periodo
    var weeks = PN.allWeeks('all');
    var wg = {};
    store.weeklyGlobal().forEach(function (r) { wg[r.mes + '|' + r.week_label] = r; });
    var pts = weeks.map(function (w) {
      var r = wg[w.mes + '|' + w.week];
      var pid = PN.periodOf({ mes: w.mes, week: w.week });
      var def = PN.PERIODS.filter(function (p) { return p.id === pid; })[0];
      return { label: PN.shortWeek(w.mes, w.week), full: PN.longWeek(w.mes, w.week),
               value: r ? r.median_minutes : null, n: r ? r.count : 0,
               color: def ? def.color : '#5a7a99', periodo: def ? def.label : '—' };
    });
    var present = pts.map(function (p) { return p.value; }).filter(function (v) { return v != null; });
    var cap = S.axisCap(present, 0.95, 1.3, 20);
    var capped = C.cap(pts.map(function (p) { return p.value; }), cap);
    var ms = C.milestonePlugin(weeks);

    C.destroy('ad');
    C.render('ad', 'cAD', {
      type: 'bar', plugins: ms ? [ms] : [],
      data: { labels: pts.map(function (p) { return p.label; }), datasets: [{
        data: capped.values,
        backgroundColor: pts.map(function (p, i) { return capped.flags[i] ? 'rgba(255,201,71,.5)' : p.color + '66'; }),
        borderColor: pts.map(function (p, i) { return capped.flags[i] ? '#ffc947' : p.color; }),
        borderWidth: 1.5, borderRadius: 3 }] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: { display: false }, tooltip: Object.assign({}, C.TOOLTIP, { callbacks: {
          title: function (it) { return pts[it[0].dataIndex].full; },
          label: function (c) {
            var p = pts[c.dataIndex];
            if (p.value == null) return 'Sin guías';
            return [p.periodo, 'Mediana: ' + p.value.toFixed(1) + ' min', p.n + ' guías'];
          } } }) },
        scales: { x: C.axis('SEMANA', { ticks: { color: '#5a7a99', font: { family: 'DM Mono', size: 8 }, maxRotation: 45 } }),
                  y: C.axis('MEDIANA (min)', { beginAtZero: true, max: cap }) } }
    });

    // Pruebas formales
    var antes = periods[0].v, macro = periods[1].v, interfaz = periods[2].v;
    function compara(a, b, titulo) {
      if (a.length < 5 || b.length < 5) return '';
      var boot = S.bootstrapDiff(a, b, S.median, { iterations: 4000 });
      var mw = S.mannWhitneyU(a, b);
      var signif = mw && mw.p < 0.05;
      var ciExcluyeCero = boot && ((boot.pctLower < 0 && boot.pctUpper < 0) || (boot.pctLower > 0 && boot.pctUpper > 0));
      return '<div style="margin-bottom:10px"><strong>' + titulo + '</strong><br>' +
        'Mediana ' + nice(boot.from) + ' → ' + nice(boot.to) + ' min · ' +
        '<b style="color:' + (boot.pct < 0 ? '#00e5b4' : '#ff6b6b') + '">' +
        (boot.pct < 0 ? '↓ ' : '↑ ') + Math.abs(boot.pct).toFixed(1) + '%</b><br>' +
        'IC 95 % del cambio: ' + boot.pctLower.toFixed(1) + '% a ' + boot.pctUpper.toFixed(1) + '%' +
        (ciExcluyeCero ? ' <span style="color:#00e5b4">(no incluye el 0 → la mejora es real)</span>'
                       : ' <span style="color:#ffc947">(incluye el 0 → no concluyente)</span>') + '<br>' +
        'Mann-Whitney U = ' + Math.round(mw.U) + ', ' + S.formatP(mw.p) +
        (signif ? ' <span style="color:#00e5b4">→ diferencia estadísticamente significativa</span>'
                : ' <span style="color:#ffc947">→ no significativa al 5 %</span>') + '</div>';
    }

    var bootTotal = S.bootstrapDiff(antes, interfaz, S.median, { iterations: 4000 });
    var mwTotal = S.mannWhitneyU(antes, interfaz);
    var vale = bootTotal && mwTotal && mwTotal.p < 0.05 && bootTotal.pctUpper < 0;

    $('adVerdict').className = 'verdict ' + (vale ? 'ok' : 'warn');
    $('adVerdict').innerHTML =
      '<span class="v-tag">' + (vale ? 'Mejora confirmada' : 'Sin evidencia suficiente') + '</span>' +
      (bootTotal ? '<strong>De ' + nice(bootTotal.from) + ' a ' + nice(bootTotal.to) +
        ' minutos de mediana (' + Math.abs(bootTotal.pct).toFixed(1) + '% menos).</strong> ' : '') +
      'Las pruebas se hacen sobre la mediana porque los tiempos tienen cola derecha larga; ' +
      'la U de Mann-Whitney no asume normalidad y el intervalo por bootstrap no depende de ella.<br><br>' +
      compara(antes, macro, '1 · Macro Layout Millennium (9 marzo)') +
      compara(macro, interfaz, '2 · Interfaz de Facturas (28 mayo)') +
      compara(antes, interfaz, '3 · Efecto acumulado de ambas');

    $('adScope').textContent = store.period === 'all'
      ? ''
      : '⚠ Este análisis siempre usa el histórico completo (los tres periodos son fijos), ignorando el filtro de ' +
        PN.MONTHS[store.period] + ' activo arriba.';
  }

  /* ── Carta de control ───────────────────────────────────────────────── */
  function drawControl() {
    var series = store.weeklySeries({ stat: state.ccStat });
    var res = C.controlChart('cc', 'cCC', series, {
      weeks: series, yTitle: 'MINUTOS', color: '#00e5b4',
      seriesLabel: (state.ccStat === 'median' ? 'Mediana' : 'Promedio') + ' semanal',
      format: function (v) { return v.toFixed(1) + ' min'; }
    });
    C.bindHideAll('cc', 'hbCC');
    if (!res) { $('ccNote').textContent = 'No hay suficientes semanas para calcular límites.'; return; }
    var r1 = res.flags.filter(function (f) { return f.indexOf(1) >= 0; }).length;
    var r2 = res.flags.filter(function (f) { return f.indexOf(2) >= 0; }).length;
    $('ccNote').innerHTML =
      'Límites por <b>I-MR</b>: σ̂ = MR̄ / 1.128 = ' + res.limits.sigma.toFixed(2) + ' min · ' +
      'LC = ' + res.limits.cl.toFixed(1) + ' · LCS = ' + res.limits.ucl.toFixed(1) +
      ' · LCI = ' + res.limits.lcl.toFixed(1) + ' min.<br>' +
      '<b>Regla 1</b> (punto fuera de los límites 3σ): ' + r1 + ' semana(s). ' +
      '<b>Regla 2</b> (nueve o más semanas seguidas del mismo lado de la línea central): ' + r2 + ' semana(s).' +
      (r2 > 0 ? ' La regla 2 es la señal importante aquí: no marca incidentes sueltos, marca que el proceso ' +
                'se <b>desplazó de nivel</b> — que es justo lo que se esperaba de las mejoras.' : '') +
      ' El rango móvil mide sólo la variación de una semana a la siguiente, por eso un incidente aislado ' +
      'no infla los límites y sigue siendo detectable.';
  }

  /* ── Box plot ───────────────────────────────────────────────────────── */
  function drawBoxPlot() {
    var g = store.groupMinutes(state.bpGroup);
    var keys = Object.keys(g);
    if (state.bpGroup === 'm') keys.sort(function (a, b) {
      return PN.MONTH_LIST.findIndex(function (m) { return PN.MONTHS[m] === a; }) -
             PN.MONTH_LIST.findIndex(function (m) { return PN.MONTHS[m] === b; }); });
    else keys.sort(function (a, b) { return S.median(g[a]) - S.median(g[b]); });

    var groups = keys.filter(function (k) { return g[k].length >= 3; }).map(function (k, i) {
      return { label: state.bpGroup === 'p' ? k.split(' ')[0] : k.slice(0, 22),
               values: g[k],
               color: state.bpGroup === 'p' ? store.colorFor(k) : PN.PALETTE[i % PN.PALETTE.length] };
    });
    C.boxPlot('bp', 'cBP', groups, { yTitle: 'MINUTOS', xTitle: null,
      format: function (v) { return v.toFixed(1) + ' min'; } });
    $('bpNote').textContent = 'Se omiten los grupos con menos de 3 guías: con esa muestra los cuartiles no significan nada. ' +
      'La caja va de Q1 a Q3, la línea gruesa es la mediana, los bigotes llegan al dato real más extremo dentro de ' +
      'Q1−1.5·IQR y Q3+1.5·IQR, y los puntos rojos son los outliers de Tukey.';
  }

  /* ── Pareto ─────────────────────────────────────────────────────────── */
  function drawPareto() {
    var g = store.groupMinutes(state.paGroup);
    var items = Object.keys(g).map(function (k) {
      var v = g[k];
      return { label: k.split(',')[0].slice(0, 18), full: k, n: v.length,
               value: state.paMetric === 'n' ? v.length : S.sum(v) };
    }).sort(function (a, b) { return b.value - a.value; });

    C.pareto('pa', 'cPA', items, {
      valueLabel: state.paMetric === 'n' ? 'Guías' : 'Minutos acumulados',
      yTitle: state.paMetric === 'n' ? 'N° DE GUÍAS' : 'MINUTOS TOTALES',
      xTitle: state.paGroup === 't' ? 'TIPO DE EMBARQUE' : state.paGroup === 'p' ? 'PERSONA' : 'DÍA DE LA SEMANA',
      format: function (v) { return state.paMetric === 'n' ? v + ' guías' : Math.round(v) + ' min'; }
    });
    $('paNote').textContent = state.paMetric === 'n'
      ? 'Ordenado por VOLUMEN: dónde se concentran más guías.'
      : 'Ordenado por TIEMPO TOTAL acumulado: dónde se va realmente el tiempo del equipo. ' +
        'Un tipo con pocas guías pero muy lentas aparece aquí y no en la vista por volumen.';
  }

  /* ── Distribución ───────────────────────────────────────────────────── */
  function drawDistribution() {
    var rows = store.t();
    var mins = rows.map(function (r) { return r.diff_minutes; });
    if (!mins.length) return;

    var h = C.histogram('hn', 'cHN', mins, { xTitle: 'MINUTOS',
      labelFn: function (b) { return b.lo + '–' + b.hi; } });
    C.bindHideAll('hn', 'hbHN');

    var box = S.boxStats(mins);
    var normales = rows.filter(function (r) { return r.diff_minutes >= box.lowFence && r.diff_minutes <= box.highFence; });
    var outliers = rows.filter(function (r) { return r.diff_minutes < box.lowFence || r.diff_minutes > box.highFence; });
    var capY = S.axisCap(mins, 0.97, 1.3, 60);

    C.destroy('ot');
    C.render('ot', 'cOT', {
      type: 'scatter',
      data: { datasets: [
        { label: 'Dentro de patrón', pointRadius: 3, backgroundColor: 'rgba(0,229,180,.55)',
          data: normales.map(function (r) { return { x: r.mes + (hashJitter(r.GUIANUMBER) - 0.5) * 0.55, y: r.diff_minutes, r: r }; }) },
        { label: 'Outlier de Tukey', pointRadius: 5, pointStyle: 'triangle',
          backgroundColor: outliers.map(function (r) { return r.diff_minutes > capY ? '#ffc947' : '#ff6b6b'; }),
          data: outliers.map(function (r) { return { x: r.mes + (hashJitter(r.GUIANUMBER) - 0.5) * 0.55,
                                                     y: Math.min(r.diff_minutes, capY), r: r }; }) }
      ] },
      options: { responsive: true, maintainAspectRatio: false,
        plugins: { legend: C.legend(true), tooltip: Object.assign({}, C.TOOLTIP, { callbacks: {
          label: function (c) {
            var r = c.raw.r;
            return ['Guía ' + r.GUIANUMBER + ' · ' + r.persona.split(' ')[0],
                    r.diff_minutes.toFixed(1) + ' min' + (r.diff_minutes > capY ? ' ⚠ fuera de escala' : ''),
                    r.fecha_str];
          } } }) },
        scales: {
          x: C.axis('MES', { min: 0.4, max: 6.6, ticks: { stepSize: 1, color: '#5a7a99',
              font: { family: 'DM Mono', size: 10 }, callback: function (v) { return PN.MONTHS[v] || ''; } } }),
          y: C.axis('MINUTOS', { beginAtZero: true, max: capY })
        } }
    });

    $('diNote').innerHTML =
      'Vallas de Tukey: por debajo de <b>' + box.lowFence.toFixed(1) + '</b> o por encima de <b>' +
      box.highFence.toFixed(1) + '</b> min (Q1∓1.5·IQR, con IQR = ' + box.iqr.toFixed(1) + '). ' +
      '<b>' + outliers.length + '</b> de ' + mins.length + ' guías (' +
      (outliers.length / mins.length * 100).toFixed(1) + '%) son outliers formales.' +
      (h && h.hist ? ' Histograma con bins de ' + h.hist.width + ' min de ancho constante.' : '') +
      (h && h.lognormal && h.normal
        ? ' La log-normal (σ del log = ' + h.lognormal.sd.toFixed(2) + ') describe la cola derecha mucho mejor que la normal — ' +
          'por eso las pruebas del reporte son no paramétricas.' : '');
  }
  function hashJitter(s) {
    var h = 0; s = String(s);
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return (Math.abs(h) % 1000) / 1000;
  }

  /* ── Serie de tiempo ────────────────────────────────────────────────── */
  function drawSeries() {
    var series = store.weeklySeries({ stat: 'median', period: 'all' });
    var vals = series.map(function (p) { return p.value; });
    var trend = S.movingAverage(vals.map(function (v) { return v == null ? NaN : v; }), 3, true);
    var resid = vals.map(function (v, i) { return (v == null || trend[i] == null) ? null : +(v - trend[i]).toFixed(2); });

    var present = vals.filter(function (v) { return v != null; });
    var cap = S.axisCap(present, 0.95, 1.35, 20);
    var cappedV = C.cap(vals, cap);

    C.lines('sr', 'cSR', series.map(function (p) { return p.label; }), [
      { label: 'Mediana semanal', data: cappedV.values, borderColor: '#00e5b4', borderWidth: 2,
        tension: 0.2, fill: false, spanGaps: false,
        pointRadius: vals.map(function (v, i) { return v == null ? 0 : (cappedV.flags[i] ? 6 : 3); }),
        pointStyle: cappedV.flags.map(function (f) { return f ? 'triangle' : 'circle'; }),
        pointBackgroundColor: cappedV.flags.map(function (f) { return f ? '#ffc947' : '#00e5b4'; }) },
      { label: 'Tendencia (media móvil 3, centrada)', data: trend, borderColor: '#ffc947',
        borderDash: [6, 3], borderWidth: 2, pointRadius: 0, tension: 0.4, fill: false, spanGaps: true },
      { label: 'Residuo (dato − tendencia)', data: resid, borderColor: '#a78bfa',
        borderDash: [3, 3], borderWidth: 1.5, pointRadius: 2, tension: 0.2, fill: false, spanGaps: true }
    ], {
      weeks: series, xTitle: 'SEMANA', yTitle: 'MINUTOS',
      y: { min: Math.min(0, S.quantile(resid.filter(function (v) { return v != null; }), 0.05) || 0), max: cap },
      tooltip: { callbacks: {
        title: function (it) { return series[it[0].dataIndex].full; },
        label: function (c) {
          if (c.datasetIndex === 0) {
            var v = vals[c.dataIndex];
            return v == null ? 'Sin guías' : 'Mediana: ' + v.toFixed(1) + ' min' + (cappedV.flags[c.dataIndex] ? ' ⚠ fuera de escala' : '');
          }
          return c.raw == null ? c.dataset.label + ': —' : c.dataset.label + ': ' + (+c.raw).toFixed(1) + ' min';
        } } }
    });
    C.bindHideAll('sr', 'hbSR');

    var firstT = trend.findIndex(function (v) { return v != null; });
    var lastT = trend.length - 1 - trend.slice().reverse().findIndex(function (v) { return v != null; });
    var delta = (firstT >= 0 && lastT >= 0) ? trend[lastT] - trend[firstT] : null;
    $('srNote').innerHTML =
      'La media móvil es <b>centrada</b> (ventana [i−1, i, i+1]): la versión rezagada desplazaba la tendencia una semana ' +
      'y hacía llegar tarde los puntos de inflexión. Por eso la línea amarilla no existe en la primera ni en la última semana.' +
      (delta != null ? ' Tendencia de ' + trend[firstT].toFixed(1) + ' a ' + trend[lastT].toFixed(1) + ' min (' +
        (delta < 0 ? '↓ mejora sostenida' : '↑ deterioro') + ' de ' + Math.abs(delta).toFixed(1) + ' min).' : '');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})(typeof window !== 'undefined' ? window : globalThis);
