// Sends hospital events to an n8n webhook (set on the staff Forecast screen,
// or with N8N_EVENTS_URL in server/.env). n8n then sends the real SMS,
// Telegram alerts to staff, etc. Server to server, so no browser CORS issues.

export function createNotifier(store) {
  async function post(type, data) {
    const cfg = await store.getConfig()
    const url = cfg.eventsUrl || process.env.N8N_EVENTS_URL || ''
    const at = Date.now()
    if (!url) {
      await store.addLog({ at, type, status: 'off' })
      return 'off'
    }
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type, at: new Date(at).toISOString(), hospital: 'City District Hospital (sample)', data }),
        signal: AbortSignal.timeout(8000),
      })
      await store.addLog({ at, type, status: res.ok ? 'sent' : 'error', code: res.status })
      return res.ok ? 'sent' : 'error'
    } catch {
      await store.addLog({ at, type, status: 'error' })
      return 'error'
    }
  }

  return {
    post,
    postAll(events) {
      for (const e of events) post(e.type, e.data).catch(() => {})
    },
  }
}
