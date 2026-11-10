// `round(x, dec)` de Python: redondea al par cuando el valor binario cae exactamente en la mitad.
// `toFixed` de JS desempata hacia arriba, así que solo se corrige ese caso.
export function redondear(x, dec = 0) {
  if (!Number.isFinite(x)) return x;
  const f = 10 ** dec;
  const s = x * f;
  const piso = Math.floor(s);
  if (s - piso === 0.5 && (piso + 0.5) / f === x) {
    return (piso % 2 === 0 ? piso : piso + 1) / f;
  }
  return Number(x.toFixed(dec));
}
