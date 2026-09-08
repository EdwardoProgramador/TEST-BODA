/**
 * ChartCanvas — Único punto donde se instancia Chart.js.
 *
 * Recibe una configuración ya construida (ver src/charts/builders.js), crea la
 * gráfica al montar y la destruye al desmontar o al cambiar la configuración.
 * Nunca se llama a Chart.register(): los plugins viajan en la propia config,
 * que es lo que evitaba el error "plugin already registered" al redibujar.
 */

import { useEffect, useRef } from 'react';
import Chart from 'chart.js/auto';

Chart.defaults.color = '#5a7a99';
Chart.defaults.font = { family: 'DM Mono, monospace', size: 11 };
Chart.defaults.animation = { duration: 320 };

export default function ChartCanvas({ config, className = 'cw', style, canvasRef }) {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current || !config) return undefined;
    const chart = new Chart(ref.current.getContext('2d'), config);
    chartRef.current = chart;
    if (canvasRef) canvasRef.current = chart;
    return () => {
      chart.destroy();
      chartRef.current = null;
      if (canvasRef) canvasRef.current = null;
    };
  }, [config, canvasRef]);

  if (!config) {
    return (
      <div className={className}>
        <div className="empty">
          <span className="e-ico">📭</span>
          <p>Sin datos suficientes para esta gráfica</p>
        </div>
      </div>
    );
  }

  return (
    <div className={className} style={style}>
      <canvas ref={ref} />
    </div>
  );
}
