import { useI18n } from '../i18n/index.js'
import { roomsText } from '../lib/text.js'
import { LinkButton, Notice } from './ui.jsx'

// Where the doctor's paper slip is, for someone who registered on a phone:
// the point is that they never queue at the counter just for the paper.
export default function PaperSlipNote({ state, p }) {
  const { t } = useI18n()
  if (!p?.slip || !['booked', 'waiting', 'called'].includes(p.status)) return null
  const mode = state.slipMode || 'counter'
  const rooms = roomsText(p.dept, t)
  const st = p.slip.status
  if (st === 'given') return <Notice kind="ok" icon="slip" title={t('paper.given')} />
  if (st === 'atRoom') {
    return (
      <Notice kind="ok" icon="check" title={t('paper.atRoomTitle')} live>
        {t('paper.atRoom', { rooms })} {t('paper.noLine')}
      </Notice>
    )
  }
  if (p.status === 'called' && mode !== 'window') return <Notice kind="info" icon="slip" title={t('paper.called')} />
  return (
    <Notice kind="info" icon="slip" title={t('paper.title')}>
      {st === 'printed' ? t('paper.printed', { rooms }) : t(`paper.due.${mode}`, { rooms })} {mode !== 'window' && t('paper.noLine')}
      {mode === 'window' && (
        <LinkButton to="/find?to=g_reg" variant="secondary" icon="map" className="mt-2 w-full">
          {t('paper.way')}
        </LinkButton>
      )}
    </Notice>
  )
}
