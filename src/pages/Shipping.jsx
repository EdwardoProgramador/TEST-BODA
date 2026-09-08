/**
 * Shipping — Recepción de Documentos.
 * A qué hora entrega Shipping los documentos y los datos de transporte.
 */

import { Fragment, useMemo, useRef, useState } from 'react';
import PN from '../lib/calendar.js';
import S from '../lib/stats.js';
import * as D from '../lib/derive.js';
import { hour, dayLabel } from '../lib/format.js';
import * as B from '../charts/builders.js';
import ChartCanvas from '../components/ChartCanvas.jsx';
import { PeriodBar } from '../components/Layout.jsx';
import {
  Card, InfoPanel, KpiGrid, MainTabs, SectionNav, Select,
  TableWrap, EmptyRow, HideAllButton
} from '../components/ui.jsx';
import { useData } from '../state/DataContext.jsx';

const DOCS = '#4d7cfe';
const TRANS = '#00e5b4';

const SECTIONS = [
  { id: 'cc', label: 'Carta de control' },
  { id: 'bp', label: 'Box plot' },
  { id: 'pa', label: 'Pareto' },
  { id: 'td', label: 'Tendencia' },
  { id: 'di', label: 'Distribución' }
];

export default function Shipping() {
  const { manifiestos, dataset, period } = useData();
  const [tab, setTab] = useState('op');

  return (
    <>
      <PeriodBar
        note={
          <>
            <span style={{ color: 'var(--aw)' }}>*</span> Semanas de transición entre meses. Se excluyen los
            embarques <b style={{ color: '#8aa0b8' }}>American Mail</b>, el 2 de enero y las recepciones a partir
            de las 12:00 hrs (quedan en la tabla, pero no promedian).
          </>
        }
      />
      <MainTabs
        items={[{ value: 'op', label: 'Operativo' }, { value: 'st', label: 'Análisis estadístico' }]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'op' ? (
        <Operativo rows={manifiestos} period={period} />
      ) : (
        <Estadistico rows={manifiestos} all={dataset.manifiestos} />
      )}
    </>
  );
}

/* ══════════════ OPERATIVO ══════════════ */

function Operativo({ rows, period }) {
  return (
    <>
      <KpisMensuales rows={rows} />
      <HoraPromedio rows={rows} period={period} />
      {period !== 'all' && <Volumen rows={rows} period={period} />}
      <ResumenSemanal rows={rows} />
      <Detalle rows={rows} />
    </>
  );
}

function KpisMensuales({ rows }) {
  const months = useMemo(() => D.shippingMonthly(rows), [rows]);
  if (!months.length) {
    return (
      <div className="empty">
        <span className="e-ico">📭</span>
        <p>Sin recepciones en este periodo</p>
      </div>
    );
  }
  return (
    <div className="kgrid">
      {months.map((m) => (
        <div key={m.mes} className="kpi" style={{ '--kc': DOCS }}>
          <div className="klbl">{m.mes_nombre}</div>
          <div className="mkrow">
            <div className="mkdot" style={{ background: DOCS }} />
            <span className="mklbl">Recepción de docs</span>
            <span className="mktime" style={{ color: DOCS }}>{hour(m.dec_docs)}</span>
          </div>
          <div className="mkrow">
            <div className="mkdot" style={{ background: TRANS }} />
            <span className="mklbl">Datos de transporte</span>
            <span className="mktime" style={{ color: TRANS }}>{hour(m.dec_trans)}</span>
          </div>
          <div className="mkcnt">{m.n_guias} guías · {m.n_docs} con hora de docs</div>
        </div>
      ))}
    </div>
  );
}

function HoraPromedio({ rows, period }) {
  const config = useMemo(() => {
    const series = D.shippingSeries(rows, period);
    const all = [];
    series.forEach((p) => {
      if (p.docs != null) all.push(p.docs);
      if (p.trans != null) all.push(p.trans);
    });
    if (!all.length) return null;
    const lo = Math.floor((Math.min(...all) - 0.3) * 4) / 4;
    const hi = Math.ceil((Math.max(...all) + 0.3) * 4) / 4;

    return B.lineConfig(
      series.map((p) => p.label),
      [
        {
          label: 'Recepción de docs', data: series.map((p) => p.docs),
          borderColor: DOCS, backgroundColor: 'rgba(77,124,254,.10)', borderWidth: 2.5,
          pointRadius: 4, tension: 0.3, fill: true, spanGaps: false
        },
        {
          label: 'Datos de transporte', data: series.map((p) => p.trans),
          borderColor: TRANS, backgroundColor: 'rgba(0,229,180,.07)', borderWidth: 2.5,
          pointRadius: 4, tension: 0.3, fill: true, spanGaps: false
        }
      ],
      {
        weeks: series, xTitle: 'SEMANA', yTitle: 'HORA DEL DÍA',
        y: {
          min: lo, max: hi,
          ticks: { color: '#5a7a99', font: { family: 'DM Mono', size: 10 }, stepSize: 0.25, callback: (v) => hour(v) }
        },
        tooltip: {
          callbacks: {
            title: (it) => series[it[0].dataIndex].full,
            label: (ctx) => {
              if (ctx.raw == null) return `${ctx.dataset.label}: sin registro`;
              const p = series[ctx.dataIndex];
              return `${ctx.dataset.label}: ${hour(ctx.raw)} hrs  (${p.n} guías · ${p.rango})`;
            }
          }
        }
      }
    );
  }, [rows, period]);

  return (
    <Card
      title="Hora promedio de recepción por semana"
      subtitle={
        <div className="lgd">
          <div className="lgdi"><div className="lgdd" style={{ background: DOCS }} />Recepción de documentos</div>
          <div className="lgdi"><div className="lgdd" style={{ background: TRANS }} />Recepción de datos de transporte</div>
        </div>
      }
    >
      <ChartCanvas config={config} className="cw tall" />
    </Card>
  );
}

function Volumen({ rows, period }) {
  const diaConfig = useMemo(() => {
    const dias = ['Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes'];
    const counts = [0, 0, 0, 0, 0];
    rows.forEach((r) => {
      if (!r.fecha_docs) return;
      const d = new Date(r.fecha_docs + 'T00:00:00').getDay();
      if (d >= 1 && d <= 5) counts[d - 1]++;
    });
    const cs = [DOCS, TRANS, '#a78bfa', '#ffc947', '#ff6b6b'];
    return B.barConfig(dias, [{
      data: counts, backgroundColor: cs.map((c) => c + '99'), borderColor: cs, borderWidth: 2, borderRadius: 6
    }], { xTitle: 'DÍA DE LA SEMANA', yTitle: 'N° DE GUÍAS', rotate: 0, tooltip: { callbacks: { label: (c) => `${c.raw} guías` } } });
  }, [rows]);

  const semanaConfig = useMemo(() => {
    const wk = D.shippingWeekly(rows).filter((r) => r.mes === period);
    if (!wk.length) return null;
    return B.barConfig(
      wk.map((r) => `${r.week_label} · ${r.rango}`),
      [{ data: wk.map((r) => r.n_guias), backgroundColor: 'rgba(77,124,254,.5)', borderColor: DOCS, borderWidth: 1.5, borderRadius: 4 }],
      { xTitle: 'SEMANA', yTitle: 'N° DE GUÍAS', rotate: 25, tooltip: { callbacks: { label: (c) => `${c.raw} guías` } } }
    );
  }, [rows, period]);

  return (
    <div className="two">
      <Card title="Guías por día de la semana" subtitle="Carga de recepción a lo largo de la semana">
        <ChartCanvas config={diaConfig} />
      </Card>
      <Card title="Volumen por semana" subtitle="Guías con recepción registrada">
        <ChartCanvas config={semanaConfig} />
      </Card>
    </div>
  );
}

function ResumenSemanal({ rows }) {
  const { weekly, monthly } = useMemo(
    () => ({ weekly: D.shippingWeekly(rows), monthly: D.shippingMonthly(rows) }),
    [rows]
  );

  const byMonth = {};
  weekly.forEach((r) => { (byMonth[r.mes] = byMonth[r.mes] || []).push(r); });

  return (
    <Card title="Resumen semanal" subtitle="Hora promedio por semana · el promedio del mes cierra cada bloque">
      <TableWrap tall>
        <table>
          <thead>
            <tr>
              <th>Mes</th><th>Semana</th><th>Fechas</th><th className="c">Guías</th>
              <th className="c" style={{ color: DOCS }}>Prom. docs</th>
              <th className="c" style={{ color: TRANS }}>Prom. transporte</th>
            </tr>
          </thead>
          <tbody>
            {!weekly.length && <EmptyRow cols={6} />}
            {Object.keys(byMonth).sort((a, b) => a - b).map((m) => {
              const mm = monthly.find((x) => x.mes === +m);
              let last = '';
              return (
                <Fragment key={m}>
                  {byMonth[m].map((r) => {
                    const showMonth = r.mes_nombre !== last;
                    last = r.mes_nombre;
                    return (
                      <tr key={`${r.mes}-${r.week_label}`}>
                        <td>{showMonth ? <strong>{r.mes_nombre}</strong> : ''}</td>
                        <td style={{ color: 'var(--mt)' }}>{r.week_label}</td>
                        <td style={{ color: 'var(--mt)', fontSize: 9 }}>{r.rango}</td>
                        <td className="c">{r.n_guias}</td>
                        <td className="c" style={{ color: DOCS, fontWeight: 700 }}>{hour(r.dec_docs)}</td>
                        <td className="c" style={{ color: TRANS, fontWeight: 700 }}>{hour(r.dec_trans)}</td>
                      </tr>
                    );
                  })}
                  {mm && (
                    <tr style={{ background: 'rgba(255,255,255,.04)', borderTop: '1px solid rgba(255,255,255,.15)' }}>
                      <td style={{ color: 'var(--mt)', fontSize: 9, fontStyle: 'italic' }}>promedio</td>
                      <td colSpan={2} style={{ fontWeight: 700, color: 'var(--tx)' }}>Promedio de {mm.mes_nombre}</td>
                      <td className="c" style={{ fontWeight: 700 }}>{mm.n_guias}</td>
                      <td className="c" style={{ color: DOCS, fontWeight: 800, fontSize: 13 }}>{hour(mm.dec_docs)}</td>
                      <td className="c" style={{ color: TRANS, fontWeight: 800, fontSize: 13 }}>{hour(mm.dec_trans)}</td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}

function Detalle({ rows }) {
  const [mes, setMes] = useState('');
  const [semana, setSemana] = useState('');
  const [dia, setDia] = useState('');

  const meses = useMemo(
    () => [...new Set(rows.map((r) => r.mes))].sort((a, b) => a - b).map((m) => ({ value: m, label: PN.MONTHS[m] })),
    [rows]
  );
  const afterMes = useMemo(() => (mes ? rows.filter((r) => r.mes === +mes) : rows), [rows, mes]);
  const semanas = useMemo(() => {
    const seen = {};
    afterMes.forEach((r) => { seen[`${r.mes}|${r.week_label}`] = r; });
    return Object.keys(seen).sort().map((k) => {
      const r = seen[k];
      return {
        value: k,
        label: `${mes ? '' : PN.MONTHS[r.mes] + ' — '}${r.week_label} (${PN.weekRange(r.mes, r.week_label)})`
      };
    });
  }, [afterMes, mes]);
  const afterSemana = useMemo(
    () => (semana ? afterMes.filter((r) => `${r.mes}|${r.week_label}` === semana) : afterMes),
    [afterMes, semana]
  );
  const dias = useMemo(() => {
    const seen = {};
    afterSemana.forEach((r) => {
      if (!r.fecha_docs || seen[r.fecha_docs]) return;
      const d = new Date(r.fecha_docs + 'T00:00:00').getDay();
      if (d !== 0 && d !== 6) seen[r.fecha_docs] = 1;
    });
    return Object.keys(seen).sort().map((f) => ({ value: f, label: dayLabel(f) }));
  }, [afterSemana]);

  const filtered = useMemo(() => {
    const out = dia ? afterSemana.filter((r) => r.fecha_docs === dia) : afterSemana;
    return [...out].sort((a, b) =>
      (a.fecha_docs || '') < (b.fecha_docs || '') ? -1
        : (a.fecha_docs || '') > (b.fecha_docs || '') ? 1
          : (+a.GUIANUMBER || 0) - (+b.GUIANUMBER || 0)
    );
  }, [afterSemana, dia]);

  return (
    <Card
      title="Detalle por guía"
      subtitle="Hora exacta · tipo de embarque · ⚠ señala docs y transporte registrados en días distintos"
    >
      <div className="frow">
        <Select label="Mes" value={mes} onChange={(v) => { setMes(v); setSemana(''); setDia(''); }}
          options={meses} placeholder="Todos los meses" />
        <Select label="Semana" value={semana} onChange={(v) => { setSemana(v); setDia(''); }}
          options={semanas} placeholder="Todas las semanas" />
        <Select label="Día" value={dia} onChange={setDia} options={dias} placeholder="Todos los días" />
      </div>
      <TableWrap tall>
        <table>
          <thead>
            <tr>
              <th>Guía</th><th>Fecha</th><th>Tipo</th><th>Semana</th><th>Mes</th>
              <th className="c" style={{ color: DOCS }}>Docs</th>
              <th className="c" style={{ color: TRANS }}>Transporte</th>
              <th>Nota</th>
            </tr>
          </thead>
          <tbody>
            {!filtered.length && <EmptyRow cols={8} />}
            {filtered.map((r, i) => {
              const tarde = r.dec_docs != null && r.dec_docs >= 8;
              return (
                <tr
                  key={r.GUIANUMBER}
                  style={i % 2 ? { background: 'rgba(255,255,255,.02)' } : undefined}
                  data-comment={r.nota_fecha || undefined}
                >
                  <td style={{ fontWeight: 700, color: DOCS }}>{r.GUIANUMBER}</td>
                  <td>{r.fecha_docs || '—'}</td>
                  <td style={{ color: 'var(--mt)', fontSize: 9 }}>{r.SHIPMENTTYPE || '—'}</td>
                  <td style={{ color: 'var(--mt)' }}>{r.week_label}</td>
                  <td style={{ color: 'var(--mt)' }}>{PN.MONTHS[r.mes] || '—'}</td>
                  <td className="c" style={{ color: tarde ? '#ffc947' : DOCS, fontWeight: 700 }}>
                    {r.hora_docs ? `${r.hora_docs} hrs` : '—'}
                  </td>
                  <td className="c" style={{ color: TRANS, fontWeight: 700 }}>
                    {r.hora_trans ? `${r.hora_trans} hrs` : '—'}
                  </td>
                  <td style={{ fontSize: 9, color: '#ffc947' }}>{r.nota_fecha ? '⚠' : ''}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}

/* ══════════════ ESTADÍSTICO ══════════════ */

function Estadistico({ rows, all }) {
  const [section, setSection] = useState('cc');
  return (
    <>
      <SectionNav items={SECTIONS} value={section} onChange={setSection} />
      {section === 'cc' && <CartaControl all={all} />}
      {section === 'bp' && <BoxPlot rows={rows} />}
      {section === 'pa' && <Pareto rows={rows} />}
      {section === 'td' && <Tendencia all={all} />}
      {section === 'di' && <Distribucion rows={rows} />}
    </>
  );
}

function CartaControl({ all }) {
  const [serie, setSerie] = useState('docs');
  const chartRef = useRef(null);
  const result = useMemo(() => {
    const series = D.shippingSeries(all, 'all');
    const pts = series.map((p) => ({ label: p.label, full: p.full, value: p[serie], n: p.n }));
    if (pts.filter((p) => p.value != null).length < 3) return null;
    return B.controlChartConfig(pts, {
      weeks: series, yTitle: 'HORA DEL DÍA',
      color: serie === 'docs' ? DOCS : TRANS,
      seriesLabel: serie === 'docs' ? 'Hora media de recepción de docs' : 'Hora media de datos de transporte',
      format: (v) => `${hour(v)} hrs`,
      floorAtZero: false,
      yTicks: { callback: (v) => hour(v), stepSize: 0.25 }
    });
  }, [all, serie]);

  const r1 = result ? result.flags.filter((f) => f.includes(1)).length : 0;
  const r2 = result ? result.flags.filter((f) => f.includes(2)).length : 0;

  return (
    <Card
      title="Carta de control I-MR — horas de recepción"
      action={<HideAllButton chartRef={chartRef} />}
      subtitle="¿La llegada de información de Shipping es estable?"
    >
      <InfoPanel>
        <strong>¿Qué representa?</strong> La hora media a la que llega la información cada semana, con sus límites
        de control.<br />
        <strong>Cómo se calculan.</strong> Con el rango móvil entre semanas consecutivas:
        <span className="formula">σ̂ = MR̄ / 1.128 &nbsp;·&nbsp; LCS/LCI = x̄ ± 3σ̂</span>
        La versión anterior recortaba los límites a mano entre las 04:00 y las 12:00 hrs. Eso no es un límite
        estadístico sino un recorte visual: hacía que ninguna semana pudiera salirse nunca.<br />
        <strong>¿Qué miro?</strong> Un punto rojo por encima del LCS es una semana en la que la información llegó
        sistemáticamente más tarde de lo que el proceso considera normal.
      </InfoPanel>
      <div className="frow">
        <Select label="Serie" value={serie} onChange={setSerie}
          options={[{ value: 'docs', label: 'Recepción de documentos' }, { value: 'trans', label: 'Recepción de datos de transporte' }]} />
      </div>
      <ChartCanvas config={result?.config} className="cw tall" canvasRef={chartRef} />
      {result && (
        <div className="csub" style={{ margin: '12px 0 0', display: 'block', lineHeight: 1.8 }}>
          Límites I-MR sobre la hora media semanal: LC = <b>{hour(result.limits.cl)}</b>, LCS ={' '}
          <b>{hour(result.limits.ucl)}</b>, LCI = <b>{hour(result.limits.lcl)}</b> (σ̂ ={' '}
          {(result.limits.sigma * 60).toFixed(1)} min). Regla 1 (fuera de 3σ): <b>{r1}</b> semana(s) · Regla 2
          (nueve seguidas del mismo lado): <b>{r2}</b>.
        </div>
      )}
    </Card>
  );
}

function BoxPlot({ rows }) {
  const [group, setGroup] = useState('tipo');
  const config = useMemo(() => {
    const gd = {};
    const gt = {};
    rows.forEach((r) => {
      const k = group === 'tipo' ? r.SHIPMENTTYPE || '—' : PN.MONTHS[r.mes];
      if (r.dec_docs != null) (gd[k] = gd[k] || []).push(r.dec_docs);
      if (r.dec_trans != null) (gt[k] = gt[k] || []).push(r.dec_trans);
    });
    let keys = Object.keys(gd).filter((k) => gd[k].length >= 3);
    if (group === 'mes') {
      keys.sort((a, b) => PN.MONTH_LIST.findIndex((m) => PN.MONTHS[m] === a) - PN.MONTH_LIST.findIndex((m) => PN.MONTHS[m] === b));
    } else {
      keys.sort((a, b) => S.median(gd[b]) - S.median(gd[a]));
    }
    const groups = [];
    keys.forEach((k) => {
      groups.push({ label: `${k.slice(0, 18)} · docs`, values: gd[k], color: DOCS });
      if (gt[k]?.length >= 3) groups.push({ label: `${k.slice(0, 18)} · trans`, values: gt[k], color: TRANS });
    });
    return B.boxPlotConfig(groups, {
      yTitle: 'HORA DEL DÍA', floorAtZero: false,
      format: (v) => `${hour(v)} hrs`,
      yTicks: { callback: (v) => hour(v), stepSize: 0.25 }
    });
  }, [rows, group]);

  return (
    <Card title="Box plot — distribución de horas" subtitle="Docs y datos de transporte, lado a lado">
      <InfoPanel>
        <strong>Alto vs ancho.</strong> Una caja alta en el eje significa que esa información llega tarde; una caja{' '}
        <em>ancha</em> significa que llega de forma irregular, que suele ser el problema real: un tipo que siempre
        llega a las 07:00 se puede planear, uno que llega entre las 05:00 y las 10:00 no.<br />
        Cuantiles interpolados (tipo 7) y bigotes hasta el dato real dentro de las vallas de Tukey. Se omiten los
        grupos con menos de 3 guías.
      </InfoPanel>
      <div className="frow">
        <Select label="Agrupar por" value={group} onChange={setGroup}
          options={[{ value: 'tipo', label: 'Tipo de embarque' }, { value: 'mes', label: 'Mes' }]} />
      </div>
      <ChartCanvas config={config} className="cw tall" />
    </Card>
  );
}

function Pareto({ rows }) {
  const [metric, setMetric] = useState('docs');
  const BASE = 6; // referencia operativa: 06:00 hrs
  const config = useMemo(() => {
    const key = metric === 'docs' ? 'dec_docs' : 'dec_trans';
    const g = {};
    rows.forEach((r) => {
      if (r[key] == null) return;
      (g[r.SHIPMENTTYPE || '—'] = g[r.SHIPMENTTYPE || '—'] || []).push(r[key]);
    });
    const items = Object.keys(g)
      .map((k) => {
        const v = g[k];
        return {
          label: k.split(',')[0].slice(0, 18),
          n: v.length,
          value: v.reduce((s, h) => s + Math.max(0, h - BASE), 0)
        };
      })
      .filter((it) => it.value > 0)
      .sort((a, b) => b.value - a.value);
    if (!items.length) return null;
    return B.paretoConfig(items, {
      valueLabel: 'Horas de retraso acumuladas',
      yTitle: 'HORAS ACUMULADAS SOBRE LAS 06:00',
      xTitle: 'TIPO DE EMBARQUE',
      format: (v) => `${v.toFixed(1)} h`
    });
  }, [rows, metric]);

  return (
    <Card title="Pareto — retraso acumulado por tipo" subtitle="¿Dónde se concentran realmente los retrasos?">
      <InfoPanel>
        <strong>Qué mide.</strong> Horas de retraso <em>acumuladas</em> sobre las 06:00 hrs, la referencia
        operativa del área.<br />
        <strong>Por qué así.</strong> Ordenar por «hora promedio» compara implícitamente contra la medianoche y
        trata igual a un tipo con dos guías tardías que a uno con cuarenta ligeramente tarde. Sumando el retraso
        sobre la referencia, cada tipo pesa lo que de verdad cuesta al equipo.
      </InfoPanel>
      <div className="frow">
        <Select label="Métrica" value={metric} onChange={setMetric}
          options={[{ value: 'docs', label: 'Recepción de documentos' }, { value: 'trans', label: 'Recepción de datos de transporte' }]} />
      </div>
      <ChartCanvas config={config} className="cw tall" />
    </Card>
  );
}

function Tendencia({ all }) {
  const chartRef = useRef(null);
  const data = useMemo(() => {
    const series = D.shippingSeries(all, 'all');
    const vd = series.map((p) => p.docs);
    const vt = series.map((p) => p.trans);
    const td = S.movingAverage(vd.map((v) => (v == null ? NaN : v)), 3, true);
    const tt = S.movingAverage(vt.map((v) => (v == null ? NaN : v)), 3, true);
    const present = vd.concat(vt).filter((v) => v != null);
    if (!present.length) return null;
    const lo = Math.floor((Math.min(...present) - 0.2) * 4) / 4;
    const hi = Math.ceil((Math.max(...present) + 0.2) * 4) / 4;

    const config = B.lineConfig(
      series.map((p) => p.label),
      [
        { label: 'Docs (real)', data: vd, borderColor: DOCS, backgroundColor: 'rgba(77,124,254,.08)', borderWidth: 2, pointRadius: 3, tension: 0.2, fill: true, spanGaps: false },
        { label: 'Docs (tendencia MA3)', data: td, borderColor: DOCS, borderDash: [6, 3], borderWidth: 1.5, pointRadius: 0, tension: 0.4, fill: false, spanGaps: true },
        { label: 'Transporte (real)', data: vt, borderColor: TRANS, backgroundColor: 'rgba(0,229,180,.06)', borderWidth: 2, pointRadius: 3, tension: 0.2, fill: true, spanGaps: false },
        { label: 'Transporte (tendencia MA3)', data: tt, borderColor: TRANS, borderDash: [6, 3], borderWidth: 1.5, pointRadius: 0, tension: 0.4, fill: false, spanGaps: true }
      ],
      {
        weeks: series, xTitle: 'SEMANA', yTitle: 'HORA DEL DÍA',
        y: { min: lo, max: hi, ticks: { color: '#5a7a99', font: { family: 'DM Mono', size: 10 }, stepSize: 0.25, callback: (v) => hour(v) } },
        tooltip: {
          callbacks: {
            title: (it) => series[it[0].dataIndex].full,
            label: (ctx) => `${ctx.dataset.label}: ${ctx.raw == null ? '—' : `${hour(ctx.raw)} hrs`}`
          }
        }
      }
    );

    const delta = (t) => {
      const a = t.findIndex((v) => v != null);
      const b = t.length - 1 - [...t].reverse().findIndex((v) => v != null);
      return a >= 0 && b >= 0 && a !== b ? t[b] - t[a] : null;
    };
    return { config, dd: delta(td), dt: delta(tt) };
  }, [all]);

  return (
    <Card
      title="Tendencia"
      action={<HideAllButton chartRef={chartRef} />}
      subtitle="¿Los documentos llegan cada vez más temprano o más tarde?"
    >
      <InfoPanel>
        <strong>Centrada, no rezagada.</strong> La ventana es [i−1, i, i+1]: así el punto de inflexión de la
        tendencia coincide con la semana en que realmente ocurrió el cambio, en lugar de aparecer dos semanas
        después. Por eso la línea punteada no existe en el primer ni en el último punto.
      </InfoPanel>
      <ChartCanvas config={data?.config} className="cw tall" canvasRef={chartRef} />
      {data && (
        <div className="csub" style={{ margin: '12px 0 0', display: 'block' }}>
          Media móvil de 3 semanas centrada.{' '}
          {data.dd != null && (
            <>
              Docs:{' '}
              {data.dd < 0
                ? <>llegan <b>{Math.abs(data.dd * 60).toFixed(0)} min más temprano</b></>
                : <>llegan <b>{(data.dd * 60).toFixed(0)} min más tarde</b></>}{' '}
              de principio a fin.{' '}
            </>
          )}
          {data.dt != null && (
            <>Transporte: {data.dt < 0 ? `${Math.abs(data.dt * 60).toFixed(0)} min más temprano.` : `${(data.dt * 60).toFixed(0)} min más tarde.`}</>
          )}
        </div>
      )}
    </Card>
  );
}

function Distribucion({ rows }) {
  const data = useMemo(() => {
    const docs = rows.map((r) => r.dec_docs).filter((v) => v != null);
    const trans = rows.map((r) => r.dec_trans).filter((v) => v != null);
    const opts = { width: 0.25, maxBins: 24, xTitle: 'HORA DEL DÍA', labelFn: (b) => hour(b.lo) };
    return {
      d1: B.histogramConfig(docs, opts),
      d2: B.histogramConfig(trans, opts),
      s1: docs.length ? S.describe(docs) : null,
      s2: trans.length ? S.describe(trans) : null
    };
  }, [rows]);

  return (
    <>
      <div className="two">
        <Card title="Distribución — documentos" subtitle="Histograma de horas de llegada · bins de 15 min">
          <InfoPanel>
            <strong>¿Qué representa?</strong> Cuántas guías llegaron en cada franja de 15 minutos. La barra más alta
            es el horario habitual de entrega.<br />
            <strong>Las curvas ajustadas</strong> se calculan por diferencia de la función acumulada dentro de cada
            bin, no evaluando la densidad en el punto medio — que sólo sería exacto si el bin fuera infinitesimal.
          </InfoPanel>
          <ChartCanvas config={data.d1?.config} />
        </Card>
        <Card title="Distribución — datos de transporte" subtitle="Histograma de horas de llegada · bins de 15 min">
          <ChartCanvas config={data.d2?.config} />
        </Card>
      </div>
      {data.s1 && data.s2 && (
        <Card>
          <div className="csub" style={{ margin: 0, display: 'block', lineHeight: 1.8 }}>
            Bins de 15 minutos. Docs: mediana <b>{hour(data.s1.median)}</b> (mitad central entre {hour(data.s1.q1)} y{' '}
            {hour(data.s1.q3)}, n = {data.s1.n}). Transporte: mediana <b>{hour(data.s2.median)}</b> ({hour(data.s2.q1)}–
            {hour(data.s2.q3)}, n = {data.s2.n}). Las recepciones a partir de las {PN.SHIPPING_CUTOFF_HOUR}:00 hrs no
            entran en los promedios.
          </div>
        </Card>
      )}
    </>
  );
}
