// Generador de números aleatorios compatible con `random.Random(semilla)` de Python (CPython 3.13).
//
// Por qué: el motor de riesgo de eiran usa Mersenne Twister (MT19937) con semilla fija. Para que la
// herramienta dé EXACTAMENTE los mismos percentiles que el código Python original, aquí se porta el
// mismo generador (init_by_array, genrand_res53) y los mismos algoritmos de `betavariate`,
// `gammavariate` (Cheng 1977 y GS de Kennedy y Gentle) y `triangular`.
// Funciones puras salvo el estado interno del objeto devuelto.

const N = 624;
const M = 397;
const MATRIX_A = 0x9908b0df;
const UPPER = 0x80000000;
const LOWER = 0x7fffffff;

const LOG4 = Math.log(4.0);
const SG_MAGICCONST = 1.0 + Math.log(4.5);
const E = Math.E;

function mul32(a, b) {
  return Math.imul(a, b) >>> 0;
}

/** Crea un generador equivalente a `random.Random(semilla)` para semillas enteras no negativas. */
export function crearAzar(semilla = 42) {
  if (!Number.isSafeInteger(semilla) || semilla < 0) {
    throw new RangeError('La semilla debe ser un entero no negativo (hasta 2^53)');
  }
  const mt = new Uint32Array(N);
  let mti = N + 1;

  function initGenrand(s) {
    mt[0] = s >>> 0;
    for (mti = 1; mti < N; mti++) {
      const prev = mt[mti - 1] ^ (mt[mti - 1] >>> 30);
      mt[mti] = (mul32(1812433253, prev) + mti) >>> 0;
    }
  }

  function initByArray(clave) {
    initGenrand(19650218);
    let i = 1;
    let j = 0;
    let k = N > clave.length ? N : clave.length;
    for (; k; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ mul32(prev, 1664525)) + clave[j] + j) >>> 0;
      i++; j++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
      if (j >= clave.length) j = 0;
    }
    for (k = N - 1; k; k--) {
      const prev = mt[i - 1] ^ (mt[i - 1] >>> 30);
      mt[i] = ((mt[i] ^ mul32(prev, 1566083941)) - i) >>> 0;
      i++;
      if (i >= N) { mt[0] = mt[N - 1]; i = 1; }
    }
    mt[0] = 0x80000000;
  }

  function genrandInt32() {
    let y;
    if (mti >= N) {
      let kk = 0;
      for (; kk < N - M; kk++) {
        y = (mt[kk] & UPPER) | (mt[kk + 1] & LOWER);
        mt[kk] = mt[kk + M] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0);
      }
      for (; kk < N - 1; kk++) {
        y = (mt[kk] & UPPER) | (mt[kk + 1] & LOWER);
        mt[kk] = mt[kk + (M - N)] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0);
      }
      y = (mt[N - 1] & UPPER) | (mt[0] & LOWER);
      mt[N - 1] = mt[M - 1] ^ (y >>> 1) ^ (y & 1 ? MATRIX_A : 0);
      mti = 0;
    }
    y = mt[mti++];
    y ^= y >>> 11;
    y ^= (y << 7) & 0x9d2c5680;
    y ^= (y << 15) & 0xefc60000;
    y ^= y >>> 18;
    return y >>> 0;
  }

  // Python parte el entero en palabras de 32 bits (la menos significativa primero).
  const clave = [];
  let resto = semilla;
  do {
    clave.push(resto % 0x100000000);
    resto = Math.floor(resto / 0x100000000);
  } while (resto > 0);
  initByArray(clave);

  /** Flotante en [0, 1) con 53 bits, igual que `random.random()`. */
  function random() {
    const a = genrandInt32() >>> 5;
    const b = genrandInt32() >>> 6;
    return (a * 67108864.0 + b) * (1.0 / 9007199254740992.0);
  }

  function gammavariate(alpha, beta) {
    if (alpha <= 0 || beta <= 0) throw new RangeError('gammavariate: alpha y beta deben ser > 0');
    if (alpha > 1.0) {
      const ainv = Math.sqrt(2.0 * alpha - 1.0);
      const bbb = alpha - LOG4;
      const ccc = alpha + ainv;
      for (;;) {
        const u1 = random();
        if (!(1e-7 < u1 && u1 < 0.9999999)) continue;
        const u2 = 1.0 - random();
        const v = Math.log(u1 / (1.0 - u1)) / ainv;
        const x = alpha * Math.exp(v);
        const z = u1 * u1 * u2;
        const r = bbb + ccc * v - x;
        if (r + SG_MAGICCONST - 4.5 * z >= 0.0 || r >= Math.log(z)) return x * beta;
      }
    }
    if (alpha === 1.0) return -Math.log(1.0 - random()) * beta;
    let x;
    for (;;) {
      const u = random();
      const b = (E + alpha) / E;
      const p = b * u;
      x = p <= 1.0 ? p ** (1.0 / alpha) : -Math.log((b - p) / alpha);
      const u1 = random();
      if (p > 1.0) {
        if (u1 <= x ** (alpha - 1.0)) break;
      } else if (u1 <= Math.exp(-x)) break;
    }
    return x * beta;
  }

  function betavariate(alpha, beta) {
    const y = gammavariate(alpha, 1.0);
    if (y) return y / (y + gammavariate(beta, 1.0));
    return 0.0;
  }

  function triangular(low = 0.0, high = 1.0, mode = null) {
    let u = random();
    if (high === low) return low;
    let c = mode === null ? 0.5 : (mode - low) / (high - low);
    if (u > c) {
      u = 1.0 - u;
      c = 1.0 - c;
      [low, high] = [high, low];
    }
    return low + (high - low) * Math.sqrt(u * c);
  }

  return { random, gammavariate, betavariate, triangular };
}
