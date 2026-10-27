import { useState } from 'react'
import { Button } from './ui.jsx'
import { canListen, listenOnce } from '../lib/speech.js'
import { useI18n } from '../i18n/index.js'

// Big "Speak" button for text questions. Hidden where the browser cannot
// listen.
export default function MicButton({ onText }) {
  const { t, lang } = useI18n()
  const [state, setState] = useState('idle') // idle | listening | error
  if (!canListen) return null
  const start = async () => {
    setState('listening')
    try {
      const text = await listenOnce(lang)
      onText(text)
      setState('idle')
    } catch {
      setState('error')
    }
  }
  return (
    <div>
      <Button variant="soft" icon="mic" onClick={start} disabled={state === 'listening'} className="w-full">
        {state === 'listening' ? t('mic.listening') : t('mic.speak')}
      </Button>
      <p className="mt-1 text-sm text-ink-2" role="status">
        {state === 'error' ? t('mic.error') : state === 'listening' ? t('mic.hint') : ''}
      </p>
    </div>
  )
}
