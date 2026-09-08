/**
 * Datos — Carga del Master de Millennium y validación del dataset activo.
 * El archivo se procesa íntegramente en el navegador: nunca sale del equipo.
 */

import { useCallback, useMemo, useRef, useState } from 'react';
import PN from '../lib/calendar.js';
import S from '../lib/stats.js';
import I from '../lib/ingest.js';
import * as D from '../lib/derive.js';
import { hour, nice } from '../lib/format.js';
import { Card, InfoPanel, TableWrap, EmptyRow } from '../components/ui.jsx';
import { useData } from '../state/DataContext.jsx';

export default function Datos() {
  const { dataset, setDataset, reset } = useData();
  const [log, setLog] = useState([{ level: 'dim', msg: 'Esperando archivo…' }]);
  const [pending, setPending] = useState(null);
  const [dragOver, setDragOver] = useState(false);
  const inputRef = useRef(null);

  const say = useCallback((level, msg) => setLog((l) => [...l, { level, msg }]), []);

  /** Elige la hoja con más filas que contenga columnas reconocibles. */
  const pickSheet = (XLSX, wb) => {
    let best = wb.SheetNames[0];
    let bestScore = -1;
    wb.SheetNames.forEach((name) => {
      const ref = wb.Sheets[name]?.['!ref'];
      if (!ref) return;
      const range = XLSX.utils.decode_range(ref);
      const head = XLSX.utils.sheet_to_json(wb.Sheets[name], { header: 1, range: 0 })[0] || [];
      const cols = I.detectColumns(head.map((h) => String(h ?? '')));
      const score = (cols.guia ? 1000 : 0) + (cols.activity ? 1000 : 0) + (range.e.r - range.s.r);
      if (score > bestScore) { bestScore = score; best = name; }
    });
    return best;
  };

  const handleFile = useCallback(
    (file) => {
      setLog([]);
      setPending(null);
      say('', `▸ ${file.name}  (${(file.size / 1024 / 1024).toFixed(2)} MB)`);

      if (!/\.(xlsx|xlsm|xls|csv)$/i.test(file.name)) {
        say('err', '✕ Formato no reconocido. Se espera .xlsx, .xlsm, .xls o .csv.');
        return;
      }

      const reader = new FileReader();
      reader.onerror = () => say('err', '✕ No se pudo leer el archivo.');
      reader.onload = async (e) => {
        try {
          say('dim', 'Cargando el lector de Excel…');
          // Import dinámico: SheetJS (~430 kB) solo se descarga cuando de verdad
          // se sube un archivo, no al abrir el tablero.
          const XLSX = await import('xlsx');
          say('dim', 'Leyendo el libro…');
          // raw:true + cellDates:false → los timestamps llegan como seriales y
          // los convierte ingest.js a hora local, sin desfase por zona horaria.
          const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array', cellDates: false });
          const sheet = pickSheet(XLSX, wb);
          say('dim', `Hojas: ${wb.SheetNames.join(', ')}  →  se usa "${sheet}"`);
          const rows = XLSX.utils.sheet_to_json(wb.Sheets[sheet], { defval: null, raw: true });
          const res = I.process(rows, { sourceName: file.name });
          res.log.forEach((l) => say(l.level, l.msg));
          if (!res.ok) {
            say('err', '✕ El archivo no se pudo procesar. No se cambió nada.');
            return;
          }
          setPending(res);
          say('ok', '▸ Listo para aplicar. Pulsa «Usar este archivo» para actualizar el tablero.');
        } catch (err) {
          say('err', `✕ Error al procesar: ${err?.message || err}`);
        }
      };
      reader.readAsArrayBuffer(file);
    },
    [say]
  );

  const apply = () => {
    if (!pending) return;
    const stored = setDataset(pending);
    say('ok', '✔ Dataset aplicado. Todas las páginas del tablero ya usan este archivo.');
    if (!stored) {
      say('warn', '⚠ No se pudo guardar en el navegador: los datos se perderán al recargar la página.');
    }
    setPending(null);
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(dataset, null, 1)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `reportes-import-export-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(a.href);
  };

  const checks = useMemo(() => D.healthChecks(dataset), [dataset]);

  const porPersona = useMemo(() => {
    const people = D.peopleOf(dataset.tiempos);
    const rows = people
      .map((p) => {
        const v = dataset.tiempos.filter((r) => r.persona === p).map((r) => r.diff_minutes);
        return v.length ? { p, d: S.describe(v) } : null;
      })
      .filter(Boolean);
    return { rows, total: dataset.tiempos.length ? S.describe(dataset.tiempos.map((r) => r.diff_minutes)) : null };
  }, [dataset]);

  const porMes = useMemo(() => {
    const shipping = D.shippingMonthly(dataset.manifiestos);
    return D.monthsOf(dataset).map((m) => {
      const v = dataset.tiempos.filter((r) => r.mes === m).map((r) => r.diff_minutes);
      return { m, d: v.length ? S.describe(v) : null, s: shipping.find((x) => x.mes === m) };
    });
  }, [dataset]);

  return (
    <>
      <Card
        title="Cargar el Master de Millennium"
        subtitle="El archivo se procesa en tu navegador · no se sube a ningún servidor"
      >
        <input
          ref={inputRef}
          type="file"
          accept=".xlsx,.xlsm,.xls,.csv"
          className="hidden"
          onChange={(e) => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
        <div
          className={`drop${dragOver ? ' over' : ''}`}
          role="button"
          tabIndex={0}
          onClick={() => inputRef.current?.click()}
          onKeyDown={(e) => (e.key === 'Enter' || e.key === ' ') && inputRef.current?.click()}
          onDragEnter={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={(e) => { e.preventDefault(); setDragOver(false); }}
          onDrop={(e) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
          }}
        >
          <span className="d-icon">📄</span>
          <div className="d-tit">
            Arrastra aquí tu <b>Master__XX.xlsx</b> o haz clic para elegirlo
          </div>
          <div className="d-sub">
            Se leen las columnas GUIANUMBER · ACTIVITY_ESA · DATETIMESTAMP · STATUSID · CREATEDBY · SHIPMENTTYPE ·
            COMMENTS.
            <br />
            Los nombres se detectan solos aunque cambien de mayúsculas, acentos o espacios.
          </div>
        </div>

        <div className="frow" style={{ marginTop: 18 }}>
          <button type="button" className="btn primary" disabled={!pending} onClick={apply}>
            Usar este archivo
          </button>
          <button
            type="button"
            className="btn danger"
            disabled={!!dataset.meta?.isDemo}
            onClick={() => {
              if (window.confirm('Se descartará el archivo cargado y se volverá al dataset demo. ¿Continuar?')) {
                reset();
                setLog([{ level: 'warn', msg: 'Dataset restablecido al demo.' }]);
              }
            }}
          >
            Volver al dataset demo
          </button>
          <button type="button" className="btn" onClick={exportJSON}>
            Descargar datos procesados (JSON)
          </button>
        </div>

        <div className="log" style={{ marginTop: 14 }}>
          {log.map((l, i) => (
            // eslint-disable-next-line react/no-array-index-key
            <span key={i} className={l.level}>
              {l.msg}
              {'\n'}
            </span>
          ))}
        </div>

        <InfoPanel label="¿Qué le hace exactamente al archivo?">
          <strong>1 · Filtro base.</strong> Se conservan sólo las filas con <code>STATUSID = 8</code> (guía
          completada) y cuya fecha cae dentro del calendario laboral lunes–viernes definido para 2026.<br />
          <strong>2 · Normalización.</strong> Las actividades vienen con entidades HTML
          (<code>Elaboraci&amp;oacute;n</code>): se decodifican, se pasan a minúsculas y se les quitan los acentos
          antes de comparar. Los números de guía pierden los ceros a la izquierda para que <code>0082</code> y{' '}
          <code>82</code> sean la misma.<br />
          <strong>3 · Tiempos.</strong> Por cada guía se toma la primera «Elaboración de factura» y la primera
          «Solicitud de carta porte»; la diferencia en minutos es el indicador. Se descartan las guías que no tienen
          las dos actividades. La guía se atribuye a quien la cierra.<br />
          <strong>4 · Shipping.</strong> Se toman «Recepción de Docs» y «Recepción de datos de Transporte». Se
          excluyen los embarques American Mail y el 2 de enero, y las recepciones a partir de las 12:00 hrs quedan
          registradas pero no entran en los promedios.<br />
          <strong>5 · Tipo de embarque.</strong> Se resuelve por actividad, no por guía: hay guías con un
          SHIPMENTTYPE distinto en sus filas de tiempos y en las de recepción, y elegir uno solo descartaba
          recepciones válidas.<br />
          <strong>6 · Fechas.</strong> Los timestamps de Excel son números sin zona horaria. Se convierten a hora
          local descomponiendo el serial, no con aritmética sobre epoch UTC — que desplazaría cada hora tantas horas
          como diga el huso del navegador.
          <br />
          <br />
          Todos los resúmenes semanales y mensuales se <b>calculan</b> a partir de estas dos tablas, así que no
          pueden desincronizarse del detalle.
        </InfoPanel>
      </Card>

      <div className="two">
        <Card title="Comprobaciones de integridad" subtitle="Se ejecutan sobre el dataset activo">
          {checks.map((c) => {
            const color = c.warn ? '#ffc947' : c.ok ? '#00e5b4' : '#ff6b6b';
            const ico = c.warn ? '⚠' : c.ok ? '✔' : '✕';
            return (
              <div className="chk-row" key={c.label}>
                <span className="c-ico" style={{ color }}>{ico}</span>
                <span className="c-txt">{c.label}</span>
                <span className="c-val" style={{ color }}>{String(c.value)}</span>
              </div>
            );
          })}
        </Card>

        <Card title="Resumen por mes" subtitle="Tiempos y horas de recepción">
          <TableWrap>
            <table>
              <thead>
                <tr>
                  <th>Mes</th><th className="c">Guías</th><th className="r">Mediana</th><th className="r">Promedio</th>
                  <th className="c">Shipping</th><th className="c">Docs</th><th className="c">Transp.</th>
                </tr>
              </thead>
              <tbody>
                {!porMes.length && <EmptyRow cols={7} />}
                {porMes.map(({ m, d, s }) => (
                  <tr key={m}>
                    <td style={{ fontWeight: 700 }}>{PN.MONTHS[m]}</td>
                    <td className="c">{d ? d.n : 0}</td>
                    <td className="r">{d ? nice(d.median) : '—'}</td>
                    <td className="r">{d ? d.mean.toFixed(1) : '—'}</td>
                    <td className="c">{s ? s.n_guias : 0}</td>
                    <td className="c" style={{ color: '#4d7cfe' }}>{s ? hour(s.dec_docs) : '—'}</td>
                    <td className="c" style={{ color: '#00e5b4' }}>{s ? hour(s.dec_trans) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </TableWrap>
        </Card>
      </div>

      <Card
        title="Resumen por persona"
        subtitle="Cuantiles por interpolación lineal (tipo 7) · el rango Q1–Q3 mide consistencia"
      >
        <TableWrap tall>
          <table>
            <thead>
              <tr>
                <th>Persona</th><th className="c">Guías</th><th className="r">Mediana</th>
                <th className="r">Promedio</th><th className="r">Q1 – Q3</th><th className="r">Máximo</th>
              </tr>
            </thead>
            <tbody>
              {!porPersona.rows.length && <EmptyRow cols={6} message="Sin datos cargados" />}
              {porPersona.rows.map(({ p, d }) => (
                <tr key={p}>
                  <td style={{ color: D.colorFor(p), fontWeight: 700 }}>{p}</td>
                  <td className="c">{d.n}</td>
                  <td className="r">{nice(d.median)}</td>
                  <td className="r">{d.mean.toFixed(1)}</td>
                  <td className="r">{d.q1.toFixed(1)} – {d.q3.toFixed(1)}</td>
                  <td className="r">{d.max.toFixed(0)}</td>
                </tr>
              ))}
              {porPersona.total && (
                <tr style={{ background: 'rgba(255,255,255,.05)', borderTop: '1px solid rgba(255,255,255,.15)' }}>
                  <td style={{ fontWeight: 800 }}>TOTAL</td>
                  <td className="c" style={{ fontWeight: 700 }}>{porPersona.total.n}</td>
                  <td className="r" style={{ fontWeight: 700 }}>{nice(porPersona.total.median)}</td>
                  <td className="r">{porPersona.total.mean.toFixed(1)}</td>
                  <td className="r">{porPersona.total.q1.toFixed(1)} – {porPersona.total.q3.toFixed(1)}</td>
                  <td className="r">{porPersona.total.max.toFixed(0)}</td>
                </tr>
              )}
            </tbody>
          </table>
        </TableWrap>
      </Card>
    </>
  );
}
