// Bible → AI check: what would make the AI's context better, found locally
// (zero tokens), with one-click fixes.
import { useMemo, useState } from 'react'
import { useStore } from '../store'
import { typeInfo, type EntryType } from '../lib/types'
import { checkBible, type Issue } from '../lib/bibleCheck'
import { writeShort } from '../bibleAI'
import { numLocale, useT } from '../i18n'

const NAMED: EntryType[] = ['character', 'place', 'object', 'lore', 'magic', 'creature', 'event', 'faction', 'storyline', 'theme']

export default function AICheck() {
  const book = useStore(s => s.book)!
  const t = useT()
  const [busy, setBusy] = useState<string | null>(null)
  const [type, setType] = useState<EntryType>('character')
  const { issues, stats } = useMemo(() => checkBible(book), [book])
  const n = (x: number) => x.toLocaleString(numLocale())
  const name = (slug?: string) => book.entries.find(e => e.slug === slug)?.name ?? slug ?? ''
  const open = (slug?: string) => { if (slug) useStore.setState({ entrySlug: slug, bibleTab: 'entry' }) }

  const text = (i: Issue): string => {
    switch (i.kind) {
      case 'no-short': return t('{name} has no short version: the AI gets the first paragraph of the full text instead.', { name: name(i.slug) })
      case 'short-long': return t('{name}: the short version is about {n} tokens; it is sent every time the name appears.', { name: name(i.slug), n: i.n ?? 0 })
      case 'full-huge': return t('{name}: the full version is about {n} tokens, sent whole for a POV or an @-mention. Consider splitting it.', { name: name(i.slug), n: i.n ?? 0 })
      case 'no-voice': return t('{name} appears in {n} scenes but has no voice card, so the AI will make their dialogue sound like anyone’s.', { name: name(i.slug), n: i.n ?? 0 })
      case 'no-knows': return t('{name} is the POV of {n} scenes but "Knows" and "Doesn’t know" are empty, so the AI may leak what they can’t know.', { name: name(i.slug), n: i.n ?? 0 })
      case 'always-heavy': return t('The entries sent "Always" take about {n} tokens, more than half of the bible budget.', { n: i.n ?? 0 })
      case 'duplicate': return t('{a} and {b} both answer to “{name}”: the AI will only ever find the first.', { a: name(i.slug), b: name(i.other), name: i.name ?? '' })
      case 'common-alias': return t('“{name}” (an alias of {entry}) is short and lower-case: it will match ordinary words. End it with ! to match exact capitals.', { name: i.name ?? '', entry: name(i.slug) })
      case 'unlinked': return t('{a} and {b} appear together in {n} scenes but aren’t linked: linking sends one along with the other.', { a: name(i.slug), b: name(i.other), n: i.n ?? 0 })
      case 'unknown-name': return t('“{name}” appears {n} times in the text but isn’t in the bible.', { name: i.name ?? '', n: i.n ?? 0 })
      case 'unused': return t('{name} is never mentioned in the text.', { name: name(i.slug) })
    }
  }

  const rewrite = async (slug: string): Promise<boolean> => {
    const e = useStore.getState().book!.entries.find(x => x.slug === slug)
    if (!e) return false
    setBusy(slug)
    try {
      useStore.getState().updateEntry(slug, { short: await writeShort(useStore.getState().book!, e) })
      setBusy(null)
      return true
    } catch (err) {
      useStore.getState().notify('error', (err as Error).message)
      setBusy(null)
      return false
    }
  }
  const missing = issues.filter(i => i.kind === 'no-short')
  const fillAll = async () => { for (const i of missing) if (!(await rewrite(i.slug!))) break }
  const link = (a?: string, b?: string) => {
    if (!a || !b) return
    const st = useStore.getState()
    st.updateEntry(a, { links: [...(st.book!.entries.find(e => e.slug === a)?.links ?? []), b] })
  }

  const warns = issues.filter(i => i.severity === 'warn')
  const infos = issues.filter(i => i.severity === 'info')
  const row = (i: Issue, k: number) => (
    <div key={`${i.kind}${k}`} className={`pl-aicheck-row ${i.severity === 'warn' ? 'pl-warn' : ''}`}>
      <span className="pl-grow">{text(i)}</span>
      {(i.kind === 'no-short' || i.kind === 'short-long') && i.slug && <button type="button" className="sk-btn sk-btn-sm" disabled={!!busy} onClick={() => rewrite(i.slug!)}>{busy === i.slug ? t('Thinking…') : t('Write it')}</button>}
      {i.kind === 'unlinked' && <button type="button" className="sk-btn sk-btn-sm" onClick={() => { link(i.slug, i.other); link(i.other, i.slug) }}>{t('Link them')}</button>}
      {i.kind === 'unknown-name' && i.name && <button type="button" className="sk-btn sk-btn-sm" onClick={() => { const e = useStore.getState().addEntry(type, i.name!); open(e.slug) }}>{t('Add to the bible')}</button>}
      {i.slug && i.kind !== 'unknown-name' && <button type="button" className="sk-btn sk-btn-ghost sk-btn-sm" onClick={() => open(i.slug)}>{t('Open')}</button>}
    </div>
  )

  return (
    <div className="pl-aicheck">
      <section className="pl-dash-block">
        <span className="pl-label">{t('What the AI reads')}</span>
        <dl className="pl-stats">
          <dt>{t('Entries')}</dt><dd>{n(stats.entries)}</dd>
          <dt>{t('Short versions together')}</dt><dd>≈ {n(stats.shortTokens)} {t('tokens')}</dd>
          <dt>{t('Full versions together')}</dt><dd>≈ {n(stats.fullTokens)} {t('tokens')}</dd>
          <dt>{t('Sent “Always”')}</dt><dd>≈ {n(stats.alwaysTokens)} / {n(stats.budget)} {t('tokens')}</dd>
        </dl>
        <span className="sk-hint">{t('Per request, only the entries named in the passage are sent (short), plus the POV character and @-mentions (full). The budget is set in Settings → AI for this book.')}</span>
      </section>
      <div className="pl-row">
        <span className="pl-label pl-grow">{issues.length ? t('{n} things to improve', { n: issues.length }) : t('Nothing to improve: the bible is in good shape for the AI.')}</span>
        <select className="sk-select sk-btn-sm" value={type} onChange={e => setType(e.target.value as EntryType)} aria-label={t('Type for new entries')}>
          {NAMED.map(ty => <option key={ty} value={ty}>{t(typeInfo(ty).label)}</option>)}
        </select>
        {missing.length > 1 && <button type="button" className="sk-btn sk-btn-primary sk-btn-sm" disabled={!!busy} onClick={fillAll} title={t('One quick Haiku call per entry')}>{t('Write the {n} missing short versions', { n: missing.length })}</button>}
      </div>
      {warns.map(row)}
      {infos.length > 0 && <span className="sk-label">{t('Suggestions')}</span>}
      {infos.map(row)}
    </div>
  )
}
