import { useState } from 'react'
import { useI18n } from '../i18n/index.js'
import { useTelegramBot, turnUrl, telegramUrl, whatsappUrl } from '../lib/share.js'
import { Button, Modal, RowGroup, ActionRow } from './ui.jsx'

// "Send to family": the phone's own share menu (WhatsApp, SMS, …), or a few
// choices where there is none. The link shows the token's place in the line,
// never the patient's name. With the hospital's Telegram bot, a second link
// sends the alerts to the relative's Telegram.
export default function ShareTurn({ p, className = '' }) {
  const { t } = useI18n()
  const bot = useTelegramBot()
  const [open, setOpen] = useState(false)
  const [copied, setCopied] = useState(false)
  const tg = bot ? telegramUrl(bot, p.token) : null
  const text = [t('share.text', { token: p.token, dept: t(`depts.${p.dept}.name`), url: turnUrl(p.token) }), tg && t('share.telegramLine', { url: tg })]
    .filter(Boolean)
    .join('\n')

  const share = async () => {
    if (navigator.share) {
      try {
        await navigator.share({ title: t('share.title'), text })
        return
      } catch (err) {
        if (err.name === 'AbortError') return
      }
    }
    setCopied(false)
    setOpen(true)
  }

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }

  return (
    <>
      <Button variant="secondary" icon="share" className={`w-full ${className}`} onClick={share}>
        {t('share.button')}
      </Button>
      <Modal open={open} onClose={() => setOpen(false)} title={t('share.title')}>
        <div className="space-y-3">
          <p>{t('share.sub')}</p>
          <RowGroup>
            <ActionRow href={whatsappUrl(text)} newTab icon="sms" title={t('share.whatsapp')} />
            {tg && <ActionRow href={tg} newTab icon="bell" title={t('share.telegram')} sub={t('share.telegramSub')} />}
            <ActionRow onClick={copy} icon={copied ? 'check' : 'slip'} title={copied ? t('share.copied') : t('share.copy')} trailing={false} />
          </RowGroup>
        </div>
      </Modal>
    </>
  )
}
