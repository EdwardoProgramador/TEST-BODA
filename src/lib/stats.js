/* ==========================================================================
   stats.js — Funciones estadísticas del dashboard.

   Todas las fórmulas están documentadas con su definición formal para que
   cualquiera pueda auditarlas contra un libro de texto o contra R/Python.

   Correcciones frente a la versión anterior del dashboard:
     · Cuantiles con interpolación lineal (tipo 7, el default de R y numpy)
       en lugar de indexar con Math.floor(n*p), que producía sesgo y
       off-by-one en Q1/Q3, en las vallas de Tukey y en los topes p90.
     · Varianza muestral (÷ n-1), no poblacional (÷ n).
     · Límites de control por I-MR (rango móvil) en lugar de μ ± 3σ global:
       σ global se infla con los outliers y deja de detectar nada.
     · Histogramas de ancho de bin constante (antes mezclaba bins de 15,
       30 y 50 min dibujados con el mismo ancho: distorsionaba la densidad).
     · Curvas teóricas por diferencia de CDF, no por pdf(punto medio).
   ========================================================================== */

const S = {};



/* ── Utilidades base ────────────────────────────────────────────────── */

/** Copia numérica ordenada ascendente, descartando no-finitos. */
S.sorted = function (values) {
  return values.filter(function (v) { return typeof v === 'number' && isFinite(v); })
               .sort(function (a, b) { return a - b; });
};

S.sum = function (v) { var s = 0; for (var i = 0; i < v.length; i++) s += v[i]; return s; };

S.mean = function (v) { return v.length ? S.sum(v) / v.length : NaN; };

/**
 * Cuantil por interpolación lineal entre order statistics (tipo 7).
 *   h = (n − 1)·p ;  Q(p) = x[⌊h⌋] + (h − ⌊h⌋)·(x[⌊h⌋+1] − x[⌊h⌋])
 * Es el método por defecto de R (quantile type=7) y de numpy.percentile.
 * @param {number[]} values sin ordenar (se ordena internamente) o ya ordenado
 * @param {number} p en [0,1]
 * @param {boolean} [isSorted]
 */
S.quantile = function (values, p, isSorted) {
  var x = isSorted ? values : S.sorted(values);
  var n = x.length;
  if (!n) return NaN;
  if (n === 1) return x[0];
  if (p <= 0) return x[0];
  if (p >= 1) return x[n - 1];
  var h = (n - 1) * p;
  var lo = Math.floor(h);
  var frac = h - lo;
  return frac === 0 ? x[lo] : x[lo] + frac * (x[lo + 1] - x[lo]);
};

S.median = function (values, isSorted) { return S.quantile(values, 0.5, isSorted); };

/** Varianza muestral: Σ(xᵢ − x̄)² / (n − 1). Con n<2 devuelve NaN. */
S.variance = function (values) {
  var n = values.length;
  if (n < 2) return NaN;
  var m = S.mean(values), acc = 0;
  for (var i = 0; i < n; i++) { var d = values[i] - m; acc += d * d; }
  return acc / (n - 1);
};
S.stdev = function (values) { var v = S.variance(values); return isNaN(v) ? NaN : Math.sqrt(v); };

/** Resumen completo de una muestra. */
S.describe = function (values) {
  var x = S.sorted(values), n = x.length;
  if (!n) return { n: 0 };
  return {
    n: n,
    min: x[0], max: x[n - 1],
    q1: S.quantile(x, 0.25, true),
    median: S.quantile(x, 0.5, true),
    q3: S.quantile(x, 0.75, true),
    mean: S.mean(x),
    sd: S.stdev(x),
    iqr: S.quantile(x, 0.75, true) - S.quantile(x, 0.25, true)
  };
};

/**
 * Estadísticos de caja y bigotes (Tukey).
 * Vallas: Q1 − k·IQR y Q3 + k·IQR (k = 1.5 por convención).
 * Los bigotes NO se dibujan en las vallas: se dibujan en el dato real más
 * extremo que todavía cae dentro de ellas. Todo lo de fuera es outlier.
 */
S.boxStats = function (values, k) {
  k = (k == null) ? 1.5 : k;
  var x = S.sorted(values), n = x.length;
  if (!n) return null;
  var q1 = S.quantile(x, 0.25, true),
      q2 = S.quantile(x, 0.50, true),
      q3 = S.quantile(x, 0.75, true),
      iqr = q3 - q1,
      lowFence = q1 - k * iqr,
      highFence = q3 + k * iqr;
  var inliers = x.filter(function (v) { return v >= lowFence && v <= highFence; });
  var outliers = x.filter(function (v) { return v < lowFence || v > highFence; });
  return {
    n: n, q1: q1, median: q2, q3: q3, iqr: iqr,
    lowFence: lowFence, highFence: highFence,
    whiskerLow:  inliers.length ? inliers[0] : q1,
    whiskerHigh: inliers.length ? inliers[inliers.length - 1] : q3,
    outliers: outliers, min: x[0], max: x[n - 1],
    mean: S.mean(x)
  };
};

/* ── Control estadístico de proceso ─────────────────────────────────── */

/**
 * Carta de individuales I-MR sobre una serie temporal.
 *
 *   MR̄ = media de |xᵢ − xᵢ₋₁|            (rango móvil, n=2)
 *   σ̂  = MR̄ / d₂  con d₂ = 1.128        (constante para subgrupos de 2)
 *   LC  = x̄ ;  LCS = x̄ + 3σ̂ ;  LCI = x̄ − 3σ̂
 *
 * Por qué no μ ± 3σ con la desviación global: la desviación global incluye
 * la variación ENTRE puntos (causas especiales), así que los outliers
 * inflan los límites y el gráfico deja de señalar nada. El rango móvil
 * sólo mide variación de corto plazo — que es lo que debe definir el
 * "ruido normal" del proceso. Es el método estándar (Montgomery, cap. 6).
 *
 * @param {number[]} series valores en orden cronológico
 * @param {{floorAtZero?:boolean}} [opts]
 */
S.controlLimitsIMR = function (series, opts) {
  opts = opts || {};
  var x = series.filter(function (v) { return typeof v === 'number' && isFinite(v); });
  var n = x.length;
  if (n < 2) return null;
  var mrSum = 0;
  for (var i = 1; i < n; i++) mrSum += Math.abs(x[i] - x[i - 1]);
  var mrBar = mrSum / (n - 1);
  var d2 = 1.128;
  var sigma = mrBar / d2;
  var cl = S.mean(x);
  var lcl = cl - 3 * sigma;
  if (opts.floorAtZero !== false && lcl < 0) lcl = 0;
  return { cl: cl, ucl: cl + 3 * sigma, lcl: lcl, sigma: sigma, mrBar: mrBar, n: n };
};

/**
 * Reglas de Nelson aplicables a una carta de individuales.
 *  Regla 1 — un punto fuera de los límites 3σ (causa especial evidente).
 *  Regla 2 — 9 puntos consecutivos del mismo lado de la línea central
 *            (desplazamiento sostenido del proceso, aunque nada se salga).
 * Devuelve, por cada punto, qué reglas dispara.
 */
S.nelsonRules = function (series, limits) {
  var flags = series.map(function () { return []; });
  if (!limits) return flags;
  series.forEach(function (v, i) {
    if (!isFinite(v)) return;
    if (v > limits.ucl || v < limits.lcl) flags[i].push(1);
  });
  var run = 0, side = 0;
  for (var i = 0; i < series.length; i++) {
    var v = series[i];
    if (!isFinite(v)) { run = 0; side = 0; continue; }
    var s = v > limits.cl ? 1 : (v < limits.cl ? -1 : 0);
    if (s !== 0 && s === side) { run++; } else { side = s; run = s === 0 ? 0 : 1; }
    if (run >= 9) for (var j = i - 8; j <= i; j++) if (flags[j].indexOf(2) < 0) flags[j].push(2);
  }
  return flags;
};

/* ── Distribución normal ────────────────────────────────────────────── */

/** erf por la aproximación de Abramowitz & Stegun 7.1.26 (|ε| < 1.5e-7). */
S.erf = function (x) {
  var sign = x < 0 ? -1 : 1;
  x = Math.abs(x);
  var a1 = 0.254829592, a2 = -0.284496736, a3 = 1.421413741,
      a4 = -1.453152027, a5 = 1.061405429, p = 0.3275911;
  var t = 1 / (1 + p * x);
  var y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
  return sign * y;
};
/** Φ(z): función de distribución acumulada normal estándar. */
S.normalCdf = function (z) { return 0.5 * (1 + S.erf(z / Math.SQRT2)); };
/** φ(x; μ, σ): densidad normal. */
S.normalPdf = function (x, mu, sd) {
  return Math.exp(-0.5 * Math.pow((x - mu) / sd, 2)) / (sd * Math.sqrt(2 * Math.PI));
};

/* ── Rangos (para pruebas no paramétricas) ──────────────────────────── */

/** Rangos con promedio en los empates. Devuelve {ranks, tieGroups}. */
S.rank = function (values) {
  var idx = values.map(function (v, i) { return { v: v, i: i }; })
                  .sort(function (a, b) { return a.v - b.v; });
  var ranks = new Array(values.length), ties = [];
  var i = 0;
  while (i < idx.length) {
    var j = i;
    while (j + 1 < idx.length && idx[j + 1].v === idx[i].v) j++;
    var avg = (i + j) / 2 + 1;           // rangos base 1
    for (var k = i; k <= j; k++) ranks[idx[k].i] = avg;
    if (j > i) ties.push(j - i + 1);
    i = j + 1;
  }
  return { ranks: ranks, ties: ties };
};

/**
 * Prueba U de Mann-Whitney (Wilcoxon rank-sum), bilateral.
 *
 * H₀: las dos muestras provienen de la misma distribución.
 * Se usa en lugar de la t de Student porque los tiempos de elaboración
 * tienen sesgo derecho fuerte (outliers de 4000+ min) y la t asume
 * normalidad. La U sólo asume independencia y una escala ordinal.
 *
 *   U₁ = R₁ − n₁(n₁+1)/2
 *   μ_U = n₁n₂/2
 *   σ²_U = (n₁n₂/12)·[(N+1) − Σ(tᵢ³−tᵢ)/(N(N−1))]   ← corrección por empates
 *   z = (U − μ_U ± 0.5) / σ_U                        ← corrección de continuidad
 *
 * Devuelve además el tamaño del efecto (correlación biserial de rangos):
 *   r_rb = 1 − 2U/(n₁n₂)  ∈ [−1, 1]
 */
S.mannWhitneyU = function (a, b) {
  var A = a.filter(isFinite), B = b.filter(isFinite);
  var n1 = A.length, n2 = B.length;
  if (n1 < 2 || n2 < 2) return null;
  var all = A.concat(B);
  var r = S.rank(all);
  var R1 = 0;
  for (var i = 0; i < n1; i++) R1 += r.ranks[i];
  var U1 = R1 - n1 * (n1 + 1) / 2;
  var U2 = n1 * n2 - U1;
  var U = Math.min(U1, U2);
  var N = n1 + n2;
  var muU = n1 * n2 / 2;
  var tieTerm = 0;
  r.ties.forEach(function (t) { tieTerm += t * t * t - t; });
  var varU = (n1 * n2 / 12) * ((N + 1) - tieTerm / (N * (N - 1)));
  if (varU <= 0) return null;
  var z = (U - muU + 0.5) / Math.sqrt(varU);   // continuidad hacia μ
  var p = 2 * S.normalCdf(-Math.abs(z));
  return {
    U: U, U1: U1, U2: U2, n1: n1, n2: n2, z: z,
    p: Math.min(1, p),
    // Probabilidad de que un valor de A supere a uno de B (common language effect size)
    cles: U1 / (n1 * n2),
    effect: 1 - 2 * U / (n1 * n2)
  };
};

/* ── Remuestreo (bootstrap) ─────────────────────────────────────────── */

/** PRNG determinista mulberry32: mismos datos ⇒ mismo IC en cada carga. */
S.rng = function (seed) {
  var t = seed >>> 0;
  return function () {
    t += 0x6D2B79F5;
    var r = t;
    r = Math.imul(r ^ (r >>> 15), r | 1);
    r ^= r + Math.imul(r ^ (r >>> 7), r | 61);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
};

/**
 * Intervalo de confianza por bootstrap percentil.
 * Remuestrea con reemplazo B veces, calcula el estadístico en cada réplica
 * y toma los percentiles α/2 y 1−α/2 de la distribución de réplicas.
 */
S.bootstrapCI = function (values, statFn, opts) {
  opts = opts || {};
  var B = opts.iterations || 4000, alpha = opts.alpha || 0.05;
  var x = values.filter(isFinite), n = x.length;
  if (n < 3) return null;
  var rand = S.rng(opts.seed || 20260101);
  var reps = new Array(B), sample = new Array(n);
  for (var b = 0; b < B; b++) {
    for (var i = 0; i < n; i++) sample[i] = x[(rand() * n) | 0];
    reps[b] = statFn(sample);
  }
  reps = S.sorted(reps);
  return {
    estimate: statFn(x),
    lower: S.quantile(reps, alpha / 2, true),
    upper: S.quantile(reps, 1 - alpha / 2, true),
    iterations: B, alpha: alpha
  };
};

/**
 * IC bootstrap de la DIFERENCIA entre dos muestras independientes.
 * Devuelve la diferencia absoluta (b − a) y el cambio relativo en % sobre a.
 */
S.bootstrapDiff = function (a, b, statFn, opts) {
  opts = opts || {};
  var B = opts.iterations || 4000, alpha = opts.alpha || 0.05;
  var A = a.filter(isFinite), Bs = b.filter(isFinite);
  if (A.length < 3 || Bs.length < 3) return null;
  var rand = S.rng(opts.seed || 20260101);
  var diffs = new Array(B), pcts = new Array(B);
  var sa = new Array(A.length), sb = new Array(Bs.length);
  for (var k = 0; k < B; k++) {
    for (var i = 0; i < A.length; i++)  sa[i] = A[(rand() * A.length) | 0];
    for (var j = 0; j < Bs.length; j++) sb[j] = Bs[(rand() * Bs.length) | 0];
    var va = statFn(sa), vb = statFn(sb);
    diffs[k] = vb - va;
    pcts[k] = va !== 0 ? (vb - va) / va * 100 : NaN;
  }
  var ds = S.sorted(diffs), ps = S.sorted(pcts);
  var v0 = statFn(A), v1 = statFn(Bs);
  return {
    from: v0, to: v1,
    diff: v1 - v0,
    diffLower: S.quantile(ds, alpha / 2, true),
    diffUpper: S.quantile(ds, 1 - alpha / 2, true),
    pct: v0 !== 0 ? (v1 - v0) / v0 * 100 : NaN,
    pctLower: S.quantile(ps, alpha / 2, true),
    pctUpper: S.quantile(ps, 1 - alpha / 2, true),
    iterations: B, alpha: alpha
  };
};

/* ── Correlación ────────────────────────────────────────────────────── */

/**
 * Pearson r sobre pares (x,y), con n y p-valor bilateral.
 * El p-valor usa la transformación z de Fisher:
 *   z = artanh(r)·√(n−3)  ~ N(0,1) bajo H₀: ρ = 0
 * (exacta asintóticamente; con n > 30 la diferencia frente a la t es
 *  despreciable, y aquí n ronda las 500 parejas).
 */
S.pearson = function (xs, ys) {
  var X = [], Y = [];
  for (var i = 0; i < xs.length; i++) {
    if (isFinite(xs[i]) && isFinite(ys[i])) { X.push(xs[i]); Y.push(ys[i]); }
  }
  var n = X.length;
  if (n < 4) return null;
  var mx = S.mean(X), my = S.mean(Y);
  var num = 0, dx = 0, dy = 0;
  for (var j = 0; j < n; j++) {
    var a = X[j] - mx, b = Y[j] - my;
    num += a * b; dx += a * a; dy += b * b;
  }
  if (dx === 0 || dy === 0) return null;
  var r = num / Math.sqrt(dx * dy);
  var rc = Math.max(-0.999999, Math.min(0.999999, r));
  var z = 0.5 * Math.log((1 + rc) / (1 - rc)) * Math.sqrt(n - 3);
  return { r: r, n: n, z: z, p: Math.min(1, 2 * S.normalCdf(-Math.abs(z))), r2: r * r };
};

/**
 * Spearman ρ: Pearson sobre los rangos. Robusto a outliers y a relaciones
 * monótonas no lineales — más apropiado que Pearson para estos datos.
 */
S.spearman = function (xs, ys) {
  var X = [], Y = [];
  for (var i = 0; i < xs.length; i++) {
    if (isFinite(xs[i]) && isFinite(ys[i])) { X.push(xs[i]); Y.push(ys[i]); }
  }
  if (X.length < 4) return null;
  return S.pearson(S.rank(X).ranks, S.rank(Y).ranks);
};

/** Regresión lineal por mínimos cuadrados: y = a + b·x */
S.linreg = function (xs, ys) {
  var X = [], Y = [];
  for (var i = 0; i < xs.length; i++) {
    if (isFinite(xs[i]) && isFinite(ys[i])) { X.push(xs[i]); Y.push(ys[i]); }
  }
  var n = X.length;
  if (n < 2) return null;
  var mx = S.mean(X), my = S.mean(Y), sxy = 0, sxx = 0;
  for (var j = 0; j < n; j++) { sxy += (X[j] - mx) * (Y[j] - my); sxx += Math.pow(X[j] - mx, 2); }
  if (sxx === 0) return null;
  var slope = sxy / sxx;
  return { slope: slope, intercept: my - slope * mx, n: n };
};

/* ── Histogramas y curvas teóricas ──────────────────────────────────── */

/**
 * Ancho de bin de Freedman–Diaconis: h = 2·IQR·n^(−1/3).
 * Es robusto a outliers (usa IQR, no el rango). Si el IQR es 0 cae a Sturges.
 */
S.binWidthFD = function (values) {
  var x = S.sorted(values), n = x.length;
  if (n < 2) return 1;
  var iqr = S.quantile(x, 0.75, true) - S.quantile(x, 0.25, true);
  if (iqr <= 0) {
    var k = Math.ceil(Math.log2(n) + 1);
    return Math.max((x[n - 1] - x[0]) / k, 1e-9);
  }
  return 2 * iqr * Math.pow(n, -1 / 3);
};

/** Redondea a un ancho "bonito" (1, 2, 2.5 o 5 × 10ᵏ) para ejes legibles. */
S.niceWidth = function (w) {
  if (!isFinite(w) || w <= 0) return 1;
  var mag = Math.pow(10, Math.floor(Math.log10(w)));
  var norm = w / mag;
  var nice = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 2.5 ? 2.5 : norm <= 5 ? 5 : 10;
  return nice * mag;
};

/**
 * Histograma de bins de ANCHO CONSTANTE (requisito para que la altura de
 * las barras sea comparable entre sí y contra una curva de densidad).
 * @param {number[]} values
 * @param {{width?:number, min?:number, max?:number, maxBins?:number}} [opts]
 */
S.histogram = function (values, opts) {
  opts = opts || {};
  var x = S.sorted(values);
  if (!x.length) return { bins: [], width: 0, n: 0 };
  var lo = (opts.min != null) ? opts.min : x[0];
  var hi = (opts.max != null) ? opts.max : x[x.length - 1];
  if (hi <= lo) hi = lo + 1;
  var w = opts.width || S.niceWidth(S.binWidthFD(x));
  var maxBins = opts.maxBins || 24;
  while ((hi - lo) / w > maxBins) w = S.niceWidth(w * 1.5);
  var start = Math.floor(lo / w) * w;
  var count = Math.max(1, Math.ceil((hi - start) / w));
  var bins = [];
  for (var i = 0; i < count; i++) {
    bins.push({ lo: start + i * w, hi: start + (i + 1) * w, count: 0 });
  }
  var inRange = 0;
  x.forEach(function (v) {
    var i = Math.floor((v - start) / w);
    if (i >= 0 && i < bins.length) { bins[i].count++; inRange++; }
    else if (i >= bins.length) { bins[bins.length - 1].count++; inRange++; }
  });
  return { bins: bins, width: w, n: inRange, start: start };
};

/**
 * Conteos esperados por bin bajo una normal ajustada por máxima verosimilitud.
 * Se calcula por diferencia de CDF — NO evaluando la densidad en el punto
 * medio, que sólo es exacto si el bin es infinitesimal.
 */
S.expectedNormal = function (bins, values) {
  var x = values.filter(isFinite);
  if (x.length < 2) return null;
  var mu = S.mean(x), sd = S.stdev(x), n = x.length;
  if (!isFinite(sd) || sd <= 0) return null;
  return {
    mu: mu, sd: sd,
    counts: bins.map(function (b) {
      return n * (S.normalCdf((b.hi - mu) / sd) - S.normalCdf((b.lo - mu) / sd));
    })
  };
};

/**
 * Conteos esperados bajo una log-normal ajustada sobre ln(x).
 * Los tiempos de proceso con cola derecha larga se ajustan mucho mejor a
 * una log-normal que a una normal; superponer ambas deja ver cuál describe
 * de verdad al proceso.
 */
S.expectedLognormal = function (bins, values) {
  var x = values.filter(function (v) { return isFinite(v) && v > 0; });
  if (x.length < 3) return null;
  var logs = x.map(Math.log);
  var mu = S.mean(logs), sd = S.stdev(logs), n = x.length;
  if (!isFinite(sd) || sd <= 0) return null;
  var cdf = function (v) { return v <= 0 ? 0 : S.normalCdf((Math.log(v) - mu) / sd); };
  return {
    mu: mu, sd: sd,
    // Se escala por n (todos los datos), aunque los bins no cubran los ceros.
    counts: bins.map(function (b) { return n * (cdf(b.hi) - cdf(b.lo)); })
  };
};

/* ── Series de tiempo ───────────────────────────────────────────────── */

/**
 * Media móvil. Por defecto CENTRADA: el valor del punto i usa la ventana
 * [i−k, i+k]. La versión rezagada (trailing) desplaza la tendencia media
 * ventana hacia la derecha, lo que hacía "llegar tarde" los puntos de
 * inflexión en el gráfico anterior.
 * @param {number[]} values
 * @param {number} window tamaño de ventana (se fuerza impar si es centrada)
 * @param {boolean} [centered=true]
 */
S.movingAverage = function (values, window, centered) {
  centered = (centered !== false);
  var w = Math.max(2, Math.round(window));
  if (centered && w % 2 === 0) w += 1;
  var k = Math.floor(w / 2);
  return values.map(function (_, i) {
    var lo = centered ? i - k : i - w + 1;
    var hi = centered ? i + k : i;
    if (lo < 0 || hi >= values.length) return null;
    var slice = [];
    for (var j = lo; j <= hi; j++) if (isFinite(values[j])) slice.push(values[j]);
    return slice.length === w ? S.mean(slice) : null;
  });
};

/* ── Ayudas de presentación ─────────────────────────────────────────── */

/**
 * Tope superior de eje robusto: percentil p (0.90 por defecto) escalado.
 * Evita que un único outlier de 4000 min aplaste toda la serie, pero se
 * calcula con cuantil interpolado (antes se indexaba con floor).
 */
S.axisCap = function (values, p, factor, minCap) {
  var x = S.sorted(values);
  if (!x.length) return minCap || 10;
  var q = S.quantile(x, p == null ? 0.9 : p, true);
  var cap = Math.max(q * (factor == null ? 1.5 : factor), minCap || 0);
  var step = cap > 500 ? 100 : cap > 200 ? 50 : cap > 100 ? 25 : cap > 50 ? 10 : 5;
  return Math.max(step, Math.ceil(cap / step) * step);
};

/** Paso de rejilla sugerido para un rango dado. */
S.axisStep = function (range) {
  return range > 500 ? 100 : range > 200 ? 50 : range > 100 ? 25 : range > 50 ? 10 : range > 20 ? 5 : 2;
};

/** Formatea un p-valor para lectura humana. */
S.formatP = function (p) {
  if (p == null || isNaN(p)) return '—';
  if (p < 0.0001) return 'p < 0.0001';
  if (p < 0.001)  return 'p < 0.001';
  return 'p = ' + p.toFixed(p < 0.01 ? 4 : 3);
};

/** Lectura en español llano de la fuerza de una correlación. */
S.describeR = function (r) {
  var a = Math.abs(r);
  var fuerza = a < 0.1 ? 'prácticamente nula'
             : a < 0.3 ? 'muy débil'
             : a < 0.5 ? 'débil'
             : a < 0.7 ? 'moderada'
             : a < 0.9 ? 'fuerte' : 'muy fuerte';
  return fuerza + (a < 0.1 ? '' : (r > 0 ? ' y positiva' : ' y negativa'));
};

export default S;
