// Dibujo SVG (sin librerías). Reutiliza los rectángulos para que el histograma se anime entre estados.
import { histograma } from './modelo.js';

const NS = 'http://www.w3.org/2000/svg';

export function el(nombre, attrs = {}, texto) {
  const n = document.createElementNS(NS, nombre);
  for (const [k, v] of Object.entries(attrs)) {
    // var(--x) en fill/stroke va por estilo: así sigue al tema claro u oscuro en cualquier navegador
    if ((k === 'fill' || k === 'stroke') && String(v).startsWith('var(')) n.style.setProperty(k, v);
    else n.setAttribute(k, v);
  }
  if (texto != null) n.textContent = texto;
  return n;
}

/**
 * Histograma del costo simulado con líneas P50/P80/P90 y el tope (presupuesto con contingencia).
 * opciones: { p50, p80, p90, tope, bins, etiquetaMin, etiquetaMax, etiquetaTope }
 */
export function dibujarHistograma(svg, muestras, o) {
  const W = 600; const X0 = 12; const X1 = 588; const Y0 = 46; const Y1 = 190;
  const bins = o.bins || 30;
  const barras = histograma(muestras, bins);
  const min = muestras[0];
  const max = muestras[muestras.length - 1];
  const rango = max - min || 1;
  const x = (v) => X0 + ((Math.min(Math.max(v, min), max) - min) / rango) * (X1 - X0);
  const maxN = Math.max(...barras.map((b) => b.n), 1);

  let capa = svg.querySelector('g.barras');
  if (!capa) {
    capa = el('g', { class: 'barras' });
    svg.appendChild(capa);
  }
  const rects = [...capa.querySelectorAll('rect')];
  const ancho = (X1 - X0) / bins;
  for (let i = 0; i < bins; i++) {
    let r = rects[i];
    const nuevo = !r;
    if (nuevo) {
      r = el('rect', { class: 'barra', y: Y0, height: Y1 - Y0 });
      r.style.transform = 'scaleY(0)';
      capa.appendChild(r);
    }
    r.setAttribute('x', (X0 + i * ancho + 1).toFixed(2));
    r.setAttribute('width', Math.max(ancho - 2, 1).toFixed(2));
    const b = barras[i];
    r.classList.toggle('sobre', o.tope != null && (b.desde + b.hasta) / 2 > o.tope);
    const escala = b.n / maxN;
    if (nuevo) requestAnimationFrame(() => requestAnimationFrame(() => { r.style.transform = `scaleY(${escala})`; }));
    else r.style.transform = `scaleY(${escala})`;
  }
  rects.slice(bins).forEach((r) => r.remove());

  svg.querySelector('g.anot')?.remove();
  const g = el('g', { class: 'anot' });
  g.appendChild(el('line', { class: 'eje', x1: X0, x2: X1, y1: Y1, y2: Y1 }));
  const marcas = [['P50', o.p50, 12], ['P80', o.p80, 25], ['P90', o.p90, 38]];
  for (const [nombre, v, ty] of marcas) {
    const px = x(v);
    g.appendChild(el('line', { class: 'linea-p', x1: px, x2: px, y1: ty + 3, y2: Y1 }));
    g.appendChild(el('text', { x: Math.min(Math.max(px, 20), W - 20), y: ty, 'text-anchor': 'middle' }, nombre));
  }
  if (o.tope != null) {
    const px = x(o.tope);
    const fuera = o.tope > max ? ' →' : o.tope < min ? '← ' : '';
    g.appendChild(el('line', { class: 'linea-tope', x1: px, x2: px, y1: Y0 - 4, y2: Y1 + 6 }));
    const anchor = px > W * 0.7 ? 'end' : px < W * 0.3 ? 'start' : 'middle';
    g.appendChild(el('text', { class: 't-tope', x: px, y: 224, 'text-anchor': anchor }, `${o.etiquetaTope || 'tope'}${fuera}`));
  }
  g.appendChild(el('text', { x: X0, y: 207, 'text-anchor': 'start' }, o.etiquetaMin || ''));
  g.appendChild(el('text', { x: X1, y: 207, 'text-anchor': 'end' }, o.etiquetaMax || ''));
  svg.appendChild(g);
}
