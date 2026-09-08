# Reportes Import/Export — Pluma Nacional SA de CV

Aplicación web para generar los reportes operativos del área de Documentación
Import/Export a partir del **Master de Millennium** (`.xlsx`). Subes el archivo,
la app lo procesa **íntegramente en tu navegador** y el tablero se actualiza:
tiempos de documentación, shipping y el cruce entre ambos.

> El archivo nunca sale de tu equipo. No hay servidor, no hay subida a la nube:
> SheetJS lo lee en memoria y el resultado se guarda en `localStorage`.

---

## Arrancarla en tu computadora

Necesitas [Node.js 18+](https://nodejs.org) (trae `npm` incluido).

```bash
npm install     # una sola vez
npm run dev     # abre http://localhost:5173
```

`npm run dev` levanta el servidor local y abre el navegador solo. Cualquier
cambio que guardes en `src/` se refleja al instante, sin recargar.

### Los cuatro comandos

| Comando | Qué hace |
|---|---|
| `npm run dev` | Servidor local con recarga en caliente → `http://localhost:5173` |
| `npm run build` | Compila a `dist/` (carpeta estática, lista para publicar) |
| `npm run preview` | Sirve `dist/` para revisar el build antes de publicar |
| `npm test` | 27 pruebas de las fórmulas estadísticas |

El build usa rutas relativas y `HashRouter`, así que `dist/` funciona igual en la
raíz de un dominio, en un subdirectorio, en GitHub Pages o abriendo el
`index.html` directamente — sin configurar reescrituras en el servidor.

---

## Cómo usarla

1. Abre la app. Arranca con un **dataset de ejemplo** (Master del 3 de julio) para
   que veas el tablero lleno desde el primer segundo.
2. Ve a **Datos** y arrastra tu `Master__XX.xlsx`.
3. Lee el registro de ingesta: te dice cuántas filas leyó, cuántas descartó y por
   qué. Nada cambia hasta que pulses **«Usar este archivo»**.
4. El dataset queda guardado en el navegador. Al volver a abrir la app sigue ahí.
   **Reiniciar** te devuelve al ejemplo.

### Qué hace exactamente con el archivo

- Detecta las columnas por nombre (`GUIANUMBER`, `ACTIVITY_ESA`, `STATUSID`,
  `CREATEDBY`, `SHIPMENTTYPE`, fecha/hora…), sin depender del orden.
- Se queda solo con `STATUSID = 8` y con fechas dentro del calendario laboral 2026.
- **Tiempos**: guías con factura *y* solicitud de carta porte. La guía se le
  atribuye a quien cierra el par (quien solicita la carta porte).
- **Shipping**: guías con recepción de documentos registrada. Excluye
  *American Mail* y el 2 de enero.
- Aplica `PERSON_MAP` / `PERSON_FIX` / `HOUR_FIX` (correcciones documentadas de
  usuarios y horas mal capturadas en Millennium).

---

## Estructura del proyecto

```
├── index.html              punto de entrada de Vite
├── vite.config.js          build, chunks de vendors, servidor local
├── public/logo.svg         placeholder del logo (reemplázalo por el real)
└── src/
    ├── main.jsx            arranque: HashRouter + DataProvider
    ├── App.jsx             rutas
    ├── lib/
    │   ├── calendar.js     calendario laboral 2026, personas, hitos, colores
    │   ├── stats.js        estadística pura, sin DOM (lo que prueba npm test)
    │   ├── ingest.js       Master → dataset (detección de columnas + reglas)
    │   ├── derive.js       resúmenes: por semana, mes, persona, tipo
    │   ├── demo.js         dataset de ejemplo
    │   └── format.js       formateo de horas, decimales y porcentajes
    ├── charts/builders.js  configuraciones de Chart.js (sin tocar el DOM)
    ├── components/         Layout, ChartCanvas y los bloques de UI
    ├── state/DataContext.jsx  dataset activo + periodo seleccionado
    ├── pages/              Tiempos · Shipping · CrossData · Datos
    └── styles/app.css      tema completo
```

**Cómo está separado**: `lib/` no sabe que existe React ni el navegador — son
funciones puras, y por eso se pueden probar desde Node. `charts/` devuelve
objetos de configuración, no dibuja. `ChartCanvas` es el **único** sitio donde se
instancia Chart.js, y destruye la instancia al desmontar (de ahí que no haya
fugas de memoria al cambiar de pestaña). Las páginas solo componen.

### Rutas

| Ruta | Reporte |
|---|---|
| `#/` | Documentación Import/Export (factura → carta porte) |
| `#/shipping` | Shipping (recepción → entrega a transporte) |
| `#/cross-data` | Cruce: ¿la hora de llegada de documentos explica el tiempo de elaboración? |
| `#/datos` | Carga del Master, validaciones y exportación |

Cada reporte tiene dos pestañas: **Operativo** (lo que se presenta) y **Análisis
estadístico** (lo que lo sostiene).

---

## Correcciones estadísticas

El tablero original tenía fórmulas que daban resultados incorrectos. Esto es lo
que se corrigió y por qué importa:

| Cálculo | Antes | Ahora | Por qué |
|---|---|---|---|
| **Percentiles** | índice truncado | interpolación lineal (tipo 7, la de R/numpy) | Con n pequeño el cuartil saltaba de golpe entre valores |
| **Varianza** | dividía entre *n* | entre *n − 1* | La de la población subestima la dispersión de una muestra |
| **Límites de control** | μ ± 3σ | carta I-MR con σ̂ = MR̄ / 1.128 | σ global se infla con los propios outliers y deja de detectarlos |
| **Bigotes del box plot** | mín/máx absolutos | último dato dentro de las vallas de Tukey | Los bigotes no deben ser los outliers |
| **Antes vs. después** | comparaba promedios | Mann-Whitney U + IC bootstrap | Los tiempos son muy asimétricos; el promedio no representa nada |
| **Correlación** | solo *r* de Pearson | Pearson + Spearman con *p* por z de Fisher | Sin *p* no se sabe si *r* es señal o ruido |
| **Histograma** | 10 bins fijos | regla de Freedman–Diaconis | El número de bins cambiaba la forma de la distribución |
| **Media móvil** | rezagada | centrada | La rezagada desplaza los puntos de quiebre |
| **Fechas de Excel** | `(n−25569)×86400×1000` | descomposición del serial en hora local | El instante UTC hacía que `getHours()` corriera las horas según la zona horaria del navegador |

**Ejemplo concreto**: en la serie de junio hay una guía de 900 minutos. μ + 3σ
la deja *dentro* de los límites (porque ella misma infló σ). La carta I-MR la
marca como fuera de control, que es lo correcto.

`npm test` verifica 27 asertos contra valores calculados en R/numpy, no contra la
propia implementación.

---

## Verificación

- **27/27** asertos estadísticos en verde.
- Los resúmenes semanales reproducen el tablero original **27/27 exactos**
  (valores y conteos): mediana global 26 min, promedio 66.3 min, y todas las
  medianas por persona idénticas a la tabla de referencia.
- Prueba de extremo a extremo con un Master sintético de 2,273 filas (con ruido
  que debe descartarse): recupera exactamente **592** guías de tiempos, **546**
  de shipping y **540** cruzadas.
- Las cuatro rutas cargan **sin errores de JS**, en `dev` y en el build.

---

## Pendientes

- Sustituir `public/logo.svg` por el logo real de Pluma Nacional.
- El calendario laboral llega al 3 de julio de 2026; hay que extenderlo para
  seguir cargando Masters posteriores (`src/lib/calendar.js`).
- Decidir si se restaura la exportación a Excel de 9 hojas.
