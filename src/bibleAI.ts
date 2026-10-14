// Small AI helpers that make the bible work better for the AI itself: a short
// version written to remind the model who or what an entry is each time it
// appears, and a first draft of an entry from how the book already uses its name.
import { ask, parseJSON } from './ai'
import { buildMatcher, findMentions } from './lib/context'
import { typeInfo, type Book, type Entry, type EntryType } from './lib/types'

/** One or two sentences, about 35 words: what the AI reads every time the name comes up. */
export async function writeShort(book: Book, e: Entry): Promise<string> {
  const fr = book.meta.language === 'fr'
  const facts = e.facts.map(f => `- ${f.text}`).join('\n')
  const reply = await ask({
    model: 'haiku', effort: 'low',
    system: fr
      ? 'Tu rédiges la version courte d’une fiche de bible de roman, relue par une IA chaque fois que le nom apparaît. Réponds uniquement par le texte.'
      : 'You write the short version of a novel-bible entry, which an AI reads every time the name comes up. Reply with the text only.',
    message: `<entry type="${e.type}" name="${e.name}">\n${e.full.trim().slice(0, 6000)}\n${facts}\n</entry>\n\n${fr
      ? 'Écris 1 à 2 phrases (35 mots au plus) : ce que c’est ou qui c’est, ce qui le définit, ce qui compte pour l’histoire. Pas de généralités, pas de style fleuri, seulement ce qui aide à écrire juste.'
      : 'Write 1 or 2 sentences (35 words at most): what or who it is, what defines it, what matters to the story. No generalities or flourish, only what helps write it right.'}`,
  })
  return reply.trim().replace(/^["“«]\s*|\s*["”»]$/g, '')
}

export interface Draft { short: string; full: string; aliases: string[] }

/** Passages of the book that name `name`, a few hundred characters each. */
export function snippetsFor(book: Book, name: string, max = 6): string[] {
  const matcher = buildMatcher([{ slug: 'x', type: 'lore', path: '', name, aliases: [], include: 'auto', links: [], short: '', full: '', facts: [], extra: {} }])
  const out: string[] = []
  for (const c of book.chapters) for (const s of c.scenes) {
    for (const p of s.text.split('\n')) {
      if (out.length >= max) return out
      if (findMentions(p, matcher).length) out.push(p.length > 500 ? p.slice(0, 500) + '…' : p)
    }
  }
  return out
}

/** A first draft of a bible entry from the passages that mention the name. */
export async function draftEntry(book: Book, name: string, type: EntryType, context: string): Promise<Draft> {
  const fr = book.meta.language === 'fr'
  const passages = [context, ...snippetsFor(book, name)].filter(Boolean).filter((p, i, a) => a.indexOf(p) === i).slice(0, 7)
  const headings = typeInfo(type).headings[book.meta.language]
  const known = book.entries.filter(e => e.type !== 'style' && e.short.trim() && e.include !== 'secret').slice(0, 40).map(e => `- ${e.name}: ${e.short.trim()}`).join('\n')
  const reply = await ask({
    model: 'sonnet', effort: 'low',
    system: fr
      ? 'Tu aides un romancier de fantasy à tenir sa bible. Tu ne décris que ce que le texte dit ou implique clairement ; tu n’inventes rien. Réponds uniquement en JSON valide, en français.'
      : 'You help a fantasy novelist keep their story bible. Describe only what the text states or clearly implies; invent nothing. Reply with valid JSON only.',
    message: `<name type="${type}">${name}</name>\n<passages>\n${passages.join('\n---\n')}\n</passages>\n${known ? `<known_entries>\n${known}\n</known_entries>\n` : ''}\n${fr
      ? `Rédige la fiche : "short" (1-2 phrases, 35 mots au plus), "full" (markdown, sections parmi : ${headings.join(', ')} ; saute celles que le texte ne permet pas de remplir), "aliases" (autres façons dont le texte désigne l’entrée).`
      : `Write the entry: "short" (1-2 sentences, 35 words at most), "full" (markdown, sections among: ${headings.join(', ')}; skip those the text can't fill), "aliases" (other ways the text refers to it).`}\nJSON: {"short": "...", "full": "...", "aliases": ["..."]}`,
  })
  const d = parseJSON<Partial<Draft>>(reply)
  if (!d || typeof d.short !== 'string') throw new Error(fr ? 'La réponse de Claude n’a pas pu être lue. Réessayez.' : 'Claude’s reply could not be read. Try again.')
  return { short: d.short.trim(), full: typeof d.full === 'string' ? d.full.trim() : '', aliases: Array.isArray(d.aliases) ? d.aliases.map(String).filter(a => a.trim() && a.trim() !== name) : [] }
}
