/**
 * Tiempos — Documentación Import/Export.
 * Elaboración de factura → Solicitud de carta porte.
 */

import { useMemo, useRef, useState } from 'react';
import PN from '../lib/calendar.js';
import S from '../lib/stats.js';
import * as D from '../lib/derive.js';
import { nice, int, dayLabel } from '../lib/format.js';
import * as B from '../charts/builders.js';
import ChartCanvas from '../components/ChartCanvas.jsx';
import { PeriodBar } from '../components/Layout.jsx';
import {
  Card, InfoPanel, KpiGrid, Tabs, MainTabs, SectionNav, Select,
  Collapsible, Verdict, TableWrap, EmptyRow, HideAllButton
} from '../components/ui.jsx';
import { useData } from '../state/DataContext.jsx';

const SECTIONS = [
  { id: 'ad', label: 'Antes / Después' },
  { id: 'cc', label: 'Carta de control' },
  { id: 'bp', label: 'Box plot' },
  { id: 'pa', label: 'Pareto' },
  { id: 'di', label: 'Distribución' },
  { id: 'sr', label: 'Serie de tiempo' }
];

const HINT_MED =
  '<b style="color:#4d7cfe">MEDIANA</b><br><br>El valor que parte a la mitad: la mitad de las guías tardó ' +
  'menos y la mitad más. Un solo caso de 4 000 min no la mueve, por eso es la métrica principal del reporte.';
const HINT_AVG =
  '<b style="color:#ffc947">PROMEDIO</b><br><br>Suma de minutos entre número de guías. Un incidente aislado ' +
  'lo dispara: en enero el paro de KN llevó el promedio semanal a 818 min mientras la mediana apenas se movió.';
const HINT_IQR =
  '<b style="color:#a78bfa">RANGO INTERCUARTIL (IQR)</b><br><br>Distancia entre el percentil 25 y el 75: ahí ' +
  'cae la mitad central de las guías. Mide consistencia — cuanto más chico, más predecible el proceso.';

export default function Tiempos() {
  const { tiempos, dataset, period } = useData();
  const [tab, setTab] = useState('op');

  return (
    <>
      <PeriodBar
        note={
          <>
            <span style={{ color: 'var(--aw)' }}>*</span> Las semanas marcadas son{' '}
            <b style={{ color: '#8aa0b8' }}>semanas de transición entre meses</b>: tienen menos días hábiles,
            así que su volumen no es comparable con una semana completa.
          </>
        }
      />
      <MainTabs
        items={[
          { value: 'op', label: 'Operativo' },
          { value: 'st', label: 'Análisis estadístico' }
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === 'op' ? (
        <Operativo rows={tiempos} period={period} all={dataset.tiempos} />
      ) : (
        <Estadistico rows={tiempos} all={dataset.tiempos} period={period} />
      )}
    </>
  );
}

/* ══════════════ OPERATIVO ══════════════ */

function Operativo({ rows, period, all }) {
  return (
    <>
      <Kpis rows={rows} period={period} all={all} />
      <TendenciaSemanal rows={rows} period={period} />
      <EvolucionPersona rows={rows} period={period} />
      <DetallePorGuia rows={rows} />
      <Collapsible title="Datos extra">
        <DatosExtra rows={rows} />
      </Collapsible>
    </>
  );
}

function Kpis({ rows, period, all }) {
  const cards = useMemo(() => {
    const v = rows.map((r) => r.diff_minutes);
    if (!v.length) return [];
    const d = S.describe(v);
    const base = [
      { color: '#00e5b4', label: 'Total de guías', value: int(d.n), sub: 'registros con factura y carta porte' },
      { color: '#4d7cfe', label: 'Mediana', value: `${nice(d.median)} min`, sub: 'tiempo típico · no la mueven los outliers', hint: HINT_MED },
      { color: '#ffc947', label: 'Promedio', value: `${Math.round(d.mean)} min`, sub: 'incluye outliers extremos', hint: HINT_AVG },
      {
        color: '#a78bfa', label: 'Consistencia (IQR)', value: `${Math.round(d.iqr)} min`,
        sub: `la mitad central cae entre ${Math.round(d.q1)} y ${Math.round(d.q3)} min`, hint: HINT_IQR
      }
    ];
    if (period !== 'all') {
      const prev = all.filter((r) => r.mes === period - 1);
      if (prev.length >= 5) {
        const pm = S.median(prev.map((r) => r.diff_minutes));
        const pct = pm > 0 ? ((d.median - pm) / pm) * 100 : 0;
        const igual = Math.abs(pct) < 0.5;
        const mejor = pct < 0;
        base[3] = {
          color: igual ? '#5a7a99' : mejor ? '#00e5b4' : '#ff6b6b',
          label: `vs ${PN.MONTHS[period - 1]}`,
          value: `${igual ? '→ ' : mejor ? '↓ ' : '↑ '}${Math.abs(pct).toFixed(1)}%`,
          sub: `${igual ? 'sin cambio' : mejor ? 'mejora' : 'aumento'} en la mediana (${nice(pm)} → ${nice(d.median)} min)`
        };
      }
    }
    return base;
  }, [rows, period, all]);

  return <KpiGrid cards={cards} />;
}

function TendenciaSemanal({ rows, period }) {
  const [stat, setStat] = useState('median');
  const { config, note } = useMemo(() => {
    const series = D.weeklySeries(rows, { period, stat });
    const vals = series.map((p) => p.value);
    const present = vals.filter((v) => v != null);
    if (!present.length) return { config: null, note: '' };
    const top = S.axisCap(present, 0.95, 1.3, 30);
    const c = B.cap(vals, top);
    const cfg = B.lineConfig(
      series.map((p) => p.label),
      [{
        label: stat === 'median' ? 'Mediana semanal' : 'Promedio semanal',
        data: c.values,
        borderColor: '#00e5b4',
        backgroundColor: 'rgba(0,229,180,.10)',
        borderWidth: 2.5, tension: 0.3, fill: true, spanGaps: false,
        pointRadius: vals.map((v) => (v == null ? 0 : 5)),
        pointStyle: c.flags.map((f) => (f ? 'triangle' : 'circle')),
        pointBackgroundColor: c.flags.map((f) => (f ? '#ffc947' : '#00e5b4'))
      }],
      {
        weeks: series, legend: false, xTitle: 'SEMANA', yTitle: 'MINUTOS',
        y: { beginAtZero: true, max: top, ticks: { color: '#5a7a99', font: { family: 'DM Mono', size: 10 }, stepSize: S.axisStep(top) } },
        tooltip: {
          callbacks: {
            title: (it) => series[it[0].dataIndex].full,
            label: (ctx) => {
              const p = series[ctx.dataIndex];
              if (p.value == null) return 'Sin guías esa semana';
              const out = [
                `Mediana: ${p.median.toFixed(1)} min`,
                `Promedio: ${p.avg.toFixed(1)} min`,
                `${p.count} guías · ${p.rango}`
              ];
              if (c.flags[ctx.dataIndex]) out.push('⚠ fuera de la escala visible');
              return out;
            }
          }
        }
      }
    );
    return {
      config: cfg,
      note: stat === 'median'
        ? 'Se grafica la mediana: es lo que representa a una semana típica.'
        : 'Se grafica el promedio: los picos de enero y mayo son incidentes puntuales, no el ritmo normal.'
    };
  }, [rows, period, stat]);

  return (
    <Card
      title="Tendencia semanal del equipo"
      subtitle={
        <>
          <span className="mlgd"><span className="mldot" />Macro Layout Millennium · 9 mar</span>
          <span className="mlgd teal"><span className="mldot" />Interfaz de Facturas · 28 may</span>
        </>
      }
    >
      <div className="frow">
        <Select
          label="Estadístico"
          value={stat}
          onChange={setStat}
          options={[
            { value: 'median', label: 'Mediana semanal (recomendado)' },
            { value: 'avg', label: 'Promedio semanal' }
          ]}
        />
      </div>
      <ChartCanvas config={config} className="cw tall" />
      <div className="csub" style={{ margin: '12px 0 0' }}>{note}</div>
    </Card>
  );
}

function EvolucionPersona({ rows, period }) {
  const [persona, setPersona] = useState('Equipo');
  const people = useMemo(() => D.peopleOf(rows), [rows]);

  const config = useMemo(() => {
    const weeks = PN.allWeeks(period);
    const targets = persona === 'Equipo' ? people : [persona];
    const byPerson = {};
    const allVals = [];
    targets.forEach((p) => {
      const s = D.weeklySeries(rows, { period, stat: 'median', persona: p });
      byPerson[p] = s;
      s.forEach((pt) => { if (pt.value != null) allVals.push(pt.value); });
    });
    if (!allVals.length) return null;
    const top = S.axisCap(allVals, 0.95, 1.3, 20);

    const datasets = targets
      .filter((p) => byPerson[p].some((pt) => pt.value != null))
      .map((p) => {
        const vals = byPerson[p].map((pt) => pt.value);
        const c = B.cap(vals, top);
        const color = D.colorFor(p);
        return {
          label: p.split(' ')[0],
          data: c.values,
          borderColor: color,
          backgroundColor: 'transparent',
          borderWidth: persona === 'Equipo' ? 2 : 2.5,
          tension: 0.28, fill: false, spanGaps: false,
          pointRadius: vals.map((v, i) => (v == null ? 0 : c.flags[i] ? 6 : 3.5)),
          pointStyle: c.flags.map((f) => (f ? 'triangle' : 'circle')),
          pointBackgroundColor: c.flags.map((f) => (f ? '#ffc947' : color)),
          _series: byPerson[p]
        };
      });

    return B.lineConfig(weeks.map((w) => PN.shortWeek(w.mes, w.week)), datasets, {
      weeks, xTitle: 'SEMANA', yTitle: 'MEDIANA (min)', legend: persona === 'Equipo',
      y: { beginAtZero: true, max: top, ticks: { color: '#5a7a99', font: { family: 'DM Mono', size: 10 }, stepSize: S.axisStep(top) } },
      tooltip: {
        callbacks: {
          title: (it) => {
            const w = weeks[it[0].dataIndex];
            return w ? PN.longWeek(w.mes, w.week) : '';
          },
          label: (ctx) => {
            const pt = ctx.dataset._series?.[ctx.dataIndex];
            if (!pt || pt.value == null) return `${ctx.dataset.label}: sin guías`;
            return `${ctx.dataset.label}: ${pt.value.toFixed(1)} min (${pt.count} guías)` +
              (pt.value > top ? ' ⚠ fuera de escala' : '');
          }
        }
      }
    });
  }, [rows, period, persona, people]);

  const items = [{ value: 'Equipo', label: 'Equipo', color: '#ffc947' }].concat(
    people.map((p) => ({ value: p, label: p.split(' ')[0], title: p, color: D.colorFor(p) }))
  );

  return (
    <Card title="Evolución semanal por persona" subtitle="Curva de aprendizaje · mediana semanal de cada quien">
      <Tabs items={items} value={persona} onChange={setPersona} />
      <ChartCanvas config={config} className="cw tall" />
    </Card>
  );
}

function DetallePorGuia({ rows }) {
  const [persona, setPersona] = useState('Equipo');
  const [tipo, setTipo] = useState('');
  const [mes, setMes] = useState('');
  const [semana, setSemana] = useState('');
  const [dia, setDia] = useState('');

  const people = useMemo(() => D.peopleOf(rows), [rows]);
  const base = useMemo(
    () => (persona === 'Equipo' ? rows : rows.filter((r) => r.persona === persona)),
    [rows, persona]
  );

  // Cada filtro acota las opciones del siguiente.
  const tipos = useMemo(() => [...new Set(base.map((r) => r.SHIPMENTTYPE))].sort(), [base]);
  const afterTipo = useMemo(() => (tipo ? base.filter((r) => r.SHIPMENTTYPE === tipo) : base), [base, tipo]);
  const meses = useMemo(
    () => [...new Set(afterTipo.map((r) => r.mes))].sort((a, b) => a - b).map((m) => ({ value: m, label: PN.MONTHS[m] })),
    [afterTipo]
  );
  const afterMes = useMemo(() => (mes ? afterTipo.filter((r) => r.mes === +mes) : afterTipo), [afterTipo, mes]);
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
      const d = new Date(r.fecha_str + 'T00:00:00');
      if (!seen[r.fecha_str] && d.getDay() !== 0 && d.getDay() !== 6) seen[r.fecha_str] = 1;
    });
    return Object.keys(seen).sort().map((f) => ({ value: f, label: dayLabel(f) }));
  }, [afterSemana]);

  const filtered = useMemo(() => {
    const out = dia ? afterSemana.filter((r) => r.fecha_str === dia) : afterSemana;
    return [...out].sort(
      (a, b) => (a.fecha_str < b.fecha_str ? -1 : a.fecha_str > b.fecha_str ? 1 : (+a.GUIANUMBER || 0) - (+b.GUIANUMBER || 0))
    );
  }, [afterSemana, dia]);

  const mins = filtered.map((r) => r.diff_minutes);
  const box = mins.length ? S.boxStats(mins) : null;
  const top = mins.length ? S.axisCap(mins, 0.95, 1.25, 30) : 60;
  const capped = B.cap(mins, top);

  const config = useMemo(() => {
    if (!filtered.length) return null;
    return B.barConfig(
      filtered.map((r) => r.GUIANUMBER),
      [{
        data: capped.values,
        backgroundColor: filtered.map((r, i) => (capped.flags[i] ? 'rgba(255,201,71,.55)' : D.colorFor(r.persona) + '77')),
        borderColor: filtered.map((r, i) => (capped.flags[i] ? '#ffc947' : D.colorFor(r.persona))),
        borderWidth: filtered.map((r) => (r.comment ? 2.2 : 1.2)),
        borderRadius: 3
      }],
      {
        yTitle: 'MINUTOS', rotate: 60,
        y: { beginAtZero: true, max: top, ticks: { color: '#5a7a99', font: { family: 'DM Mono', size: 10 }, stepSize: S.axisStep(top) } },
        tooltip: {
          callbacks: {
            title: (it) => {
              const r = filtered[it[0].dataIndex];
              return `Guía ${r.GUIANUMBER} · ${r.persona.split(' ')[0]}`;
            },
            label: (ctx) => {
              const r = filtered[ctx.dataIndex];
              const out = [`${r.diff_minutes.toFixed(1)} min · ${r.fecha_str}`];
              if (capped.flags[ctx.dataIndex]) out.push('⚠ fuera de la escala visible');
              out.push(r.SHIPMENTTYPE);
              if (r.comment) out.push(`💬 ${r.comment.slice(0, 90)}${r.comment.length > 90 ? '…' : ''}`);
              return out;
            }
          }
        }
      }
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filtered, top]);

  const items = [{ value: 'Equipo', label: 'Equipo', color: '#ffc947' }].concat(
    people.map((p) => ({ value: p, label: p.split(' ')[0], title: p, color: D.colorFor(p) }))
  );

  const resetDown = (level) => {
    if (level <= 0) { setTipo(''); }
    if (level <= 1) { setMes(''); }
    if (level <= 2) { setSemana(''); }
    setDia('');
  };

  return (
    <Card
      title="Detalle por guía"
      subtitle="Filtra por persona, tipo, mes, semana y día · 💬 pasa el cursor sobre las filas con comentario"
    >
      <Tabs
        items={items}
        value={persona}
        onChange={(v) => { setPersona(v); resetDown(0); }}
      />
      <div className="frow">
        <Select label="Tipo de embarque" value={tipo} onChange={(v) => { setTipo(v); resetDown(1); }}
          options={tipos} placeholder="Todos los tipos" />
        <Select label="Mes" value={mes} onChange={(v) => { setMes(v); resetDown(2); }}
          options={meses} placeholder="Todos los meses" />
        <Select label="Semana" value={semana} onChange={(v) => { setSemana(v); setDia(''); }}
          options={semanas} placeholder="Todas las semanas" />
        <Select label="Día" value={dia} onChange={setDia} options={dias} placeholder="Todos los días" />
      </div>

      <div style={{ position: 'relative' }}>
        <div className="avgbox">
          <span className="avglbl">Selección visible</span>
          <span className="avgval">{mins.length ? `${nice(S.median(mins))} min` : '— min'}</span>
          <span className="avgsub">
            {mins.length ? `mediana · promedio ${Math.round(S.mean(mins))} min · ${mins.length} guías` : 'sin guías'}
          </span>
        </div>
        <div className="cscroll">
          <div style={{ height: 250, minWidth: Math.max(600, filtered.length * 26) }}>
            <ChartCanvas config={config} className="" style={{ height: '100%' }} />
          </div>
        </div>
      </div>

      <hr className="sep" />
      <TableWrap>
        <table>
          <thead>
            <tr>
              <th>Guía</th><th>Fecha</th><th>Tipo</th><th>Semana</th><th className="r">Min</th><th className="c">💬</th>
            </tr>
          </thead>
          <tbody>
            {!filtered.length && <EmptyRow cols={6} />}
            {filtered.map((r) => {
              const esOut = box && (r.diff_minutes < box.lowFence || r.diff_minutes > box.highFence);
              const color = esOut ? '#ffc947' : D.colorFor(r.persona);
              return (
                <tr
                  key={r.GUIANUMBER}
                  data-comment={r.comment || undefined}
                  style={r.comment ? { cursor: 'help' } : undefined}
                >
                  <td style={{ color, fontWeight: 700 }}>{r.GUIANUMBER}{esOut ? ' ⚠' : ''}</td>
                  <td>
                    {persona === 'Equipo' && (
                      <>
                        <span style={{ color: D.colorFor(r.persona), fontSize: 9 }}>{r.persona.split(' ')[0]}</span>
                        <br />
                      </>
                    )}
                    {r.fecha_str}
                  </td>
                  <td style={{ color: 'var(--mt)', fontSize: 9 }}>{r.SHIPMENTTYPE}</td>
                  <td style={{ color: 'var(--mt)' }}>{r.week_label}</td>
                  <td className="r" style={{ color, fontWeight: 700 }}>{r.diff_minutes.toFixed(1)}</td>
                  <td className="c">{r.comment ? '💬' : ''}</td>
                </tr>
              );
            })}
            {box && (
              <tr>
                <td colSpan={6} style={{ color: 'var(--mt)', fontSize: 9, padding: '8px 12px' }}>
                  ⚠ marca las guías fuera de las vallas de Tukey (menos de {box.lowFence.toFixed(0)} o más de{' '}
                  {box.highFence.toFixed(0)} min) — anómalas frente a este mismo conjunto.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </TableWrap>
    </Card>
  );
}

function DatosExtra({ rows }) {
  const [volPersona, setVolPersona] = useState('all');
  const people = useMemo(() => D.peopleOf(rows), [rows]);

  const groups = useMemo(
    () =>
      people
        .map((p) => ({ p, v: rows.filter((r) => r.persona === p).map((r) => r.diff_minutes) }))
        .filter((g) => g.v.length)
        .sort((a, b) => S.median(a.v) - S.median(b.v)),
    [rows, people]
  );

  const personConfig = useMemo(
    () =>
      groups.length
        ? B.barConfig(
            groups.map((g) => g.p.split(' ')[0]),
            [
              {
                label: 'Mediana', data: groups.map((g) => +S.median(g.v).toFixed(1)),
                backgroundColor: groups.map((g) => D.colorFor(g.p) + '99'),
                borderColor: groups.map((g) => D.colorFor(g.p)), borderWidth: 2, borderRadius: 5
              },
              {
                label: 'Promedio', type: 'line', data: groups.map((g) => +S.mean(g.v).toFixed(1)),
                borderColor: '#ffc947', borderDash: [4, 3], borderWidth: 1.5,
                pointRadius: 4, pointBackgroundColor: '#ffc947', tension: 0.25, fill: false
              }
            ],
            {
              legend: true, xTitle: 'PERSONA', yTitle: 'MINUTOS', rotate: 0,
              tooltip: {
                callbacks: {
                  label: (c) =>
                    c.datasetIndex === 0
                      ? `Mediana: ${c.raw} min (${groups[c.dataIndex].v.length} guías)`
                      : `Promedio: ${c.raw} min`
                }
              }
            }
          )
        : null,
    [groups]
  );

  const volConfig = useMemo(() => {
    if (!groups.length) return null;
    const total = groups.reduce((s, g) => s + g.v.length, 0);
    return {
      type: 'doughnut',
      data: {
        labels: groups.map((g) => g.p.split(' ')[0]),
        datasets: [{
          data: groups.map((g) => g.v.length),
          backgroundColor: groups.map((g) => D.colorFor(g.p) + 'cc'),
          borderColor: '#080b10', borderWidth: 3
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false, cutout: '58%',
        plugins: {
          legend: B.legend(true, 'bottom'),
          tooltip: {
            ...B.TOOLTIP,
            callbacks: { label: (c) => `${c.label}: ${c.raw} guías (${((c.raw / total) * 100).toFixed(1)}%)` }
          }
        }
      }
    };
  }, [groups]);

  const tipoConfig = useMemo(() => {
    const data = D.volumeByType(rows, volPersona);
    if (!data.length) return null;
    const color = volPersona === 'all' ? null : D.colorFor(volPersona);
    return B.barConfig(
      data.map((d) => d.type),
      [{
        data: data.map((d) => d.count),
        backgroundColor: data.map((_, i) => (color || PN.PALETTE[i % PN.PALETTE.length]) + '99'),
        borderColor: data.map((_, i) => color || PN.PALETTE[i % PN.PALETTE.length]),
        borderWidth: 1.5, borderRadius: 4
      }],
      {
        xTitle: 'TIPO DE EMBARQUE', yTitle: 'N° DE GUÍAS', rotate: 55,
        tooltip: { callbacks: { label: (c) => `${c.raw} guías` } }
      }
    );
  }, [rows, volPersona]);

  const hist = useMemo(
    () => B.histogramConfig(rows.map((r) => r.diff_minutes), { xTitle: 'MINUTOS', labelFn: (b) => `${b.lo}–${b.hi}` }),
    [rows]
  );

  const volItems = [{ value: 'all', label: 'Todos', color: '#5a7a99' }].concat(
    people.map((p) => ({ value: p, label: p.split(' ')[0], title: p, color: D.colorFor(p) }))
  );

  return (
    <>
      <div className="two">
        <Card title="Mediana y promedio por persona" subtitle="La brecha entre ambas líneas mide el peso de los outliers">
          <ChartCanvas config={personConfig} />
        </Card>
        <Card title="Reparto del volumen" subtitle="Guías atendidas por persona">
          <ChartCanvas config={volConfig} />
        </Card>
      </div>
      <Card title="Volumen por tipo de embarque" subtitle="Filtra por persona">
        <Tabs items={volItems} value={volPersona} onChange={setVolPersona} />
        <ChartCanvas config={tipoConfig} />
      </Card>
      <Card
        title="Distribución de tiempos"
        subtitle={
          hist
            ? `Bins de ${hist.hist.width} min (regla de Freedman–Diaconis).` +
              (hist.excluded ? ` ${hist.excluded} guías por encima de ${Math.round(hist.upper)} min quedan fuera del recorte visual.` : '')
            : 'Histograma con ancho de bin constante'
        }
      >
        <ChartCanvas config={hist?.config} />
      </Card>
    </>
  );
}

/* ══════════════ ESTADÍSTICO ══════════════ */

function Estadistico({ rows, all, period }) {
  const [section, setSection] = useState('ad');
  return (
    <>
      <SectionNav items={SECTIONS} value={section} onChange={setSection} />
      {section === 'ad' && <AntesDespues all={all} period={period} />}
      {section === 'cc' && <CartaControl rows={rows} period={period} />}
      {section === 'bp' && <BoxPlot rows={rows} />}
      {section === 'pa' && <Pareto rows={rows} />}
      {section === 'di' && <Distribucion rows={rows} />}
      {section === 'sr' && <SerieTiempo all={all} />}
    </>
  );
}

function AntesDespues({ all, period }) {
  const data = useMemo(() => {
    const periods = PN.PERIODS.map((def) => {
      const rows = D.byPeriodId(all, def.id);
      return { def, rows, v: rows.map((r) => r.diff_minutes) };
    });

    const weeks = PN.allWeeks('all');
    const wg = {};
    D.weeklyGlobal(all).forEach((r) => { wg[`${r.mes}|${r.week_label}`] = r; });
    const pts = weeks.map((w) => {
      const r = wg[`${w.mes}|${w.week}`];
      const pid = PN.periodOf({ mes: w.mes, week: w.week });
      const def = PN.PERIODS.find((p) => p.id === pid);
      return {
        label: PN.shortWeek(w.mes, w.week),
        full: PN.longWeek(w.mes, w.week),
        value: r ? r.median : null,
        n: r ? r.count : 0,
        color: def ? def.color : '#5a7a99',
        periodo: def ? def.label : '—'
      };
    });
    const present = pts.map((p) => p.value).filter((v) => v != null);
    const top = S.axisCap(present, 0.95, 1.3, 20);
    const c = B.cap(pts.map((p) => p.value), top);
    const ms = B.milestonePlugin(weeks);

    const config = {
      type: 'bar',
      plugins: ms ? [ms] : [],
      data: {
        labels: pts.map((p) => p.label),
        datasets: [{
          data: c.values,
          backgroundColor: pts.map((p, i) => (c.flags[i] ? 'rgba(255,201,71,.5)' : p.color + '66')),
          borderColor: pts.map((p, i) => (c.flags[i] ? '#ffc947' : p.color)),
          borderWidth: 1.5, borderRadius: 3
        }]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...B.TOOLTIP,
            callbacks: {
              title: (it) => pts[it[0].dataIndex].full,
              label: (ctx) => {
                const p = pts[ctx.dataIndex];
                if (p.value == null) return 'Sin guías';
                return [p.periodo, `Mediana: ${p.value.toFixed(1)} min`, `${p.n} guías`];
              }
            }
          }
        },
        scales: {
          x: B.axis('SEMANA', { ticks: { color: '#5a7a99', font: { family: 'DM Mono', size: 8 }, maxRotation: 45 } }),
          y: B.axis('MEDIANA (min)', { beginAtZero: true, max: top })
        }
      }
    };

    const boxes = periods.map((pp) => ({
      def: pp.def,
      n: pp.v.length,
      median: pp.v.length ? S.median(pp.v) : null,
      ci: pp.v.length >= 3 ? S.bootstrapCI(pp.v, S.median, { iterations: 4000 }) : null
    }));

    const compara = (a, b, titulo) => {
      if (a.length < 5 || b.length < 5) return null;
      const boot = S.bootstrapDiff(a, b, S.median, { iterations: 4000 });
      const mw = S.mannWhitneyU(a, b);
      return { titulo, boot, mw, significativo: mw && mw.p < 0.05, ciExcluyeCero: boot && ((boot.pctLower < 0 && boot.pctUpper < 0) || (boot.pctLower > 0 && boot.pctUpper > 0)) };
    };

    const [antes, macro, interfaz] = periods.map((p) => p.v);
    const comps = [
      compara(antes, macro, '1 · Macro Layout Millennium (9 marzo)'),
      compara(macro, interfaz, '2 · Interfaz de Facturas (28 mayo)'),
      compara(antes, interfaz, '3 · Efecto acumulado de ambas')
    ].filter(Boolean);

    const total = comps[comps.length - 1];
    return { config, boxes, comps, total };
  }, [all]);

  return (
    <Card
      title="Antes / Después — impacto de las mejoras"
      subtitle="Macro Layout Millennium (9 mar) · Interfaz de Facturas (28 may) · comparación de medianas con prueba formal"
    >
      <InfoPanel>
        <strong>¿Qué compara?</strong> La mediana de minutos en tres periodos: antes de cualquier mejora, después
        de la macro y después de la interfaz. Cada barra semanal se colorea según el periodo al que pertenece.<br />
        <strong>¿Por qué la mediana y no el promedio?</strong> Los tiempos tienen cola derecha larga (el paro de KN
        de enero produjo guías de más de 4 000 min). El promedio se dispara con esos casos; la mediana describe la
        semana típica.<br />
        <strong>¿Por qué Mann-Whitney y no una prueba t?</strong> La t asume que los datos son normales y estos no
        lo son. La U de Mann-Whitney compara rangos y sólo exige independencia.
        <span className="formula">
          U₁ = R₁ − n₁(n₁+1)/2 &nbsp;·&nbsp; z = (U − μ_U ± 0.5) / σ_U &nbsp;con corrección por empates
        </span>
        <strong>¿Qué es el intervalo de confianza?</strong> Se remuestrean los datos 4 000 veces (bootstrap) y se
        toma el percentil 2.5 y el 97.5 del cambio. Si ese intervalo no incluye el 0, la mejora no es casualidad.
      </InfoPanel>

      {period !== 'all' && (
        <div className="csub" style={{ color: 'var(--aw)' }}>
          ⚠ Este análisis siempre usa el histórico completo (los tres periodos son fijos), ignorando el filtro de{' '}
          {PN.MONTHS[period]} activo arriba.
        </div>
      )}

      <div className="stat-grid">
        {data.boxes.map((b) => (
          <div key={b.def.id} className="stat-box" style={{ borderColor: b.def.color + '44' }}>
            <div className="sb-lbl" style={{ color: b.def.color }}>{b.def.label}</div>
            <div className="sb-range">{b.def.desc} · {b.def.tone}</div>
            <div className="sb-val" style={{ color: b.def.color }}>{nice(b.median)}</div>
            <div className="sb-unit">minutos (mediana)</div>
            {b.ci && (
              <div className="sb-ci">IC 95 %: {b.ci.lower.toFixed(1)} – {b.ci.upper.toFixed(1)} min</div>
            )}
            <div className="sb-ci">{b.n} guías</div>
          </div>
        ))}
      </div>

      <ChartCanvas config={data.config} className="cw tall" />

      <Verdict
        tone={data.total?.significativo && data.total?.boot.pctUpper < 0 ? 'ok' : 'warn'}
        tag={data.total?.significativo && data.total?.boot.pctUpper < 0 ? 'Mejora confirmada' : 'Sin evidencia suficiente'}
      >
        {data.total && (
          <>
            <strong>
              De {nice(data.total.boot.from)} a {nice(data.total.boot.to)} minutos de mediana (
              {Math.abs(data.total.boot.pct).toFixed(1)}% menos).
            </strong>{' '}
          </>
        )}
        Las pruebas se hacen sobre la mediana porque los tiempos tienen cola derecha larga; la U de Mann-Whitney no
        asume normalidad y el intervalo por bootstrap no depende de ella.
        <br />
        <br />
        {data.comps.map((c) => (
          <div key={c.titulo} style={{ marginBottom: 10 }}>
            <strong>{c.titulo}</strong>
            <br />
            Mediana {nice(c.boot.from)} → {nice(c.boot.to)} min ·{' '}
            <b style={{ color: c.boot.pct < 0 ? '#00e5b4' : '#ff6b6b' }}>
              {c.boot.pct < 0 ? '↓ ' : '↑ '}{Math.abs(c.boot.pct).toFixed(1)}%
            </b>
            <br />
            IC 95 % del cambio: {c.boot.pctLower.toFixed(1)}% a {c.boot.pctUpper.toFixed(1)}%
            {c.ciExcluyeCero ? (
              <span style={{ color: '#00e5b4' }}> (no incluye el 0 → la mejora es real)</span>
            ) : (
              <span style={{ color: '#ffc947' }}> (incluye el 0 → no concluyente)</span>
            )}
            <br />
            Mann-Whitney U = {Math.round(c.mw.U)}, {S.formatP(c.mw.p)}
            {c.significativo ? (
              <span style={{ color: '#00e5b4' }}> → diferencia estadísticamente significativa</span>
            ) : (
              <span style={{ color: '#ffc947' }}> → no significativa al 5 %</span>
            )}
          </div>
        ))}
      </Verdict>
    </Card>
  );
}

function CartaControl({ rows, period }) {
  const [stat, setStat] = useState('median');
  const chartRef = useRef(null);
  const result = useMemo(() => {
    const series = D.weeklySeries(rows, { period, stat });
    const res = B.controlChartConfig(series, {
      weeks: series, yTitle: 'MINUTOS', color: '#00e5b4',
      seriesLabel: `${stat === 'median' ? 'Mediana' : 'Promedio'} semanal`,
      format: (v) => `${v.toFixed(1)} min`
    });
    return res;
  }, [rows, period, stat]);

  const r1 = result ? result.flags.filter((f) => f.includes(1)).length : 0;
  const r2 = result ? result.flags.filter((f) => f.includes(2)).length : 0;

  return (
    <Card
      title="Carta de control I-MR"
      action={<HideAllButton chartRef={chartRef} />}
      subtitle="¿El proceso está bajo control o hay semanas con causas especiales?"
    >
      <InfoPanel>
        <strong>¿Qué representa?</strong> El valor de cada semana con tres líneas de referencia calculadas a partir
        del propio proceso.<br />
        <strong>¿Cómo se calculan los límites?</strong> Con el <b>rango móvil</b> — la diferencia entre semanas
        consecutivas:
        <span className="formula">
          MR̄ = media de |xᵢ − xᵢ₋₁| &nbsp;·&nbsp; σ̂ = MR̄ / 1.128 &nbsp;·&nbsp; LCS/LCI = x̄ ± 3σ̂
        </span>
        Antes se usaba μ ± 3σ con la desviación global. Esa σ incluye los propios picos, así que los outliers
        <em> ensanchaban</em> los límites y el gráfico dejaba de señalar nada.<br />
        <strong>¿Qué miro?</strong> Puntos rojos = semanas fuera de control (regla 1 de Nelson) o nueve semanas
        seguidas del mismo lado de la línea central (regla 2: el proceso se desplazó, aunque nada se salga).
      </InfoPanel>
      <div className="frow">
        <Select label="Estadístico semanal" value={stat} onChange={setStat}
          options={[{ value: 'median', label: 'Mediana (recomendado)' }, { value: 'avg', label: 'Promedio' }]} />
      </div>
      <ChartCanvas config={result?.config} className="cw tall" canvasRef={chartRef} />
      {result && (
        <div className="csub" style={{ margin: '12px 0 0', display: 'block', lineHeight: 1.8 }}>
          Límites por <b>I-MR</b>: σ̂ = MR̄ / 1.128 = {result.limits.sigma.toFixed(2)} min · LC ={' '}
          {result.limits.cl.toFixed(1)} · LCS = {result.limits.ucl.toFixed(1)} · LCI = {result.limits.lcl.toFixed(1)} min.
          <br />
          <b>Regla 1</b> (punto fuera de los límites 3σ): {r1} semana(s). <b>Regla 2</b> (nueve o más semanas
          seguidas del mismo lado): {r2} semana(s).
          {r2 > 0 && (
            <>
              {' '}La regla 2 es la señal importante aquí: no marca incidentes sueltos, marca que el proceso se{' '}
              <b>desplazó de nivel</b> — que es justo lo que se esperaba de las mejoras.
            </>
          )}
        </div>
      )}
    </Card>
  );
}

function BoxPlot({ rows }) {
  const [group, setGroup] = useState('p');
  const config = useMemo(() => {
    const g = D.groupMinutes(rows, group);
    let keys = Object.keys(g);
    if (group === 'm') {
      keys.sort((a, b) => PN.MONTH_LIST.findIndex((m) => PN.MONTHS[m] === a) - PN.MONTH_LIST.findIndex((m) => PN.MONTHS[m] === b));
    } else {
      keys.sort((a, b) => S.median(g[a]) - S.median(g[b]));
    }
    const groups = keys
      .filter((k) => g[k].length >= 3)
      .map((k, i) => ({
        label: group === 'p' ? k.split(' ')[0] : k.slice(0, 22),
        values: g[k],
        color: group === 'p' ? D.colorFor(k) : PN.PALETTE[i % PN.PALETTE.length]
      }));
    return B.boxPlotConfig(groups, { yTitle: 'MINUTOS', format: (v) => `${v.toFixed(1)} min` });
  }, [rows, group]);

  return (
    <Card title="Box plot" subtitle="Mediana · Q1 · Q3 · bigotes · outliers de Tukey (IQR × 1.5)">
      <InfoPanel>
        <strong>¿Qué representa?</strong> La distribución completa resumida en cinco números. La caja va del
        percentil 25 al 75 (dentro cae la mitad central de las guías) y la línea gruesa es la mediana.<br />
        <strong>Los bigotes.</strong> No llegan a las vallas: llegan al <em>dato real</em> más extremo que todavía
        cae dentro de Q1 − 1.5·IQR y Q3 + 1.5·IQR. Los puntos rojos por fuera son los outliers formales.
        <span className="formula">
          IQR = Q3 − Q1 &nbsp;·&nbsp; cuantiles por interpolación lineal (tipo 7, el default de R y numpy)
        </span>
        <strong>¿Qué decide?</strong> No sólo quién es más rápido, sino quién es más <em>consistente</em>: una caja
        angosta significa que casi todas sus guías tardan lo mismo.
      </InfoPanel>
      <div className="frow">
        <Select label="Agrupar por" value={group} onChange={setGroup}
          options={[{ value: 'p', label: 'Persona' }, { value: 't', label: 'Tipo de embarque' }, { value: 'm', label: 'Mes' }]} />
      </div>
      <ChartCanvas config={config} className="cw tall" />
      <div className="csub" style={{ margin: '12px 0 0' }}>
        Se omiten los grupos con menos de 3 guías: con esa muestra los cuartiles no significan nada.
      </div>
    </Card>
  );
}

function Pareto({ rows }) {
  const [group, setGroup] = useState('t');
  const [metric, setMetric] = useState('n');
  const config = useMemo(() => {
    const g = D.groupMinutes(rows, group);
    const items = Object.keys(g)
      .map((k) => {
        const v = g[k];
        return { label: k.split(',')[0].slice(0, 18), n: v.length, value: metric === 'n' ? v.length : S.sum(v) };
      })
      .sort((a, b) => b.value - a.value);
    return B.paretoConfig(items, {
      valueLabel: metric === 'n' ? 'Guías' : 'Minutos acumulados',
      yTitle: metric === 'n' ? 'N° DE GUÍAS' : 'MINUTOS TOTALES',
      xTitle: group === 't' ? 'TIPO DE EMBARQUE' : group === 'p' ? 'PERSONA' : 'DÍA DE LA SEMANA',
      format: (v) => (metric === 'n' ? `${v} guías` : `${Math.round(v)} min`)
    });
  }, [rows, group, metric]);

  return (
    <Card title="Análisis de Pareto" subtitle="Principio 80/20 · dónde está concentrado el problema">
      <InfoPanel>
        <strong>¿Qué representa?</strong> Las categorías ordenadas de mayor a menor, con la línea naranja marcando
        el porcentaje acumulado. Las barras resaltadas en verde son las que suman el primer 80 %.<br />
        <strong>Volumen o tiempo.</strong> Son preguntas distintas y la versión anterior las mezclaba: ordenaba por
        número de guías mientras el texto prometía mostrar dónde se concentraba el tiempo. Aquí eliges cuál.
      </InfoPanel>
      <div className="frow">
        <Select label="Categoría" value={group} onChange={setGroup}
          options={[{ value: 't', label: 'Tipo de embarque' }, { value: 'p', label: 'Persona' }, { value: 'd', label: 'Día de la semana' }]} />
        <Select label="Medir por" value={metric} onChange={setMetric}
          options={[{ value: 'n', label: 'Número de guías (volumen)' }, { value: 'min', label: 'Minutos acumulados (tiempo)' }]} />
      </div>
      <ChartCanvas config={config} className="cw tall" />
      <div className="csub" style={{ margin: '12px 0 0' }}>
        {metric === 'n'
          ? 'Ordenado por VOLUMEN: dónde se concentran más guías.'
          : 'Ordenado por TIEMPO TOTAL acumulado: dónde se va realmente el tiempo del equipo. Un tipo con pocas guías pero muy lentas aparece aquí y no en la vista por volumen.'}
      </div>
    </Card>
  );
}

function Distribucion({ rows }) {
  const histRef = useRef(null);
  const data = useMemo(() => {
    const mins = rows.map((r) => r.diff_minutes);
    if (!mins.length) return null;
    const hist = B.histogramConfig(mins, { xTitle: 'MINUTOS', labelFn: (b) => `${b.lo}–${b.hi}` });
    const box = S.boxStats(mins);
    const normales = rows.filter((r) => r.diff_minutes >= box.lowFence && r.diff_minutes <= box.highFence);
    const outliers = rows.filter((r) => r.diff_minutes < box.lowFence || r.diff_minutes > box.highFence);
    const capY = S.axisCap(mins, 0.97, 1.3, 60);
    const jitter = (s) => {
      let h = 0;
      s = String(s);
      for (let i = 0; i < s.length; i++) h = ((h << 5) - h + s.charCodeAt(i)) | 0;
      return ((Math.abs(h) % 1000) / 1000 - 0.5) * 0.55;
    };
    const scatter = {
      type: 'scatter',
      data: {
        datasets: [
          {
            label: 'Dentro de patrón', pointRadius: 3, backgroundColor: 'rgba(0,229,180,.55)',
            data: normales.map((r) => ({ x: r.mes + jitter(r.GUIANUMBER), y: r.diff_minutes, r }))
          },
          {
            label: 'Outlier de Tukey', pointRadius: 5, pointStyle: 'triangle',
            backgroundColor: outliers.map((r) => (r.diff_minutes > capY ? '#ffc947' : '#ff6b6b')),
            data: outliers.map((r) => ({ x: r.mes + jitter(r.GUIANUMBER), y: Math.min(r.diff_minutes, capY), r }))
          }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: B.legend(true),
          tooltip: {
            ...B.TOOLTIP,
            callbacks: {
              label: (c) => {
                const r = c.raw.r;
                return [
                  `Guía ${r.GUIANUMBER} · ${r.persona.split(' ')[0]}`,
                  `${r.diff_minutes.toFixed(1)} min${r.diff_minutes > capY ? ' ⚠ fuera de escala' : ''}`,
                  r.fecha_str
                ];
              }
            }
          }
        },
        scales: {
          x: B.axis('MES', {
            min: 0.4, max: 6.6,
            ticks: { stepSize: 1, color: '#5a7a99', font: { family: 'DM Mono', size: 10 }, callback: (v) => PN.MONTHS[v] || '' }
          }),
          y: B.axis('MINUTOS', { beginAtZero: true, max: capY })
        }
      }
    };
    return { hist, scatter, box, outliers, mins };
  }, [rows]);

  if (!data) return null;
  const { hist, scatter, box, outliers, mins } = data;

  return (
    <>
      <div className="two">
        <Card
          title="Histograma y curvas ajustadas"
          action={<HideAllButton chartRef={histRef} />}
          subtitle="Distribución real contra normal y log-normal"
        >
          <InfoPanel>
            <strong>Bins de ancho constante.</strong> La versión anterior mezclaba intervalos de 15, 30 y 50 minutos
            dibujados todos del mismo ancho, lo que exageraba visualmente los bins anchos. Aquí el ancho lo fija la
            regla de Freedman–Diaconis:
            <span className="formula">h = 2 · IQR · n^(−1/3) &nbsp;(robusta a outliers porque usa el IQR, no el rango)</span>
            <strong>Las curvas.</strong> Se calculan por diferencia de la función acumulada en cada bin, no evaluando
            la densidad en el punto medio. Si las barras siguen la <b>log-normal</b> y no la normal, el proceso tiene
            cola derecha — que es por lo que las pruebas del reporte son no paramétricas.
          </InfoPanel>
          <ChartCanvas config={hist?.config} canvasRef={histRef} />
        </Card>
        <Card title="Outliers formales de Tukey" subtitle="Detección estadística, no a ojo · IQR × 1.5">
          <ChartCanvas config={scatter} />
        </Card>
      </div>
      <Card>
        <div className="csub" style={{ margin: 0, display: 'block', lineHeight: 1.8 }}>
          Vallas de Tukey: por debajo de <b>{box.lowFence.toFixed(1)}</b> o por encima de{' '}
          <b>{box.highFence.toFixed(1)}</b> min (Q1∓1.5·IQR, con IQR = {box.iqr.toFixed(1)}).{' '}
          <b>{outliers.length}</b> de {mins.length} guías ({((outliers.length / mins.length) * 100).toFixed(1)}%) son
          outliers formales.
          {hist && ` Histograma con bins de ${hist.hist.width} min de ancho constante.`}
          {hist?.lognormal &&
            ` La log-normal (σ del log = ${hist.lognormal.sd.toFixed(2)}) describe la cola derecha mucho mejor que la normal.`}
        </div>
      </Card>
    </>
  );
}

function SerieTiempo({ all }) {
  const chartRef = useRef(null);
  const data = useMemo(() => {
    const series = D.weeklySeries(all, { period: 'all', stat: 'median' });
    const vals = series.map((p) => p.value);
    const trend = S.movingAverage(vals.map((v) => (v == null ? NaN : v)), 3, true);
    const resid = vals.map((v, i) => (v == null || trend[i] == null ? null : +(v - trend[i]).toFixed(2)));
    const present = vals.filter((v) => v != null);
    const top = S.axisCap(present, 0.95, 1.35, 20);
    const c = B.cap(vals, top);
    const residPresent = resid.filter((v) => v != null);

    const config = B.lineConfig(
      series.map((p) => p.label),
      [
        {
          label: 'Mediana semanal', data: c.values, borderColor: '#00e5b4', borderWidth: 2,
          tension: 0.2, fill: false, spanGaps: false,
          pointRadius: vals.map((v, i) => (v == null ? 0 : c.flags[i] ? 6 : 3)),
          pointStyle: c.flags.map((f) => (f ? 'triangle' : 'circle')),
          pointBackgroundColor: c.flags.map((f) => (f ? '#ffc947' : '#00e5b4'))
        },
        {
          label: 'Tendencia (media móvil 3, centrada)', data: trend, borderColor: '#ffc947',
          borderDash: [6, 3], borderWidth: 2, pointRadius: 0, tension: 0.4, fill: false, spanGaps: true
        },
        {
          label: 'Residuo (dato − tendencia)', data: resid, borderColor: '#a78bfa',
          borderDash: [3, 3], borderWidth: 1.5, pointRadius: 2, tension: 0.2, fill: false, spanGaps: true
        }
      ],
      {
        weeks: series, xTitle: 'SEMANA', yTitle: 'MINUTOS',
        y: { min: Math.min(0, residPresent.length ? S.quantile(residPresent, 0.05) : 0), max: top },
        tooltip: {
          callbacks: {
            title: (it) => series[it[0].dataIndex].full,
            label: (ctx) => {
              if (ctx.datasetIndex === 0) {
                const v = vals[ctx.dataIndex];
                return v == null ? 'Sin guías' : `Mediana: ${v.toFixed(1)} min${c.flags[ctx.dataIndex] ? ' ⚠ fuera de escala' : ''}`;
              }
              return ctx.raw == null ? `${ctx.dataset.label}: —` : `${ctx.dataset.label}: ${(+ctx.raw).toFixed(1)} min`;
            }
          }
        }
      }
    );

    const firstT = trend.findIndex((v) => v != null);
    const lastT = trend.length - 1 - [...trend].reverse().findIndex((v) => v != null);
    const delta = firstT >= 0 && lastT >= 0 && firstT !== lastT ? trend[lastT] - trend[firstT] : null;
    return { config, trend, firstT, lastT, delta };
  }, [all]);

  return (
    <Card
      title="Descomposición de la serie"
      action={<HideAllButton chartRef={chartRef} />}
      subtitle="Dato semanal · tendencia · residuo"
    >
      <InfoPanel>
        <strong>¿Qué representa?</strong> La serie semanal separada en tres partes: lo que pasó (verde), hacia dónde
        va (amarillo) y lo que sobra (morado).<br />
        <strong>Media móvil centrada.</strong> El valor de la semana i usa la ventana [i−1, i, i+1]. La versión
        rezagada, que usaba [i−2, i−1, i], desplazaba toda la tendencia una semana hacia la derecha y hacía «llegar
        tarde» los puntos de inflexión — justo los que marcan cuándo empezó a servir cada mejora. El precio es que
        la línea no existe en la primera ni en la última semana.<br />
        <strong>El residuo</strong> es dato − tendencia. Si no tiene patrón, la tendencia ya capturó la señal.
      </InfoPanel>
      <ChartCanvas config={data.config} className="cw tall" canvasRef={chartRef} />
      <div className="csub" style={{ margin: '12px 0 0', display: 'block', lineHeight: 1.8 }}>
        La media móvil es <b>centrada</b>: la versión rezagada desplazaba la tendencia una semana y hacía llegar
        tarde los puntos de inflexión.
        {data.delta != null && (
          <>
            {' '}Tendencia de {data.trend[data.firstT].toFixed(1)} a {data.trend[data.lastT].toFixed(1)} min (
            {data.delta < 0 ? '↓ mejora sostenida' : '↑ deterioro'} de {Math.abs(data.delta).toFixed(1)} min).
          </>
        )}
      </div>
    </Card>
  );
}
