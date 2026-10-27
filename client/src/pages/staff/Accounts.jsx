import { useEffect, useState } from 'react'
import { useStaffUser, accounts, changePassword, makePassword } from '../../lib/auth.js'
import { ROLES, can } from '../../lib/permissions.js'
import { Button, Card, Notice } from '../../components/ui.jsx'
import Icon from '../../components/Icon.jsx'
import ScreenGuide from '../../components/ScreenGuide.jsx'
import { useStaffI18n } from './StaffLayout.jsx'

const input = 'w-full rounded-xl border border-line bg-card px-3 min-h-12 text-lg'

function Field({ id, label, children, hint }) {
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-lg font-semibold">
        {label}
      </label>
      {children}
      {hint && <p className="mt-1 text-base text-ink-2">{hint}</p>}
    </div>
  )
}

function MyPassword({ t }) {
  const [f, setF] = useState({ current: '', next: '', again: '' })
  const [msg, setMsg] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    if (f.next !== f.again) return setMsg({ kind: 'danger', text: t('accounts.mismatch') })
    try {
      await changePassword(f.current, f.next)
      setF({ current: '', next: '', again: '' })
      setMsg({ kind: 'ok', text: t('accounts.changed') })
    } catch (err) {
      setMsg({ kind: 'danger', text: err.message })
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-3" noValidate>
      <Field id="pw-current" label={t('accounts.current')}>
        <input id="pw-current" type="password" autoComplete="current-password" className={input} value={f.current} onChange={(e) => setF({ ...f, current: e.target.value })} />
      </Field>
      <Field id="pw-next" label={t('accounts.newPassword')} hint={t('accounts.rule')}>
        <input id="pw-next" type="password" autoComplete="new-password" className={input} value={f.next} onChange={(e) => setF({ ...f, next: e.target.value })} />
      </Field>
      <Field id="pw-again" label={t('accounts.again')}>
        <input id="pw-again" type="password" autoComplete="new-password" className={input} value={f.again} onChange={(e) => setF({ ...f, again: e.target.value })} />
      </Field>
      <div className="sm:col-span-3 space-y-2">
        <Button type="submit" icon="check" disabled={!f.current || !f.next}>
          {t('accounts.change')}
        </Button>
        {msg && (
          <Notice kind={msg.kind} live>
            {msg.text}
          </Notice>
        )}
      </div>
    </form>
  )
}

function Row({ u, me, t, onChange }) {
  const [reset, setReset] = useState('')
  const [err, setErr] = useState('')
  const run = async (fn) => {
    setErr('')
    try {
      await fn()
      onChange()
    } catch (e) {
      setErr(e.message)
    }
  }
  return (
    <li className="space-y-2 rounded-2xl border border-line bg-card p-3">
      <p className="flex flex-wrap items-center gap-x-3">
        <span className="font-mono text-lg font-bold">{u.username}</span>
        <span className="text-lg">{u.name}</span>
        {u.username === me.username && <span className="rounded-full bg-brand-soft px-2 text-base">{t('accounts.you')}</span>}
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label htmlFor={`role-${u.username}`} className="block text-base font-semibold">
            {t('accounts.role')}
          </label>
          <select
            id={`role-${u.username}`}
            value={u.role}
            onChange={(e) => run(() => accounts.update(u.username, { role: e.target.value }))}
            className="min-h-12 rounded-xl border border-line bg-card px-2 text-lg"
          >
            {ROLES.map((r) => (
              <option key={r} value={r}>
                {t(`roles.${r}`)}
              </option>
            ))}
          </select>
        </div>
        <div className="min-w-[min(100%,16rem)] flex-1">
          <label htmlFor={`reset-${u.username}`} className="block text-base font-semibold">
            {t('accounts.setPassword')}
          </label>
          <div className="flex gap-2">
            <input id={`reset-${u.username}`} value={reset} onChange={(e) => setReset(e.target.value)} className={input} autoComplete="new-password" />
            <Button variant="secondary" icon="refresh" onClick={() => setReset(makePassword())}>
              {t('accounts.make')}
            </Button>
          </div>
        </div>
        <Button
          variant="secondary"
          icon="check"
          disabled={reset.length < 8}
          onClick={() =>
            run(async () => {
              await accounts.update(u.username, { password: reset })
              setErr(t('accounts.passwordSet', { password: reset }))
              setReset('')
            })
          }
        >
          {t('common.save')}
        </Button>
        {u.username !== me.username && (
          <Button variant="dangerOutline" icon="close" onClick={() => run(() => accounts.remove(u.username))}>
            {t('accounts.remove')}
          </Button>
        )}
      </div>
      {err && (
        <p role="status" className="text-base font-semibold">
          {err}
        </p>
      )}
    </li>
  )
}

function AddAccount({ t, onAdded }) {
  const empty = { username: '', name: '', role: 'nurse', password: makePassword() }
  const [f, setF] = useState(empty)
  const [msg, setMsg] = useState(null)
  const submit = async (e) => {
    e.preventDefault()
    try {
      await accounts.create({ ...f, username: f.username.trim().toLowerCase() })
      setMsg({ kind: 'ok', text: t('accounts.added', { username: f.username, password: f.password }) })
      setF({ ...empty, password: makePassword() })
      onAdded()
    } catch (err) {
      setMsg({ kind: 'danger', text: err.message })
    }
  }
  return (
    <form onSubmit={submit} className="grid gap-3 sm:grid-cols-2" noValidate>
      <Field id="add-user" label={t('login.username')} hint={t('accounts.usernameRule')}>
        <input id="add-user" className={input} value={f.username} onChange={(e) => setF({ ...f, username: e.target.value })} autoCapitalize="none" spellCheck={false} />
      </Field>
      <Field id="add-name" label={t('accounts.name')}>
        <input id="add-name" className={input} value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} />
      </Field>
      <Field id="add-role" label={t('accounts.role')} hint={t(`roles.${f.role}Hint`)}>
        <select id="add-role" className={input} value={f.role} onChange={(e) => setF({ ...f, role: e.target.value })}>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {t(`roles.${r}`)}
            </option>
          ))}
        </select>
      </Field>
      <Field id="add-pass" label={t('login.password')} hint={t('accounts.rule')}>
        <input id="add-pass" className={input} value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} autoComplete="new-password" />
      </Field>
      <div className="space-y-2 sm:col-span-2">
        <Button type="submit" icon="plus" disabled={!f.username || f.password.length < 8}>
          {t('accounts.add')}
        </Button>
        {msg && (
          <Notice kind={msg.kind} live>
            {msg.text}
          </Notice>
        )}
      </div>
    </form>
  )
}

export default function Accounts() {
  const { t } = useStaffI18n()
  const me = useStaffUser()
  const [list, setList] = useState([])
  const admin = can(me, 'accounts')
  const reload = () =>
    accounts
      .list()
      .then(setList)
      .catch(() => {})
  useEffect(() => {
    if (admin) reload()
  }, [admin])

  if (!me) return <Notice kind="info">{t('accounts.offline')}</Notice>

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <h1 className="flex items-center gap-2 text-2xl font-bold">
        <Icon name="badge" size={34} />
        {admin ? t('accounts.title') : t('accounts.mine')}
      </h1>
      {admin && <ScreenGuide id="accounts" items={['add', 'reset', 'roles']} t={t} />}
      <Card className="space-y-3">
        <h2 className="text-lg font-semibold">{t('accounts.mine')}</h2>
        <p className="text-lg">
          {me.name} · <span className="font-mono">{me.username}</span> · {t(`roles.${me.role}`)}
        </p>
        <MyPassword t={t} />
      </Card>
      {admin && (
        <>
          <Card className="space-y-3">
            <h2 className="text-lg font-semibold">{t('accounts.all')}</h2>
            <p className="text-base text-ink-2">{t('accounts.rolesKey')}</p>
            <ul className="space-y-2">
              {list.map((u) => (
                <Row key={u.username} u={u} me={me} t={t} onChange={reload} />
              ))}
            </ul>
          </Card>
          <Card className="space-y-3">
            <h2 className="text-lg font-semibold">{t('accounts.add')}</h2>
            <AddAccount t={t} onAdded={reload} />
          </Card>
        </>
      )}
    </div>
  )
}
