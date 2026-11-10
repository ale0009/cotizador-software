# ¿Cuánto cuesta tu software?

[English](README.en.md)

Una herramienta de una sola cosa: armas tu proyecto con piezas (login, pagos, panel de administración, app móvil, API, reportes…), eliges tu equipo con salarios en pesos colombianos y ves en vivo el **rango** de precio y plazo (P50, P80 y P90) calculado con una simulación Monte Carlo.

- `/`: la herramienta. Abre con un ejemplo marcado (tienda en línea pequeña).
- `/proceso/`: cómo se hizo, con las fuentes, el método, las gráficas, las decisiones de diseño y las limitaciones.

> No es una cotización formal. Todos los valores (SMMLV, auxilio de transporte, factor prestacional, salarios, horas de cada pieza, TRM) son de referencia, editables y deben verificarse.

## Cómo usarlo

1. Toca las piezas que necesita tu software. En «Ajustar horas» puedes cambiar las horas optimista, probable y pesimista de cada una.
2. Elige cuántas personas de cada rol y su salario mensual. El costo por hora incluye prestaciones (52 %) y auxilio de transporte si el salario es menor que 2 SMMLV.
3. Lee el rango: precio P80 como titular, rango P50–P90, plazo en semanas, probabilidad de no pasarse del presupuesto con contingencia, histograma y desglose.
4. Cambia la moneda (COP/USD) y la TRM en la cabecera; los demás supuestos están en «Supuestos y parámetros».

Para verlo en local, sirve la carpeta con cualquier servidor estático (por ejemplo `python3 -m http.server`) y abre `http://localhost:8000/`. No tiene paso de compilación: HTML, CSS y módulos JS, listo para GitHub Pages.

## Cómo funciona

- `js/nomina.js`: costo por hora para la empresa: `(salario × 1,52 + auxilio si aplica) / 160`.
- `js/riesgo.js` + `js/azar.js`: Monte Carlo con Beta-PERT (5000 iteraciones, semilla 42). `azar.js` porta el Mersenne Twister y `betavariate` de Python para reproducir exactamente el motor original.
- `js/cascada.js`: mano de obra, contingencia, costos no laborales, margen comercial, niveles de precio, capacidad y conversión de moneda.
- `js/modelo.js`: une todo en `cotizar()`. Precio por percentil = costo simulado × (1 + margen).

## Pruebas

```bash
node --test
```

Las pruebas comparan el motor JavaScript con valores calculados ejecutando el código Python original (`test/referencias.json`). Para regenerarlos hace falta el repositorio privado de eiran:

```bash
cd <repo de eiran>
<entorno de eiran>/bin/python <este repo>/scripts/generar_referencias.py > <este repo>/test/referencias.json
```

## De qué trabajo sale

- [optimizacion-presupuesto-ecommerce](https://github.com/ale0009/optimizacion-presupuesto-ecommerce): trabajo de investigación de operaciones (programación lineal entera mixta con PuLP) hecho en la Universidad ECCI. De ahí salen la fórmula de costo por hora, los salarios de referencia y las horas probables de siete piezas.
- eiran: asistente propio de Mario para evaluar la viabilidad de proyectos. De su módulo de presupuesto se portaron `costo_laboral.py`, `riesgo.py` y `cascade_engine.py`.

## Créditos

Mario Puerta × [David Rincón «Kuronoma»](https://www.linkedin.com/in/davidalexanderrinconcorredorkuronoma/). El trabajo de investigación de operaciones se hizo con David; el motor de cálculo deriva de eiran.

Licencia MIT.
