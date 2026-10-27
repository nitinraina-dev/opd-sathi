import Icon from './Icon.jsx'
import { billText } from './Payment.jsx'

const look = {
  paid: ['check', 'border-ok bg-ok-soft'],
  free: ['check', 'border-brand bg-brand-soft'],
  due: ['rupee', 'border-warn bg-warn-soft'],
  cardCheck: ['badge', 'border-warn bg-warn-soft'],
}

// Payment state with an icon and words, never colour alone.
export default function BillChip({ bill, t }) {
  if (!bill || bill.state === 'none') return null
  const [icon, cls] = look[bill.state]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border-2 px-2 text-base font-semibold ${cls}`}>
      <Icon name={icon} size={18} />
      {billText(bill, t)}
    </span>
  )
}
