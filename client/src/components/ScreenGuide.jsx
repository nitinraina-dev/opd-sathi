import { useState } from 'react'
import Icon from './Icon.jsx'

// "How to use this screen" on staff screens: what to press for each everyday
// job, in a few lines. Open the first time; once someone folds it away, this
// computer remembers. Jobs, not an order to follow, so a plain list.
const KEY = 'opd-saathi-guides-closed'

function closed() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '[]')
  } catch {
    return []
  }
}

function remember(id, open) {
  const next = closed().filter((x) => x !== id)
  if (!open) next.push(id)
  try {
    localStorage.setItem(KEY, JSON.stringify(next))
  } catch {
    // ignore
  }
}

export default function ScreenGuide({ id, items, t }) {
  const [open, setOpen] = useState(() => !closed().includes(id))
  const toggle = (v) => {
    setOpen(v)
    remember(id, v)
  }
  return (
    <details
      open={open}
      onToggle={(e) => e.currentTarget.open !== open && toggle(e.currentTarget.open)}
      className="group rounded-2xl border border-line bg-card print:hidden"
    >
      <summary className="flex min-h-12 cursor-pointer list-none items-center gap-2 rounded-2xl px-4 font-semibold hover:bg-page">
        <Icon name="question" size={20} className="text-brand" />
        <span className="flex-1">{t('guide.title')}</span>
        <Icon name="next" size={18} className="text-ink-2 transition-transform group-open:rotate-90" />
      </summary>
      <div className="px-4 pb-4">
        <ul className="grid gap-x-8 gap-y-2 lg:grid-cols-2">
          {items.map((k) => (
            <li key={k} className="flex gap-2 leading-snug">
              <Icon name="check" size={18} className="mt-0.5 text-brand" />
              <span>
                <strong className="font-semibold">{t(`guide.${id}.${k}.do`)}</strong> {t(`guide.${id}.${k}.how`)}
              </span>
            </li>
          ))}
        </ul>
        <button type="button" onClick={() => toggle(false)} className="mt-3 min-h-10 rounded-lg px-2 text-sm font-semibold text-brand hover:bg-brand-soft">
          {t('guide.hide')}
        </button>
      </div>
    </details>
  )
}
