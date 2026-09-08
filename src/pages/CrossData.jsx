/**
 * CrossData — Cruce de ambos reportes por número de guía.
 * Pregunta central: ¿cuando los documentos llegan tarde, el equipo tarda más?
 */

import { useMemo, useState } from 'react';
import PN from '../lib/calendar.js';
import S from '../lib/stats.js';
import * as D from '../lib/derive.js';
import { hour, int, nice } from '../lib/format.js';
import * as B from '../charts/builders.js';
import ChartCanvas from '../components/ChartCanvas.jsx';
import { PeriodBar } from '../components/Layout.jsx';
import { Card, InfoPanel, KpiGrid, Select, Verdict } from '../components/ui.jsx';
import { useData } from '../state/DataContext.jsx';

const HINT_R =
  '<b style="color:#f97316">CORRELACIÓN</b><br><br>Pearson mide relación lineal; Spearman mide relación ' +
  'monótona sobre rangos y aguanta los outliers, por eso aquí manda Spearman.<br><br>' +
  'r cerca de 0 = las dos cosas no se mueven juntas.<br>El p-valor dice si lo observado podría deberse al azar: ' +
  'p &gt; 0.05 significa que ni siquiera se distingue del ruido.';

export default function CrossData() {
  const { tiempos, manifiestos, dataset } = useData();
  const [colorBy, setColorBy] = useState('p');

  const all = useMemo(() => D.crossPairs(tiempos, manifiestos), [tiempos, manifiestos]);
  const pairs = useMemo(() => all.filter((p) => p.docs != null), [all]);

  const stats = useMemo(() => {
    if (pairs.length < 4) return null;
    const horas = pairs.map((x) => x.docs);
    const mins = pairs.map((x) => x.minutos);
    return {
      horas, mins,
      pearson: S.pearson(horas, mins),
      spearman: S.spearman(horas, mins),
      reg: S.linreg(horas, mins)
    };
  }, [pairs]);

  const cards = useMemo(() => {
    if (!all.length) return [];
    const horas = pairs.map((x) => x.docs);
    const mins = pairs.map((x) => x.minutos);
    return [
      { color: '#f97316', label: 'Guías en ambos reportes', value: int(all.length), sub: `${pairs.length} con hora de recepción utilizable` },
      { color: '#4d7cfe', label: 'Hora media de llegada', value: horas.length ? hour(S.mean(horas)) : '—', sub: `mediana ${horas.length ? hour(S.median(horas)) : '—'} hrs` },
      { color: '#00e5b4', label: 'Mediana de elaboración', value: mins.length ? `${nice(S.median(mins))} min` : '—', sub: 'sobre las guías cruzadas' },
      {
        color: '#f97316', label: 'Correlación',
        value: stats?.spearman ? stats.spearman.r.toFixed(3) : '—',
        sub: stats?.spearman ? `Spearman ρ · ${S.formatP(stats.spearman.p)} · n = ${stats.spearman.n}` : 'muestra insuficiente',
        hint: HINT_R
      }
    ];
  }, [all, pairs, stats]);

  const scatter = useMemo(() => {
    if (!pairs.length) return null;
    const groups = {};
    pairs.forEach((x) => {
      const k = colorBy === 'p' ? x.persona : colorBy === 't' ? x.tipo : PN.MONTHS[x.mes];
      (groups[k] = groups[k] || []).push(x);
    });
    const capY = S.axisCap(pairs.map((x) => x.minutos), 0.97, 1.3, 60);
    const datasets = Object.keys(groups).map((k, i) => {
      const color = colorBy === 'p' ? D.colorFor(k) : PN.PALETTE[i % PN.PALETTE.length];
      return {
        label: k.split(',')[0].slice(0, 18), type: 'scatter',
        backgroundColor: color + '99', borderColor: color, borderWidth: 1, pointRadius: 4,
        data: groups[k].map((x) => ({ x: x.docs, y: Math.min(x.minutos, capY), _r: x }))
      };
    });
    if (stats?.reg) {
      const xs = pairs.map((x) => x.docs);
      const x0 = Math.min(...xs);
      const x1 = Math.max(...xs);
      datasets.push({
        label: 'Recta de ajuste', type: 'line', borderColor: '#ffc947', borderDash: [6, 3],
        borderWidth: 2, pointRadius: 0, fill: false,
        data: [
          { x: x0, y: Math.min(stats.reg.intercept + stats.reg.slope * x0, capY) },
          { x: x1, y: Math.min(stats.reg.intercept + stats.reg.slope * x1, capY) }
        ]
      });
    }
    return {
      type: 'scatter',
      data: { datasets },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: B.legend(true),
          tooltip: {
            ...B.TOOLTIP,
            callbacks: {
              label: (c) => {
                if (!c.raw._r) return 'Ajuste lineal';
                const r = c.raw._r;
                return [
                  `Guía ${r.guia} · ${r.persona.split(' ')[0]}`,
                  `Docs a las ${hour(r.docs)} hrs`,
                  `Elaboración: ${r.minutos.toFixed(1)} min${r.minutos > capY ? ' ⚠ fuera de escala' : ''}`,
                  r.tipo
                ];
              }
            }
          }
        },
        scales: {
          x: B.axis('HORA DE LLEGADA DE DOCS', {
            ticks: { color: '#4d7cfe', font: { family: 'DM Mono', size: 10 }, callback: (v) => hour(v) }
          }),
          y: B.axis('MINUTOS DE ELABORACIÓN', { beginAtZero: true, max: capY })
        }
      }
    };
  }, [pairs, colorBy, stats]);

  const paretoCfg = useMemo(() => {
    if (!all.length) return null;
    const g = {};
    all.forEach((x) => {
      const k = x.tipo || '—';
      const e = (g[k] = g[k] || { n: 0, min: 0, tarde: 0 });
      e.n++;
      e.min += x.minutos;
      if (x.docs != null && x.docs > 7) e.tarde++;
    });
    const items = Object.keys(g)
      .map((k) => ({ label: k.split(',')[0].slice(0, 16), n: g[k].n, value: g[k].min, tarde: g[k].tarde }))
      .sort((a, b) => b.value - a.value);
    const total = items.reduce((s, i) => s + i.value, 0);
    let cum = 0;
    const pct = items.map((i) => { cum += i.value; return +((cum / total) * 100).toFixed(1); });
    return {
      type: 'bar',
      data: {
        labels: items.map((i) => i.label),
        datasets: [
          { label: 'Minutos totales de elaboración', data: items.map((i) => Math.round(i.value)), backgroundColor: 'rgba(249,115,22,.45)', borderColor: '#f97316', borderWidth: 1.5, borderRadius: 4, yAxisID: 'y', order: 3 },
          { label: 'Guías con docs después de las 07:00', data: items.map((i) => i.tarde), backgroundColor: 'rgba(77,124,254,.5)', borderColor: '#4d7cfe', borderWidth: 1.5, borderRadius: 4, yAxisID: 'y2', order: 2 },
          { label: '% acumulado del tiempo', data: pct, type: 'line', borderColor: '#ffc947', borderWidth: 2, pointRadius: 3, tension: 0.25, fill: false, yAxisID: 'y3', order: 1 }
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
                const it = items[c.dataIndex];
                if (c.datasetIndex === 0) return `${Math.round(it.value)} min en total (${it.n} guías)`;
                if (c.datasetIndex === 1) return `${it.tarde} de ${it.n} guías con docs tardíos`;
                return `${c.raw} % acumulado`;
              }
            }
          }
        },
        scales: {
          x: B.axis('TIPO DE EMBARQUE', { ticks: { color: '#5a7a99', font: { family: 'DM Mono', size: 8 }, maxRotation: 45 } }),
          y: B.axis('MINUTOS', { beginAtZero: true }),
          y2: { display: false, beginAtZero: true },
          y3: { position: 'right', min: 0, max: 100, grid: { display: false }, ticks: { color: '#ffc947', font: { family: 'DM Mono', size: 9 }, callback: (v) => `${v}%` } }
        }
      }
    };
  }, [all]);

  const weekly = useMemo(() => {
    const wg = {};
    D.weeklyGlobal(dataset.tiempos).forEach((r) => { wg[`${r.mes}|${r.week_label}`] = r; });
    const pts = [];
    D.shippingWeekly(dataset.manifiestos).forEach((s) => {
      const t = wg[`${s.mes}|${s.week_label}`];
      if (t && s.dec_docs != null) {
        pts.push({ x: s.dec_docs, y: t.median, label: PN.longWeek(s.mes, s.week_label), n: t.count });
      }
    });
    if (pts.length < 3) return null;
    const cor = S.spearman(pts.map((p) => p.x), pts.map((p) => p.y));
    const config = {
      type: 'scatter',
      data: { datasets: [{ label: 'Semanas', data: pts, backgroundColor: 'rgba(249,115,22,.6)', borderColor: '#f97316', pointRadius: 6, borderWidth: 1.5 }] },
      options: {
        responsive: true, maintainAspectRatio: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            ...B.TOOLTIP,
            callbacks: {
              label: (c) => [c.raw.label, `Docs: ${hour(c.raw.x)} hrs`, `Mediana de elaboración: ${c.raw.y.toFixed(1)} min (${c.raw.n} guías)`]
            }
          }
        },
        scales: {
          x: B.axis('HORA MEDIA DE DOCS', { ticks: { color: '#4d7cfe', font: { family: 'DM Mono', size: 9 }, callback: (v) => hour(v) } }),
          y: B.axis('MEDIANA SEMANAL (min)', { beginAtZero: true })
        }
      }
    };
    return { config, cor };
  }, [dataset]);

  const hayRelacion = stats?.spearman && stats.spearman.p < 0.05 && Math.abs(stats.spearman.r) >= 0.2;

  return (
    <>
      <PeriodBar
        note={
          <>
            Sólo se cruzan las guías presentes en <b style={{ color: '#8aa0b8' }}>los dos reportes</b> y con hora de
            recepción utilizable.
          </>
        }
      />

      <div className="xhero">
        <div style={{ fontFamily: 'var(--mn)', fontSize: 9, color: 'var(--mt)', textTransform: 'uppercase', letterSpacing: '.1em', marginBottom: 12 }}>
          Flujo operativo completo
        </div>
        <div className="xflow">
          <div className="fstep m">📋 Recepción de docs</div><span className="farr">→</span>
          <div className="fstep m">🚛 Datos de transporte</div><span className="farr">→</span>
          <div className="fstep t">🧾 Elaboración de factura</div><span className="farr">→</span>
          <div className="fstep t">📄 Solicitud de carta porte</div>
        </div>
        <div className="xdesc">
          Los dos primeros pasos los controla Shipping; los dos últimos, el equipo de Import/Export. Esta página une
          ambos reportes por número de guía para responder una sola pregunta:{' '}
          <b style={{ color: '#e8edf5' }}>¿el tiempo de elaboración depende de la hora a la que llegan los documentos?</b>{' '}
          La respuesta decide dónde tiene sentido invertir esfuerzo de mejora.
        </div>
      </div>

      <KpiGrid cards={cards} />

      {stats?.spearman && stats?.pearson && (
        <Verdict tone={hayRelacion ? 'warn' : 'ok'} tag={hayRelacion ? 'Sí hay relación' : 'No hay relación'}>
          Con <b>n = {stats.spearman.n}</b> parejas, Spearman ρ = <b>{stats.spearman.r.toFixed(3)}</b> (
          {S.describeR(stats.spearman.r)}), {S.formatP(stats.spearman.p)}. Pearson r = {stats.pearson.r.toFixed(3)} (
          {S.formatP(stats.pearson.p)}), que explica apenas el <b>{(stats.pearson.r2 * 100).toFixed(1)}%</b> de la
          variación.
          <br />
          <br />
          {hayRelacion
            ? 'La hora de llegada de los documentos sí mueve el tiempo de elaboración: vale la pena atacar los retrasos de Shipping.'
            : (
              <>
                La hora a la que llegan los documentos <b>no explica</b> cuánto tarda el equipo en elaborar. El
                tiempo de elaboración depende del propio proceso (herramientas, tipo de embarque, incidencias), no
                de que Shipping entregue antes o después. Esto justifica que las mejoras se hayan hecho del lado de
                la elaboración y no presionando a Shipping.
              </>
            )}
        </Verdict>
      )}

      <Card
        title="Hora de llegada vs tiempo de elaboración"
        subtitle="Una guía por punto · la recta amarilla es el ajuste por mínimos cuadrados"
        className="cross-scatter"
      >
        <InfoPanel>
          <strong>¿Qué representa?</strong> Cada punto es una guía: en el eje horizontal la hora a la que llegaron
          sus documentos, en el vertical los minutos que tardó su elaboración.<br />
          <strong>¿Qué buscar?</strong> Si los documentos tardíos causaran demoras, los puntos formarían una diagonal
          ascendente. Una nube sin forma significa que las dos cosas son independientes.<br />
          <strong>Cuidado con la recta.</strong> La pendiente siempre se puede calcular, incluso sobre datos sin
          relación. Sólo tiene sentido leerla junto al coeficiente y su p-valor:
          <span className="formula">
            Spearman ρ sobre rangos (robusto a outliers) · p por transformación z de Fisher: z = artanh(r)·√(n−3)
          </span>
        </InfoPanel>
        <div className="frow">
          <Select label="Colorear por" value={colorBy} onChange={setColorBy}
            options={[{ value: 'p', label: 'Persona' }, { value: 't', label: 'Tipo de embarque' }, { value: 'm', label: 'Mes' }]} />
        </div>
        <ChartCanvas config={scatter} className="cw tall" />
        {stats?.reg && (
          <div className="csub" style={{ margin: '12px 0 0' }}>
            Pendiente de la recta: <b>&nbsp;{stats.reg.slope.toFixed(1)} min por cada hora de retraso</b>. Si la nube
            no sigue la recta, la pendiente no significa nada — mírala junto al coeficiente de arriba.
          </div>
        )}
      </Card>

      <div className="two">
        <Card title="Pareto combinado" subtitle="¿Qué tipos pesan en las dos etapas a la vez?">
          <InfoPanel>
            <strong>Dos medidas superpuestas.</strong> Las barras naranjas suman los minutos totales de elaboración
            de cada tipo; las azules cuentan cuántas de sus guías tuvieron documentos después de las 07:00.<br />
            Un tipo alto en naranja pero bajo en azul es un problema de elaboración. Alto en las dos puede ser un
            problema de entrada.
          </InfoPanel>
          <ChartCanvas config={paretoCfg} />
        </Card>
        <Card title="Correlación a nivel semana" subtitle="Un punto por semana en lugar de por guía">
          <InfoPanel>
            <strong>Por qué agregar por semana.</strong> Promediar reduce el ruido de cada guía individual.<br />
            <strong>Por qué no basta.</strong> Al agregar quedan muy pocos puntos, así que el coeficiente se vuelve
            inestable y puede aparecer una relación que a nivel guía no existe (falacia ecológica).
          </InfoPanel>
          <ChartCanvas config={weekly?.config} />
          {weekly?.cor && (
            <div className="csub" style={{ margin: '12px 0 0', display: 'block', lineHeight: 1.8 }}>
              A nivel semana: Spearman ρ = <b>{weekly.cor.r.toFixed(3)}</b> ({S.describeR(weekly.cor.r)}),{' '}
              {S.formatP(weekly.cor.p)} con {weekly.cor.n} semanas.
            </div>
          )}
        </Card>
      </div>
    </>
  );
}
