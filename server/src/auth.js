// Staff login.
// - Passwords are hashed with scrypt (Node's built-in crypto), never stored as text.
// - A signed session cookie (HttpOnly, SameSite=Lax) lasts 12 hours. Changing a
//   password logs that person out everywhere.
// - On the very first start an "admin" account is created. Its password comes
//   from STAFF_ADMIN_PASSWORD, or a random one is printed once in the terminal.

import crypto from 'node:crypto'
import { Router } from 'express'
import { ROLES, can } from '../../client/src/lib/permissions.js'

const COOKIE = 'opd_staff'
const MAX_AGE = 12 * 60 * 60 // seconds

function scrypt(password, salt) {
  return new Promise((resolve, reject) =>
    crypto.scrypt(password, salt, 64, (err, key) => (err ? reject(err) : resolve(key.toString('hex')))),
  )
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex')
  return `${salt}:${await scrypt(password, salt)}`
}

async function checkPassword(password, stored) {
  const [salt, hash] = String(stored || '').split(':')
  if (!salt || !hash) return false
  const key = Buffer.from(await scrypt(password, salt), 'hex')
  const want = Buffer.from(hash, 'hex')
  return key.length === want.length && crypto.timingSafeEqual(key, want)
}

// Cookies that are not ours, or badly encoded, are skipped (localhost shares
// cookies between every app on it, whatever the port).
export function parseCookies(header = '') {
  const out = {}
  for (const part of header.split(';')) {
    const i = part.indexOf('=')
    if (i <= 0) continue
    try {
      out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim())
    } catch {
      // not a cookie we can read
    }
  }
  return out
}

const publicUser = (u) => ({ username: u._id || u.username, name: u.name, role: u.role })
const validUsername = (s) => typeof s === 'string' && /^[a-z0-9._-]{3,30}$/.test(s)
const validPassword = (s) => typeof s === 'string' && s.length >= 8 && s.length <= 100

export function randomPassword() {
  const words = crypto.randomBytes(9).toString('base64url')
  return `${words.slice(0, 4)}-${words.slice(4, 8)}-${words.slice(8, 12)}`
}

export async function createAuth(store, audit) {
  let secret = process.env.SESSION_SECRET || (await store.getSecret('session'))
  if (!secret) {
    secret = crypto.randomBytes(32).toString('hex')
    await store.setSecret('session', secret)
  }

  // First start: make sure there is an admin.
  if (!(await store.listStaff()).length) {
    const password = process.env.STAFF_ADMIN_PASSWORD || randomPassword()
    await store.saveStaff({ _id: 'admin', name: 'Administrator', role: 'admin', hash: await hashPassword(password), v: 1 })
    const line = `Staff login created:  username "admin"  password "${password}"`
    console.log(`\n${'='.repeat(line.length)}\n${line}\n${process.env.STAFF_ADMIN_PASSWORD ? '(from STAFF_ADMIN_PASSWORD)' : 'Write it down. Change it in Staff → Accounts, or reset it with: npm run staff:reset -- admin'}\n${'='.repeat(line.length)}\n`)
  }

  const sign = (payload) => {
    const body = Buffer.from(JSON.stringify(payload)).toString('base64url')
    const mac = crypto.createHmac('sha256', secret).update(body).digest('base64url')
    return `${body}.${mac}`
  }

  const verify = (token) => {
    if (!token || !token.includes('.')) return null
    const [body, mac] = token.split('.')
    const want = Buffer.from(crypto.createHmac('sha256', secret).update(body).digest('base64url'))
    const got = Buffer.from(mac)
    if (got.length !== want.length || !crypto.timingSafeEqual(got, want)) return null
    try {
      const p = JSON.parse(Buffer.from(body, 'base64url').toString())
      return p.exp > Date.now() ? p : null
    } catch {
      return null
    }
  }

  const setCookie = (req, res, value, maxAge) => {
    const secure = req.secure || req.get('x-forwarded-proto') === 'https'
    res.append('Set-Cookie', `${COOKIE}=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${secure ? '; Secure' : ''}`)
  }

  const startSession = (req, res, user) => {
    setCookie(req, res, sign({ u: user._id, v: user.v, exp: Date.now() + MAX_AGE * 1000 }), MAX_AGE)
  }

  // Who is asking? Sets req.staff (or null) on every request.
  async function identify(req) {
    const p = verify(parseCookies(req.headers.cookie)[COOKIE])
    if (!p) return null
    const u = await store.getStaff(p.u)
    if (!u || u.v !== p.v) return null
    return publicUser(u)
  }

  const middleware = async (req, res, next) => {
    req.staff = await identify(req)
    next()
  }

  const requireRole = (feature) => (req, res, next) => {
    if (!req.staff) return res.status(401).json({ error: 'Please log in' })
    if (!can(req.staff, feature)) return res.status(403).json({ error: 'Not allowed for your role' })
    next()
  }

  // A few wrong passwords in a row slow the next tries down.
  const attempts = new Map()
  const tooMany = (key) => {
    const a = attempts.get(key)
    return a && a.n >= 5 && Date.now() - a.at < 60_000
  }
  const noteFail = (key) => {
    const a = attempts.get(key)
    attempts.set(key, { n: a && Date.now() - a.at < 60_000 ? a.n + 1 : 1, at: Date.now() })
  }

  const router = Router()

  router.post('/auth/login', async (req, res) => {
    const { username, password } = req.body || {}
    const key = `${req.ip}|${username}`
    if (tooMany(key)) return res.status(429).json({ error: 'Too many tries. Wait a minute.' })
    const u = validUsername(username) ? await store.getStaff(username) : null
    if (!u || !(await checkPassword(String(password || ''), u.hash))) {
      noteFail(key)
      audit.log(null, 'loginFailed', { username: validUsername(username) ? username : '' })
      return res.status(401).json({ error: 'Wrong username or password' })
    }
    attempts.delete(key)
    startSession(req, res, u)
    audit.log(publicUser(u), 'login')
    res.json({ user: publicUser(u) })
  })

  router.post('/auth/logout', (req, res) => {
    if (req.staff) audit.log(req.staff, 'logout')
    setCookie(req, res, '', 0)
    res.json({ ok: true })
  })

  // Not logged in is a normal answer here, not an error.
  router.get('/auth/me', (req, res) => {
    res.json({ user: req.staff || null })
  })

  router.post('/auth/password', async (req, res) => {
    if (!req.staff) return res.status(401).json({ error: 'Please log in' })
    const { current, next } = req.body || {}
    const u = await store.getStaff(req.staff.username)
    if (!(await checkPassword(String(current || ''), u.hash))) return res.status(400).json({ error: 'The current password is wrong' })
    if (!validPassword(next)) return res.status(400).json({ error: 'The new password needs at least 8 characters' })
    const saved = await store.saveStaff({ ...u, hash: await hashPassword(next), v: (u.v || 1) + 1 })
    startSession(req, res, saved)
    audit.log(req.staff, 'passwordChanged')
    res.json({ ok: true })
  })

  // Accounts (admin only).
  router.get('/staff', requireRole('accounts'), async (req, res) => {
    res.json((await store.listStaff()).map(publicUser))
  })

  router.post('/staff', requireRole('accounts'), async (req, res) => {
    const { username, name, role, password } = req.body || {}
    if (!validUsername(username)) return res.status(400).json({ error: 'Username: 3–30 small letters, numbers, dot, dash or underscore' })
    if (!ROLES.includes(role)) return res.status(400).json({ error: 'Unknown role' })
    if (!validPassword(password)) return res.status(400).json({ error: 'The password needs at least 8 characters' })
    if (await store.getStaff(username)) return res.status(409).json({ error: 'That username is taken' })
    const u = await store.saveStaff({
      _id: username,
      name: String(name || username).slice(0, 60),
      role,
      hash: await hashPassword(password),
      v: 1,
    })
    audit.log(req.staff, 'accountCreated', { username, role })
    res.json(publicUser(u))
  })

  router.put('/staff/:username', requireRole('accounts'), async (req, res) => {
    const u = await store.getStaff(req.params.username)
    if (!u) return res.status(404).json({ error: 'No such account' })
    const { name, role, password } = req.body || {}
    const next = { ...u }
    if (name !== undefined) next.name = String(name).slice(0, 60)
    if (role !== undefined) {
      if (!ROLES.includes(role)) return res.status(400).json({ error: 'Unknown role' })
      if (u.role === 'admin' && role !== 'admin' && (await countAdmins()) <= 1) {
        return res.status(400).json({ error: 'Keep at least one admin' })
      }
      next.role = role
    }
    if (password !== undefined) {
      if (!validPassword(password)) return res.status(400).json({ error: 'The password needs at least 8 characters' })
      next.hash = await hashPassword(password)
      next.v = (u.v || 1) + 1
    }
    const fields = ['name', 'role', 'password'].filter((k) => req.body?.[k] !== undefined)
    audit.log(req.staff, 'accountUpdated', { username: u._id, fields, role: next.role })
    res.json(publicUser(await store.saveStaff(next)))
  })

  router.delete('/staff/:username', requireRole('accounts'), async (req, res) => {
    const u = await store.getStaff(req.params.username)
    if (!u) return res.status(404).json({ error: 'No such account' })
    if (u._id === req.staff.username) return res.status(400).json({ error: 'You cannot delete your own account' })
    if (u.role === 'admin' && (await countAdmins()) <= 1) return res.status(400).json({ error: 'Keep at least one admin' })
    await store.deleteStaff(u._id)
    audit.log(req.staff, 'accountDeleted', { username: u._id })
    res.json({ ok: true })
  })

  async function countAdmins() {
    return (await store.listStaff()).filter((u) => u.role === 'admin').length
  }

  return { middleware, requireRole, router, identify }
}
