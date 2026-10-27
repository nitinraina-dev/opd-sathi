// Staff account tools for the terminal.
//   npm run staff:reset -- admin              new random password for "admin"
//   npm run staff:reset -- admin MyNewPass1   set this password
// Works with MongoDB or the file storage, whichever the server uses.

import { openStore } from './db.js'
import { hashPassword, randomPassword } from './auth.js'

const [cmd, username, given] = process.argv.slice(2)
if (cmd !== 'reset-password' || !username) {
  console.log('Usage: npm run staff:reset -- <username> [new password]')
  process.exit(1)
}
const store = await openStore(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/opd-saathi')
const u = await store.getStaff(username)
const password = given || randomPassword()
if (password.length < 8) {
  console.log('The password needs at least 8 characters.')
  process.exit(1)
}
const next = u
  ? { ...u, hash: await hashPassword(password), v: (u.v || 1) + 1 }
  : { _id: username, name: username, role: 'admin', hash: await hashPassword(password), v: 1 }
await store.saveStaff(next)
console.log(`${u ? 'Password reset' : 'Admin account created'}:  username "${username}"  password "${password}"`)
await store.close()
