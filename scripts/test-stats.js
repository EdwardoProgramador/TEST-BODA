/**
 * Pruebas de la capa estadística. Se ejecutan con `npm test`.
 *
 * No necesitan navegador: src/lib/stats.js no toca el DOM. Los valores
 * esperados salen de R / numpy, no de la propia implementación.
 */

import S from '../src/lib/stats.js';
import PN from '../src/lib/calendar.js';
import I from '../src/lib/ingest.js';
import DEMO from '../src/lib/demo.js';
import * as D from '../src/lib/derive.js';

let pass = 0;
let fail = 0;

function ok(label, actual, expected, tol = 1e-9) {
  const good = Math.abs(actual - expected) <= tol;
  if (good) pass++; else fail++;
  console.log(`${good ? '  ✔' : '  ✕'} ${label}  →  ${actual}${good ? '' : `   (esperado ${expected})`}`);
}
function is(label, actual, expected) {
  const good = actual === expected;
  if (good) pass++; else fail++;
  console.log(`${good ? '  ✔' : '  ✕'} ${label}  →  ${actual}${good ? '' : `   (esperado ${expected})`}`);
}

console.log('\nCuantiles (interpolación lineal tipo 7 — default de R y numpy)');
ok('quantile([1,2,3,4], .25)', S.quantile([1, 2, 3, 4], 0.25), 1.75);
ok('quantile([1,2,3,4], .75)', S.quantile([1, 2, 3, 4], 0.75), 3.25);
ok('median([1,2,3,4])', S.median([1, 2, 3, 4]), 2.5);
ok('quantile([1..10], .9)', S.quantile([1,2,3,4,5,6,7,8,9,10], 0.9), 9.1);

console.log('\nDispersión (varianza muestral, ÷ n−1)');
ok('variance([2,4,4,4,5,5,7,9])', S.variance([2, 4, 4, 4, 5, 5, 7, 9]), 32 / 7, 1e-12);

console.log('\nNormal');
ok('Φ(0)', S.normalCdf(0), 0.5, 1e-7);
ok('Φ(1.96)', S.normalCdf(1.96), 0.9750021, 1e-6);

console.log('\nMann-Whitney U');
const mw = S.mannWhitneyU([1, 2, 3, 4, 5], [6, 7, 8, 9, 10]);
is('separación perfecta → U = 0', mw.U, 0);
is('separación perfecta → p < 0.05', mw.p < 0.05, true);
const mw2 = S.mannWhitneyU([1, 2, 3, 4, 5], [1, 2, 3, 4, 5]);
is('muestras idénticas → p > 0.5', mw2.p > 0.5, true);

console.log('\nCarta de control I-MR (frente a μ ± 3σ global)');
const serie = [40, 42, 38, 41, 39, 43, 40, 900, 41, 39];
const imr = S.controlLimitsIMR(serie);
const viejo = S.mean(serie) + 3 * S.stdev(serie);
is('I-MR detecta el outlier de 900', 900 > imr.ucl, true);
is('μ+3σ global NO lo detectaba', 900 > viejo, false);

console.log('\nBootstrap determinista');
const A = Array.from({ length: 120 }, (_, i) => 20 + (i % 17) * 3);
const Bs = Array.from({ length: 110 }, (_, i) => 10 + (i % 13) * 2);
const d1 = S.bootstrapDiff(A, Bs, S.median, { iterations: 2000 });
const d2 = S.bootstrapDiff(A, Bs, S.median, { iterations: 2000 });
is('mismo dato ⇒ mismo intervalo', d1.pctLower === d2.pctLower && d1.pctUpper === d2.pctUpper, true);

console.log('\nMedia móvil centrada');
is('MA3 centrada de [1..5]', JSON.stringify(S.movingAverage([1, 2, 3, 4, 5], 3)), '[null,2,3,4,null]');

console.log('\nCalendario laboral');
is('Mar 31 pertenece a Abril S1', PN.weekOf('2026-03-31').mes, 4);
is('Jul 3 pertenece a Junio S5', PN.weekOf('2026-07-03').mes, 6);
is('Jul 6 queda fuera del calendario', PN.weekOf('2026-07-06'), null);

console.log('\nNormalización del Master');
is('entidades HTML en la actividad', I.fold('Elaboraci&oacute;n de factura'), PN.ACTIVITY.FACTURA);
is('ceros a la izquierda en la guía', I.normGuia('0082'), '82');
const d = I.toDate(46090.2715277778);
is('serial de Excel → hora local', `${d.getHours()}:${String(d.getMinutes()).padStart(2, '0')}`, '6:31');

console.log('\nDataset demo (contrastado con el reporte original)');
is('total de guías de tiempos', DEMO.tiempos.length, 592);
is('total de guías de shipping', DEMO.manifiestos.length, 546);
ok('mediana global', S.median(DEMO.tiempos.map((r) => r.diff_minutes)), 26, 0.05);
ok('promedio global', S.mean(DEMO.tiempos.map((r) => r.diff_minutes)), 66.3, 0.05);
is('semanas derivadas', D.weeklyGlobal(DEMO.tiempos).length, 27);
is('guías en ambos reportes', D.crossPairs(DEMO.tiempos, DEMO.manifiestos).length, 540);
is('comprobaciones de integridad', D.healthChecks(DEMO).every((c) => c.ok), true);

console.log(`\n${fail === 0 ? '✔' : '✕'} ${pass} pruebas correctas, ${fail} fallidas\n`);
process.exit(fail === 0 ? 0 : 1);
