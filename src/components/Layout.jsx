/**
 * Layout — Cascarón común: barra superior con navegación, filtro de periodo,
 * aviso del origen de datos y pie. Envuelve a todas las rutas.
 */

import { useEffect, useRef, useState } from 'react';
import { Link, NavLink, useLocation } from 'react-router-dom';
import PN from '../lib/calendar.js';
import { useData } from '../state/DataContext.jsx';
import { FloatingTooltips } from './ui.jsx';

const ROUTES = [
  { path: '/', key: 't' },
  { path: '/shipping', key: 'm' },
  { path: '/cross-data', key: 'x' },
  { path: '/datos', key: 'd' }
];

/* ── Logo ────────────────────────────────────────────────────────────────── */
// El logotipo original venía incrustado en base64 en el HTML antiguo y ya no
// está disponible. public/logo.svg es un marcador con las iniciales que ocupa
// la misma caja: basta sustituir ese archivo por el logo real.
function Logo() {
  const [failed, setFailed] = useState(false);
  if (failed) {
    return (
      <div className="logo img-ph" title="Coloca tu logotipo en public/logo.svg">
        <span className="ph-txt">PN</span>
      </div>
    );
  }
  return (
    <div className="logo">
      <img src="./logo.svg" alt="Pluma Nacional" onError={() => setFailed(true)} />
    </div>
  );
}

/* ── Selector de reporte ─────────────────────────────────────────────────── */

function ReportNav({ current }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    const onDocClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('click', onDocClick);
    return () => document.removeEventListener('click', onDocClick);
  }, []);

  const rep = PN.REPORTS[current];
  return (
    <div className="nav-wrap" ref={wrapRef}>
      <div
        className={`nav-btn${open ? ' open' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen((o) => !o)}
      >
        <div className="nav-dot" />
        <span>
          {rep.icon}&nbsp;&nbsp;{rep.short}
        </span>
        <span className="nav-arr">▼</span>
      </div>
      <div className={`nav-dd${open ? ' open' : ''}`}>
        {ROUTES.map(({ path, key }) => {
          const r = PN.REPORTS[key];
          return (
            <NavLink
              key={key}
              to={path}
              end={path === '/'}
              className={({ isActive }) => `nav-item${isActive ? ' active' : ''}`}
              onClick={() => setOpen(false)}
            >
              <span className="ico">{r.icon}</span>
              <div className="ntx">
                <strong>{r.short}</strong>
                <span>{r.sub}</span>
              </div>
              <span className="chk" style={{ color: r.color }}>
                ✓
              </span>
            </NavLink>
          );
        })}
      </div>
    </div>
  );
}

/* ── Aviso de origen de datos ────────────────────────────────────────────── */

function DataBanner() {
  const { dataset } = useData();
  const meta = dataset.meta || {};
  if (meta.isDemo) {
    return (
      <div className="banner demo">
        <span>📦</span>
        <span>
          Estás viendo el <b>dataset demo</b> ({meta.source || '—'}). Para analizar tu propio Master,
          ve a <Link to="/datos">Datos y validación</Link> y súbelo — todo el tablero se recalcula solo.
        </span>
      </div>
    );
  }
  const when = meta.processedAt ? new Date(meta.processedAt) : null;
  return (
    <div className="banner live">
      <span>✅</span>
      <span>
        Datos de <b>{meta.source || 'archivo cargado'}</b>
        {when && !Number.isNaN(when.getTime()) ? ` · procesado el ${when.toLocaleDateString('es-MX')}` : ''} ·{' '}
        {dataset.tiempos.length} guías de tiempos y {dataset.manifiestos.length} de shipping.{' '}
        <Link to="/datos">Cambiar archivo</Link>
      </span>
    </div>
  );
}

/* ── Filtro de periodo ───────────────────────────────────────────────────── */

export function PeriodBar({ note }) {
  const { period, setPeriod, months, dataset } = useData();
  return (
    <div className="cbar">
      <div>
        <div className="plbl">Periodo</div>
        <div className="pills">
          <div
            className={`pill${period === 'all' ? ' active' : ''}`}
            role="button"
            tabIndex={0}
            onClick={() => setPeriod('all')}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setPeriod('all')}
          >
            Todo
          </div>
          {months.map((m) => (
            <div
              key={m}
              className={`pill${period === m ? ' active' : ''}`}
              role="button"
              tabIndex={0}
              onClick={() => setPeriod(m)}
              onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setPeriod(m)}
            >
              {PN.MONTHS[m]}
            </div>
          ))}
        </div>
        <div className="pill-note">{note}</div>
      </div>
      <div className="badge">
        <div className="bdot" />
        <span>{(dataset.meta?.source || '—') + ' · STATUSID=8'}</span>
      </div>
    </div>
  );
}

/* ── Layout ──────────────────────────────────────────────────────────────── */

export default function Layout({ children }) {
  const location = useLocation();
  const route = ROUTES.find((r) => r.path === location.pathname) || ROUTES[0];
  const rep = PN.REPORTS[route.key];
  const { dataset } = useData();

  // El acento de la interfaz cambia con el reporte activo.
  useEffect(() => {
    document.documentElement.style.setProperty('--ac', rep.color);
    document.title = `${rep.short} · Pluma Nacional`;
  }, [rep]);

  return (
    <div className="app">
      <div className="topbar">
        <div className="tl">
          <Logo />
          <div className="rl">
            <h1 style={{ color: rep.color }}>{rep.title}</h1>
            <span className="sub">{rep.sub}</span>
          </div>
        </div>
        <ReportNav current={route.key} />
      </div>

      <div style={{ marginTop: 18 }}>
        <DataBanner />
      </div>

      {children}

      <footer>
        <p>
          Fuente: {dataset.meta?.source || '—'} · STATUSID = 8 (guías completadas) · calendario laboral lun–vie
        </p>
        <p>
          Import/Export Assistant · Pluma Nacional SA de CV · <Link to="/datos">Datos y validación</Link>
        </p>
      </footer>

      <FloatingTooltips />
    </div>
  );
}
