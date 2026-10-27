// Settings for this phone or browser (language, text size, …), plus the
// patient's own token and an unfinished registration draft.

import { useSyncExternalStore } from 'react'

const KEY = 'opd-saathi-settings'

const defaults = {
  lang: null, // null until the person picks a language
  textSize: 0, // 0, 1, 2
  contrast: false,
  readAloud: false,
  avoidStairs: false,
  assisted: false, // "Someone is helping me"
  here: 'g_entrance', // where the person says they are
  me: null, // id of this phone's patient
  staffLang: 'en',
}

function load() {
  try {
    return { ...defaults, ...JSON.parse(localStorage.getItem(KEY) || '{}') }
  } catch {
    return { ...defaults }
  }
}

let current = load()
const subs = new Set()

export function getSettings() {
  return current
}

export function setSettings(patch) {
  const next = typeof patch === 'function' ? patch(current) : patch
  current = { ...current, ...next }
  try {
    localStorage.setItem(KEY, JSON.stringify(current))
  } catch {
    // Settings still apply for this visit.
  }
  for (const fn of subs) fn()
}

function subscribe(fn) {
  subs.add(fn)
  return () => subs.delete(fn)
}

if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === KEY) {
      current = load()
      for (const fn of subs) fn()
    }
  })
}

export function useSettings() {
  const s = useSyncExternalStore(subscribe, getSettings)
  return [s, setSettings]
}

// Assisted mode makes text one step bigger.
export function effectiveTextSize(s) {
  return Math.min(2, s.textSize + (s.assisted ? 1 : 0))
}

// ---- Registration draft (survives Back and page reloads) --------------------

const DRAFT = 'opd-saathi-draft'

export function loadDraft() {
  try {
    return JSON.parse(localStorage.getItem(DRAFT) || 'null') || { step: 0 }
  } catch {
    return { step: 0 }
  }
}

export function saveDraft(d) {
  try {
    localStorage.setItem(DRAFT, JSON.stringify(d))
  } catch {
    // ignore
  }
}

export function clearDraft() {
  try {
    localStorage.removeItem(DRAFT)
  } catch {
    // ignore
  }
}
