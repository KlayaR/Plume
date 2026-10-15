// How heavy actions say what they cost: tokens, and (once Plume has learned
// it, experimental) the share of your 5-hour window.
import { loadRate } from './store'
import { shareOf } from './lib/windowCost'
import { numLocale, t } from './i18n'

export function costText(tokens: number): string {
  const n = Math.round(tokens).toLocaleString(numLocale())
  const share = shareOf(loadRate(), tokens)
  if (share === null) return t('about {n} tokens', { n })
  const p = share < 0.01 ? '<1' : String(Math.round(share * 100))
  return t('about {n} tokens, about {p} % of your 5-hour window', { n, p })
}
