// Interfaz de la herramienta. Toda la lógica de cálculo vive en modelo.js (y sus módulos), probada con node --test.
import { PIEZAS, ROLES, EJEMPLO } from './catalogo.js';
import { cotizar, aMoneda, PARAMETROS_REFERENCIA } from './modelo.js';
import { NOMINA_REFERENCIA, costoHoraEmpresa } from './nomina.js';
import { dibujarHistograma } from './dibujo.js';

const $ = (s) => document.querySelector(s);
const NF = (dec = 0) => new Intl.NumberFormat('es-CO', { minimumFractionDigits: dec, maximumFractionDigits: dec });

const PARAMS_REF = {
  ...NOMINA_REFERENCIA,
  horasProductivas: PARAMETROS_REFERENCIA.horasProductivas,
  contingencia: PARAMETROS_REFERENCIA.contingencia,
  margen: PARAMETROS_REFERENCIA.margen,
  otrosCostos: PARAMETROS_REFERENCIA.otrosCostos,
  ...PARAMETROS_REFERENCIA.riesgo,
};

const estado = {
  seleccion: new Set(),
  horas: {},
  equipo: {},
  params: { ...PARAMS_REF },
  moneda: 'COP',
  usdCop: PARAMETROS_REFERENCIA.usdCop,
  esEjemplo: true,
};

function cargarEjemplo() {
  estado.seleccion = new Set(EJEMPLO.piezas);
  estado.horas = Object.fromEntries(PIEZAS.map((p) => [p.id, [...p.horas]]));
  estado.equipo = Object.fromEntries(ROLES.map((r) => [r.id, { salario: r.salario, cantidad: EJEMPLO.equipo[r.id] || 0 }]));
  estado.esEjemplo = true;
}

// ---------- Formatos ----------
function dinero(cop, corto = false) {
  const v = aMoneda(cop, estado.moneda, estado.usdCop);
  if (estado.moneda === 'USD') {
    if (corto && v >= 100_000) return `US$ ${NF(1).format(v / 1000)} mil`;
    return `US$ ${NF(v < 100 ? 2 : 0).format(v)}`;
  }
  if (corto && v >= 1_000_000) return `$ ${NF(1).format(v / 1e6)} M`;
  return `$ ${NF(0).format(v)}`;
}
const semanas = (s) => `${NF(1).format(s)} sem`;
const pct = (x) => `${NF(0).format(x * 100)} %`;

// ---------- Construcción de controles ----------
function pintarPiezas() {
  const cont = $('#piezas');
  cont.replaceChildren();
  for (const p of PIEZAS) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'pieza';
    b.dataset.id = p.id;
    b.setAttribute('aria-pressed', String(estado.seleccion.has(p.id)));
    b.title = p.nombre;
    const n = document.createElement('span');
    n.textContent = p.corto;
    const h = document.createElement('span');
    h.className = 'h';
    h.textContent = `~${NF(0).format(estado.horas[p.id][1])} h`;
    b.append(n, h);
    b.setAttribute('aria-label', `${p.nombre}, unas ${estado.horas[p.id][1]} horas probables`);
    b.addEventListener('click', () => {
      if (estado.seleccion.has(p.id)) estado.seleccion.delete(p.id);
      else estado.seleccion.add(p.id);
      estado.esEjemplo = false;
      b.setAttribute('aria-pressed', String(estado.seleccion.has(p.id)));
      pintarTablaHoras();
      recalcular();
    });
    cont.appendChild(b);
  }
}

function pintarTablaHoras() {
  const tb = $('#tabla-horas');
  tb.replaceChildren();
  const elegidas = PIEZAS.filter((p) => estado.seleccion.has(p.id));
  if (!elegidas.length) {
    const tr = document.createElement('tr');
    tr.innerHTML = '<td colspan="4">Aún no hay piezas elegidas.</td>';
    tb.appendChild(tr);
    return;
  }
  for (const p of elegidas) {
    const tr = document.createElement('tr');
    const td = document.createElement('td');
    td.textContent = p.nombre;
    const o = document.createElement('span');
    o.className = `origen ${p.origen}`;
    o.textContent = p.origen === 'eco' ? 'EC' : 'SP';
    o.title = p.origen === 'eco' ? `Horas probables de parametros.yaml, caso «pequena» (${p.nota})` : 'Supuesto propio de esta herramienta';
    td.appendChild(o);
    tr.appendChild(td);
    ['optimista', 'probable', 'pesimista'].forEach((nombre, i) => {
      const c = document.createElement('td');
      const inp = document.createElement('input');
      inp.type = 'number';
      inp.min = '0';
      inp.step = '1';
      inp.value = estado.horas[p.id][i];
      inp.setAttribute('aria-label', `${p.nombre}: horas ${nombre}`);
      inp.addEventListener('input', () => {
        const v = Number(inp.value);
        if (!(v >= 0)) return;
        estado.horas[p.id][i] = v;
        estado.esEjemplo = false;
        const btn = document.querySelector(`.pieza[data-id="${p.id}"] .h`);
        if (btn && i === 1) btn.textContent = `~${NF(0).format(v)} h`;
        recalcularPronto();
      });
      c.appendChild(inp);
      tr.appendChild(c);
    });
    tb.appendChild(tr);
  }
}

function pintarEquipo() {
  const cont = $('#equipo');
  cont.replaceChildren();
  for (const r of ROLES) {
    const fila = document.createElement('div');
    fila.className = 'rol';
    fila.dataset.id = r.id;
    const nombre = document.createElement('span');
    nombre.className = 'nombre';
    nombre.textContent = r.etiqueta;

    const lab = document.createElement('label');
    lab.className = 'sal';
    lab.textContent = 'Salario/mes (COP)';
    const sal = document.createElement('input');
    sal.type = 'number';
    sal.min = '1';
    sal.step = '50000';
    sal.value = estado.equipo[r.id].salario;
    sal.addEventListener('input', () => {
      const v = Number(sal.value);
      if (!(v > 0)) return;
      estado.equipo[r.id].salario = v;
      estado.esEjemplo = false;
      recalcularPronto();
    });
    lab.appendChild(sal);

    const paso = document.createElement('div');
    paso.className = 'paso';
    paso.setAttribute('role', 'group');
    paso.setAttribute('aria-label', `Personas de ${r.etiqueta}`);
    const menos = document.createElement('button');
    menos.type = 'button';
    menos.textContent = '−';
    menos.setAttribute('aria-label', `Quitar una persona de ${r.etiqueta}`);
    const out = document.createElement('output');
    out.textContent = estado.equipo[r.id].cantidad;
    out.setAttribute('aria-live', 'polite');
    const mas = document.createElement('button');
    mas.type = 'button';
    mas.textContent = '+';
    mas.setAttribute('aria-label', `Sumar una persona de ${r.etiqueta}`);
    const cambiar = (d) => {
      const n = Math.min(9, Math.max(0, estado.equipo[r.id].cantidad + d));
      estado.equipo[r.id].cantidad = n;
      out.textContent = n;
      estado.esEjemplo = false;
      recalcular();
    };
    menos.addEventListener('click', () => cambiar(-1));
    mas.addEventListener('click', () => cambiar(1));
    paso.append(menos, out, mas);

    const ch = document.createElement('span');
    ch.className = 'ch';
    fila.append(nombre, lab, paso, ch);
    cont.appendChild(fila);
  }
}

function actualizarCostosHora() {
  for (const fila of document.querySelectorAll('.rol')) {
    const id = fila.dataset.id;
    const e = estado.equipo[id];
    fila.classList.toggle('inactivo', e.cantidad === 0);
    let texto = '—';
    try {
      texto = `${dinero(costoHoraEmpresa(e.salario, nominaActual()))}/h`;
    } catch { /* parámetros inválidos: el error se muestra en el resultado */ }
    const ch = fila.querySelector('.ch');
    ch.textContent = texto;
    const s = document.createElement('small');
    s.textContent = 'costo empresa';
    ch.appendChild(s);
  }
}

function nominaActual() {
  const p = estado.params;
  return {
    factorPrestacional: p.factorPrestacional, smmlv: p.smmlv, auxilioTransporte: p.auxilioTransporte,
    limiteAuxilioSmmlv: p.limiteAuxilioSmmlv, horasSemana: p.horasSemana, semanasMes: p.semanasMes,
  };
}

function pintarParametros() {
  for (const inp of document.querySelectorAll('[data-param]')) {
    const k = inp.dataset.param;
    const esc = Number(inp.dataset.escala || 1);
    inp.value = typeof estado.params[k] === 'number' ? +(estado.params[k] * esc).toFixed(4) : estado.params[k];
  }
}

function enlazarParametros() {
  for (const inp of document.querySelectorAll('[data-param]')) {
    inp.addEventListener('input', () => {
      const k = inp.dataset.param;
      if (inp.tagName === 'SELECT') estado.params[k] = inp.value;
      else {
        const v = Number(inp.value);
        if (inp.value === '' || !Number.isFinite(v)) return;
        estado.params[k] = v / Number(inp.dataset.escala || 1);
      }
      recalcularPronto();
    });
  }
}

// ---------- Cálculo y pintado del resultado ----------
let temporizador = null;
function recalcularPronto() {
  clearTimeout(temporizador);
  temporizador = setTimeout(recalcular, 140);
}

function mostrarError(msg) {
  $('#precio-p80').textContent = '—';
  $('#precio-rango').replaceChildren(Object.assign(document.createElement('span'), { className: 'error', textContent: msg }));
  for (const id of ['#sem-p50', '#sem-p80', '#sem-p90', '#mini-precio', '#mini-plazo']) $(id).textContent = '—';
  $('#lectura').textContent = 'Sin datos para simular.';
  $('#medidor-relleno').style.width = '0';
  $('#nivel').textContent = '—';
  $('#desglose-cuerpo').replaceChildren();
}

function recalcular() {
  $('#sello-ejemplo').textContent = estado.esEjemplo ? EJEMPLO.nombre : 'Tu proyecto';
  $('#sello-ejemplo').classList.toggle('frio', !estado.esEjemplo);
  actualizarCostosHora();
  const p = estado.params;
  let q;
  try {
    q = cotizar({
      piezas: PIEZAS.filter((x) => estado.seleccion.has(x.id)).map((x) => {
        const [a, m, b] = estado.horas[x.id];
        return { id: x.id, nombre: x.nombre, a, m, b };
      }),
      equipo: ROLES.map((r) => ({ id: r.id, etiqueta: r.etiqueta, ...estado.equipo[r.id] })),
      nomina: nominaActual(),
      horasProductivas: p.horasProductivas,
      contingencia: p.contingencia,
      margen: p.margen,
      otrosCostos: p.otrosCostos,
      usdCop: estado.usdCop,
      riesgo: { distribucion: p.distribucion, iteraciones: p.iteraciones, semilla: p.semilla },
    });
  } catch (e) {
    mostrarError(`Revisa los valores: ${e.message}`);
    return;
  }
  if (q.error) {
    mostrarError(q.error);
    return;
  }
  const { sim, cascada, precio } = q;
  $('#etq-precio').textContent = `Precio con 80 % de confianza (P80) · ${estado.moneda}`;
  $('#precio-p80').textContent = dinero(precio.p80, true);
  $('#precio-p80').title = dinero(precio.p80);
  const rango = $('#precio-rango');
  rango.innerHTML = '';
  rango.append('Rango P50 ', Object.assign(document.createElement('b'), { textContent: dinero(precio.p50, true) }),
    ' a P90 ', Object.assign(document.createElement('b'), { textContent: dinero(precio.p90, true) }));
  $('#sem-p50').textContent = semanas(sim.semanas.p50);
  $('#sem-p80').textContent = semanas(sim.semanas.p80);
  $('#sem-p90').textContent = semanas(sim.semanas.p90);
  $('#nivel').textContent = cascada.capacidad.nivel;
  $('#mini-precio').textContent = dinero(precio.p80, true);
  $('#mini-plazo').textContent = `${semanas(sim.semanas.p80)} · ${q.personas} pers.`;

  const prob = sim.prob_dentro_presupuesto;
  $('#medidor-relleno').style.width = `${prob * 100}%`;
  $('#medidor').setAttribute('aria-valuenow', String(Math.round(prob * 100)));
  $('#medidor').setAttribute('aria-valuetext', pct(prob));
  $('#lectura').textContent = `Con la contingencia actual (${pct(p.contingencia)}) hay un ${pct(prob)} de probabilidad de no pasarse del presupuesto. `
    + (sim.cubre_p80 ? 'La contingencia cubre el P80.' : 'La contingencia NO cubre el P80: súbela o recorta alcance.');

  const tope = cascada.manoObra + cascada.contingenciaCosto + cascada.noLaboral;
  dibujarHistograma($('#histo'), sim.muestrasCosto, {
    p50: sim.costo.p50, p80: sim.costo.p80, p90: sim.costo.p90, tope, bins: 30,
    etiquetaMin: dinero(sim.costo.minimo, true), etiquetaMax: dinero(sim.costo.maximo, true),
    etiquetaTope: `presupuesto + contingencia ${dinero(tope, true)}`,
  });
  $('#histo-desc').textContent = `${sim.config.iteraciones} escenarios de costo sin margen entre ${dinero(sim.costo.minimo)} y ${dinero(sim.costo.maximo)}. `
    + `P50 ${dinero(sim.costo.p50)}, P80 ${dinero(sim.costo.p80)}, P90 ${dinero(sim.costo.p90)}. Presupuesto con contingencia ${dinero(tope)}.`;
  const onoma = $('#onoma');
  onoma.textContent = `×${NF(0).format(sim.config.iteraciones)}`;
  onoma.classList.remove('pulso');
  void onoma.offsetWidth;
  onoma.classList.add('pulso');

  pintarDesglose(q);
}

function filaTabla(celdas, etiqueta = 'td') {
  const tr = document.createElement('tr');
  celdas.forEach((c, i) => {
    const td = document.createElement(i === 0 && etiqueta === 'td' ? 'th' : etiqueta);
    if (i === 0 && etiqueta === 'td') td.scope = 'row';
    td.textContent = c;
    if (i > 0) td.className = 'num';
    tr.appendChild(td);
  });
  return tr;
}

function tabla(titulo, cabeza, filas, pie) {
  const frag = document.createDocumentFragment();
  const h = document.createElement('h3');
  h.textContent = titulo;
  const envoltura = document.createElement('div');
  envoltura.className = 'tabla-scroll';
  const t = document.createElement('table');
  t.className = 'tabla';
  const th = document.createElement('thead');
  th.appendChild(filaTabla(cabeza, 'th'));
  const tb = document.createElement('tbody');
  filas.forEach((f) => tb.appendChild(filaTabla(f)));
  t.append(th, tb);
  if (pie) {
    const tf = document.createElement('tfoot');
    tf.appendChild(filaTabla(pie));
    t.appendChild(tf);
  }
  envoltura.appendChild(t);
  frag.append(h, envoltura);
  return frag;
}

function pintarDesglose(q) {
  const c = q.cascada;
  const p = estado.params;
  const cuerpo = $('#desglose-cuerpo');
  cuerpo.replaceChildren(
    tabla('Cascada de precio', ['Concepto', 'Horas', 'Valor'], [
      ['Mano de obra', NF(0).format(c.totalHoras), dinero(c.manoObra)],
      [`Contingencia ${pct(p.contingencia)}`, `+${NF(0).format(c.contingenciaHoras)}`, dinero(c.contingenciaCosto)],
      ['Otros costos fijos', '', dinero(c.noLaboral)],
      ['Subtotal', NF(0).format(c.horasPlaneadas), dinero(c.subtotal)],
      [`Margen comercial ${pct(p.margen)}`, '', dinero(c.margenCosto)],
    ], ['Precio con horas probables', '', dinero(c.precio)]),
    tabla('Por pieza', ['Pieza', 'Opt · Prob · Pes', 'Mano de obra'],
      q.porPieza.map((x) => [x.nombre, `${NF(0).format(x.a)} · ${NF(0).format(x.m)} · ${NF(0).format(x.b)}`, dinero(x.costo)])),
    tabla('Por rol', ['Rol', 'Personas', 'Costo/hora', 'Horas', 'Mano de obra'],
      q.roles.map((r) => {
        const fila = c.roles.find((x) => x.id === r.id);
        return [r.etiqueta, String(r.cantidad), dinero(r.costoHora), NF(0).format(fila.horas), dinero(fila.costo)];
      })),
  );
  const nota = document.createElement('p');
  nota.className = 'aviso-legal';
  nota.textContent = `Niveles de eiran: mínimo viable ${dinero(c.niveles.minimo.precio)} · recomendado ${dinero(c.niveles.recomendado.precio)} · premium ${dinero(c.niveles.premium.precio)}. `
    + `Costo promedio del equipo: ${dinero(q.tarifaCombinada)}/h; capacidad ${NF(0).format(c.capacidad.capacidadSemanal)} h/semana. `
    + `Equivalente: ${estado.moneda === 'COP' ? `US$ ${NF(0).format(c.equivalente.usd)}` : `$ ${NF(0).format(c.equivalente.cop)} COP`} (TRM ${NF(0).format(estado.usdCop)}).`;
  cuerpo.appendChild(nota);
}

// ---------- Arranque ----------
function enlazarCabecera() {
  for (const b of document.querySelectorAll('[data-moneda]')) {
    b.addEventListener('click', () => {
      estado.moneda = b.dataset.moneda;
      document.querySelectorAll('[data-moneda]').forEach((x) => x.setAttribute('aria-pressed', String(x === b)));
      recalcular();
    });
  }
  $('#trm').addEventListener('input', (e) => {
    const v = Number(e.target.value);
    if (v > 0) { estado.usdCop = v; recalcularPronto(); }
  });
  $('#tema').addEventListener('click', () => {
    const raiz = document.documentElement;
    const oscuroAhora = raiz.dataset.theme ? raiz.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
    raiz.dataset.theme = oscuroAhora ? 'light' : 'dark';
    try { localStorage.setItem('cotizador-tema', raiz.dataset.theme); } catch { /* sin almacenamiento: no pasa nada */ }
  });
  $('#cargar-ejemplo').addEventListener('click', () => {
    cargarEjemplo();
    pintarTodo();
  });
  $('#vaciar').addEventListener('click', () => {
    estado.seleccion.clear();
    estado.esEjemplo = false;
    pintarTodo();
  });
  $('#restaurar').addEventListener('click', () => {
    estado.params = { ...PARAMS_REF };
    pintarParametros();
    recalcular();
  });
}

function pintarTodo() {
  pintarPiezas();
  pintarTablaHoras();
  pintarEquipo();
  pintarParametros();
  recalcular();
}

cargarEjemplo();
enlazarCabecera();
enlazarParametros();
pintarTodo();
