/**
 * DataContext — Dataset activo y periodo seleccionado.
 *
 * Guarda únicamente las dos tablas base (tiempos y manifiestos). Los resúmenes
 * los calculan las funciones de lib/derive.js, memoizadas por cada página.
 *
 * El dataset se persiste en localStorage para que sobreviva a recargas y a la
 * navegación; el periodo va en sessionStorage porque es un filtro de sesión.
 */

import { createContext, useContext, useMemo, useState, useCallback } from 'react';
import DEMO from '../lib/demo.js';
import { monthsOf } from '../lib/derive.js';

const LS_KEY = 'pn.dataset.v1';
const SS_KEY = 'pn.period.v1';

const DataContext = createContext(null);

/** Acceso a almacenamiento tolerante a fallos (modo privado, permisos, file://). */
function safeGet(storage, key) {
  try { return window[storage].getItem(key); } catch { return null; }
}
function safeSet(storage, key, value) {
  try { window[storage].setItem(key, value); return true; } catch { return false; }
}
function safeRemove(storage, key) {
  try { window[storage].removeItem(key); } catch { /* nada que hacer */ }
}

function loadInitial() {
  const saved = safeGet('localStorage', LS_KEY);
  if (saved) {
    try {
      const obj = JSON.parse(saved);
      if (obj?.tiempos && obj?.manifiestos) {
        return {
          tiempos: obj.tiempos,
          manifiestos: obj.manifiestos,
          meta: { ...(obj.meta || {}), isDemo: false }
        };
      }
    } catch { /* dataset corrupto: se ignora y se usa el demo */ }
  }
  return {
    tiempos: DEMO.tiempos,
    manifiestos: DEMO.manifiestos,
    meta: { source: DEMO.source, processedAt: DEMO.processedAt, isDemo: true }
  };
}

export function DataProvider({ children }) {
  const [dataset, setDatasetState] = useState(loadInitial);
  const [period, setPeriodState] = useState(() => {
    const p = safeGet('sessionStorage', SS_KEY);
    if (!p || p === 'all') return 'all';
    const n = parseInt(p, 10);
    return Number.isNaN(n) ? 'all' : n;
  });

  const setPeriod = useCallback((p) => {
    setPeriodState(p);
    safeSet('sessionStorage', SS_KEY, String(p));
  }, []);

  /** Reemplaza el dataset con el resultado de procesar un Master. */
  const setDataset = useCallback((result) => {
    const next = {
      tiempos: result.tiempos || [],
      manifiestos: result.manifiestos || [],
      meta: { ...(result.meta || {}), isDemo: false }
    };
    setDatasetState(next);
    const stored = safeSet('localStorage', LS_KEY, JSON.stringify(next));
    return stored;
  }, []);

  /** Vuelve al dataset demo embebido. */
  const reset = useCallback(() => {
    safeRemove('localStorage', LS_KEY);
    setDatasetState({
      tiempos: DEMO.tiempos,
      manifiestos: DEMO.manifiestos,
      meta: { source: DEMO.source, processedAt: DEMO.processedAt, isDemo: true }
    });
  }, []);

  const value = useMemo(() => {
    const tiempos = period === 'all' ? dataset.tiempos : dataset.tiempos.filter((r) => r.mes === period);
    const manifiestos =
      period === 'all' ? dataset.manifiestos : dataset.manifiestos.filter((r) => r.mes === period);
    return {
      dataset,          // completo, sin filtrar
      tiempos,          // filtrado por el periodo activo
      manifiestos,      // filtrado por el periodo activo
      months: monthsOf(dataset),
      period, setPeriod,
      setDataset, reset
    };
  }, [dataset, period, setPeriod, setDataset, reset]);

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>;
}

export function useData() {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error('useData debe usarse dentro de <DataProvider>');
  return ctx;
}
