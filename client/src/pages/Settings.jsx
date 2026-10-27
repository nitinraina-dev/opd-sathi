import { useState } from 'react'
import { useI18n, translate, LANGS } from '../i18n/index.js'
import { useSettings } from '../lib/settings.js'
import { usePageSpeech } from '../components/pageSpeech.js'
import { Button, PageTitle, Toggle, Notice, Segmented, RowGroup } from '../components/ui.jsx'

export default function Settings() {
  const { t } = useI18n()
  const [s, set] = useSettings()
  const [perm, setPerm] = useState(() => (typeof Notification === 'undefined' ? 'unsupported' : Notification.permission))
  usePageSpeech([t('settings.title'), t('settings.language'), t('settings.textSize'), t('settings.contrast'), t('settings.readAloud'), t('settings.avoidStairs')].join('. '))

  return (
    <div className="mx-auto max-w-xl space-y-6">
      <PageTitle>{t('settings.title')}</PageTitle>

      <Segmented
        label={t('settings.language')}
        value={s.lang}
        onChange={(l) => set({ lang: l })}
        options={LANGS.map((l) => ({ value: l, label: translate(l, 'lang.self'), lang: l }))}
      />
      <Segmented
        label={t('settings.textSize')}
        value={s.textSize}
        onChange={(n) => set({ textSize: n })}
        options={[0, 1, 2].map((n) => ({ value: n, label: t(`settings.size${n}`) }))}
      />

      <section>
        <h2 className="mb-1.5 text-sm font-semibold text-ink-2">{t('settings.other')}</h2>
        <RowGroup>
          <Toggle bare icon="contrast" label={t('settings.contrast')} hint={t('settings.contrastHint')} checked={s.contrast} onChange={(v) => set({ contrast: v })} />
          <Toggle bare icon="speaker" label={t('settings.readAloud')} hint={t('settings.readAloudHint')} checked={s.readAloud} onChange={(v) => set({ readAloud: v })} />
          <Toggle
            bare
            icon="wheelchair"
            label={t('settings.avoidStairs')}
            hint={t('settings.avoidStairsHint')}
            checked={s.avoidStairs}
            onChange={(v) => set({ avoidStairs: v })}
          />
          <Toggle
            bare
            icon="hand"
            label={t('reg.helper')}
            hint={t('reg.helperHint')}
            checked={s.assisted}
            onChange={(v) => set((cur) => ({ assisted: v, avoidStairs: v ? true : cur.avoidStairs }))}
          />
        </RowGroup>
      </section>

      <section className="space-y-2">
        <h2 className="text-sm font-semibold text-ink-2">{t('settings.alerts')}</h2>
        {perm === 'granted' && <Notice kind="ok">{t('settings.alertsOn')}</Notice>}
        {perm === 'denied' && <Notice kind="warn">{t('settings.alertsBlocked')}</Notice>}
        {perm === 'unsupported' && <Notice kind="info">{t('settings.alertsUnsupported')}</Notice>}
        {perm === 'default' && (
          <Button variant="secondary" icon="bell" className="w-full" onClick={() => Notification.requestPermission().then(setPerm)}>
            {t('turn.allowAlerts')}
          </Button>
        )}
      </section>

      {s.me && (
        <Button variant="ghost" icon="close" className="w-full" onClick={() => set({ me: null })}>
          {t('settings.forget')}
        </Button>
      )}
    </div>
  )
}
