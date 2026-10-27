import { useCallback, useMemo } from 'react'
import { translate } from './translate.js'
import { useSettings } from '../lib/settings.js'

export { translate, plural, pick, dictionaries, LANGS } from './translate.js'

export function useI18n(override) {
  const [s] = useSettings()
  const lang = override || s.lang || 'en'
  const t = useCallback((key, vars) => translate(lang, key, vars), [lang])
  return useMemo(() => ({ t, lang }), [t, lang])
}
