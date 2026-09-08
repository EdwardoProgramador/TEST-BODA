/**
 * format.js — Formateo de valores para presentación.
 */

/** 6.5166 → '06:31' */
export function hour(dec) {
  if (dec == null || isNaN(dec)) return '—';
  const total = Math.round(dec * 60);
  let h = Math.floor(total / 60);
  const m = total % 60;
  if (h >= 24) h -= 24;
  return String(h).padStart(2, '0') + ':' + String(m).padStart(2, '0');
}

/** '06:31' → 6.5166 */
export function dec(hhmm) {
  if (!hhmm || hhmm === 'nan') return null;
  const p = String(hhmm).split(':');
  const h = parseInt(p[0], 10);
  if (isNaN(h)) return null;
  return h + (parseInt(p[1] || '0', 10) || 0) / 60 + (parseInt(p[2] || '0', 10) || 0) / 3600;
}

export function int(v) {
  return v == null || isNaN(v) ? '—' : Math.round(v).toLocaleString('es-MX');
}

export function minutes(v, digits = 0) {
  return v == null || isNaN(v) ? '—' : `${v.toFixed(digits)} min`;
}

/**
 * Entero cuando lo es, un decimal cuando no. Evita presentar una mediana de
 * 16.5 como "17" (o como "16", que era lo que hacía el reporte anterior).
 */
export function nice(v) {
  if (v == null || isNaN(v)) return '—';
  return Math.abs(v - Math.round(v)) < 1e-9 ? String(Math.round(v)) : v.toFixed(1);
}

export function pct(v, digits = 1) {
  if (v == null || isNaN(v)) return '—';
  return `${v > 0 ? '+' : ''}${v.toFixed(digits)}%`;
}

const DAY_NAMES = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_ABBR = { 1: 'ene', 2: 'feb', 3: 'mar', 4: 'abr', 5: 'may', 6: 'jun', 7: 'jul' };

/** '2026-03-09' → 'Lun 9 mar' */
export function dayLabel(iso) {
  const d = new Date(iso + 'T00:00:00');
  if (isNaN(d.getTime())) return iso;
  return `${DAY_NAMES[d.getDay()]} ${d.getDate()} ${MONTH_ABBR[d.getMonth() + 1] || ''}`;
}
