interface BoostNode {
  value: number;
  feature?: number;
  threshold?: number;
  left?: BoostNode;
  right?: BoostNode;
}

export interface BoostModel {
  mean: number;
  learningRate: number;
  trees: BoostNode[];
}

function meanOf(values: number[], indices: number[]): number {
  if (indices.length === 0) return 0;
  let sum = 0;
  for (const index of indices) sum += values[index]!;
  return sum / indices.length;
}

function fitNode(
  X: number[][],
  residual: number[],
  indices: number[],
  depth: number,
  minLeaf: number,
  sorted: number[][],
): BoostNode {
  const value = meanOf(residual, indices);
  if (depth === 0 || indices.length < minLeaf * 2 || X[0]?.length === 0) return { value };
  const mask = new Uint8Array(residual.length);
  let total = 0;
  for (const index of indices) {
    mask[index] = 1;
    total += residual[index]!;
  }
  const totalN = indices.length;
  let bestGain = (total * total) / totalN;
  let bestFeature = -1;
  let bestThreshold = 0;
  const p = X[0]?.length ?? 0;
  for (let feature = 0; feature < p; feature++) {
    let leftN = 0;
    let leftSum = 0;
    let lastX = Number.NaN;
    let seen = false;
    for (const index of sorted[feature]!) {
      if (!mask[index]) continue;
      const x = X[index]![feature]!;
      if (seen && x !== lastX && leftN >= minLeaf && totalN - leftN >= minLeaf) {
        const rightN = totalN - leftN;
        const rightSum = total - leftSum;
        const gain = (leftSum * leftSum) / leftN + (rightSum * rightSum) / rightN;
        if (gain > bestGain + 1e-12) {
          bestGain = gain;
          bestFeature = feature;
          bestThreshold = lastX;
        }
      }
      leftSum += residual[index]!;
      leftN++;
      lastX = x;
      seen = true;
    }
  }
  if (bestFeature < 0) return { value };
  const left: number[] = [];
  const right: number[] = [];
  for (const index of indices) {
    if (X[index]![bestFeature]! <= bestThreshold) left.push(index);
    else right.push(index);
  }
  if (left.length < minLeaf || right.length < minLeaf) return { value };
  return {
    value,
    feature: bestFeature,
    threshold: bestThreshold,
    left: fitNode(X, residual, left, depth - 1, minLeaf, sorted),
    right: fitNode(X, residual, right, depth - 1, minLeaf, sorted),
  };
}

function walk(node: BoostNode, row: number[]): number {
  if (node.feature == null || !node.left || !node.right) return node.value;
  return row[node.feature]! <= node.threshold! ? walk(node.left, row) : walk(node.right, row);
}

export function fitBoost(
  X: number[][],
  y: number[],
  trees: number,
  learningRate = 0.1,
  depth = 2,
  minLeaf = 8,
): BoostModel {
  const n = y.length;
  let mean = 0;
  for (const value of y) mean += value;
  mean = n > 0 ? mean / n : 0;
  const residual = y.map((value) => value - mean);
  const prediction = new Array<number>(n).fill(mean);
  const p = X[0]?.length ?? 0;
  const sorted = Array.from({ length: p }, (_, feature) =>
    X.map((_, index) => index).sort((a, b) => X[a]![feature]! - X[b]![feature]! || a - b),
  );
  const indices = X.map((_, index) => index);
  const forest: BoostNode[] = [];
  for (let tree = 0; tree < trees; tree++) {
    const node = fitNode(X, residual, indices, depth, minLeaf, sorted);
    forest.push(node);
    for (let i = 0; i < n; i++) {
      const step = learningRate * walk(node, X[i]!);
      prediction[i] = prediction[i]! + step;
      residual[i] = y[i]! - prediction[i]!;
    }
  }
  return { mean, learningRate, trees: forest };
}

export function predictBoost(model: BoostModel, X: number[][]): number[] {
  return X.map((row) => {
    let value = model.mean;
    for (const tree of model.trees) value += model.learningRate * walk(tree, row);
    return value;
  });
}
