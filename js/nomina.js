// Costo por hora de un empleado para la empresa en Colombia.
// Portado de eiran (`app/budget/costo_laboral.py`, costo_hora_empresa) y de
// `optimizacion-presupuesto-ecommerce` (`src/optimizacion_ecommerce/modelo.py`, costo_hora):
//
//   costo_hora = (salario_mensual × (1 + factor_prestacional) + auxilio_aplicable) / horas_mes
//
// Todos los valores por defecto son DE REFERENCIA (ilustrativos) y deben verificarse contra la norma
// vigente: SMMLV, auxilio de transporte y jornada cambian cada año. No es asesoría laboral.
import { redondear } from './redondeo.js';

export const NOMINA_REFERENCIA = Object.freeze({
  factorPrestacional: 0.52, // prima, cesantías e intereses, vacaciones, salud, pensión, ARL, parafiscales
  smmlv: 1_423_500, // COP, valor de referencia parametrizable
  auxilioTransporte: 200_000, // COP/mes, valor de referencia
  limiteAuxilioSmmlv: 2, // se paga si el salario es menor que 2 SMMLV
  horasSemana: 40,
  semanasMes: 4,
});

/** Igual que `costo_hora_empresa` de eiran: valida y redondea a 2 decimales. */
export function costoHoraEmpresa(salarioMensual, opciones = {}) {
  const p = { ...NOMINA_REFERENCIA, ...opciones };
  if (!(salarioMensual > 0)) throw new RangeError('El salario mensual debe ser mayor que cero');
  if (!(p.factorPrestacional >= 0 && p.factorPrestacional < 2)) {
    throw new RangeError('factorPrestacional debe estar entre 0 y 2 (0.52 = 52 %)');
  }
  if (!(p.horasSemana > 0 && p.semanasMes > 0)) {
    throw new RangeError('horasSemana y semanasMes deben ser mayores que cero');
  }
  if (p.smmlv < 0 || p.auxilioTransporte < 0 || p.limiteAuxilioSmmlv < 0) {
    throw new RangeError('smmlv, auxilioTransporte y limiteAuxilioSmmlv no pueden ser negativos');
  }
  return redondear(costoMensualEmpresa(salarioMensual, p) / (p.horasSemana * p.semanasMes), 2);
}

/** Lo que le cuesta a la empresa el mes completo (salario + prestaciones + auxilio si aplica). */
export function costoMensualEmpresa(salarioMensual, opciones = {}) {
  const p = { ...NOMINA_REFERENCIA, ...opciones };
  let mensual = salarioMensual * (1 + p.factorPrestacional);
  if (salarioMensual < p.limiteAuxilioSmmlv * p.smmlv) mensual += p.auxilioTransporte;
  return mensual;
}

/**
 * Igual que `costo_hora(rol, salario, general)` del repo de optimización (sin redondeo; horas_semana × 4).
 * `general` usa los nombres del YAML: factor_prestacional, limite_auxilio_smmlv, smmlv, auxilio_transporte, horas_semana.
 */
export function costoHora(salario, general) {
  let mensual = salario * (1 + general.factor_prestacional);
  if (salario < general.limite_auxilio_smmlv * general.smmlv) mensual += general.auxilio_transporte;
  return mensual / (general.horas_semana * 4);
}
