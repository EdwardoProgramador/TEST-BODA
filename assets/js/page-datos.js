/* ==========================================================================
   page-datos.js — Carga del Master de Millennium y validación del dataset.
   ========================================================================== */
(function (global) {
  'use strict';
  var PN = global.PN, S = PN.stats, ui = PN.ui, store = PN.store, fmt = PN.fmt;
  var $ = ui.$;
  var pending = null;

  function init() {
    store.init();
    ui.mount({ report: 'd', periods: false });
    bindDrop();
    $('btnApply').onclick = applyPending;
    $('btnReset').onclick = function () {
      if (!confirm('Se descartará el archivo cargado y se volverá al dataset demo. ¿Continuar?')) return;
      store.reset();
      pending = null;
      log('warn', 'Dataset restablecido al demo.');
      refresh();
    };
    $('btnExport').onclick = exportJSON;
    refresh();
  }

  function refresh() {
    ui.mountBanner();
    ui.mountFooter();
    drawChecks();
    drawSummary();
    $('btnApply').disabled = !pending;
    $('btnReset').disabled = !!(store.meta && store.meta.isDemo);
  }

  /* ── Zona de carga ──────────────────────────────────────────────────── */
  function bindDrop() {
    var drop = $('drop'), input = $('fileInput');
    drop.onclick = function () { input.click(); };
    input.onchange = function () { if (this.files[0]) handleFile(this.files[0]); };
    ['dragenter', 'dragover'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.add('over'); });
    });
    ['dragleave', 'drop'].forEach(function (ev) {
      drop.addEventListener(ev, function (e) { e.preventDefault(); drop.classList.remove('over'); });
    });
    drop.addEventListener('drop', function (e) {
      if (e.dataTransfer.files && e.dataTransfer.files[0]) handleFile(e.dataTransfer.files[0]);
    });
  }

  function log(level, msg) {
    var el = $('log');
    var cls = level === 'ok' ? 'ok' : level === 'warn' ? 'warn' : level === 'err' ? 'err' : level === 'dim' ? 'dim' : '';
    el.innerHTML += '<span class="' + cls + '">' + ui.esc(msg) + '</span>\n';
    el.scrollTop = el.scrollHeight;
  }

  function handleFile(file) {
    $('log').innerHTML = '';
    pending = null;
    $('btnApply').disabled = true;
    log('', '▸ ' + file.name + '  (' + (file.size / 1024 / 1024).toFixed(2) + ' MB)');

    if (!global.XLSX) {
      log('err', '✕ No se pudo cargar la librería SheetJS. Revisa tu conexión y recarga la página.');
      return;
    }
    if (!/\.(xlsx|xlsm|xls|csv)$/i.test(file.name)) {
      log('err', '✕ Formato no reconocido. Se espera .xlsx, .xlsm, .xls o .csv.');
      return;
    }

    var reader = new FileReader();
    reader.onerror = function () { log('err', '✕ No se pudo leer el archivo.'); };
    reader.onload = function (e) {
      try {
        log('dim', 'Leyendo el libro…');
        // raw:true + cellDates:false → los timestamps llegan como seriales y
        // los convierte ingest.js en hora LOCAL, sin desfase por zona horaria.
        var wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: false });
        var sheetName = pickSheet(wb);
        log('dim', 'Hojas: ' + wb.SheetNames.join(', ') + '  →  se usa "' + sheetName + '"');
        var rows = XLSX.utils.sheet_to_json(wb.Sheets[sheetName], { defval: null, raw: true });
        var res = PN.ingest.process(rows, { sourceName: file.name });
        res.log.forEach(function (l) { log(l.level, l.msg); });
        if (!res.ok) { log('err', '✕ El archivo no se pudo procesar. No se cambió nada.'); return; }
        pending = res;
        $('btnApply').disabled = false;
        log('ok', '▸ Listo para aplicar. Pulsa «Usar este archivo» para actualizar el tablero.');
      } catch (err) {
        log('err', '✕ Error al procesar: ' + (err && err.message ? err.message : err));
      }
    };
    reader.readAsArrayBuffer(file);
  }

  /** Elige la hoja con más filas que contenga columnas reconocibles. */
  function pickSheet(wb) {
    var best = wb.SheetNames[0], bestScore = -1;
    wb.SheetNames.forEach(function (name) {
      var ref = wb.Sheets[name] && wb.Sheets[name]['!ref'];
      if (!ref) return;
      var range = XLSX.utils.decode_range(ref);
      var head = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, range: 0 })[0] || [];
      var cols = PN.ingest.detectColumns(head.map(function (h) { return String(h == null ? '' : h); }));
      var score = (cols.guia ? 1000 : 0) + (cols.activity ? 1000 : 0) + (range.e.r - range.s.r);
      if (score > bestScore) { bestScore = score; best = name; }
    });
    return best;
  }

  function applyPending() {
    if (!pending) return;
    store.setDataset(pending);
    log('ok', '✔ Dataset aplicado. Todas las páginas del tablero ya usan este archivo.');
    pending = null;
    refresh();
  }

  function exportJSON() {
    var blob = new Blob([JSON.stringify({
      meta: store.meta, tiempos: store.tiempos, manifiestos: store.manifiestos
    }, null, 1)], { type: 'application/json' });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = 'reportes-import-export-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a); a.click(); document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  }

  /* ── Comprobaciones y resumen ───────────────────────────────────────── */
  function drawChecks() {
    var checks = store.healthChecks();
    $('checks').innerHTML = checks.map(function (c) {
      var ico = c.warn ? '⚠' : c.ok ? '✔' : '✕';
      var color = c.warn ? '#ffc947' : c.ok ? '#00e5b4' : '#ff6b6b';
      return '<div class="chk-row"><span class="c-ico" style="color:' + color + '">' + ico + '</span>' +
             '<span class="c-txt">' + ui.esc(c.label) + '</span>' +
             '<span class="c-val" style="color:' + color + '">' + ui.esc(String(c.value)) + '</span></div>';
    }).join('');
  }

  function drawSummary() {
    var t = store.tiempos;
    if (!t.length) { $('sumTbl').innerHTML = ui.emptyRow(6, 'Sin datos cargados'); return; }
    var html = '';
    // Por persona
    store.people().forEach(function (p) {
      var v = t.filter(function (r) { return r.persona === p; }).map(function (r) { return r.diff_minutes; });
      if (!v.length) return;
      var d = S.describe(v);
      html += '<tr><td style="color:' + store.colorFor(p) + ';font-weight:700">' + ui.esc(p) + '</td>' +
        '<td class="c">' + d.n + '</td>' +
        '<td class="r">' + d.median.toFixed(1) + '</td>' +
        '<td class="r">' + d.mean.toFixed(1) + '</td>' +
        '<td class="r">' + d.q1.toFixed(1) + ' – ' + d.q3.toFixed(1) + '</td>' +
        '<td class="r">' + d.max.toFixed(0) + '</td></tr>';
    });
    // Global
    var dv = S.describe(t.map(function (r) { return r.diff_minutes; }));
    html += '<tr style="background:rgba(255,255,255,.05);border-top:1px solid rgba(255,255,255,.15)">' +
      '<td style="font-weight:800">TOTAL</td><td class="c" style="font-weight:700">' + dv.n + '</td>' +
      '<td class="r" style="font-weight:700">' + dv.median.toFixed(1) + '</td>' +
      '<td class="r">' + dv.mean.toFixed(1) + '</td>' +
      '<td class="r">' + dv.q1.toFixed(1) + ' – ' + dv.q3.toFixed(1) + '</td>' +
      '<td class="r">' + dv.max.toFixed(0) + '</td></tr>';
    $('sumTbl').innerHTML = html;

    // Meses
    var mHtml = store.months().map(function (m) {
      var v = t.filter(function (r) { return r.mes === m; }).map(function (r) { return r.diff_minutes; });
      var d = S.describe(v);
      var ms = store.shippingMonthly().filter(function (x) { return x.mes === m; })[0];
      return '<tr><td style="font-weight:700">' + PN.MONTHS[m] + '</td>' +
        '<td class="c">' + d.n + '</td><td class="r">' + d.median.toFixed(1) + '</td>' +
        '<td class="r">' + d.mean.toFixed(1) + '</td>' +
        '<td class="c">' + (ms ? ms.n_guias : 0) + '</td>' +
        '<td class="c" style="color:#4d7cfe">' + (ms ? fmt.hour(ms.dec_docs) : '—') + '</td>' +
        '<td class="c" style="color:#00e5b4">' + (ms ? fmt.hour(ms.dec_trans) : '—') + '</td></tr>';
    }).join('');
    $('mesTbl').innerHTML = mHtml || ui.emptyRow(7);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

})(typeof window !== 'undefined' ? window : globalThis);
