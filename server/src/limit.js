// A simple per-key limit: at most `max` hits in `ms` (kept in memory).
// Generous on purpose: many phones share one address on mobile networks
// and on hospital Wi-Fi.
export function limiter(max, ms) {
  const hits = new Map() // key -> times
  const timer = setInterval(() => {
    const old = Date.now() - ms
    for (const [k, times] of hits) if (!times.some((t) => t > old)) hits.delete(k)
  }, ms)
  timer.unref()
  return {
    // True if this hit is over the limit (and then it is not counted).
    over(key) {
      const now = Date.now()
      const times = (hits.get(key) || []).filter((t) => t > now - ms)
      if (times.length >= max) {
        hits.set(key, times)
        return true
      }
      times.push(now)
      hits.set(key, times)
      return false
    },
  }
}
