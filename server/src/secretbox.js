// Encrypts secrets kept in the database (payment key secrets) with
// AES-256-GCM. The key comes from SECRETS_KEY in server/.env; without it, a
// key is made and kept in the database, which still hides secrets from
// screens and exports but not from someone holding a full database copy.
// Set SECRETS_KEY in production.

import crypto from 'node:crypto'

export async function createSecretBox(store) {
  let key
  if (process.env.SECRETS_KEY) {
    key = crypto.createHash('sha256').update(process.env.SECRETS_KEY).digest()
  } else {
    let saved = await store.getSecret('boxKey')
    if (!saved) {
      saved = crypto.randomBytes(32).toString('hex')
      await store.setSecret('boxKey', saved)
    }
    key = Buffer.from(saved, 'hex')
  }

  return {
    seal(text) {
      if (!text) return ''
      const iv = crypto.randomBytes(12)
      const c = crypto.createCipheriv('aes-256-gcm', key, iv)
      const data = Buffer.concat([c.update(String(text), 'utf8'), c.final()])
      return ['v1', iv.toString('base64'), c.getAuthTag().toString('base64'), data.toString('base64')].join(':')
    },
    open(sealed) {
      if (!sealed) return ''
      try {
        const [, iv, tag, data] = sealed.split(':')
        const d = crypto.createDecipheriv('aes-256-gcm', key, Buffer.from(iv, 'base64'))
        d.setAuthTag(Buffer.from(tag, 'base64'))
        return Buffer.concat([d.update(Buffer.from(data, 'base64')), d.final()]).toString('utf8')
      } catch {
        return ''
      }
    },
  }
}
