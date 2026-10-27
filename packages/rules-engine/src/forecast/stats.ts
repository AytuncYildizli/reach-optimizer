/** Average ranks, 1-based, ties share the mean rank. */
export function ranks(values: number[]): number[] {
  const idx = values.map((_, i) => i).sort((a, b) => values[a] - values[b] || a - b);
  const out = new Array<number>(values.length);
  let i = 0;
  while (i < idx.length) {
    let j = i;
    while (j + 1 < idx.length && values[idx[j + 1]!] === values[idx[i]!]) j++;
    const avg = (i + j) / 2 + 1;
    for (let k = i; k <= j; k++) out[idx[k]!] = avg;
    i = j + 1;
  }
  return out;
}

export function pearson(x: number[], y: number[]): number | null {
  const n = x.length;
  if (n !== y.length || n < 3) return null;
  let sx = 0;
  let sy = 0;
  let sxy = 0;
  let sx2 = 0;
  let sy2 = 0;
  for (let i = 0; i < n; i++) {
    const xi = x[i]!;
    const yi = y[i]!;
    sx += xi;
    sy += yi;
    sxy += xi * yi;
    sx2 += xi * xi;
    sy2 += yi * yi;
  }
  const num = n * sxy - sx * sy;
  const den = Math.sqrt((n * sx2 - sx * sx) * (n * sy2 - sy * sy));
  if (!(den > 0)) return null;
  return num / den;
}

export function spearman(x: number[], y: number[]): number | null {
  if (x.length !== y.length || x.length < 3) return null;
  return pearson(ranks(x), ranks(y));
}

export function mae(pred: number[], actual: number[]): number | null {
  if (pred.length === 0 || pred.length !== actual.length) return null;
  let s = 0;
  for (let i = 0; i < pred.length; i++) s += Math.abs(pred[i]! - actual[i]!);
  return s / pred.length;
}

export function medianAe(pred: number[], actual: number[]): number | null {
  if (pred.length === 0 || pred.length !== actual.length) return null;
  const errs = pred.map((p, i) => Math.abs(p - actual[i]!));
  return median(errs);
}

export function median(values: number[]): number {
  if (values.length === 0) throw new Error('median of empty');
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  if (s.length % 2 === 1) return s[mid]!;
  return (s[mid - 1]! + s[mid]!) / 2;
}

/** Inclusive linear quantile. q is in [0, 1]. */
export function quantile(values: number[], q: number): number {
  if (values.length === 0) throw new Error('quantile of empty');
  const s = [...values].sort((a, b) => a - b);
  const pos = (s.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  if (lo === hi) return s[lo]!;
  const w = pos - lo;
  return s[lo]! * (1 - w) + s[hi]! * w;
}

export function maeLog(pred: number[], actual: number[]): number | null {
  if (pred.length === 0 || pred.length !== actual.length) return null;
  let s = 0;
  for (let i = 0; i < pred.length; i++) {
    const p = Math.max(pred[i]!, 1e-6);
    const a = Math.max(actual[i]!, 1e-6);
    s += Math.abs(Math.log(p) - Math.log(a));
  }
  return s / pred.length;
}
