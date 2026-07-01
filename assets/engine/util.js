// Round to a fixed number of decimals to keep plate arithmetic free of
// floating-point dust (e.g. 62.5000001). Every engine result flows through this
// so equality checks like `remainder === 0` stay trustworthy.
export function round(n, dp = 3) {
  const f = 10 ** dp;
  return Math.round((n + Number.EPSILON) * f) / f;
}
