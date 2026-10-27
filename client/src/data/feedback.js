// "How was your visit?" after the doctor: three faces, and, when it was not
// good, what went wrong. Asked on the phone, by SMS (reply 1, 2 or 3) and on
// Telegram. Counts only; nothing about health.

export const SCORES = ['good', 'okay', 'bad']
export const SCORE_ICON = { good: 'faceGood', okay: 'faceOkay', bad: 'faceBad' }
// SMS and Telegram: "1" good, "2" okay, "3" bad.
export const SCORE_BY_DIGIT = { 1: 'good', 2: 'okay', 3: 'bad' }
export const REASONS = ['wait', 'find', 'staff', 'clean', 'money']
