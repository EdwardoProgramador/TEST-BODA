/* ==========================================================================
   ui.js — Cascarón compartido: barra superior, navegación entre reportes,
   filtro de periodo, paneles de ayuda y utilidades de tabla.

   Cada página HTML sólo declara sus contenedores y llama a PN.ui.mount().
   ========================================================================== */
(function (global) {
  'use strict';
  var PN = global.PN = global.PN || {};
  var store = PN.store, fmt = PN.fmt;
  var ui = PN.ui = {};

  ui.esc = function (s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  };
  function $(id) { return document.getElementById(id); }
  ui.$ = $;

  /* ── Logo ───────────────────────────────────────────────────────────── */
  // El logotipo original venía incrustado en base64 dentro del HTML antiguo y ya
  // no está disponible. assets/img/logo.svg es un marcador con las iniciales que
  // ocupa exactamente la misma caja: basta sobrescribir ese archivo con el logo
  // real. Si tampoco existe, se cae a un recuadro dibujado por CSS.
  var LOGO_SRC = 'assets/img/logo.svg';

  ui.logoHTML = function () {
    return '<div class="logo" id="pnLogo"></div>';
  };
  function mountLogo() {
    var box = $('pnLogo');
    if (!box) return;
    var img = new Image();
    img.alt = 'Pluma Nacional';
    img.onload = function () { box.innerHTML = ''; box.appendChild(img); };
    img.onerror = function () {
      box.classList.add('img-ph');
      box.innerHTML = '<span class="ph-txt">PN</span>';
      box.title = 'Coloca tu logotipo en ' + LOGO_SRC;
    };
    img.src = LOGO_SRC;
  }

  /** Marcador reutilizable para cualquier figura que aún no exista. */
  ui.figurePlaceholder = function (label, icon) {
    return '<div class="img-ph figure-ph">' +
             '<span class="ph-icon">' + (icon || '🖼') + '</span>' +
             '<span class="ph-txt">' + ui.esc(label || 'Imagen pendiente') + '</span>' +
           '</div>';
  };

  /* ── Barra superior + navegación ────────────────────────────────────── */

  /**
   * @param {{report:'t'|'m'|'x'|'d', onPeriod?:function, periods?:boolean}} cfg
   */
  ui.mount = function (cfg) {
    var rep = PN.REPORTS[cfg.report];
    document.documentElement.style.setProperty('--ac', rep.color);

    var top = $('topbar');
    if (top) {
      top.innerHTML =
        '<div class="tl">' + ui.logoHTML() +
          '<div class="rl"><h1 style="color:' + rep.color + '">' + ui.esc(rep.title) + '</h1>' +
          '<span class="sub" id="pnSub">' + ui.esc(rep.sub) + '</span></div>' +
        '</div>' +
        '<div class="nav-wrap">' +
          '<div class="nav-btn" id="pnNavBtn"><div class="nav-dot"></div>' +
            '<span>' + rep.icon + '  ' + ui.esc(rep.short) + '</span>' +
            '<span class="nav-arr">▼</span></div>' +
          '<div class="nav-dd" id="pnNavDD">' +
            ['t', 'm', 'x', 'd'].map(function (k) {
              var r = PN.REPORTS[k];
              return '<a class="nav-item' + (k === cfg.report ? ' active' : '') + '" href="' + r.href + '">' +
                       '<span class="ico">' + r.icon + '</span>' +
                       '<div class="ntx"><strong>' + ui.esc(r.short) + '</strong><span>' + ui.esc(r.sub) + '</span></div>' +
                       '<span class="chk" style="color:' + r.color + '">✓</span></a>';
            }).join('') +
          '</div>' +
        '</div>';
      mountLogo();
      var btn = $('pnNavBtn'), dd = $('pnNavDD');
      btn.onclick = function (e) { e.stopPropagation(); btn.classList.toggle('open'); dd.classList.toggle('open'); };
      document.addEventListener('click', function (e) {
        if (!e.target.closest('.nav-wrap')) { btn.classList.remove('open'); dd.classList.remove('open'); }
      });
    }

    if (cfg.periods !== false) ui.mountPeriods(cfg.onPeriod);
    ui.mountBanner();
    ui.mountInfoPanels();
    ui.mountTooltips();
    ui.mountFooter();
  };

  /* ── Pills de periodo ───────────────────────────────────────────────── */
  ui.mountPeriods = function (onChange) {
    var host = $('periodPills');
    if (!host) return;
    var months = store.months();
    var html = '<div class="pill' + (store.period === 'all' ? ' active' : '') + '" data-p="all">Todo</div>';
    months.forEach(function (m) {
      html += '<div class="pill' + (store.period === m ? ' active' : '') + '" data-p="' + m + '">' + PN.MONTHS[m] + '</div>';
    });
    host.innerHTML = html;
    host.onclick = function (e) {
      var pill = e.target.closest('.pill');
      if (!pill) return;
      host.querySelectorAll('.pill').forEach(function (p) { p.classList.remove('active'); });
      pill.classList.add('active');
      var v = pill.dataset.p;
      store.setPeriod(v === 'all' ? 'all' : parseInt(v, 10));
      if (onChange) onChange(store.period);
    };
  };

  /* ── Banner de origen de datos ──────────────────────────────────────── */
  ui.mountBanner = function () {
    var host = $('dataBanner');
    if (!host) return;
    var m = store.meta || {};
    if (m.isDemo) {
      host.className = 'banner demo';
      host.innerHTML = '<span>📦</span><span>Estás viendo el <b>dataset demo</b> (' + ui.esc(m.source || '—') +
        '). Para analizar tu propio Master, ve a <a href="datos.html">Datos y validación</a> y súbelo — todo el tablero se recalcula solo.</span>';
    } else {
      host.className = 'banner live';
      var when = m.processedAt ? new Date(m.processedAt) : null;
      host.innerHTML = '<span>✅</span><span>Datos de <b>' + ui.esc(m.source || 'archivo cargado') + '</b>' +
        (when && !isNaN(when) ? ' · procesado el ' + when.toLocaleDateString('es-MX') : '') +
        ' · ' + store.tiempos.length + ' guías de tiempos y ' + store.manifiestos.length + ' de shipping. ' +
        '<a href="datos.html">Cambiar archivo</a></span>';
    }
    var badge = $('sourceBadge');
    if (badge) badge.textContent = (m.source || '—') + ' · STATUSID=8';
  };

  /* ── Paneles "¿Cómo leer esta gráfica?" ─────────────────────────────── */
  // Se enlazan por delegación con data-infoid: nunca onclick en línea, que
  // era la fuente del error "missing ) after argument list" al escapar comillas.
  ui.mountInfoPanels = function () {
    if (ui._infoBound) return;
    ui._infoBound = true;
    document.addEventListener('click', function (e) {
      var btn = e.target.closest('[data-infoid]');
      if (!btn) return;
      var panel = $(btn.getAttribute('data-infoid'));
      if (!panel) return;
      var open = panel.classList.toggle('open');
      btn.classList.toggle('open', open);
      btn.textContent = open ? '✕ Cerrar explicación' : 'ℹ ¿Cómo leer esta gráfica?';
    });
  };

  /* ── Tooltips flotantes (comentarios y KPIs) ────────────────────────── */
  ui.mountTooltips = function () {
    if (!$('ctt')) {
      var a = document.createElement('div'); a.id = 'ctt'; document.body.appendChild(a);
      var b = document.createElement('div'); b.id = 'ktt'; document.body.appendChild(b);
    }
    if (ui._ttBound) return;
    ui._ttBound = true;
    document.addEventListener('mouseover', function (e) {
      var t = e.target.closest('[data-comment]');
      if (t) return ui.showComment(e, t.getAttribute('data-comment'));
      var k = e.target.closest('[data-hint]');
      if (k) return ui.showHint(e, k.getAttribute('data-hint'));
    });
    document.addEventListener('mousemove', function (e) {
      if ($('ctt').style.display === 'block') place($('ctt'), e, 460);
      if ($('ktt').style.display === 'block') place($('ktt'), e, 340);
    });
    document.addEventListener('mouseout', function (e) {
      if (e.target.closest('[data-comment]')) $('ctt').style.display = 'none';
      if (e.target.closest('[data-hint]')) $('ktt').style.display = 'none';
    });
  };
  function place(el, e, w) {
    var pad = 16, x = e.clientX + 14, y = e.clientY - 10;
    if (x + w > window.innerWidth - pad) x = e.clientX - w - 10;
    if (x < pad) x = pad;
    var h = el.offsetHeight || 80;
    if (y + h > window.innerHeight - pad) y = window.innerHeight - h - pad;
    if (y < pad) y = pad;
    el.style.left = x + 'px'; el.style.top = y + 'px';
  }
  ui.showComment = function (e, text) {
    var t = $('ctt');
    t.innerHTML = '<span style="color:#00e5b4;font-weight:700;font-size:9px;display:block;margin-bottom:6px">' +
                  '💬 COMENTARIO DEL OPERADOR</span>' + ui.esc(text);
    t.style.display = 'block'; place(t, e, 460);
  };
  ui.showHint = function (e, html) {
    var t = $('ktt');
    t.innerHTML = html;
    t.style.display = 'block'; place(t, e, 340);
  };

  /* ── Pie de página ──────────────────────────────────────────────────── */
  ui.mountFooter = function () {
    var f = $('appFooter');
    if (!f) return;
    var m = store.meta || {};
    f.innerHTML =
      '<p>Fuente: ' + ui.esc(m.source || '—') + ' · STATUSID = 8 (guías completadas) · calendario laboral lun–vie</p>' +
      '<p>Import/Export Assistant · Pluma Nacional SA de CV · <a href="datos.html">Datos y validación</a></p>';
  };

  /* ── Utilidades de tabla y selects ──────────────────────────────────── */

  ui.fillSelect = function (id, options, current, placeholder) {
    var sel = $(id);
    if (!sel) return;
    var html = '<option value="">' + ui.esc(placeholder || 'Todos') + '</option>';
    options.forEach(function (o) {
      var val = (o.value !== undefined) ? o.value : o;
      var lab = (o.label !== undefined) ? o.label : o;
      html += '<option value="' + ui.esc(val) + '"' +
              (String(val) === String(current) ? ' selected' : '') + '>' + ui.esc(lab) + '</option>';
    });
    sel.innerHTML = html;
  };

  /** Opciones de día hábil a partir de un campo de fecha. */
  ui.fillDayOptions = function (id, rows, field, current) {
    var seen = {};
    var opts = [];
    rows.forEach(function (r) {
      var f = r[field];
      if (!f || seen[f]) return;
      var d = new Date(f + 'T00:00:00');
      if (isNaN(d) || d.getDay() === 0 || d.getDay() === 6) return;
      seen[f] = 1;
      opts.push({ value: f, label: fmt.dayLabel(f), sort: f });
    });
    opts.sort(function (a, b) { return a.sort < b.sort ? -1 : 1; });
    ui.fillSelect(id, opts, seen[current] ? current : '', 'Todos los días');
  };

  ui.emptyRow = function (cols, msg) {
    return '<tr><td colspan="' + cols + '" style="text-align:center;color:var(--mt);padding:16px">' +
           ui.esc(msg || 'Sin datos para este filtro') + '</td></tr>';
  };

  /** Pestañas simples (persona, agrupador, etc.). */
  ui.tabs = function (hostId, items, current, onPick) {
    var host = $(hostId);
    if (!host) return;
    host.innerHTML = items.map(function (it) {
      var active = String(it.value) === String(current);
      return '<div class="tbtn' + (active ? ' active' : '') + '" data-v="' + ui.esc(it.value) + '"' +
             (active && it.color ? ' style="background:' + it.color + '"' : '') +
             (it.title ? ' title="' + ui.esc(it.title) + '"' : '') + '>' + ui.esc(it.label) + '</div>';
    }).join('');
    host.onclick = function (e) {
      var b = e.target.closest('.tbtn');
      if (b) onPick(b.dataset.v);
    };
  };

  /** Sub-navegación de las secciones de análisis estadístico. */
  ui.sectionNav = function (hostId, sections, current, onPick) {
    var host = $(hostId);
    if (!host) return;
    host.innerHTML = sections.map(function (s) {
      return '<div class="sbtn' + (s.id === current ? ' active' : '') + '" data-s="' + s.id + '">' +
             ui.esc(s.label) + '</div>';
    }).join('');
    host.onclick = function (e) {
      var b = e.target.closest('.sbtn');
      if (!b) return;
      host.querySelectorAll('.sbtn').forEach(function (x) { x.classList.remove('active'); });
      b.classList.add('active');
      onPick(b.dataset.s);
    };
  };

  /** Muestra una sola sección .ss dentro de un contenedor. */
  ui.showSection = function (containerId, sectionId) {
    var host = $(containerId);
    if (!host) return;
    host.querySelectorAll('.ss').forEach(function (s) { s.classList.toggle('active', s.id === sectionId); });
  };

  /** Pestañas Operativo / Análisis estadístico. */
  ui.mainTabs = function (hostId, tabs, onPick) {
    var host = $(hostId);
    if (!host) return;
    host.onclick = function (e) {
      var t = e.target.closest('.mtab');
      if (!t) return;
      host.querySelectorAll('.mtab').forEach(function (x) { x.classList.remove('active'); });
      t.classList.add('active');
      tabs.forEach(function (id) {
        var el = $(id);
        if (el) el.classList.toggle('active', id === t.dataset.tab);
      });
      if (onPick) onPick(t.dataset.tab);
    };
  };

  /** Sección colapsable ("Datos extra"). */
  ui.collapsible = function (headerId, bodyId, onOpen) {
    var h = $(headerId), b = $(bodyId);
    if (!h || !b) return;
    h.onclick = function () {
      var open = b.style.display !== 'none';
      b.style.display = open ? 'none' : '';
      var arr = h.querySelector('.carr');
      if (arr) arr.classList.toggle('open', !open);
      if (!open && onOpen) onOpen();
    };
  };

})(typeof window !== 'undefined' ? window : globalThis);
