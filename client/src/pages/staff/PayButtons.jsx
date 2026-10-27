import { payCash, decideWaiver } from '../../lib/actions.js'
import { billSummary, freeCheckKind, rupees } from '../../lib/billing.js'
import { Button } from '../../components/ui.jsx'

// Take cash, or confirm (or not) free care: a card, an age, or pregnancy care.
// Free care claimed on a phone counts only once staff have looked.
export default function PayButtons({ p, t, allowed }) {
  const b = billSummary(p)
  if (b.state === 'cardCheck') {
    const kind = freeCheckKind(p.waiver?.card)
    return (
      <>
        <Button variant="soft" icon="check" disabled={!allowed('decideWaiver')} onClick={() => decideWaiver(p.id, true)}>
          {kind === 'card' ? t('staff.cardOk') : t(`staff.freeOk.${kind}`)}
        </Button>
        <Button variant="secondary" className="text-base" icon="close" disabled={!allowed('decideWaiver')} onClick={() => decideWaiver(p.id, false)}>
          {kind === 'card' ? t('staff.cardNo') : t(`staff.freeNo.${kind}`)}
        </Button>
      </>
    )
  }
  if (b.due > 0)
    return (
      <Button variant="secondary" className="text-base" icon="rupee" disabled={!allowed('payBill')} onClick={() => payCash(p.id)}>
        {t('staff.cashReceived', { amount: rupees(b.due) })}
      </Button>
    )
  return null
}
