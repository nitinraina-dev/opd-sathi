// Plain translate functions with no React, so the server can use them too.
import en from './en.js'
import hi from './hi.js'

export const dictionaries = { en, hi }
export const LANGS = ['en', 'hi']

function lookup(dict, key) {
  let v = dict
  for (const part of key.split('.')) {
    if (v == null) return undefined
    v = v[part]
  }
  return v
}

export function translate(lang, key, vars) {
  let v = lookup(dictionaries[lang] || en, key)
  if (v === undefined) v = lookup(en, key)
  if (v === undefined) return key
  if (typeof v !== 'string') return v
  return vars ? v.replace(/\{(\w+)\}/g, (_, k) => (vars[k] ?? '')) : v
}

// Plural: uses key_one or key_other with {n}.
export function plural(t, key, n, vars = {}) {
  return t(`${key}_${n === 1 ? 'one' : 'other'}`, { n, ...vars })
}

// Pick the right language from a { en, hi } value (doctor and sample names).
export function pick(obj, lang) {
  if (!obj) return ''
  if (typeof obj === 'string') return obj
  return obj[lang] || obj.en || ''
}
