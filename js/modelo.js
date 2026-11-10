// Une las tres piezas portadas de eiran en una sola cotización (función pura).
//
// 1. Nómina → costo por hora de cada rol para la empresa (costoHoraEmpresa).
// 2. Cascada → presupuesto determinista con las horas probables: mano de obra, contingencia, margen.
//    Cada pieza se reparte entre los roles del equipo en proporción al número de personas (supuesto de
//    esta herramienta, calculado aquí): así la hora de trabajo vale el costo promedio del equipo.
// 3. Monte Carlo → rango P50/P80/P90 de costo y semanas sorteando las horas de cada pieza (PERT).
//    El precio por percentil = costo simulado × (1 + margen) (calculado aquí; eiran reporta el costo sin margen).
import { costoHoraEmpresa, costoMensualEmpresa, NOMINA_REFERENCIA } from './nomina.js';
import { calcularCascada, convertirMoneda } from './cascada.js';
import { simular } from './riesgo.js';

export const PARAMETROS_REFERENCIA = Object.freeze({
  nomina: NOMINA_REFERENCIA,
  horasProductivas: 35, // horas efectivas por persona y semana (valor por defecto de eiran)
  contingencia: 0.15,
  margen: 0.20,
  otrosCostos: 0, // COP: hosting, licencias, dominios… (precios cotizados: sin contingencia)
  usdCop: 4200, // TRM de referencia de eiran; edítala con la del día
  umbralSemanas: 10,
  riesgo: { distribucion: 'pert', iteraciones: 5000, semilla: 42 },
});

export function cotizar(estado) {
  const p = { ...PARAMETROS_REFERENCIA, ...estado };
  const nomina = { ...NOMINA_REFERENCIA, ...(estado.nomina || {}) };
  const piezas = (p.piezas || []).filter((x) => x.m > 0);
  const equipo = (p.equipo || []).filter((r) => r.cantidad > 0 && r.salario > 0);
  if (!piezas.length) return { error: 'Elige al menos una pieza para tu software.' };
  if (!equipo.length) return { error: 'Tu equipo está vacío: suma al menos una persona.' };
  const mal = piezas.find((x) => !(x.a >= 0 && x.a <= x.m && x.m <= x.b));
  if (mal) return { error: `«${mal.nombre}»: debe cumplirse optimista ≤ probable ≤ pesimista.` };

  const roles = equipo.map((r) => ({
    ...r,
    costoHora: costoHoraEmpresa(r.salario, nomina),
    costoMensual: costoMensualEmpresa(r.salario, nomina),
  }));
  const personas = roles.reduce((s, r) => s + r.cantidad, 0);
  const tarifaCombinada = roles.reduce((s, r) => s + r.cantidad * r.costoHora, 0) / personas;

  const tareas = [];
  for (const pz of piezas) {
    for (const r of roles) {
      tareas.push({ id: `${pz.id}-${r.id}`, nombre: pz.nombre, pieza: pz.id, horas: (pz.m * r.cantidad) / personas, rol: r.id });
    }
  }
  const cascada = calcularCascada({
    moneda: 'COP', usdCop: p.usdCop, contingencia: p.contingencia, margen: p.margen,
    personas, horasSemana: p.horasProductivas, umbralSemanas: p.umbralSemanas,
    roles: roles.map((r) => ({ id: r.id, etiqueta: r.etiqueta, tarifaHora: r.costoHora, moneda: 'COP' })),
    tareas,
    costosNoLaborales: p.otrosCostos > 0 ? [{ monto: p.otrosCostos, moneda: 'COP' }] : [],
  });

  const porPieza = piezas.map((pz) => {
    const nodos = cascada.nodos.filter((n) => n.id.startsWith(`${pz.id}-`));
    return {
      id: pz.id, nombre: pz.nombre, a: pz.a, m: pz.m, b: pz.b,
      horas: nodos.reduce((s, n) => s + n.horas, 0),
      costo: nodos.reduce((s, n) => s + n.costo, 0),
    };
  });

  const sim = simular(
    piezas.map((pz) => ({ nombre: pz.nombre, optimista: pz.a, probable: pz.m, pesimista: pz.b, tarifaHora: tarifaCombinada })),
    personas * p.horasProductivas,
    {
      costosFijos: cascada.noLaboral,
      presupuestoReferencia: cascada.manoObra + cascada.contingenciaCosto + cascada.noLaboral,
      horasReferencia: cascada.horasPlaneadas,
      config: p.riesgo,
      muestras: true,
    },
  );

  const conMargen = (v) => v * (1 + p.margen);
  const precio = { p50: conMargen(sim.costo.p50), p80: conMargen(sim.costo.p80), p90: conMargen(sim.costo.p90) };
  return { roles, personas, tarifaCombinada, cascada, porPieza, sim, precio, margen: p.margen, usdCop: p.usdCop };
}

/** Pasa un monto en COP a la moneda de visualización. */
export function aMoneda(montoCop, moneda, usdCop) {
  return convertirMoneda(montoCop, 'COP', moneda, usdCop);
}

/** Barras de un histograma: [{desde, hasta, n}] con `n` conteos sobre `bins` intervalos iguales. */
export function histograma(muestras, bins = 28) {
  if (!muestras.length) return [];
  const min = muestras[0];
  const max = muestras[muestras.length - 1];
  const ancho = (max - min) / bins || 1;
  const barras = Array.from({ length: bins }, (_, i) => ({ desde: min + i * ancho, hasta: min + (i + 1) * ancho, n: 0 }));
  for (const v of muestras) {
    const i = Math.min(bins - 1, Math.floor((v - min) / ancho));
    barras[i].n++;
  }
  return barras;
}

/** Probabilidad de no pasarse del presupuesto según la contingencia (curva de sensibilidad). */
export function sensibilidadContingencia(muestrasCosto, manoObra, noLaboral, pasos = [0, 0.05, 0.1, 0.15, 0.2, 0.25, 0.3, 0.35, 0.4, 0.5]) {
  return pasos.map((c) => {
    const tope = manoObra * (1 + c) + noLaboral;
    let dentro = 0;
    for (const v of muestrasCosto) if (v <= tope + 1e-9) dentro++;
    return { contingencia: c, prob: dentro / muestrasCosto.length };
  });
}
