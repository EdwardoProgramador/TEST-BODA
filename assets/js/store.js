/* ==========================================================================
   store.js — Fuente única de verdad de los datos del tablero.

   Guarda sólo dos tablas base — tiempos (TD) y manifiestos (MD) — y DERIVA
   todo lo demás. En la versión anterior los siete bloques (TD/TW/TG/TV/MD/
   MS/MM) venían pre-calculados y embebidos: cualquier discrepancia entre
   ellos era invisible. Ahora los resúmenes no pueden desincronizarse del
   detalle porque se calculan del detalle.

   El dataset activo se guarda en localStorage, así que sobrevive a la
   navegación entre páginas y a cerrar el navegador.
   ========================================================================== */
(function (global) {
  'use strict';
  var PN = global.PN = global.PN || {};
  var S = PN.stats;

  /* ── Formato ────────────────────────────────────────────────────────── */
  var fmt = PN.fmt = {
    /** 6.5166 → '06:31' */
    hour: function (dec) {
      if (dec == null || isNaN(dec)) return '—';
      var total = Math.round(dec * 60);
      var h = Math.floor(total / 60), m = total % 60;
      if (h >= 24) h -= 24;
      return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
    },
    /** '06:31' → 6.5166 */
    dec: function (hhmm) {
      if (!hhmm || hhmm === 'nan') return null;
      var p = String(hhmm).split(':');
      var h = parseInt(p[0], 10), m = parseInt(p[1] || '0', 10);
      if (isNaN(h)) return null;
      return h + m / 60 + (parseInt(p[2] || '0', 10) || 0) / 3600;
    },
    min: function (v, d) { return v == null || isNaN(v) ? '—' : v.toFixed(d == null ? 0 : d) + ' min'; },
    int: function (v) { return v == null || isNaN(v) ? '—' : Math.round(v).toLocaleString('es-MX'); },
    pct: function (v, d) { return v == null || isNaN(v) ? '—' : (v > 0 ? '+' : '') + v.toFixed(d == null ? 1 : d) + '%'; },
    /** '2026-03-09' → 'Lun 9 mar' */
    dayLabel: function (iso) {
      var d = new Date(iso + 'T00:00:00');
      if (isNaN(d.getTime())) return iso;
      return PN.DAY_NAMES[d.getDay()] + ' ' + d.getDate() + ' ' + (PN.MONTH_ABBR[d.getMonth() + 1] || '');
    }
  };

  /* ── Estado ─────────────────────────────────────────────────────────── */
  var LS_KEY = 'pn.dataset.v1';
  var SS_KEY = 'pn.period.v1';

  var store = PN.store = {
    tiempos: [],
    manifiestos: [],
    meta: { source: '—', isDemo: true, processedAt: null },
    period: 'all',      // 'all' | 1..6
    _cache: {}
  };

  function safeLocal(fn, fallback) {
    try { return fn(); } catch (e) { return fallback; }
  }

  /** Carga el dataset guardado; si no hay, cae al dataset demo embebido. */
  store.init = function () {
    var saved = safeLocal(function () { return global.localStorage.getItem(LS_KEY); }, null);
    if (saved) {
      try {
        var obj = JSON.parse(saved);
        if (obj && obj.tiempos && obj.manifiestos) {
          store.tiempos = obj.tiempos;
          store.manifiestos = obj.manifiestos;
          store.meta = obj.meta || { source: 'archivo cargado', isDemo: false };
          store.meta.isDemo = false;
        }
      } catch (e) { /* dataset corrupto: se ignora y se usa el demo */ }
    }
    if (!store.tiempos.length && PN.DEMO) {
      store.tiempos = PN.DEMO.tiempos.slice();
      store.manifiestos = PN.DEMO.manifiestos.slice();
      store.meta = {
        source: PN.DEMO.source || 'dataset demo',
        isDemo: true,
        processedAt: PN.DEMO.processedAt || null
      };
    }
    var p = safeLocal(function () { return global.sessionStorage.getItem(SS_KEY); }, null);
    if (p) store.period = (p === 'all') ? 'all' : (parseInt(p, 10) || 'all');
    store._cache = {};
    return store;
  };

  /** Reemplaza el dataset activo con el resultado de procesar un Master. */
  store.setDataset = function (result) {
    store.tiempos = result.tiempos || [];
    store.manifiestos = result.manifiestos || [];
    store.meta = Object.assign({ isDemo: false }, result.meta || {});
    store._cache = {};
    safeLocal(function () {
      global.localStorage.setItem(LS_KEY, JSON.stringify({
        tiempos: store.tiempos, manifiestos: store.manifiestos, meta: store.meta
      }));
    });
    return store;
  };

  /** Vuelve al dataset demo embebido. */
  store.reset = function () {
    safeLocal(function () { global.localStorage.removeItem(LS_KEY); });
    store.tiempos = []; store.manifiestos = []; store._cache = {};
    return store.init();
  };

  store.setPeriod = function (p) {
    store.period = p;
    safeLocal(function () { global.sessionStorage.setItem(SS_KEY, String(p)); });
    store._cache = {};
  };

  /* ── Vistas filtradas por periodo ───────────────────────────────────── */
  store.t = function (period) {
    var p = period === undefined ? store.period : period;
    return (p === 'all') ? store.tiempos : store.tiempos.filter(function (r) { return r.mes === p; });
  };
  store.m = function (period) {
    var p = period === undefined ? store.period : period;
    return (p === 'all') ? store.manifiestos : store.manifiestos.filter(function (r) { return r.mes === p; });
  };
  /** Meses con datos, en orden. */
  store.months = function () {
    var seen = {};
    store.tiempos.forEach(function (r) { seen[r.mes] = 1; });
    store.manifiestos.forEach(function (r) { seen[r.mes] = 1; });
    return PN.MONTH_LIST.filter(function (m) { return seen[m]; });
  };
  /** Personas con datos, en orden alfabético estable. */
  store.people = function (rows) {
    var seen = {};
    (rows || store.tiempos).forEach(function (r) { seen[r.persona] = 1; });
    var known = PN.PEOPLE.filter(function (p) { return seen[p]; });
    Object.keys(seen).forEach(function (p) { if (known.indexOf(p) < 0) known.push(p); });
    return known;
  };
  store.colorFor = function (persona) {
    return PN.PERSON_COLOR[persona] ||
           PN.PALETTE[Math.abs(hash(persona)) % PN.PALETTE.length];
  };
  function hash(s) {
    var h = 0; s = String(s);
    for (var i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
    return h;
  }

  function memo(key, fn) {
    if (store._cache[key] === undefined) store._cache[key] = fn();
    return store._cache[key];
  }

  /* ── Derivaciones — TIEMPOS ─────────────────────────────────────────── */

  /**
   * Resumen semanal por persona (equivale al antiguo bloque TW, más la
   * mediana, que antes no existía a este nivel).
   */
  store.weeklyByPerson = function () {
    return memo('tw', function () {
      var groups = {};
      store.tiempos.forEach(function (r) {
        var k = r.persona + '|' + r.mes + '|' + r.week_label;
        (groups[k] = groups[k] || { persona: r.persona, mes: r.mes, week_label: r.week_label, v: [] })
          .v.push(r.diff_minutes);
      });
      return Object.keys(groups).map(function (k) {
        var g = groups[k];
        return {
          persona: g.persona, mes: g.mes, week_label: g.week_label,
          avg_minutes: S.mean(g.v), median_minutes: S.median(g.v), count: g.v.length,
          values: g.v
        };
      });
    });
  };

  /** Resumen semanal global — antiguo bloque TG. */
  store.weeklyGlobal = function () {
    return memo('tg', function () {
      var groups = {};
      store.tiempos.forEach(function (r) {
        var k = r.mes + '|' + r.week_label;
        (groups[k] = groups[k] || { mes: r.mes, week_label: r.week_label, v: [] }).v.push(r.diff_minutes);
      });
      var out = Object.keys(groups).map(function (k) {
        var g = groups[k];
        return {
          mes: g.mes, week_label: g.week_label,
          avg_minutes: S.mean(g.v), median_minutes: S.median(g.v), count: g.v.length,
          values: g.v
        };
      });
      out.sort(function (a, b) {
        return a.mes - b.mes || PN.WEEK_LABELS.indexOf(a.week_label) - PN.WEEK_LABELS.indexOf(b.week_label);
      });
      return out;
    });
  };

  /**
   * Serie semanal continua para el periodo activo, lista para graficar.
   * Incluye las semanas sin datos como null para que el eje X no mienta
   * sobre la continuidad del tiempo.
   */
  store.weeklySeries = function (opts) {
    opts = opts || {};
    var stat = opts.stat || 'median';   // 'median' | 'avg'
    var persona = opts.persona || null;
    var rows = persona
      ? store.weeklyByPerson().filter(function (r) { return r.persona === persona; })
      : store.weeklyGlobal();
    var index = {};
    rows.forEach(function (r) { index[r.mes + '|' + r.week_label] = r; });
    return PN.allWeeks(opts.period === undefined ? store.period : opts.period).map(function (w) {
      var r = index[w.mes + '|' + w.week];
      return {
        mes: w.mes, week: w.week, parcial: w.parcial,
        label: PN.shortWeek(w.mes, w.week),
        full: PN.longWeek(w.mes, w.week),
        rango: w.rango,
        value: r ? (stat === 'avg' ? r.avg_minutes : r.median_minutes) : null,
        avg: r ? r.avg_minutes : null,
        median: r ? r.median_minutes : null,
        count: r ? r.count : 0,
        values: r ? r.values : []
      };
    });
  };

  /** Volumen por tipo de embarque y persona — antiguo bloque TV. */
  store.volumeByType = function (persona) {
    var rows = store.t();
    if (persona && persona !== 'all') rows = rows.filter(function (r) { return r.persona === persona; });
    var counts = {};
    rows.forEach(function (r) { counts[r.SHIPMENTTYPE] = (counts[r.SHIPMENTTYPE] || 0) + 1; });
    return Object.keys(counts).map(function (k) { return { type: k, count: counts[k] }; })
                 .sort(function (a, b) { return b.count - a.count; });
  };

  /** Agrupa los minutos por una dimensión: persona, tipo, mes o día de semana. */
  store.groupMinutes = function (dim, rows) {
    rows = rows || store.t();
    var g = {};
    rows.forEach(function (r) {
      var k;
      if (dim === 'p') k = r.persona;
      else if (dim === 't') k = r.SHIPMENTTYPE;
      else if (dim === 'm') k = PN.MONTHS[r.mes] || String(r.mes);
      else if (dim === 'd') {
        var d = new Date(r.fecha_str + 'T00:00:00');
        k = PN.DAY_NAMES[d.getDay()] || 'Otro';
      } else k = 'Todos';
      (g[k] = g[k] || []).push(r.diff_minutes);
    });
    return g;
  };

  /** Todas las guías de un periodo de mejora (antes / post-macro / post-interfaz). */
  store.byPeriodId = function (id) {
    return store.tiempos.filter(function (r) {
      return PN.periodOf({ mes: r.mes, week: r.week_label }) === id;
    });
  };

  /* ── Derivaciones — SHIPPING ────────────────────────────────────────── */

  /** Resumen semanal de recepción — antiguo bloque MS. */
  store.shippingWeekly = function () {
    return memo('ms', function () {
      var groups = {};
      store.manifiestos.forEach(function (r) {
        var k = r.mes + '|' + r.week_label;
        var g = groups[k] = groups[k] || { mes: r.mes, week_label: r.week_label, n: 0, docs: [], trans: [] };
        g.n++;
        if (r.dec_docs != null && isFinite(r.dec_docs)) g.docs.push(r.dec_docs);
        if (r.dec_trans != null && isFinite(r.dec_trans)) g.trans.push(r.dec_trans);
      });
      var out = Object.keys(groups).map(function (k) {
        var g = groups[k];
        return {
          mes: g.mes, mes_nombre: PN.MONTHS[g.mes], week_label: g.week_label,
          rango: PN.weekRange(g.mes, g.week_label), n_guias: g.n,
          dec_docs: g.docs.length ? S.mean(g.docs) : null,
          dec_trans: g.trans.length ? S.mean(g.trans) : null,
          med_docs: g.docs.length ? S.median(g.docs) : null,
          med_trans: g.trans.length ? S.median(g.trans) : null,
          n_docs: g.docs.length, n_trans: g.trans.length,
          docs: g.docs, trans: g.trans
        };
      });
      out.sort(function (a, b) {
        return a.mes - b.mes || PN.WEEK_LABELS.indexOf(a.week_label) - PN.WEEK_LABELS.indexOf(b.week_label);
      });
      return out;
    });
  };

  /** Resumen mensual de recepción — antiguo bloque MM. */
  store.shippingMonthly = function () {
    return memo('mm', function () {
      var groups = {};
      store.manifiestos.forEach(function (r) {
        var g = groups[r.mes] = groups[r.mes] || { mes: r.mes, n: 0, docs: [], trans: [] };
        g.n++;
        if (r.dec_docs != null && isFinite(r.dec_docs)) g.docs.push(r.dec_docs);
        if (r.dec_trans != null && isFinite(r.dec_trans)) g.trans.push(r.dec_trans);
      });
      return Object.keys(groups).map(function (k) {
        var g = groups[k];
        return {
          mes: g.mes, mes_nombre: PN.MONTHS[g.mes], n_guias: g.n,
          dec_docs: g.docs.length ? S.mean(g.docs) : null,
          dec_trans: g.trans.length ? S.mean(g.trans) : null,
          n_docs: g.docs.length, n_trans: g.trans.length
        };
      }).sort(function (a, b) { return a.mes - b.mes; });
    });
  };

  /** Serie semanal de shipping para el periodo activo (con huecos explícitos). */
  store.shippingSeries = function (period) {
    var index = {};
    store.shippingWeekly().forEach(function (r) { index[r.mes + '|' + r.week_label] = r; });
    return PN.allWeeks(period === undefined ? store.period : period).map(function (w) {
      var r = index[w.mes + '|' + w.week];
      return {
        mes: w.mes, week: w.week, label: PN.shortWeek(w.mes, w.week),
        full: PN.longWeek(w.mes, w.week), rango: w.rango,
        docs: r ? r.dec_docs : null, trans: r ? r.dec_trans : null,
        medDocs: r ? r.med_docs : null, medTrans: r ? r.med_trans : null,
        n: r ? r.n_guias : 0
      };
    });
  };

  /* ── Derivación — CROSS DATA ────────────────────────────────────────── */

  /**
   * Une ambos reportes por número de guía. Sólo se emparejan guías que
   * existen en los dos y que tienen hora de recepción utilizable.
   */
  store.crossPairs = function (period) {
    var mIndex = {};
    store.m(period).forEach(function (r) { mIndex[r.GUIANUMBER] = r; });
    var out = [];
    store.t(period).forEach(function (t) {
      var m = mIndex[t.GUIANUMBER];
      if (!m) return;
      out.push({
        guia: t.GUIANUMBER, persona: t.persona, mes: t.mes, week: t.week_label,
        tipo: t.SHIPMENTTYPE, minutos: t.diff_minutes,
        docs: (m.dec_docs != null && isFinite(m.dec_docs)) ? m.dec_docs : null,
        trans: (m.dec_trans != null && isFinite(m.dec_trans)) ? m.dec_trans : null,
        fecha: t.fecha_str
      });
    });
    return out;
  };

  /* ── Diagnóstico de integridad ──────────────────────────────────────── */

  /** Comprobaciones que se muestran en la página de datos. */
  store.healthChecks = function () {
    var t = store.tiempos, m = store.manifiestos, out = [];
    function chk(ok, label, value) { out.push({ ok: ok, label: label, value: value }); }

    chk(t.length > 0, 'Guías en el reporte de tiempos', t.length);
    chk(m.length > 0, 'Guías en el reporte de shipping', m.length);

    var dupT = {}, dups = 0;
    t.forEach(function (r) { dupT[r.GUIANUMBER] = (dupT[r.GUIANUMBER] || 0) + 1; });
    Object.keys(dupT).forEach(function (k) { if (dupT[k] > 1) dups++; });
    chk(dups === 0, 'Números de guía duplicados en tiempos', dups);

    var neg = t.filter(function (r) { return !(r.diff_minutes >= 0); }).length;
    chk(neg === 0, 'Tiempos negativos o no numéricos', neg);

    var badWeek = t.filter(function (r) { return PN.WEEK_LABELS.indexOf(r.week_label) < 0; }).length;
    chk(badWeek === 0, 'Guías fuera del calendario laboral', badWeek);

    var unknown = t.filter(function (r) { return PN.PEOPLE.indexOf(r.persona) < 0; });
    chk(unknown.length === 0, 'Personas fuera del catálogo',
        unknown.length ? unknown.length + ' (' + unknown.slice(0, 3).map(function (r) { return r.persona; }).join(', ') + ')' : 0);

    var american = m.filter(function (r) { return r.SHIPMENTTYPE === PN.SHIPPING_EXCLUDE_TYPE; }).length;
    chk(american === 0, 'Shipping con tipo "' + PN.SHIPPING_EXCLUDE_TYPE + '" (debe excluirse)', american);

    var lateDocs = m.filter(function (r) {
      return r.dec_docs != null && r.dec_docs >= PN.SHIPPING_CUTOFF_HOUR; }).length;
    chk(lateDocs === 0, 'Recepciones ≥ ' + PN.SHIPPING_CUTOFF_HOUR + ':00 dentro de los promedios', lateDocs);

    var cross = store.crossPairs('all').length;
    chk(cross > 0, 'Guías presentes en ambos reportes', cross);

    var sinFecha = m.filter(function (r) { return r.nota_fecha; }).length;
    out.push({ ok: true, warn: sinFecha > 0, label: 'Guías con docs y transporte en días distintos', value: sinFecha });

    return out;
  };

})(typeof window !== 'undefined' ? window : globalThis);
