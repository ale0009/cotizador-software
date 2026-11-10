// Presupuesto determinista en cascada. Portado de eiran (`app/budget/cascade_engine.py`), versión plana:
// horas × tarifa del rol → mano de obra; + contingencia (en dinero y en horas); + costos no laborales
// (precios cotizados: sin contingencia, con margen); × (1 + margen comercial) → precio. Conversión de moneda
// pasando por USD con tasas explícitas.
import { redondear } from './redondeo.js';

export const MONEDAS = ['COP', 'USD', 'EUR'];
export const TASAS_REFERENCIA = Object.freeze({ usdCop: 4200, eurUsd: 1.08 });

/** Convierte `monto` de `origen` a `destino` pasando por USD (igual que `convertir_moneda`). */
export function convertirMoneda(monto, origen, destino, usdCop = TASAS_REFERENCIA.usdCop, eurUsd = TASAS_REFERENCIA.eurUsd) {
  if (!MONEDAS.includes(origen) || !MONEDAS.includes(destino)) throw new RangeError('Moneda no soportada');
  if (origen === destino) return Number(monto);
  if (!(usdCop > 0 && eurUsd > 0)) throw new RangeError('Las tasas de cambio deben ser mayores que cero');
  const aUsd = { USD: 1.0, COP: 1.0 / usdCop, EUR: eurUsd };
  return (Number(monto) * aUsd[origen]) / aUsd[destino];
}

/**
 * documento = {
 *   moneda, usdCop, eurUsd, contingencia (0.15), margen (0.20), personas, horasSemana,
 *   umbralSemanas (10), roles: [{id, etiqueta, tarifaHora, moneda}],
 *   tareas: [{id, nombre, horas, rol, activa}], costosNoLaborales: [{monto, moneda}]
 * }
 */
export function calcularCascada(doc) {
  const d = {
    moneda: 'COP', usdCop: TASAS_REFERENCIA.usdCop, eurUsd: TASAS_REFERENCIA.eurUsd,
    contingencia: 0.15, margen: 0.20, personas: 2, horasSemana: 35, umbralSemanas: 10,
    costosNoLaborales: [], ...doc,
  };
  const tarifa = {};
  for (const r of d.roles) tarifa[r.id] = convertirMoneda(r.tarifaHora, r.moneda || 'COP', d.moneda, d.usdCop, d.eurUsd);

  const horasRol = {};
  const costoRol = {};
  let totalHoras = 0;
  let manoObra = 0;
  const nodos = [];
  for (const t of d.tareas) {
    const activa = t.activa !== false;
    const h = activa ? redondear(Number(t.horas || 0), 2) : 0;
    const c = redondear(h * (tarifa[t.rol] ?? 0), 2);
    if (activa && t.rol) {
      horasRol[t.rol] = (horasRol[t.rol] || 0) + h;
      costoRol[t.rol] = (costoRol[t.rol] || 0) + c;
    }
    nodos.push({ id: t.id, nombre: t.nombre, horas: redondear(h, 2), costo: redondear(c, 2), activa });
    totalHoras += redondear(h, 2);
    manoObra += redondear(c, 2);
  }
  totalHoras = redondear(totalHoras, 2);
  manoObra = redondear(manoObra, 2);

  const contingenciaCosto = redondear(manoObra * d.contingencia, 2);
  const contingenciaHoras = redondear(totalHoras * d.contingencia, 2);
  const horasPlaneadas = redondear(totalHoras + contingenciaHoras, 2);
  let noLaboral = 0;
  for (const c of d.costosNoLaborales) noLaboral += convertirMoneda(c.monto, c.moneda || 'COP', d.moneda, d.usdCop, d.eurUsd);
  noLaboral = redondear(noLaboral, 2);
  const subtotal = redondear(manoObra + contingenciaCosto + noLaboral, 2);
  const margenCosto = redondear(subtotal * d.margen, 2);
  const precio = redondear(subtotal + margenCosto, 2);

  const enMonedas = (v) => {
    if (d.moneda === 'COP') return { usd: redondear(v / d.usdCop, 2), cop: redondear(v, 2) };
    if (d.moneda === 'USD') return { usd: redondear(v, 2), cop: redondear(v * d.usdCop, 2) };
    return { usd: redondear(v * d.eurUsd, 2), cop: redondear(v * d.eurUsd * d.usdCop, 2) };
  };

  const roles = d.roles.map((r) => {
    const h = redondear(horasRol[r.id] || 0, 2);
    const c = redondear(costoRol[r.id] || 0, 2);
    return {
      id: r.id, etiqueta: r.etiqueta, horas: h, tarifaHora: redondear(tarifa[r.id], 2), costo: c,
      pctHoras: redondear(totalHoras > 0 ? (h / totalHoras) * 100 : 0, 1),
      pctCosto: redondear(manoObra > 0 ? (c / manoObra) * 100 : 0, 1),
    };
  });

  const precioMinimo = redondear(manoObra * (1 + d.margen * 0.5) + noLaboral, 2);
  const precioPremium = redondear(precio * 1.30, 2);

  const capacidadSemanal = redondear(d.personas * d.horasSemana, 1);
  const semanas = capacidadSemanal > 0 ? redondear(horasPlaneadas / capacidadSemanal, 1) : 0;
  const riesgoSobretiempo = d.umbralSemanas > 0 ? redondear(semanas / d.umbralSemanas, 2) : 1;
  let nivel = 'CRÍTICO';
  if (riesgoSobretiempo <= 0.75) nivel = 'BAJO';
  else if (riesgoSobretiempo <= 1.0) nivel = 'MODERADO';
  else if (riesgoSobretiempo <= 1.3) nivel = 'ALTO';

  return {
    nodos, totalHoras, contingenciaHoras, horasPlaneadas, manoObra, contingenciaCosto, noLaboral,
    subtotal, margenCosto, precio, moneda: d.moneda, equivalente: enMonedas(precio), roles,
    niveles: {
      minimo: { precio: precioMinimo, ...enMonedas(precioMinimo) },
      recomendado: { precio, ...enMonedas(precio) },
      premium: { precio: precioPremium, ...enMonedas(precioPremium) },
    },
    capacidad: {
      capacidadSemanal, semanas, diasHabiles: Math.round(redondear(semanas * 5, 0)),
      riesgoSobretiempo, nivel,
    },
  };
}
