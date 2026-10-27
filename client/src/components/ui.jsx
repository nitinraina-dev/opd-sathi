import { createContext, useContext, useEffect, useId, useRef } from 'react'
import { Link } from 'react-router'
import Icon from './Icon.jsx'
import { useI18n } from '../i18n/index.js'

// Shared building blocks. Calm by default: white surfaces with a hairline,
// one solid green button per screen, red only for Emergency.

const base =
  'inline-flex flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-xl px-4 font-semibold text-center leading-tight ' +
  'transition-transform active:scale-[.98] disabled:opacity-45 disabled:cursor-not-allowed select-none'

const sizes = {
  sm: 'min-h-10 text-sm px-3',
  md: 'min-h-12 text-base',
  lg: 'min-h-14 text-lg',
}

// Staff screens: a button keeps its words on one line and is a little
// smaller, and a full row moves whole buttons to the next line instead.
// (On a phone, words may still wrap so nothing is cut off.)
const Dense = createContext(false)
export const DenseButtons = ({ children }) => <Dense.Provider value>{children}</Dense.Provider>
const denseBase =
  'inline-flex max-sm:flex-wrap items-center justify-center gap-x-2 gap-y-0.5 rounded-xl px-3.5 font-semibold text-center leading-tight ' +
  'transition-transform active:scale-[.98] disabled:opacity-45 disabled:cursor-not-allowed select-none'
const denseSizes = {
  sm: 'min-h-9 text-sm px-2.5',
  md: 'min-h-11 text-base',
  lg: 'min-h-12 text-lg',
}
const label = (dense) => (dense ? 'min-w-0 max-sm:break-words sm:whitespace-nowrap' : 'min-w-0 break-words')

const variants = {
  primary: 'bg-brand text-brand-ink hover:brightness-110',
  secondary: 'bg-card text-ink border border-line hover:border-ink/40',
  soft: 'bg-brand-soft text-brand hover:brightness-95',
  danger: 'bg-danger text-danger-ink hover:brightness-110',
  dangerOutline: 'bg-card text-danger border border-danger/50 hover:bg-danger-soft',
  ok: 'bg-ok text-ok-ink hover:brightness-110',
  ghost: 'text-brand hover:bg-brand-soft',
}

// Arrows that mean "go on" sit after the word; other icons before it.
export function Button({ variant = 'primary', size = 'md', icon, iconSize, className = '', children, ...rest }) {
  const dense = useContext(Dense)
  const after = icon === 'next'
  const is = iconSize ?? (dense ? 20 : 22)
  return (
    <button type="button" className={`${dense ? denseBase : base} ${(dense ? denseSizes : sizes)[size]} ${variants[variant]} ${className}`} {...rest}>
      {icon && !after && <Icon name={icon} size={is} />}
      <span className={label(dense)}>{children}</span>
      {after && <Icon name={icon} size={is} />}
    </button>
  )
}

export function LinkButton({ to, variant = 'primary', size = 'md', icon, iconSize, className = '', children, ...rest }) {
  const dense = useContext(Dense)
  return (
    <Link to={to} className={`${dense ? denseBase : base} ${(dense ? denseSizes : sizes)[size]} ${variants[variant]} no-underline ${className}`} {...rest}>
      {icon && <Icon name={icon} size={iconSize ?? (dense ? 20 : 22)} />}
      <span className={label(dense)}>{children}</span>
    </Link>
  )
}

// A group of rows (like a phone's settings list).
export function RowGroup({ children, className = '', label }) {
  return (
    <div role={label ? 'group' : undefined} aria-label={label} className={`overflow-hidden rounded-2xl border border-line bg-card divide-y divide-line ${className}`}>
      {children}
    </div>
  )
}

const rowTone = {
  default: 'bg-brand-soft text-brand',
  primary: 'bg-brand text-brand-ink',
  danger: 'bg-danger text-danger-ink',
}

// A big tappable row: icon, a word, a short line saying what it does.
// newTab: for links to other sites (WhatsApp, Telegram).
export function ActionRow({ to, href, onClick, icon, title, sub, tone = 'default', trailing, lang, newTab = false }) {
  const inner = (
    <>
      <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl ${rowTone[tone]}`}>
        <Icon name={icon} size={24} />
      </span>
      <span className="min-w-0 flex-1">
        <span lang={lang} className={`block text-lg font-semibold leading-snug ${tone === 'danger' ? 'text-danger' : ''}`}>
          {title}
        </span>
        {sub && <span className="block text-sm leading-snug text-ink-2">{sub}</span>}
      </span>
      {trailing ?? <Icon name="next" size={20} className="text-ink-2" />}
    </>
  )
  const cls = 'flex w-full min-h-16 items-center gap-3 px-4 py-3 text-left no-underline text-ink hover:bg-page'
  if (to) return <Link to={to} className={cls}>{inner}</Link>
  if (href)
    return (
      <a href={href} className={cls} {...(newTab ? { target: '_blank', rel: 'noopener noreferrer' } : {})}>
        {inner}
      </a>
    )
  return (
    <button type="button" onClick={onClick} className={cls}>
      {inner}
    </button>
  )
}

// On/off switch. The state is written out too, not shown by colour alone.
// bare: for use inside a RowGroup.
export function Toggle({ checked, onChange, label, hint, icon, bare = false }) {
  const { t } = useI18n()
  const id = useId()
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-describedby={hint ? `${id}-hint` : undefined}
      onClick={() => onChange(!checked)}
      className={`flex w-full items-center gap-3 px-4 py-3 min-h-14 text-left ${bare ? 'hover:bg-page' : 'rounded-2xl border border-line bg-card hover:border-ink/30'}`}
    >
      {icon && <Icon name={icon} size={22} className="text-ink-2" />}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug">{label}</span>
        {hint && (
          <span id={`${id}-hint`} className="block text-sm leading-snug text-ink-2">
            {hint}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-2">
        <span className="text-sm font-semibold text-ink-2">{checked ? t('common.on') : t('common.off')}</span>
        <span aria-hidden="true" className={`relative inline-block h-7 w-12 rounded-full transition-colors ${checked ? 'bg-brand' : 'bg-line'}`}>
          <span className={`absolute top-1 h-5 w-5 rounded-full bg-card shadow transition-[left] ${checked ? 'left-6' : 'left-1'}`} />
        </span>
      </span>
    </button>
  )
}

export function Card({ className = '', children, ...rest }) {
  return (
    <div className={`rounded-2xl border border-line bg-card p-4 ${className}`} {...rest}>
      {children}
    </div>
  )
}

const noteStyles = {
  info: 'bg-brand-soft border-brand',
  warn: 'bg-warn-soft border-warn',
  danger: 'bg-danger-soft border-danger',
  ok: 'bg-ok-soft border-ok',
}
const noteIcons = { info: 'info', warn: 'alert', danger: 'emergency', ok: 'check' }
const noteIconColor = { info: 'text-brand', warn: 'text-ink', danger: 'text-danger', ok: 'text-ok' }

export function Notice({ kind = 'info', icon, title, children, className = '', live }) {
  return (
    <div className={`flex gap-3 rounded-xl border-l-4 p-3 ${noteStyles[kind]} ${className}`} role={live ? 'status' : undefined}>
      <Icon name={icon || noteIcons[kind]} size={22} className={`mt-0.5 ${noteIconColor[kind]}`} />
      <div className="min-w-0 flex-1">
        {title && <p className="font-semibold leading-snug">{title}</p>}
        {children && <div className="text-sm leading-snug">{children}</div>}
      </div>
    </div>
  )
}

// One-line explanation of a word like OPD, token or Casualty. Shown the first
// time the word appears on this phone, then it stays out of the way.
const SEEN = 'opd-saathi-terms-seen'
function seenTerms() {
  try {
    return JSON.parse(localStorage.getItem(SEEN) || '[]')
  } catch {
    return []
  }
}
export function TermNote({ term, className = '', always = false }) {
  const { t } = useI18n()
  const firstTime = useRef(!seenTerms().includes(term))
  useEffect(
    () => () => {
      // Remember it when leaving the screen, so it stays while the person reads.
      if (firstTime.current) {
        try {
          localStorage.setItem(SEEN, JSON.stringify([...new Set([...seenTerms(), term])]))
        } catch {
          // ignore
        }
      }
    },
    [term],
  )
  if (!always && !firstTime.current) return null
  return (
    <p className={`flex items-start gap-2 text-sm leading-snug text-ink-2 ${className}`}>
      <Icon name="info" size={18} className="mt-0.5 shrink-0" />
      <span>{t(`terms.${term}`)}</span>
    </p>
  )
}

export function PageTitle({ children, sub, icon, id }) {
  const ref = useRef(null)
  useEffect(() => {
    // Move focus to the heading so screen readers announce the new screen.
    ref.current?.focus({ preventScroll: true })
  }, [])
  return (
    <div className="mb-4">
      <h1 id={id} ref={ref} tabIndex={-1} className="flex items-center gap-2 text-2xl font-bold leading-tight outline-none">
        {icon && <Icon name={icon} size={28} className="shrink-0 text-brand" />}
        <span className="min-w-0 break-words">{children}</span>
      </h1>
      {sub && <p className="mt-1 text-base leading-snug text-ink-2">{sub}</p>}
    </div>
  )
}

export function Progress({ step, total }) {
  const { t } = useI18n()
  return (
    <div className="mb-4">
      <div
        role="progressbar"
        aria-valuemin={1}
        aria-valuemax={total}
        aria-valuenow={step}
        aria-label={t('reg.stepOf', { n: step, total })}
        className="h-1.5 w-full overflow-hidden rounded-full bg-line"
      >
        <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${(step / total) * 100}%` }} />
      </div>
      <p className="mt-1.5 text-sm font-semibold text-ink-2">{t('reg.stepOf', { n: step, total })}</p>
    </div>
  )
}

// A selectable row (radio). The chosen one gets a filled dot, not just colour.
export function Choice({ selected, onSelect, icon, title, sub }) {
  const { t } = useI18n()
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onSelect}
      className={`flex w-full items-center gap-3 rounded-xl border bg-card p-3 min-h-14 text-left transition-colors ${
        selected ? 'border-brand ring-1 ring-brand bg-brand-soft' : 'border-line hover:border-ink/30'
      }`}
    >
      {icon && (
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-lg ${selected ? 'bg-brand text-brand-ink' : 'bg-page text-ink'}`}>
          <Icon name={icon} size={24} />
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block font-semibold leading-snug">{title}</span>
        {sub && <span className="block text-sm leading-snug text-ink-2">{sub}</span>}
      </span>
      <span aria-hidden="true" className={`grid h-6 w-6 shrink-0 place-items-center rounded-full border-2 ${selected ? 'border-brand' : 'border-ink/30'}`}>
        {selected && <span className="h-3 w-3 rounded-full bg-brand" />}
      </span>
      {selected && <span className="sr-only">{t('common.selected')}</span>}
    </button>
  )
}

// Two or three options side by side (language, text size).
export function Segmented({ label, value, onChange, options }) {
  const id = useId()
  return (
    <div>
      {label && (
        <p id={id} className="mb-1.5 text-sm font-semibold text-ink-2">
          {label}
        </p>
      )}
      <div role="radiogroup" aria-labelledby={label ? id : undefined} className="flex rounded-xl bg-page p-1">
        {options.map((o) => (
          <button
            key={o.value}
            type="button"
            role="radio"
            aria-checked={value === o.value}
            lang={o.lang}
            onClick={() => onChange(o.value)}
            className={`flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-lg px-2 font-semibold ${
              value === o.value ? 'bg-card text-ink shadow-sm ring-1 ring-line' : 'text-ink-2 hover:text-ink'
            }`}
          >
            {o.icon && <Icon name={o.icon} size={18} />}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  )
}

// Opens from the bottom on phones, centred on larger screens.
export function Modal({ open, onClose, title, children, wide = false, labelledBy }) {
  const ref = useRef(null)
  const back = useRef(null)
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  const { t } = useI18n()
  useEffect(() => {
    if (!open) return
    back.current = document.activeElement
    const el = ref.current
    const first = el?.querySelector('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])')
    first?.focus()
    const onKey = (e) => {
      if (e.key === 'Escape') closeRef.current?.()
      if (e.key === 'Tab' && el) {
        const items = [...el.querySelectorAll('button, a, input, select, textarea, [tabindex]:not([tabindex="-1"])')]
        if (!items.length) return
        const a = items[0]
        const z = items[items.length - 1]
        if (e.shiftKey && document.activeElement === a) {
          e.preventDefault()
          z.focus()
        } else if (!e.shiftKey && document.activeElement === z) {
          e.preventDefault()
          a.focus()
        }
      }
    }
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('keydown', onKey)
      back.current?.focus?.()
    }
  }, [open])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 sm:items-center print:hidden" onClick={onClose}>
      <div
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-labelledby={labelledBy || 'modal-title'}
        onClick={(e) => e.stopPropagation()}
        className={`max-h-[92dvh] w-full overflow-y-auto rounded-t-3xl bg-card px-4 pb-6 pt-2 shadow-2xl sm:rounded-3xl ${wide ? 'sm:max-w-3xl' : 'sm:max-w-lg'}`}
      >
        <div aria-hidden="true" className="mx-auto mb-2 h-1.5 w-10 rounded-full bg-line sm:hidden" />
        <div className="mb-3 flex items-center gap-2">
          {title && (
            <h2 id="modal-title" className="flex-1 text-xl font-bold leading-tight">
              {title}
            </h2>
          )}
          <Button variant="ghost" size="sm" icon="close" onClick={onClose} className="ml-auto">
            {t('common.close')}
          </Button>
        </div>
        {children}
      </div>
    </div>
  )
}

const levelIcon = { ok: 'check', busy: 'alert', over: 'stop', low: 'check', medium: 'minus', high: 'alert', veryHigh: 'stop' }
const levelBar = {
  ok: 'bg-good',
  low: 'bg-good',
  busy: 'bg-warn',
  medium: 'bg-warn',
  high: 'bg-serious',
  over: 'bg-critical',
  veryHigh: 'bg-critical',
}

// Crowding chip: colour, an icon and a word, never colour alone.
export function LevelChip({ level, label, className = '' }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full border border-line bg-card py-0.5 pl-0.5 pr-2.5 text-sm font-semibold ${className}`}>
      <span className={`grid h-6 w-6 place-items-center rounded-full ${levelBar[level]} text-black`}>
        <Icon name={levelIcon[level] || 'dot'} size={15} />
      </span>
      <span className="leading-tight">{label}</span>
    </span>
  )
}

export function Meter({ value, max, level, label }) {
  const pct = Math.min(100, (value / Math.max(1, max)) * 100)
  return (
    <div
      className="h-2.5 w-full overflow-hidden rounded-full bg-page"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
      aria-label={label}
    >
      <div className={`h-full rounded-full ${levelBar[level]}`} style={{ width: `${pct}%` }} />
    </div>
  )
}
