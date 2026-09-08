/**
 * calendar.js — Constantes de negocio: calendario laboral, personas,
 * hitos de mejora y paleta. Todo lo que cambia cuando cambia el negocio
 * vive aquí y en ningún otro sitio.
 */

const PN = {};

/* ── Identidad de cada reporte ──────────────────────────────────────── */
PN.REPORTS = {
  t: { key: 't', href: 'index.html',      icon: '⏱', color: '#00e5b4',
       title: 'DOCUMENTACIÓN IMPORT/EXPORT',
       short: 'Documentación Import/Export',
       sub:   'Elaboración de factura → Solicitud carta porte' },
  m: { key: 'm', href: 'shipping.html',   icon: '📋', color: '#4d7cfe',
       title: 'RECEPCIÓN DE DOCUMENTOS SHIPPING',
       short: 'Recepción de Documentos Shipping',
       sub:   'Recepción Docs · Datos de Transporte' },
  x: { key: 'x', href: 'cross-data.html', icon: '🔗', color: '#f97316',
       title: 'CROSS DATA',
       short: 'Cross Data',
       sub:   'Correlación entre ambos reportes' },
  d: { key: 'd', href: 'datos.html',      icon: '📥', color: '#a78bfa',
       title: 'CARGA Y VALIDACIÓN DE DATOS',
       short: 'Datos y validación',
       sub:   'Sube el Master de Millennium (.xlsx)' }
};

/* ── Personas ───────────────────────────────────────────────────────── */
// Clave = CREATEDBY del master en minúsculas y sin espacios.
PN.PERSON_MAP = {
  'marcoseduardo.robles':     'Marcoseduardo Robles',
  'jonathanyahir.santacruz':  'Jonathanyahir Santacruz',
  'frida.martinez':           'Frida Martinez',
  'miguelangel.estrada':      'Miguelangel Estrada',
  'alondra.barcelata':        'Alondra Barcelata',
  'christianivan.delatorre':  'Christian De La Torre'
};
// No operan rutinariamente: sus guías se descartan del reporte.
PN.PERSON_EXCLUDE = ['karla.garcia', 'pablo.ramirez', 'viridiana.garcia'];
// Correcciones manuales de autoría, por número de guía (sin ceros a la izquierda).
PN.PERSON_FIX = {
  '82':  'Jonathanyahir Santacruz',
  '84':  'Jonathanyahir Santacruz',
  '235': 'Frida Martinez'
};
// Correcciones manuales de hora de recepción de documentos.
PN.HOUR_FIX = {
  '109': '06:00', '112': '06:00', '179': '07:21', '236': '06:28', '472': '06:33'
};

PN.PEOPLE = [
  'Alondra Barcelata', 'Christian De La Torre', 'Frida Martinez',
  'Jonathanyahir Santacruz', 'Marcoseduardo Robles', 'Miguelangel Estrada'
];
PN.PERSON_COLOR = {
  'Alondra Barcelata':        '#00e5b4',
  'Christian De La Torre':    '#f97316',
  'Frida Martinez':           '#4d7cfe',
  'Jonathanyahir Santacruz':  '#ff6b6b',
  'Marcoseduardo Robles':     '#a78bfa',
  'Miguelangel Estrada':      '#34d399'
};

/* ── Actividades del master (ya sin entidades HTML) ─────────────────── */
PN.ACTIVITY = {
  FACTURA:    'elaboracion de factura',
  CARTAPORTE: 'solicitud de carta porte',
  DOCS:       'recepcion de docs',
  TRANSPORTE: 'recepcion de datos de transporte'
};

/* ── Calendario laboral ─────────────────────────────────────────────── */
// Cada semana: [[mesIni,diaIni],[mesFin,diaFin], etiqueta, esParcial]
// Una semana parcial es de transición entre meses: tiene menos días hábiles.
PN.WEEKS = {
  1: [ [[1,1],[1,2],'Ene 1-2',        true ],
       [[1,5],[1,9],'Ene 5-9',        false],
       [[1,12],[1,16],'Ene 12-16',    false],
       [[1,19],[1,23],'Ene 19-23',    false],
       [[1,26],[1,30],'Ene 26-30',    false] ],
  2: [ [[2,2],[2,6],'Feb 2-6',        false],
       [[2,9],[2,13],'Feb 9-13',      false],
       [[2,16],[2,20],'Feb 16-20',    false],
       [[2,23],[2,27],'Feb 23-27',    false] ],
  3: [ [[3,2],[3,6],'Mar 2-6',        false],
       [[3,9],[3,13],'Mar 9-13',      false],
       [[3,16],[3,20],'Mar 16-20',    false],
       [[3,23],[3,27],'Mar 23-27',    false] ],
  4: [ [[3,30],[4,3],'Mar 30-Abr 3',  false],
       [[4,6],[4,10],'Abr 6-10',      false],
       [[4,13],[4,17],'Abr 13-17',    false],
       [[4,20],[4,24],'Abr 20-24',    false],
       [[4,27],[5,1],'Abr 27-May 1',  true ] ],
  5: [ [[5,4],[5,8],'May 4-8',        false],
       [[5,11],[5,15],'May 11-15',    false],
       [[5,18],[5,22],'May 18-22',    false],
       [[5,25],[5,29],'May 25-29',    false] ],
  6: [ [[6,1],[6,5],'Jun 1-5',        false],
       [[6,8],[6,12],'Jun 8-12',      false],
       [[6,15],[6,19],'Jun 15-19',    false],
       [[6,22],[6,26],'Jun 22-26',    false],
       [[6,29],[7,3],'Jun 29-Jul 3',  true ] ]
};

PN.MONTHS      = { 1:'Enero', 2:'Febrero', 3:'Marzo', 4:'Abril', 5:'Mayo', 6:'Junio' };
PN.MONTH_LIST  = [1,2,3,4,5,6];
PN.WEEK_LABELS = ['Semana 1','Semana 2','Semana 3','Semana 4','Semana 5'];
PN.DAY_NAMES   = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb'];
PN.MONTH_ABBR  = { 1:'ene', 2:'feb', 3:'mar', 4:'abr', 5:'may', 6:'jun', 7:'jul' };

/**
 * Ubica una fecha (Date o 'YYYY-MM-DD') dentro del calendario laboral.
 * @returns {{mes:number, week:string, weekIndex:number, rango:string, parcial:boolean}|null}
 */
PN.weekOf = function (date) {
  var d = (typeof date === 'string') ? new Date(date + 'T00:00:00') : date;
  if (!d || isNaN(d.getTime())) return null;
  var m = d.getMonth() + 1, day = d.getDate();
  var key = m * 100 + day;
  for (var mes in PN.WEEKS) {
    var weeks = PN.WEEKS[mes];
    for (var i = 0; i < weeks.length; i++) {
      var w = weeks[i];
      var lo = w[0][0] * 100 + w[0][1];
      var hi = w[1][0] * 100 + w[1][1];
      if (key >= lo && key <= hi) {
        return { mes: +mes, week: PN.WEEK_LABELS[i], weekIndex: i + 1,
                 rango: w[2] + (w[3] ? ' *' : ''), parcial: w[3] };
      }
    }
  }
  return null; // fuera del calendario laboral: la fila se descarta
};

/** Rango de fechas ('Ene 5-9') de una semana concreta. */
PN.weekRange = function (mes, weekLabel) {
  var idx = PN.WEEK_LABELS.indexOf(weekLabel);
  var w = PN.WEEKS[mes] && PN.WEEKS[mes][idx];
  return w ? w[2] + (w[3] ? ' *' : '') : '';
};
PN.isPartialWeek = function (mes, weekLabel) {
  var idx = PN.WEEK_LABELS.indexOf(weekLabel);
  var w = PN.WEEKS[mes] && PN.WEEKS[mes][idx];
  return !!(w && w[3]);
};
/** Etiqueta corta para ejes: 'Mar S2' (+ ' *' si es semana parcial). */
PN.shortWeek = function (mes, weekLabel) {
  return PN.MONTHS[mes].slice(0, 3) + ' ' + weekLabel.replace('Semana ', 'S') +
         (PN.isPartialWeek(mes, weekLabel) ? ' *' : '');
};
/** Etiqueta larga para tooltips. */
PN.longWeek = function (mes, weekLabel) {
  return PN.MONTHS[mes] + ' ' + weekLabel +
         (PN.isPartialWeek(mes, weekLabel) ? ' * (semana de transición)' : '');
};
/** Todas las (mes, semana) presentes en el calendario, en orden cronológico. */
PN.allWeeks = function (mesFilter) {
  var out = [];
  PN.MONTH_LIST.forEach(function (m) {
    if (mesFilter && mesFilter !== 'all' && m !== mesFilter) return;
    PN.WEEKS[m].forEach(function (w, i) {
      out.push({ mes: m, week: PN.WEEK_LABELS[i], rango: w[2] + (w[3] ? ' *' : ''), parcial: w[3] });
    });
  });
  return out;
};

/* ── Hitos de mejora ────────────────────────────────────────────────── */
// El hito se dibuja sobre la frontera entre la última semana "antes" y la
// primera semana "después", de ahí el offset de +0.5 sobre el índice.
PN.MILESTONES = [
  { id: 'macro',    date: '2026-03-09', color: '#ffc947',
    label: 'Macro Layout Millennium - 9 marzo',
    short: 'Macro Layout Millennium',
    // primera semana YA con la mejora
    firstWeek: { mes: 3, week: 'Semana 3' } },
  { id: 'interfaz', date: '2026-05-28', color: '#00e5b4',
    label: 'Interfaz de Facturas - 28 mayo',
    short: 'Interfaz de Facturas',
    firstWeek: { mes: 5, week: 'Semana 4' } }
];

/* Los tres periodos que compara el análisis Antes/Después. */
PN.PERIODS = [
  { id: 'antes', label: 'ANTES', color: '#ffc947',
    desc: 'Ene 1 – Mar 13', tone: 'proceso manual',
    test: function (r) { return r.mes < 3 || (r.mes === 3 && (r.week === 'Semana 1' || r.week === 'Semana 2')); } },
  { id: 'macro', label: 'POST-MACRO', color: '#4d7cfe',
    desc: 'Mar 16 – May 22', tone: 'con Macro Layout',
    test: function (r) {
      return (r.mes === 3 && (r.week === 'Semana 3' || r.week === 'Semana 4')) || r.mes === 4 ||
             (r.mes === 5 && r.week !== 'Semana 4' && r.week !== 'Semana 5'); } },
  { id: 'interfaz', label: 'POST-INTERFAZ', color: '#00e5b4',
    desc: 'May 25 – Jul 3', tone: 'con Interfaz de Facturas',
    test: function (r) { return (r.mes === 5 && (r.week === 'Semana 4' || r.week === 'Semana 5')) || r.mes === 6; } }
];
PN.periodOf = function (row) {
  for (var i = 0; i < PN.PERIODS.length; i++) if (PN.PERIODS[i].test(row)) return PN.PERIODS[i].id;
  return null;
};

/* ── Paleta para series categóricas ─────────────────────────────────── */
PN.PALETTE = ['#00e5b4','#4d7cfe','#ff6b6b','#ffc947','#a78bfa','#34d399','#f97316','#ec4899',
              '#06b6d4','#84cc16','#f59e0b','#6366f1','#14b8a6','#e11d48','#8b5cf6','#0ea5e9'];

/* Recepciones de documentos posteriores a esta hora se consideran
   no representativas del flujo matutino y se excluyen del promedio. */
PN.SHIPPING_CUTOFF_HOUR = 12;
/* Tipo de embarque excluido del reporte de Shipping. */
PN.SHIPPING_EXCLUDE_TYPE = 'American Mail';

export default PN;
export const {
  REPORTS, PERSON_MAP, PERSON_EXCLUDE, PERSON_FIX, HOUR_FIX, PEOPLE, PERSON_COLOR,
  ACTIVITY, WEEKS, MONTHS, MONTH_LIST, WEEK_LABELS, DAY_NAMES, MONTH_ABBR,
  weekOf, weekRange, isPartialWeek, shortWeek, longWeek, allWeeks,
  MILESTONES, PERIODS, periodOf, PALETTE, SHIPPING_CUTOFF_HOUR, SHIPPING_EXCLUDE_TYPE
} = PN;
