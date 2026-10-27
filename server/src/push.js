// Web push: alerts reach a patient's phone even when the OPD Saathi screen is
// closed. The phone subscribes for one patient (after "Allow alerts"); when
// the engine adds a message for that patient ("your turn is close", "your
// token is called"…), the server pushes it in the patient's language.
// Keys (VAPID) are made once and kept in the database, or set in server/.env.

import crypto from 'node:crypto'
import webpush from 'web-push'
import { translate } from '../../client/src/i18n/translate.js'
import { messageText, messageTitle } from '../../client/src/lib/text.js'

export async function createPush(store) {
  let keys =
    process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY
      ? { publicKey: process.env.VAPID_PUBLIC_KEY, privateKey: process.env.VAPID_PRIVATE_KEY }
      : await store.getSecret('vapid')
  if (!keys) {
    keys = webpush.generateVAPIDKeys()
    await store.setSecret('vapid', keys)
  }
  webpush.setVapidDetails(process.env.VAPID_SUBJECT || 'mailto:opd-saathi@example.org', keys.publicKey, keys.privateKey)

  // The patient record and the ones it was moved from (moving makes a new id).
  const chain = (state, pid) => {
    const ids = []
    for (let p = state.patients[pid]; p && ids.length < 10; p = p.movedFrom ? state.patients[p.movedFrom] : null) ids.push(p.id)
    return ids
  }

  async function send(state, m) {
    const subs = await store.pushSubsFor(chain(state, m.pid))
    for (const s of subs) {
      const t = (k, v) => translate(s.lang, k, v)
      const token = m.newToken || m.token
      const payload = JSON.stringify({
        title: messageTitle(m, t),
        body: messageText(m, t),
        url: `/turn/${token}`,
        tag: `${token}-${m.kind}`,
        lang: s.lang,
        urgent: m.kind === 'called',
      })
      try {
        await webpush.sendNotification(s.sub, payload, { TTL: 60 * 30, urgency: 'high' })
      } catch (err) {
        // 404/410: the phone unsubscribed or the browser was reset.
        if (err.statusCode === 404 || err.statusCode === 410) await store.removePushSub(s._id)
        else console.warn('Push failed:', err.statusCode || err.message)
      }
    }
  }

  return {
    publicKey: keys.publicKey,

    async subscribe(state, { pid, token, lang, subscription }) {
      const p = state.patients[pid]
      if (!p || p.token !== token) throw new Error('patient')
      const endpoint = subscription?.endpoint
      if (typeof endpoint !== 'string' || !/^https:\/\//.test(endpoint) || !subscription.keys?.p256dh || !subscription.keys?.auth) {
        throw new Error('subscription')
      }
      const id = crypto.createHash('sha256').update(`${endpoint}|${pid}`).digest('hex')
      await store.addPushSub({
        _id: id,
        pid,
        token,
        lang: lang === 'hi' ? 'hi' : 'en',
        sub: { endpoint, keys: { p256dh: String(subscription.keys.p256dh), auth: String(subscription.keys.auth) } },
        at: Date.now(),
      })
      return id
    },

    async unsubscribe({ endpoint, pid }) {
      const id = crypto.createHash('sha256').update(`${endpoint}|${pid}`).digest('hex')
      await store.removePushSub(id)
    },

    // New messages from one change of the hospital state.
    onMessages(state, messages) {
      for (const m of messages) send(state, m).catch((err) => console.warn('Push error:', err.message))
    },
  }
}
