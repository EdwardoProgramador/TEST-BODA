/**
 * ui.jsx — Piezas de interfaz reutilizables por todas las páginas.
 */

import { useState, useEffect, useRef } from 'react';

/* ── Tarjeta ─────────────────────────────────────────────────────────────── */

export function Card({ title, subtitle, action, children, className = '' }) {
  return (
    <div className={`card ${className}`}>
      {title && (
        <div className="ctit">
          {title} {action}
        </div>
      )}
      {subtitle && <div className="csub">{subtitle}</div>}
      {children}
    </div>
  );
}

/* ── Panel "¿Cómo leer esta gráfica?" ────────────────────────────────────── */

export function InfoPanel({ children, label = '¿Cómo leer esta gráfica?' }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <span
        className={`info-toggle${open ? ' open' : ''}`}
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen((o) => !o)}
      >
        {open ? '✕ Cerrar explicación' : `ℹ ${label}`}
      </span>
      <div className={`info-panel${open ? ' open' : ''}`}>{children}</div>
    </>
  );
}

/* ── KPIs ────────────────────────────────────────────────────────────────── */

export function KpiGrid({ cards }) {
  if (!cards?.length) {
    return (
      <div className="empty">
        <span className="e-ico">📭</span>
        <p>Sin datos en este periodo</p>
      </div>
    );
  }
  return (
    <div className="kgrid">
      {cards.map((k) => (
        <div
          key={k.label}
          className="kpi"
          style={{ '--kc': k.color, cursor: k.hint ? 'help' : undefined }}
          data-hint={k.hint || undefined}
        >
          <div className="klbl">
            {k.label}
            {k.hint ? ' ℹ' : ''}
          </div>
          <div className="kval">{k.value}</div>
          <div className="ksub">{k.sub}</div>
        </div>
      ))}
    </div>
  );
}

/* ── Pestañas ────────────────────────────────────────────────────────────── */

export function Tabs({ items, value, onChange }) {
  return (
    <div className="trow">
      {items.map((it) => {
        const active = String(it.value) === String(value);
        return (
          <div
            key={it.value}
            className={`tbtn${active ? ' active' : ''}`}
            style={active && it.color ? { background: it.color } : undefined}
            title={it.title}
            role="button"
            tabIndex={0}
            onClick={() => onChange(it.value)}
            onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onChange(it.value)}
          >
            {it.label}
          </div>
        );
      })}
    </div>
  );
}

export function MainTabs({ items, value, onChange }) {
  return (
    <div className="mtabs">
      {items.map((it) => (
        <div
          key={it.value}
          className={`mtab${value === it.value ? ' active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => onChange(it.value)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onChange(it.value)}
        >
          {it.label}
        </div>
      ))}
    </div>
  );
}

export function SectionNav({ items, value, onChange }) {
  return (
    <div className="snav">
      {items.map((it) => (
        <div
          key={it.id}
          className={`sbtn${value === it.id ? ' active' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => onChange(it.id)}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && onChange(it.id)}
        >
          {it.label}
        </div>
      ))}
    </div>
  );
}

/* ── Controles ───────────────────────────────────────────────────────────── */

export function Field({ label, children }) {
  return (
    <div className="fi">
      <span className="flbl">{label}</span>
      {children}
    </div>
  );
}

export function Select({ label, value, onChange, options, placeholder }) {
  return (
    <Field label={label}>
      <select value={value ?? ''} onChange={(e) => onChange(e.target.value)}>
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((o) => {
          const val = o.value !== undefined ? o.value : o;
          const lab = o.label !== undefined ? o.label : o;
          return (
            <option key={String(val)} value={val}>
              {lab}
            </option>
          );
        })}
      </select>
    </Field>
  );
}

/* ── Sección colapsable ──────────────────────────────────────────────────── */

export function Collapsible({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div>
      <div
        className="chdr"
        role="button"
        tabIndex={0}
        onClick={() => setOpen((o) => !o)}
        onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && setOpen((o) => !o)}
      >
        <span className="ctit2">{title}</span>
        <span className={`carr${open ? ' open' : ''}`}>▼</span>
      </div>
      {open && children}
    </div>
  );
}

/* ── Veredicto ───────────────────────────────────────────────────────────── */

export function Verdict({ tone = 'ok', tag, children }) {
  return (
    <div className={`verdict ${tone}`}>
      {tag && <span className="v-tag">{tag}</span>}
      {children}
    </div>
  );
}

/* ── Tabla ───────────────────────────────────────────────────────────────── */

export function TableWrap({ children, tall = false }) {
  return <div className={`twrap${tall ? ' tall' : ''}`}>{children}</div>;
}

export function EmptyRow({ cols, message = 'Sin datos para este filtro' }) {
  return (
    <tr>
      <td colSpan={cols} style={{ textAlign: 'center', color: 'var(--mt)', padding: 16 }}>
        {message}
      </td>
    </tr>
  );
}

/* ── Botón "ocultar todo" para gráficas multi-serie ──────────────────────── */

export function HideAllButton({ chartRef }) {
  const [hidden, setHidden] = useState(false);
  const toggle = () => {
    const ch = chartRef.current;
    if (!ch) return;
    const next = !hidden;
    ch.data.datasets.forEach((_, i) => {
      ch.getDatasetMeta(i).hidden = next;
    });
    ch.update();
    setHidden(next);
  };
  return (
    <span
      className={`hide-all-btn${hidden ? ' all-hidden' : ''}`}
      role="button"
      tabIndex={0}
      onClick={toggle}
      onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && toggle()}
    >
      {hidden ? '○ Mostrar todo' : '● Ocultar todo'}
    </span>
  );
}

/* ── Tooltips flotantes (comentarios de operador y ayudas de KPI) ────────── */

/**
 * Un solo listener delegado en el documento atiende cualquier elemento con
 * data-comment o data-hint, sin importar en qué página esté.
 */
export function FloatingTooltips() {
  const [state, setState] = useState(null);
  const posRef = useRef({ x: 0, y: 0 });
  const elRef = useRef(null);

  useEffect(() => {
    const place = (e) => {
      const el = elRef.current;
      if (!el) return;
      const pad = 16;
      const w = el.offsetWidth || 420;
      const h = el.offsetHeight || 90;
      let x = e.clientX + 14;
      let y = e.clientY - 10;
      if (x + w > window.innerWidth - pad) x = e.clientX - w - 10;
      if (x < pad) x = pad;
      if (y + h > window.innerHeight - pad) y = window.innerHeight - h - pad;
      if (y < pad) y = pad;
      posRef.current = { x, y };
      el.style.left = `${x}px`;
      el.style.top = `${y}px`;
    };

    const onOver = (e) => {
      const c = e.target.closest?.('[data-comment]');
      if (c) return setState({ kind: 'comment', text: c.getAttribute('data-comment') });
      const h = e.target.closest?.('[data-hint]');
      if (h) return setState({ kind: 'hint', text: h.getAttribute('data-hint') });
      return undefined;
    };
    const onOut = (e) => {
      if (e.target.closest?.('[data-comment]') || e.target.closest?.('[data-hint]')) setState(null);
    };

    document.addEventListener('mouseover', onOver);
    document.addEventListener('mouseout', onOut);
    document.addEventListener('mousemove', place);
    return () => {
      document.removeEventListener('mouseover', onOver);
      document.removeEventListener('mouseout', onOut);
      document.removeEventListener('mousemove', place);
    };
  }, []);

  if (!state) return null;

  const isComment = state.kind === 'comment';
  return (
    <div
      ref={elRef}
      id={isComment ? 'ctt' : 'ktt'}
      style={{ display: 'block', left: posRef.current.x, top: posRef.current.y }}
    >
      {isComment ? (
        <>
          <span style={{ color: '#00e5b4', fontWeight: 700, fontSize: 9, display: 'block', marginBottom: 6 }}>
            💬 COMENTARIO DEL OPERADOR
          </span>
          {state.text}
        </>
      ) : (
        <span dangerouslySetInnerHTML={{ __html: state.text }} />
      )}
    </div>
  );
}
