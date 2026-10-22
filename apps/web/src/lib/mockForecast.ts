export interface ForecastPoint {
  date: string
  history: number | null
  p50: number | null
  /** [p10, p90] band, as expected by Recharts range areas. */
  band: [number, number] | null
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Deterministic mock: 60 days of history followed by 28 days of forecast with a p10/p50/p90 band. */
export function buildMockForecast(historyDays = 60, horizonDays = 28): ForecastPoint[] {
  const start = Date.UTC(2025, 0, 1)
  const demand = (i: number) => 40 + 12 * Math.sin((2 * Math.PI * i) / 7) + 0.1 * i
  const points: ForecastPoint[] = []

  for (let i = 0; i < historyDays + horizonDays; i++) {
    const date = new Date(start + i * DAY_MS).toISOString().slice(0, 10)
    if (i < historyDays) {
      points.push({ date, history: Math.round(demand(i)), p50: null, band: null })
      continue
    }
    const p50 = demand(i)
    const spread = 4 + 0.35 * (i - historyDays)
    points.push({
      date,
      history: null,
      p50: Math.round(p50),
      band: [Math.max(0, Math.round(p50 - spread)), Math.round(p50 + spread)],
    })
  }
  // Connect the forecast line to the last observed point.
  const last = points[historyDays - 1]
  last.p50 = last.history
  last.band = [last.history ?? 0, last.history ?? 0]
  return points
}
