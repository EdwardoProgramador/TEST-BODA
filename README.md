# Reportes Import/Export — Pluma Nacional SA de CV

Herramienta web para generar los reportes operativos del área de Import/Export a partir del
**Master de Millennium Aduanas**. Sube el `.xlsx` y el tablero se recalcula completo en el navegador.

```
index.html        Documentación Import/Export   Elaboración de factura → Solicitud de carta porte
shipping.html     Recepción de Documentos       A qué hora entrega Shipping docs y datos de transporte
cross-data.html   Cross Data                    ¿La hora de llegada afecta el tiempo de elaboración?
datos.html        Datos y validación            Carga del Master + comprobaciones de integridad
```

No hay paso de compilación: se abre `index.html` con doble clic o se publica la carpeta tal cual
(GitHub Pages, un recurso compartido de red, cualquier servidor estático). Chart.js y SheetJS van
incluidos en `assets/vendor/`, así que **funciona sin conexión** (sin internet las tipografías caen
a las del sistema, nada más) y el Master nunca sale del navegador.

---

## Estructura

```
assets/
  css/app.css            Hoja de estilo única
  js/
    config.js            Calendario laboral, personas, hitos, paleta
    stats.js             Estadística (auditable, con la fórmula documentada en cada función)
    ingest.js            Pipeline de lectura del Master (SheetJS)
    store.js             Dataset activo + derivación de todos los resúmenes
    charts.js            Capa sobre Chart.js: tema, box plots, cartas de control, Pareto
    ui.js                Cascarón compartido: barra, navegación, filtros, tooltips
    page-*.js            Lógica de cada página
  data/demo.js           Dataset de ejemplo (Master_3_de_julio: 592 guías + 546 recepciones)
  vendor/                Chart.js 4.4.1 y SheetJS 0.18.5
  img/logo.svg           Marcador del logotipo (ver assets/img/README.md)
```

**Sólo se almacenan dos tablas base** — `tiempos` y `manifiestos`. Todos los resúmenes semanales
y mensuales se calculan en tiempo de ejecución, así que no pueden desincronizarse del detalle.
El dataset activo vive en `localStorage`, por eso sobrevive a la navegación entre páginas.

---

## Cargar un Master nuevo

1. Abrir **Datos y validación**.
2. Arrastrar el `Master__XX.xlsx`. El registro muestra, paso a paso, cuántas filas se leyeron,
   cuántas se descartaron y por qué.
3. Pulsar **Usar este archivo**. Las tres páginas del tablero pasan a usarlo.
4. Revisar las comprobaciones de integridad (duplicados, tiempos negativos, personas fuera de
   catálogo, guías fuera del calendario laboral…).

Los nombres de columna se detectan solos aunque cambien de mayúsculas, acentos o espacios.
Para volver al ejemplo: **Volver al dataset demo**.

---

## Reglas de negocio implementadas

| Regla | Dónde |
|---|---|
| Sólo `STATUSID = 8` (guías completadas) | `ingest.js` |
| Calendario laboral lun–vie de 2026, con semanas de transición marcadas `*` | `config.js → WEEKS` |
| Mar 30-31 pertenece a Abril S1; Abr 27–May 1 a Abril S5; Jun 29–Jul 3 a Junio S5 | `config.js → WEEKS` |
| Personas que no operan de forma rutinaria quedan fuera | `config.js → PERSON_MAP` |
| Correcciones manuales de autoría y de hora | `config.js → PERSON_FIX`, `HOUR_FIX` |
| Shipping excluye American Mail y el 2 de enero | `ingest.js` |
| Recepciones ≥ 12:00 hrs quedan en la tabla pero no promedian | `ingest.js` |
| La guía se atribuye a quien la cierra (solicita la carta porte) | `ingest.js` |

---

## Correcciones estadísticas frente a la versión anterior

La versión anterior del tablero tenía errores que hacían que varias gráficas dijeran algo distinto
de lo que prometían. Cada uno está corregido y documentado en el código:

| # | Problema | Corrección |
|---|---|---|
| 1 | Cuantiles con `Math.floor(n·p)`: sin interpolación y con off-by-one, afectando Q1/Q3, vallas de Tukey y todos los topes de eje | Interpolación lineal tipo 7 (el default de R y numpy) — `stats.quantile` |
| 2 | Desviación **poblacional** (÷ n) usada como si fuera muestral | `stats.variance` divide entre n − 1 |
| 3 | Límites de control μ ± 3σ con la σ global: los outliers ensanchaban los límites y el gráfico dejaba de señalar nada | Carta **I-MR**: σ̂ = MR̄ / 1.128 sobre el rango móvil |
| 4 | La carta de shipping recortaba los límites a mano entre las 04:00 y las 12:00 | Los límites salen del proceso; el recorte visual va aparte y se avisa |
| 5 | Promedio de promedios semanales sin ponderar por número de guías | Los resúmenes se derivan de las guías, no de otros promedios |
| 6 | Histograma con bins de 15, 30 y 50 min dibujados del mismo ancho | Ancho constante por Freedman–Diaconis (h = 2·IQR·n^−1/3) |
| 7 | Curva normal evaluada en el punto medio del bin y ajustada sólo con parte de los datos | Diferencia de CDF por bin, y se superpone también la **log-normal**, que es la que describe estos tiempos |
| 8 | Pareto ordenado por conteo mientras el texto prometía mostrar dónde se concentra el tiempo | Selector explícito: volumen o minutos acumulados |
| 9 | El "box plot" sólo dibujaba la caja: bigotes y outliers se calculaban pero nunca se pintaban | Box plot completo, con bigotes al dato real dentro de las vallas y outliers visibles |
| 10 | Media móvil rezagada etiquetada como tendencia: desplazaba los puntos de inflexión | Media móvil **centrada** [i−1, i, i+1] |
| 11 | "↓ 47.5 %" sin prueba de significancia ni intervalo | **U de Mann-Whitney** con corrección por empates + **IC 95 % por bootstrap** (4 000 réplicas, semilla fija) |
| 12 | Correlación reportada sin n ni p-valor | Pearson **y** Spearman, ambos con n y p (transformación z de Fisher), y un veredicto en español llano |
| 13 | Seriales de Excel convertidos por aritmética sobre epoch UTC: desplazaba cada hora según el huso del navegador | Descomposición del serial y construcción en hora local |

La estadística está aislada en `assets/js/stats.js` y no depende del DOM: se puede auditar con Node.

---

## Verificación

La derivación de los resúmenes se contrastó contra los números del tablero anterior:

- Los 27 promedios semanales globales coinciden **exactamente** (27/27), igual que sus conteos.
- Mediana global 26 min y promedio 66.3 min: idénticos a lo documentado.
- Medianas por persona idénticas a la tabla de referencia.
- 592 guías de tiempos, el mismo total del reporte original.

Las diferencias que sí existen son intencionadas y están explicadas arriba: por ejemplo la mediana
post-interfaz es 16.5 min (el reporte anterior mostraba «16» por truncamiento) y los límites de
control cambian porque el método es otro.

---

## Créditos

Import/Export Assistant · Pluma Nacional SA de CV
