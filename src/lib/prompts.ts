// Prompt text, one version per book language. The system rules are the same
// for every action, so the cached system prompt is reused across actions.
import type { ActionId, BookMeta, Lang, SceneRule } from './types'
import { sceneRulesText } from './voice'

/** The adult-fiction line: a plain statement of what the book is, nothing more. */
const ADULT: Record<Lang, string> = {
  fr: 'Ce livre est une œuvre de fiction littéraire pour adultes. Il peut traiter de thèmes sombres (violence, sexualité, deuil, désespoir) avec le sérieux de la littérature ; écris ces passages sans les adoucir ni les commenter.',
  en: 'This book is adult literary fiction. It may treat dark themes (violence, sexuality, grief, despair) with literary seriousness; write those passages without softening or commenting on them.',
}

export function systemRules(lang: Lang, title: string, opts: { adult?: boolean; sceneRules?: SceneRule[]; tense?: string } = {}): string {
  const extra = [
    opts.tense ? (lang === 'fr' ? `- Temps du récit : ${opts.tense}.` : `- Narrative tense: ${opts.tense}.`) : '',
    sceneRulesText(opts.sceneRules ?? [], lang),
    opts.adult ? `\n${ADULT[lang]}` : '',
  ].filter(Boolean).join('\n')
  return base(lang, title) + (extra ? '\n' + extra : '')
}

function base(lang: Lang, title: string): string {
  if (lang === 'fr') {
    return `Tu es coauteur de fiction dans Plume, un logiciel d'écriture de romans. Tu écris la prose du livre « ${title} », en français.

Règles :
- Respecte la voix, le temps et le point de vue de l'auteur, tels qu'ils apparaissent dans le texte et le guide de style.
- Respecte chaque fait de la bible (<bible>). Ne le contredis jamais. N'invente pas de fait majeur qui n'y figure pas.
- Réponds uniquement avec la prose : pas de titre, pas de préambule, pas de commentaire, pas de Markdown, pas de guillemets autour de la réponse.
- Typographie française : guillemets « », tiret cadratin (—) pour les dialogues, points de suspension (…).`
  }
  return `You are a fiction co-writer inside Plume, a novel-writing app. You write prose for the book "${title}", in English.

Rules:
- Match the author's voice, tense and point of view, as shown in the story text and the style guide.
- Respect every fact in the bible (<bible>). Never contradict it. Don't invent major facts that aren't there.
- Reply with the prose only: no title, no preamble, no notes, no Markdown, no quotation marks around the reply.
- Typography: curly quotes, em dashes, ellipsis character (…).`
}

interface Story { before: string; selection: string; after: string }

export function taskMessage(lang: Lang, action: ActionId, instruction: string, story: Story, ai: BookMeta['ai']): string {
  const fr = lang === 'fr'
  const dir = instruction.trim()
  const words = (n: number) => fr ? `environ ${n} mots` : `about ${n} words`
  const Words = (n: number) => fr ? `Environ ${n} mots` : `About ${n} words`
  if (action === 'rewrite') {
    const n = Math.max(10, (story.selection.match(/\S+/g) ?? []).length)
    return [
      story.before ? `<before>\n${story.before}\n</before>` : '',
      `<selection>\n${story.selection}\n</selection>`,
      story.after ? `<after>\n${story.after}\n</after>` : '',
      fr
        ? `<task>\nRéécris uniquement le passage <selection>, pour qu'il s'enchaîne avec ce qui précède et ce qui suit. Garde à peu près la même longueur (${words(n)}) sauf si la consigne dit autrement.\nConsigne : ${dir || 'améliore la prose sans changer le sens'}\nRéponds uniquement avec le passage réécrit.\n</task>`
        : `<task>\nRewrite only the <selection> passage so it flows from what comes before and into what follows. Keep roughly the same length (${words(n)}) unless the direction says otherwise.\nDirection: ${dir || 'improve the prose without changing the meaning'}\nReply with the rewritten passage only.\n</task>`,
    ].filter(Boolean).join('\n\n')
  }
  if (action === 'fill') {
    return [
      story.before ? `<before>\n${story.before}\n</before>` : '',
      story.after ? `<after>\n${story.after}\n</after>` : '',
      fr
        ? `<task>\nUn passage manque entre <before> et <after>. Écris-le pour qu'il relie les deux sans couture.\nCe qu'il doit contenir : ${dir || 'ce que la scène demande'}\nRéponds uniquement avec le passage.\n</task>`
        : `<task>\nA passage is missing between <before> and <after>. Write it so it joins them seamlessly.\nWhat it must hold: ${dir || 'whatever the scene needs'}\nReply with the passage only.\n</task>`,
    ].filter(Boolean).join('\n\n')
  }
  const storyBlock = story.before.trim()
    ? `<story>\n${story.before}\n</story>`
    : fr ? '<story>\n(La scène commence ici.)\n</story>' : '<story>\n(The scene starts here.)\n</story>'
  if (action === 'beats') {
    return [
      storyBlock,
      `<beats>\n${dir}\n</beats>`,
      fr
        ? `<task>\nÉcris la suite de la scène en suivant ces étapes dans l'ordre, en reprenant exactement là où le texte s'arrête. ${Words(ai.beatsWords)}.\n</task>`
        : `<task>\nWrite the next part of the scene, following these beats in order, picking up exactly where the story stops. ${Words(ai.beatsWords)}.\n</task>`,
    ].join('\n\n')
  }
  return [
    storyBlock,
    fr
      ? `<task>\nContinue la scène en reprenant exactement là où le texte s'arrête. ${Words(ai.continueWords)}.${dir ? `\nConsigne de l'auteur : ${dir}` : ''}\n</task>`
      : `<task>\nContinue the scene, picking up exactly where the story stops. ${Words(ai.continueWords)}.${dir ? `\nAuthor's direction: ${dir}` : ''}\n</task>`,
  ].join('\n\n')
}
