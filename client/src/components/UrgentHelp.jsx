import { useState } from 'react'
import { Modal, Button, Notice, RowGroup, ActionRow } from './ui.jsx'
import { PlacePicker } from './Route.jsx'
import { useI18n } from '../i18n/index.js'
import { useSettings } from '../lib/settings.js'
import { useHospital } from '../lib/store.js'
import { raiseFlag } from '../lib/actions.js'
import { followMoves } from '../lib/queue.js'
import { startPlaces } from '../data/hospital.js'
import { nameFor } from '../lib/mine.js'

// "Get help": one tap sends a staff member to the patient. It never asks the
// person to wait or to register first, and Emergency is always right there.
export default function UrgentHelp({ open, onClose }) {
  const { t, lang } = useI18n()
  const [settings, setSettings] = useSettings()
  const state = useHospital()
  const [flagId, setFlagId] = useState(null)
  const [sending, setSending] = useState(false)
  const [failed, setFailed] = useState(false)
  const flag = flagId ? state.flags.find((f) => f.id === flagId) : null
  const me = settings.me && state.patients[settings.me] ? followMoves(state, state.patients[settings.me]) : null

  const send = async () => {
    setSending(true)
    setFailed(false)
    let id = null
    try {
      id = await raiseFlag({
        pid: me?.id || null,
        token: me && ['waiting', 'called'].includes(me.status) ? me.token : '',
        name: me ? nameFor(state, me, 'en') : '',
        where: settings.here,
        lang,
        by: settings.assisted ? 'helper' : 'patient',
      })
    } catch {
      setFailed(true)
    }
    setSending(false)
    setFlagId(id)
  }

  const close = () => {
    onClose()
    if (flag?.seen) setFlagId(null)
  }

  return (
    <Modal open={open} onClose={close} title={t('urgent.title')}>
      <div className="space-y-4">
        {!flag ? (
          <>
            <p>{t('urgent.body')}</p>
            <PlacePicker id="urgent-where" label={t('urgent.where')} value={settings.here} onChange={(v) => setSettings({ here: v })} places={startPlaces} />
            <Button variant="danger" size="lg" icon="hand" onClick={send} disabled={sending} className="w-full">
              {t('urgent.send')}
            </Button>
            {failed && <Notice kind="danger" title={t('urgent.failed')} live />}
          </>
        ) : flag.seen ? (
          <Notice kind="ok" title={t('urgent.seenTitle')} live>
            {t('urgent.seenBody')}
          </Notice>
        ) : (
          <Notice kind="warn" icon="bell" title={t('urgent.sentTitle')} live>
            {t('urgent.sentBody')}
          </Notice>
        )}
        <p className="text-sm font-semibold text-ink-2">{t('urgent.emergencyNow')}</p>
        <RowGroup>
          <ActionRow to="/emergency" icon="emergency" tone="danger" title={t('urgent.showEmergency')} sub={t('home.emergencySub')} />
          <ActionRow href="tel:112" icon="phone" title={t('emergency.call112')} sub={t('urgent.call112Sub')} />
          <ActionRow href="tel:108" icon="ambulance" title={t('emergency.call108')} sub={t('urgent.call108Sub')} />
        </RowGroup>
      </div>
    </Modal>
  )
}
