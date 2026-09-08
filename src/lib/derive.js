/**
 * derive.js — Resúmenes calculados a partir de las dos tablas base.
 *
 * Todo aquí es una función pura: recibe el dataset y devuelve el resumen.
 * En la versión anterior del reporte los resúmenes venían pre-calculados y
 * embebidos junto al detalle, así que podían contradecirlo sin que se notara.
 * Calculándolos siempre desde el detalle, eso ya no puede pasar.
 */

import PN from './calendar.js';
import S from './stats.js';

/* ── Filtros por periodo ─────────────────────────────────────────────────── */

export const byPeriod = (rows, period) =>
  period === 'all' || period == null ? rows : rows.filter((r) => r.mes === period);

export function monthsOf(dataset) {
  const seen = {};
  dataset.tiempos.forEach((r) => { seen[r.mes] = 1; });
  dataset.manifiestos.forEach((r) => { seen[r.mes] = 1; });
  return PN.MONTH_LIST.filter((m) => seen[m]);
}

export function peopleOf(rows) {
  const seen = {};
  rows.forEach((r) => { seen[r.persona] = 1; });
  const known = PN.PEOPLE.filter((p) => seen[p]);
  Object.keys(seen).forEach((p) => { if (!known.includes(p)) known.push(p); });
  return known;
}

function hash(s) {
  let h = 0;
  s = String(s);
  for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
  return h;
}

/** Color estable por persona, incluso si aparece alguien fuera del catálogo. */
export function colorFor(persona) {
  return PN.PERSON_COLOR[persona] || PN.PALETTE[Math.abs(hash(persona)) % PN.PALETTE.length];
}

/* ── Tiempos ─────────────────────────────────────────────────────────────── */

function groupBy(rows, keyFn) {
  const out = {};
  rows.forEach((r) => {
    const k = keyFn(r);
    (out[k] = out[k] || []).push(r);
  });
  return out;
}

function summarize(rows) {
  const v = rows.map((r) => r.diff_minutes);
  return { avg: S.mean(v), median: S.median(v), count: v.length, values: v };
}

/** Resumen semanal por persona. */
export function weeklyByPerson(tiempos) {
  const g = groupBy(tiempos, (r) => `${r.persona}|${r.mes}|${r.week_label}`);
  return Object.keys(g).map((k) => {
    const [persona, mes, week_label] = k.split('|');
    return { persona, mes: +mes, week_label, ...summarize(g[k]) };
  });
}

/** Resumen semanal de todo el equipo, en orden cronológico. */
export function weeklyGlobal(tiempos) {
  const g = groupBy(tiempos, (r) => `${r.mes}|${r.week_label}`);
  return Object.keys(g)
    .map((k) => {
      const [mes, week_label] = k.split('|');
      return { mes: +mes, week_label, ...summarize(g[k]) };
    })
    .sort(
      (a, b) =>
        a.mes - b.mes ||
        PN.WEEK_LABELS.indexOf(a.week_label) - PN.WEEK_LABELS.indexOf(b.week_label)
    );
}

/**
 * Serie semanal continua lista para graficar. Incluye las semanas sin datos
 * como null para que el eje no mienta sobre la continuidad del tiempo.
 */
export function weeklySeries(tiempos, { period = 'all', stat = 'median', persona = null } = {}) {
  const rows = persona
    ? weeklyByPerson(tiempos).filter((r) => r.persona === persona)
    : weeklyGlobal(tiempos);
  const index = {};
  rows.forEach((r) => { index[`${r.mes}|${r.week_label}`] = r; });

  return PN.allWeeks(period).map((w) => {
    const r = index[`${w.mes}|${w.week}`];
    return {
      mes: w.mes,
      week: w.week,
      parcial: w.parcial,
      label: PN.shortWeek(w.mes, w.week),
      full: PN.longWeek(w.mes, w.week),
      rango: w.rango,
      value: r ? (stat === 'avg' ? r.avg : r.median) : null,
      avg: r ? r.avg : null,
      median: r ? r.median : null,
      count: r ? r.count : 0
    };
  });
}

/** Volumen por tipo de embarque, opcionalmente filtrado por persona. */
export function volumeByType(tiempos, persona = 'all') {
  const rows = persona && persona !== 'all'
    ? tiempos.filter((r) => r.persona === persona)
    : tiempos;
  const counts = {};
  rows.forEach((r) => { counts[r.SHIPMENTTYPE] = (counts[r.SHIPMENTTYPE] || 0) + 1; });
  return Object.keys(counts)
    .map((type) => ({ type, count: counts[type] }))
    .sort((a, b) => b.count - a.count);
}

/** Agrupa los minutos por persona (p), tipo (t), mes (m) o día de semana (d). */
export function groupMinutes(tiempos, dim) {
  const g = {};
  tiempos.forEach((r) => {
    let k;
    if (dim === 'p') k = r.persona;
    else if (dim === 't') k = r.SHIPMENTTYPE;
    else if (dim === 'm') k = PN.MONTHS[r.mes] || String(r.mes);
    else if (dim === 'd') k = PN.DAY_NAMES[new Date(r.fecha_str + 'T00:00:00').getDay()] || 'Otro';
    else k = 'Todos';
    (g[k] = g[k] || []).push(r.diff_minutes);
  });
  return g;
}

/** Guías de un periodo de mejora: 'antes' | 'macro' | 'interfaz'. */
export function byPeriodId(tiempos, id) {
  return tiempos.filter((r) => PN.periodOf({ mes: r.mes, week: r.week_label }) === id);
}

/* ── Shipping ────────────────────────────────────────────────────────────── */

function summarizeHours(rows) {
  const docs = rows.map((r) => r.dec_docs).filter((v) => v != null && isFinite(v));
  const trans = rows.map((r) => r.dec_trans).filter((v) => v != null && isFinite(v));
  return {
    n_guias: rows.length,
    dec_docs: docs.length ? S.mean(docs) : null,
    dec_trans: trans.length ? S.mean(trans) : null,
    med_docs: docs.length ? S.median(docs) : null,
    med_trans: trans.length ? S.median(trans) : null,
    n_docs: docs.length,
    n_trans: trans.length,
    docs,
    trans
  };
}

export function shippingWeekly(manifiestos) {
  const g = groupBy(manifiestos, (r) => `${r.mes}|${r.week_label}`);
  return Object.keys(g)
    .map((k) => {
      const [mes, week_label] = k.split('|');
      return {
        mes: +mes,
        mes_nombre: PN.MONTHS[+mes],
        week_label,
        rango: PN.weekRange(+mes, week_label),
        ...summarizeHours(g[k])
      };
    })
    .sort(
      (a, b) =>
        a.mes - b.mes ||
        PN.WEEK_LABELS.indexOf(a.week_label) - PN.WEEK_LABELS.indexOf(b.week_label)
    );
}

export function shippingMonthly(manifiestos) {
  const g = groupBy(manifiestos, (r) => r.mes);
  return Object.keys(g)
    .map((m) => ({ mes: +m, mes_nombre: PN.MONTHS[+m], ...summarizeHours(g[m]) }))
    .sort((a, b) => a.mes - b.mes);
}

export function shippingSeries(manifiestos, period = 'all') {
  const index = {};
  shippingWeekly(manifiestos).forEach((r) => { index[`${r.mes}|${r.week_label}`] = r; });
  return PN.allWeeks(period).map((w) => {
    const r = index[`${w.mes}|${w.week}`];
    return {
      mes: w.mes,
      week: w.week,
      label: PN.shortWeek(w.mes, w.week),
      full: PN.longWeek(w.mes, w.week),
      rango: w.rango,
      docs: r ? r.dec_docs : null,
      trans: r ? r.dec_trans : null,
      medDocs: r ? r.med_docs : null,
      medTrans: r ? r.med_trans : null,
      n: r ? r.n_guias : 0
    };
  });
}

/* ── Cross Data ──────────────────────────────────────────────────────────── */

/** Une ambos reportes por número de guía. */
export function crossPairs(tiempos, manifiestos) {
  const index = {};
  manifiestos.forEach((r) => { index[r.GUIANUMBER] = r; });
  const out = [];
  tiempos.forEach((t) => {
    const m = index[t.GUIANUMBER];
    if (!m) return;
    out.push({
      guia: t.GUIANUMBER,
      persona: t.persona,
      mes: t.mes,
      week: t.week_label,
      tipo: t.SHIPMENTTYPE,
      minutos: t.diff_minutes,
      docs: m.dec_docs != null && isFinite(m.dec_docs) ? m.dec_docs : null,
      trans: m.dec_trans != null && isFinite(m.dec_trans) ? m.dec_trans : null,
      fecha: t.fecha_str
    });
  });
  return out;
}

/* ── Integridad ──────────────────────────────────────────────────────────── */

export function healthChecks(dataset) {
  const { tiempos: t, manifiestos: m } = dataset;
  const out = [];
  const chk = (ok, label, value, warn = false) => out.push({ ok, warn, label, value });

  chk(t.length > 0, 'Guías en el reporte de tiempos', t.length);
  chk(m.length > 0, 'Guías en el reporte de shipping', m.length);

  const counts = {};
  t.forEach((r) => { counts[r.GUIANUMBER] = (counts[r.GUIANUMBER] || 0) + 1; });
  const dups = Object.values(counts).filter((c) => c > 1).length;
  chk(dups === 0, 'Números de guía duplicados en tiempos', dups);

  const neg = t.filter((r) => !(r.diff_minutes >= 0)).length;
  chk(neg === 0, 'Tiempos negativos o no numéricos', neg);

  const badWeek = t.filter((r) => !PN.WEEK_LABELS.includes(r.week_label)).length;
  chk(badWeek === 0, 'Guías fuera del calendario laboral', badWeek);

  const unknown = t.filter((r) => !PN.PEOPLE.includes(r.persona));
  chk(
    unknown.length === 0,
    'Personas fuera del catálogo',
    unknown.length
      ? `${unknown.length} (${[...new Set(unknown.map((r) => r.persona))].slice(0, 3).join(', ')})`
      : 0
  );

  const american = m.filter((r) => r.SHIPMENTTYPE === PN.SHIPPING_EXCLUDE_TYPE).length;
  chk(american === 0, `Shipping con tipo "${PN.SHIPPING_EXCLUDE_TYPE}" (debe excluirse)`, american);

  const late = m.filter((r) => r.dec_docs != null && r.dec_docs >= PN.SHIPPING_CUTOFF_HOUR).length;
  chk(late === 0, `Recepciones ≥ ${PN.SHIPPING_CUTOFF_HOUR}:00 dentro de los promedios`, late);

  chk(crossPairs(t, m).length > 0, 'Guías presentes en ambos reportes', crossPairs(t, m).length);

  const notas = m.filter((r) => r.nota_fecha).length;
  chk(true, 'Guías con docs y transporte en días distintos', notas, notas > 0);

  return out;
}
