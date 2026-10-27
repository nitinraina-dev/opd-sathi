import { useI18n } from '../i18n/index.js'
import { Card, LinkButton, TermNote } from './ui.jsx'
import Icon from './Icon.jsx'

// The patient's own PM-JAY claim, in plain words. `claim` comes from their own
// record (only their phone and staff have it). Nothing here asks them to pay.
export default function ClaimCard({ claim }) {
  const { t } = useI18n()
  if (!claim) return null
  const pkg = t(`pmjay.packages.${claim.pkg}`)
  const tone = claim.view === 'notApproved' ? 'border-l-warn' : 'border-l-brand'
  return (
    <Card className={`space-y-3 border-l-4 ${tone}`}>
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Icon name="shield" size={22} className="text-brand" />
        {t('pmjay.title')}
      </h2>
      <p>{t(`pmjay.patient.${claim.view}`, { pkg })}</p>
      {claim.view === 'notApproved' && (
        <LinkButton to="/find?to=g_help" variant="soft" icon="map" className="w-full">
          {t('pmjay.patient.findDesk')}
        </LinkButton>
      )}
      <TermNote term="pmjay" />
    </Card>
  )
}
