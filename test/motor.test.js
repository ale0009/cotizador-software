// Compara el motor JS contra valores calculados con el código Python original de eiran y del repo de
// optimización (test/referencias.json, generado con scripts/generar_referencias.py).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { crearAzar } from '../js/azar.js';
import { redondear } from '../js/redondeo.js';
import { costoHoraEmpresa, costoHora } from '../js/nomina.js';
import { percentil, rangoTarea, configurar, simular } from '../js/riesgo.js';
import { convertirMoneda, calcularCascada } from '../js/cascada.js';
import { cotizar, histograma, sensibilidadContingencia } from '../js/modelo.js';
import { PIEZAS, ROLES, EJEMPLO } from '../js/catalogo.js';

const REF = JSON.parse(readFileSync(new URL('./referencias.json', import.meta.url), 'utf8'));

// Monte Carlo: log/exp de V8 y de libm pueden diferir en el último bit; el resto es idéntico.
function cerca(real, esperado, msg, tol = 1e-9) {
  const escala = Math.max(1, Math.abs(esperado));
  assert.ok(Math.abs(real - esperado) <= tol * escala, `${msg}: ${real} ≠ ${esperado}`);
}
function cercaObjeto(real, esperado, msg, tol) {
  for (const [k, v] of Object.entries(esperado)) {
    if (typeof v === 'number') cerca(real[k], v, `${msg}.${k}`, tol);
    else if (v && typeof v === 'object') cercaObjeto(real[k], v, `${msg}.${k}`, tol);
    else assert.equal(real[k], v, `${msg}.${k}`);
  }
}

test('el generador reproduce random.Random(42) de Python', () => {
  const r = crearAzar(42);
  assert.deepEqual([r.random(), r.random(), r.random()], [0.6394267984578837, 0.025010755222666936, 0.27502931836911926]);
});

test('redondear imita round() de Python (mitades al par)', () => {
  assert.equal(redondear(2.5, 0), 2);
  assert.equal(redondear(3.5, 0), 4);
  assert.equal(redondear(0.125, 2), 0.12);
  assert.equal(redondear(1.005, 2), 1); // 1.005 en binario es 1.00499…
  assert.equal(redondear(28296.4875, 2), 28296.49);
});

test('costoHoraEmpresa = costo_hora_empresa de eiran', () => {
  // Las referencias se generaron con los valores 2025 (SMMLV 1.423.500, auxilio 200.000): se pasan explícitos.
  const V2025 = { smmlv: 1_423_500, auxilioTransporte: 200_000 };
  for (const c of REF.costo_hora_empresa) assert.equal(costoHoraEmpresa(c.salario, { ...V2025, ...(c.opciones || {}) }), c.esperado, `salario ${c.salario}`);
  assert.throws(() => costoHoraEmpresa(0));
  assert.throws(() => costoHoraEmpresa(1e6, { factorPrestacional: 2 }));
});

test('costoHora = costo_hora de optimizacion-presupuesto-ecommerce', () => {
  const { general, casos } = REF.costo_hora_modelo;
  for (const c of casos) cerca(costoHora(c.salario, general), c.esperado, `salario ${c.salario}`, 1e-15);
});

test('percentil y rangoTarea iguales a riesgo.py', () => {
  for (const c of REF.percentil.casos) assert.equal(percentil(REF.percentil.valores, c.p), c.esperado);
  const cfg = configurar();
  for (const c of REF.rango_tarea) assert.deepEqual(rangoTarea(c.tarea, cfg), c.esperado);
  assert.throws(() => rangoTarea({ nombre: 'x', horas: 10, optimista: 20, pesimista: 30 }, cfg));
  assert.throws(() => configurar({ iteraciones: 10 }));
  assert.throws(() => configurar({ rara: 1 }));
});

test('simular (Monte Carlo PERT y triangular) = simular de riesgo.py', () => {
  for (const e of REF.simular) {
    const tareas = e.tareas.map(([nombre, optimista, probable, pesimista, tarifaHora]) => ({ nombre, optimista, probable, pesimista, tarifaHora }));
    const r = simular(tareas, e.capacidad, {
      costosFijos: e.kw.costos_fijos ?? 0,
      presupuestoReferencia: e.kw.presupuesto_referencia ?? null,
      horasReferencia: e.kw.horas_referencia ?? null,
      config: e.config,
    });
    for (const k of Object.keys(e.esperado)) {
      if (typeof e.esperado[k] === 'object') cercaObjeto(r[k], e.esperado[k], `${e.nombre}.${k}`);
      else cerca(r[k], e.esperado[k], `${e.nombre}.${k}`);
    }
  }
});

test('convertirMoneda = convertir_moneda de cascade_engine.py', () => {
  for (const c of REF.convertir_moneda) cerca(convertirMoneda(...c.args), c.esperado, c.args.join(' '), 1e-15);
});

test('calcularCascada = calculate_cascade (contingencia, margen, niveles, capacidad)', () => {
  for (const [i, c] of REF.cascada.entries()) cercaObjeto(calcularCascada(c.doc), c.esperado, `doc ${i}`, 0);
});

function estadoEjemplo() {
  return {
    piezas: PIEZAS.filter((p) => EJEMPLO.piezas.includes(p.id)).map((p) => ({ id: p.id, nombre: p.nombre, a: p.horas[0], m: p.horas[1], b: p.horas[2] })),
    equipo: ROLES.map((r) => ({ ...r, cantidad: EJEMPLO.equipo[r.id] })),
  };
}

test('el ejemplo precargado da lo mismo que el motor Python de eiran', () => {
  const E = REF.ejemplo;
  assert.deepEqual(E.piezas.map(([id, a, m, b]) => [id, a, m, b]), estadoEjemplo().piezas.map((p) => [p.id, p.a, p.m, p.b]));
  const q = cotizar(estadoEjemplo());
  for (const r of q.roles) assert.equal(r.costoHora, E.tarifas[r.id]);
  assert.equal(q.tarifaCombinada, E.tarifaCombinada);
  cercaObjeto(q.cascada, E.cascada, 'cascada', 0);
  for (const k of ['horas', 'costo', 'semanas']) cercaObjeto(q.sim[k], E.simular[k], k);
  cerca(q.sim.prob_dentro_presupuesto, E.simular.prob_dentro_presupuesto, 'prob');
  assert.equal(q.sim.cubre_p80, E.lectura.includes('cubre el P80') && !E.lectura.includes('NO cubre'));
});

test('cotizar avisa si no hay piezas o equipo', () => {
  assert.match(cotizar({ piezas: [], equipo: estadoEjemplo().equipo }).error, /pieza/);
  assert.match(cotizar({ piezas: estadoEjemplo().piezas, equipo: [] }).error, /equipo/);
  const torcida = [{ id: 'x', nombre: 'X', a: 50, m: 40, b: 60 }];
  assert.match(cotizar({ piezas: torcida, equipo: estadoEjemplo().equipo }).error, /optimista ≤ probable/);
});

test('histograma conserva todas las muestras y la sensibilidad crece con la contingencia', () => {
  const q = cotizar(estadoEjemplo());
  const barras = histograma(q.sim.muestrasCosto, 24);
  assert.equal(barras.reduce((s, b) => s + b.n, 0), q.sim.muestrasCosto.length);
  const curva = sensibilidadContingencia(q.sim.muestrasCosto, q.cascada.manoObra, q.cascada.noLaboral);
  for (let i = 1; i < curva.length; i++) assert.ok(curva[i].prob >= curva[i - 1].prob);
  const en15 = curva.find((c) => c.contingencia === 0.15).prob;
  cerca(en15, REF.ejemplo.simular.prob_dentro_presupuesto, 'contingencia 15 %', 1e-3);
});

test('el catálogo es coherente (0 ≤ a ≤ m ≤ b)', () => {
  for (const p of PIEZAS) {
    const [a, m, b] = p.horas;
    assert.ok(a >= 0 && a <= m && m <= b, p.id);
    assert.ok(['eco', 'propio'].includes(p.origen));
  }
});
