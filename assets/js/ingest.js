/* ==========================================================================
   ingest.js — Pipeline de lectura del Master de Millennium Aduanas.

   Reproduce en el navegador (con SheetJS) el proceso que antes se hacía
   offline en Python, para que subir un .xlsx nuevo baste para actualizar
   todo el tablero.

   Salida: { tiempos:[...], manifiestos:[...], log:[...], meta:{...} }
   con exactamente el mismo esquema de fila que el dataset demo.
   ========================================================================== */
(function (global) {
  'use strict';
  var PN = global.PN = global.PN || {};
  var I = PN.ingest = {};

  /* ── Normalización de texto ─────────────────────────────────────────── */

  var ENTITY_EL = null;
  /** Equivalente a html.unescape(): el master trae 'Elaboraci&oacute;n'. */
  function unescapeHtml(s) {
    if (s == null) return '';
    s = String(s);
    if (s.indexOf('&') < 0) return s;
    if (typeof document !== 'undefined') {
      if (!ENTITY_EL) ENTITY_EL = document.createElement('textarea');
      ENTITY_EL.innerHTML = s;
      return ENTITY_EL.value;
    }
    return s.replace(/&aacute;/gi,'á').replace(/&eacute;/gi,'é').replace(/&iacute;/gi,'í')
            .replace(/&oacute;/gi,'ó').replace(/&uacute;/gi,'ú').replace(/&ntilde;/gi,'ñ')
            .replace(/&amp;/gi,'&').replace(/&nbsp;/gi,' ');
  }
  I.unescapeHtml = unescapeHtml;

  /** minúsculas, sin acentos, sin espacios redundantes — para comparar. */
  function fold(s) {
    return unescapeHtml(s).toLowerCase()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/\s+/g, ' ').trim();
  }
  I.fold = fold;

  /** Número de guía canónico: sin ceros a la izquierda, como string. */
  function normGuia(v) {
    if (v == null) return '';
    var s = String(v).trim();
    if (!s) return '';
    s = s.replace(/^0+(?=\d)/, '');
    return s;
  }
  I.normGuia = normGuia;

  /* ── Detección de columnas ──────────────────────────────────────────── */

  // Sinónimos aceptados por columna. Se busca por "contiene", tras fold().
  var COLUMN_HINTS = {
    guia:      ['guianumber', 'guia number', 'numero de guia', 'no guia', 'guia'],
    activity:  ['activity_esa', 'activity esa', 'activity', 'actividad'],
    date:      ['datetimestamp date', 'timestamp date', 'fecha'],
    time:      ['datetimestamp time', 'timestamp time', 'hora completa', 'datetime'],
    hour:      ['datetimestamp hour of day', 'hour of day', 'hora del dia'],
    status:    ['statusid', 'status id', 'status'],
    createdBy: ['createdby', 'created by', 'usuario', 'creado por'],
    shipment:  ['shipmenttype', 'shipment type', 'tipo de embarque'],
    comments:  ['comments', 'comentarios', 'comentario']
  };

  /**
   * Empareja los encabezados reales del archivo con los campos que necesitamos.
   * Prioriza la coincidencia exacta sobre la parcial para que 'DATETIMESTAMP
   * Date' no se lleve la columna de 'DATETIMESTAMP Time'.
   */
  I.detectColumns = function (headers) {
    var folded = headers.map(fold);
    var map = {}, used = {};
    Object.keys(COLUMN_HINTS).forEach(function (field) {
      var hints = COLUMN_HINTS[field], best = -1, bestScore = -1;
      for (var h = 0; h < hints.length; h++) {
        for (var i = 0; i < folded.length; i++) {
          if (used[i]) continue;
          var score = folded[i] === hints[h] ? 100 - h
                    : folded[i].indexOf(hints[h]) >= 0 ? 50 - h : -1;
          if (score > bestScore) { bestScore = score; best = i; }
        }
      }
      if (best >= 0 && bestScore > 0) { map[field] = headers[best]; used[best] = true; }
    });
    return map;
  };

  /* ── Fechas ─────────────────────────────────────────────────────────── */

  /**
   * Serial de Excel → Date en hora LOCAL (base 1899-12-30).
   *
   * Importante: los seriales de Excel no tienen zona horaria. Convertirlos
   * con aritmética sobre epoch UTC y luego leerlos con getHours() desplaza
   * cada hora tantas horas como diga el huso del navegador (en Tijuana/CDMX
   * las 06:31 se leerían como 23:31 o 00:31). Por eso la parte entera y la
   * fraccionaria se descomponen y se arma la fecha con el constructor local.
   */
  function excelSerialToDate(n) {
    var days = Math.floor(n);
    var totalSec = Math.round((n - days) * 86400);
    if (totalSec >= 86400) { days += 1; totalSec -= 86400; }
    var base = new Date(1899, 11, 30);
    base.setDate(base.getDate() + days);
    return new Date(base.getFullYear(), base.getMonth(), base.getDate(),
                    Math.floor(totalSec / 3600),
                    Math.floor((totalSec % 3600) / 60),
                    totalSec % 60);
  }

  /**
   * Convierte a Date lo que venga: Date, serial de Excel o cadena.
   * Para cadenas dd/mm/yyyy vs mm/dd/yyyy se asume dd/mm (formato mexicano)
   * salvo que el primer componente sea > 12, que lo resuelve por sí solo.
   */
  I.toDate = function (v) {
    if (v == null || v === '') return null;
    if (v instanceof Date) return isNaN(v.getTime()) ? null : v;
    if (typeof v === 'number') {
      if (v <= 0 || v > 80000) return null;
      var d = excelSerialToDate(v);
      return isNaN(d.getTime()) ? null : d;
    }
    var s = String(v).trim();
    if (!s) return null;
    var m;
    // ISO: 2026-03-09[ T]06:31[:00]
    if ((m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) {
      return new Date(+m[1], +m[2] - 1, +m[3], +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    }
    // dd/mm/yyyy o mm/dd/yyyy
    if ((m = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})(?:[T ](\d{1,2}):(\d{2})(?::(\d{2}))?)?/))) {
      var a = +m[1], b = +m[2];
      var day = a > 12 ? a : (b > 12 ? b : a);   // si b>12, b es el día → formato mm/dd
      var mon = a > 12 ? b : (b > 12 ? a : b);
      return new Date(+m[3], mon - 1, day, +(m[4] || 0), +(m[5] || 0), +(m[6] || 0));
    }
    var d2 = new Date(s);
    return isNaN(d2.getTime()) ? null : d2;
  };

  /** 'YYYY-MM-DD' en hora local (sin desfase por UTC). */
  I.dateKey = function (d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
  };
  /** Hora del día en decimales: 06:31 → 6.5166… */
  I.decHour = function (d) {
    return d.getHours() + d.getMinutes() / 60 + d.getSeconds() / 3600;
  };
  I.hhmm = function (d) {
    return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
  };

  /* ── Pipeline ───────────────────────────────────────────────────────── */

  /**
   * Procesa las filas crudas del master.
   * @param {Object[]} rows  filas tal cual salen de XLSX.utils.sheet_to_json
   * @param {{sourceName?:string}} [opts]
   */
  I.process = function (rows, opts) {
    opts = opts || {};
    var log = [];
    function say(level, msg) { log.push({ level: level, msg: msg }); }

    if (!rows || !rows.length) {
      say('err', 'El archivo no contiene filas legibles.');
      return { ok: false, log: log, tiempos: [], manifiestos: [] };
    }

    var headers = Object.keys(rows[0]);
    var col = I.detectColumns(headers);
    say('dim', 'Encabezados detectados: ' + headers.length + ' columnas.');

    var required = ['guia', 'activity', 'status', 'createdBy'];
    var missing = required.filter(function (f) { return !col[f]; });
    if (missing.length) {
      say('err', 'Faltan columnas obligatorias: ' + missing.join(', ') +
                 '. Encabezados encontrados: ' + headers.slice(0, 12).join(' | '));
      return { ok: false, log: log, tiempos: [], manifiestos: [] };
    }
    if (!col.time && !col.date) {
      say('err', 'No se encontró ninguna columna de fecha/hora (DATETIMESTAMP).');
      return { ok: false, log: log, tiempos: [], manifiestos: [] };
    }
    Object.keys(col).forEach(function (f) { say('dim', '  · ' + f + ' → "' + col[f] + '"'); });

    /* Paso 1 — normalizar y filtrar */
    var kept = [], nStatus = 0, nCalendar = 0, nNoDate = 0;
    var excludedPeople = {};
    rows.forEach(function (raw) {
      var status = raw[col.status];
      var statusNum = typeof status === 'number' ? status : parseInt(String(status).trim(), 10);
      if (statusNum !== 8) { nStatus++; return; }

      var ts = col.time ? I.toDate(raw[col.time]) : null;
      var dOnly = col.date ? I.toDate(raw[col.date]) : null;
      // Si la columna Time no traía hora, se completa con "Hour of Day".
      if ((!ts || (ts.getHours() === 0 && ts.getMinutes() === 0)) && dOnly && col.hour != null) {
        var hod = parseFloat(raw[col.hour]);
        if (isFinite(hod) && hod > 0) {
          var base = ts || dOnly;
          ts = new Date(base.getFullYear(), base.getMonth(), base.getDate(),
                        Math.floor(hod), Math.round((hod % 1) * 60));
        }
      }
      if (!ts) ts = dOnly;
      if (!ts) { nNoDate++; return; }

      var wk = PN.weekOf(ts);
      if (!wk) { nCalendar++; return; }

      var user = fold(raw[col.createdBy]).replace(/\s/g, '');
      kept.push({
        guia: normGuia(raw[col.guia]),
        act: fold(raw[col.activity]),
        ts: ts,
        wk: wk,
        user: user,
        shipment: unescapeHtml(raw[col.shipment] == null ? '' : raw[col.shipment]).trim(),
        comment: unescapeHtml(raw[col.comments] == null ? '' : raw[col.comments]).trim()
      });
    });

    say('info', 'Filas leídas: ' + rows.length.toLocaleString('es-MX'));
    say('dim',  '  − ' + nStatus.toLocaleString('es-MX') + ' descartadas por STATUSID ≠ 8');
    say('dim',  '  − ' + nCalendar.toLocaleString('es-MX') + ' fuera del calendario laboral');
    if (nNoDate) say('warn', '  − ' + nNoDate + ' sin fecha legible');
    say('ok',   '  = ' + kept.length.toLocaleString('es-MX') + ' filas útiles');

    /* Paso 2 — agrupar por guía */
    var byGuia = {};
    kept.forEach(function (r) {
      if (!r.guia) return;
      (byGuia[r.guia] = byGuia[r.guia] || []).push(r);
    });
    say('info', 'Guías distintas: ' + Object.keys(byGuia).length.toLocaleString('es-MX'));

    /** Primera ocurrencia cronológica de una actividad dentro de la guía. */
    function firstOf(list, activity) {
      var best = null;
      list.forEach(function (r) {
        if (r.act !== activity) return;
        if (!best || r.ts < best.ts) best = r;
      });
      return best;
    }
    /**
     * Tipo de embarque: el valor no vacío más frecuente; empate → el más largo.
     *
     * Se calcula sobre las filas de la actividad que interesa, NO sobre toda la
     * guía. En el master hay guías cuyas filas de "Elaboración de factura" traen
     * un SHIPMENTTYPE distinto del de sus filas de "Recepción de Docs" (por
     * ejemplo la 30, la 57, la 58 y la 250). Elegir un único tipo por guía hacía
     * que el filtro de American Mail descartara recepciones que no eran American
     * Mail en su propia fila.
     */
    function pickShipment(list) {
      var freq = {};
      list.forEach(function (r) { if (r.shipment) freq[r.shipment] = (freq[r.shipment] || 0) + 1; });
      var best = '', bestN = 0;
      Object.keys(freq).forEach(function (k) {
        if (freq[k] > bestN || (freq[k] === bestN && k.length > best.length)) { best = k; bestN = freq[k]; }
      });
      return best;
    }
    /** Filas de una guía que corresponden a alguna de esas actividades. */
    function only(list, activities) {
      return list.filter(function (r) { return activities.indexOf(r.act) >= 0; });
    }

    /* Paso 3 — TIEMPOS (elaboración de factura → solicitud de carta porte) */
    var tiempos = [], nSinPar = 0, nSinPersona = 0;
    Object.keys(byGuia).forEach(function (g) {
      var list = byGuia[g];
      var ini = firstOf(list, PN.ACTIVITY.FACTURA);
      var fin = firstOf(list, PN.ACTIVITY.CARTAPORTE);
      if (!ini || !fin) { nSinPar++; return; }

      // La guía se atribuye a quien la CIERRA (solicita la carta porte);
      // si esa fila no tiene usuario reconocible se usa quien la inició.
      var persona = PN.PERSON_FIX[g] ||
                    PN.PERSON_MAP[fin.user] || PN.PERSON_MAP[ini.user] || null;
      if (!persona) {
        nSinPersona++;
        var u = fin.user || ini.user;
        if (u) excludedPeople[u] = (excludedPeople[u] || 0) + 1;
        return;
      }

      var wk = PN.weekOf(ini.ts) || ini.wk;
      var comment = [ini.comment, fin.comment].filter(Boolean)
                    .filter(function (v, i, a) { return a.indexOf(v) === i; }).join(' · ');

      tiempos.push({
        persona: persona,
        GUIANUMBER: g,
        fecha_str: I.dateKey(ini.ts),
        diff_minutes: Math.round(Math.abs(fin.ts - ini.ts) / 60000 * 10) / 10,
        week_label: wk.week,
        mes: wk.mes,
        SHIPMENTTYPE: pickShipment(only(list, [PN.ACTIVITY.FACTURA, PN.ACTIVITY.CARTAPORTE])) ||
                      pickShipment(list),
        comment: comment
      });
    });
    say('info', 'Reporte de tiempos: ' + tiempos.length + ' guías con ambas actividades');
    say('dim',  '  − ' + nSinPar + ' guías sin el par factura/carta porte completo');
    if (nSinPersona) say('warn', '  − ' + nSinPersona + ' guías de usuarios no incluidos en el reporte');
    Object.keys(excludedPeople).forEach(function (u) {
      say('dim', '     · ' + u + ' (' + excludedPeople[u] + ')');
    });

    /* Paso 4 — MANIFIESTOS (recepción de docs / de datos de transporte) */
    var manifiestos = [], nAmerican = 0, nEne2 = 0, nCutoff = 0, nSinHoras = 0;
    Object.keys(byGuia).forEach(function (g) {
      var list = byGuia[g];
      var docs  = firstOf(list, PN.ACTIVITY.DOCS);
      var trans = firstOf(list, PN.ACTIVITY.TRANSPORTE);
      if (!docs && !trans) { nSinHoras++; return; }

      var shipment = pickShipment(only(list, [PN.ACTIVITY.DOCS, PN.ACTIVITY.TRANSPORTE])) ||
                     pickShipment(list);
      if (shipment === PN.SHIPPING_EXCLUDE_TYPE) { nAmerican++; return; }

      var ref = docs ? docs.ts : trans.ts;
      // El 2 de enero no es representativo del flujo normal de recepción.
      if (ref.getMonth() === 0 && ref.getDate() === 2) { nEne2++; return; }
      var wk = PN.weekOf(ref);
      if (!wk) return;

      var decDocs = null, horaDocs = null;
      if (docs) { decDocs = I.decHour(docs.ts); horaDocs = I.hhmm(docs.ts); }
      // Corrección manual documentada de hora de recepción.
      if (PN.HOUR_FIX[g]) {
        horaDocs = PN.HOUR_FIX[g];
        var hp = horaDocs.split(':');
        decDocs = +hp[0] + (+hp[1]) / 60;
      }
      // Recepciones de tarde: quedan registradas pero no promedian.
      if (decDocs != null && decDocs >= PN.SHIPPING_CUTOFF_HOUR) { decDocs = null; nCutoff++; }

      var decTrans = trans ? I.decHour(trans.ts) : null;
      var horaTrans = trans ? I.hhmm(trans.ts) : null;
      if (decTrans != null && decTrans >= PN.SHIPPING_CUTOFF_HOUR) decTrans = null;

      if (decDocs == null && decTrans == null && !horaDocs && !horaTrans) return;

      var fDocs  = docs  ? I.dateKey(docs.ts)  : null;
      var fTrans = trans ? I.dateKey(trans.ts) : null;
      manifiestos.push({
        GUIANUMBER: g,
        fecha_docs: fDocs || fTrans,
        mes: wk.mes,
        hora_docs: horaDocs,
        dec_docs: decDocs,
        SHIPMENTTYPE: shipment,
        week_label: wk.week,
        hora_trans: horaTrans,
        dec_trans: decTrans,
        fecha_trans: fTrans || fDocs,
        nota_fecha: (fDocs && fTrans && fDocs !== fTrans)
          ? 'Documentos y datos de transporte se registraron en días distintos (' +
            fDocs + ' vs ' + fTrans + ').' : ''
      });
    });
    say('info', 'Reporte de shipping: ' + manifiestos.length + ' guías con recepción registrada');
    say('dim',  '  − ' + nAmerican + ' excluidas por tipo "' + PN.SHIPPING_EXCLUDE_TYPE + '"');
    say('dim',  '  − ' + nEne2 + ' del 2 de enero (no representativo)');
    if (nCutoff) say('warn', '  − ' + nCutoff + ' recepciones ≥ ' + PN.SHIPPING_CUTOFF_HOUR +
                             ':00 hrs: quedan en la tabla pero no entran a los promedios');

    tiempos.sort(function (a, b) { return (+a.GUIANUMBER || 0) - (+b.GUIANUMBER || 0); });
    manifiestos.sort(function (a, b) { return (+a.GUIANUMBER || 0) - (+b.GUIANUMBER || 0); });

    if (!tiempos.length && !manifiestos.length) {
      say('err', 'No se pudo derivar ninguna guía. Revisa que ACTIVITY_ESA contenga ' +
                 'las actividades esperadas y que STATUSID = 8 exista en el archivo.');
      return { ok: false, log: log, tiempos: [], manifiestos: [] };
    }
    say('ok', 'Procesamiento completo.');

    return {
      ok: true, log: log, tiempos: tiempos, manifiestos: manifiestos,
      meta: {
        source: opts.sourceName || 'archivo.xlsx',
        processedAt: new Date().toISOString(),
        rowsRead: rows.length,
        guias: Object.keys(byGuia).length
      }
    };
  };

})(typeof window !== 'undefined' ? window : globalThis);
