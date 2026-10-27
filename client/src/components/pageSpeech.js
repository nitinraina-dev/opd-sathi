import { createContext, useContext, useEffect } from 'react'

// Each patient screen tells the layout what "Listen" should read out, and
// can take over the top bar's Back button (a step-by-step form goes back one
// step instead of leaving the form).
export const SpeechCtx = createContext({ setText: () => {}, openHelp: () => {}, setBack: () => {} })

export function usePageSpeech(text) {
  const { setText } = useContext(SpeechCtx)
  useEffect(() => {
    // undefined means "a child screen sets the text", so leave it alone.
    if (text !== undefined) setText(text || '')
  }, [text, setText])
}

export function useOpenHelp() {
  return useContext(SpeechCtx).openHelp
}

// onBack: a function, or null to use the normal Back.
export function usePageBack(onBack) {
  const { setBack } = useContext(SpeechCtx)
  useEffect(() => {
    setBack(() => onBack)
    return () => setBack(() => null)
  }, [onBack, setBack])
}
