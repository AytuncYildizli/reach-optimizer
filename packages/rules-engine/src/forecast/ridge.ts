/** Gaussian elimination with partial pivoting. Returns null if singular. */
export function solveLinear(matrix: number[][], rhs: number[]): number[] | null {
  const n = rhs.length;
  const m = matrix.map((row, i) => [...row, rhs[i]!]);
  for (let col = 0; col < n; col++) {
    let pivot = col;
    for (let r = col + 1; r < n; r++) {
      if (Math.abs(m[r]![col]!) > Math.abs(m[pivot]![col]!)) pivot = r;
    }
    const pivotRow = m[pivot]!;
    m[pivot] = m[col]!;
    m[col] = pivotRow;
    const div = m[col]![col]!;
    if (Math.abs(div) < 1e-12) return null;
    for (let c = col; c <= n; c++) m[col]![c] = m[col]![c]! / div;
    for (let r = 0; r < n; r++) {
      if (r === col) continue;
      const factor = m[r]![col]!;
      if (factor === 0) continue;
      for (let c = col; c <= n; c++) m[r]![c] = m[r]![c]! - factor * m[col]![c]!;
    }
  }
  return m.map((row) => row[n]!);
}

export interface ColumnStats {
  mean: number[];
  std: number[];
}

export function columnStats(X: number[][]): ColumnStats {
  const n = X.length;
  const p = X[0]?.length ?? 0;
  const mean = new Array<number>(p).fill(0);
  if (n === 0) return { mean, std: new Array<number>(p).fill(0) };
  for (const row of X) {
    for (let j = 0; j < p; j++) mean[j] = mean[j]! + row[j]!;
  }
  for (let j = 0; j < p; j++) mean[j] = mean[j]! / n;
  const std = new Array<number>(p).fill(0);
  for (const row of X) {
    for (let j = 0; j < p; j++) {
      const d = row[j]! - mean[j]!;
      std[j] = std[j]! + d * d;
    }
  }
  for (let j = 0; j < p; j++) std[j] = Math.sqrt(std[j]! / n);
  return { mean, std };
}

export function applyStandardize(X: number[][], mean: number[], std: number[]): number[][] {
  return X.map((row) =>
    row.map((v, j) => {
      const s = std[j] ?? 0;
      if (!(s > 0)) return 0;
      return (v - (mean[j] ?? 0)) / s;
    }),
  );
}

export interface LinearFit {
  weights: number[];
  intercept: number;
}

/**
 * Ridge on an already column-standardized matrix (train columns should be
 * mean 0). The intercept is unpenalized and equals the mean of y when the
 * columns are centered.
 */
export function fitRidgeOnStandardized(Xz: number[][], y: number[], lambda: number): LinearFit | null {
  const n = y.length;
  if (n === 0) return null;
  const p = Xz[0]?.length ?? 0;
  let yMean = 0;
  for (const v of y) yMean += v;
  yMean /= n;
  if (p === 0) return { weights: [], intercept: yMean };

  const G = Array.from({ length: p }, () => new Array<number>(p).fill(0));
  const g = new Array<number>(p).fill(0);
  for (let i = 0; i < n; i++) {
    const yc = y[i]! - yMean;
    const row = Xz[i]!;
    for (let a = 0; a < p; a++) {
      g[a] = g[a]! + row[a]! * yc;
      const ga = G[a]!;
      for (let b = a; b < p; b++) ga[b] = ga[b]! + row[a]! * row[b]!;
    }
  }
  for (let a = 0; a < p; a++) {
    for (let b = 0; b < a; b++) G[a]![b] = G[b]![a]!;
    G[a]![a] = G[a]![a]! + lambda;
  }
  const weights = solveLinear(G, g);
  if (!weights) return null;
  return { weights, intercept: yMean };
}

export function dotPredict(Xz: number[][], weights: number[], intercept: number): number[] {
  return Xz.map((row) => {
    let s = intercept;
    for (let j = 0; j < weights.length; j++) s += row[j]! * weights[j]!;
    return s;
  });
}

export interface RidgeModel extends LinearFit {
  mean: number[];
  std: number[];
}

/** Convenience wrapper that standardizes X itself, for tests and one-shot fits. */
export function fitRidge(X: number[][], y: number[], lambda: number): RidgeModel | null {
  const { mean, std } = columnStats(X);
  const Xz = applyStandardize(X, mean, std);
  const fit = fitRidgeOnStandardized(Xz, y, lambda);
  if (!fit) return null;
  return { ...fit, mean, std };
}

export function predictRidge(model: RidgeModel, X: number[][]): number[] {
  return dotPredict(applyStandardize(X, model.mean, model.std), model.weights, model.intercept);
}
