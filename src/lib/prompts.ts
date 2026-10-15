// Prompt text, one version per book language. The system rules are the same
// for every action, so the cached system prompt is reused across actions.
import type { ActionId, BookMeta, Lang, SceneRule } from './types'
import { sceneRulesText } from './voice'

/** The adult-fiction line: a plain statement of what the book is, nothing more. */
const ADULT: Record<Lang, string> = {
  fr: 'Ce livre est une œuvre de fiction littéraire pour adultes. Il peut traiter de thèmes sombres (violence, sexualité, deuil, désespoir) avec le sérieux de la littérature ; écris ces passages sans les adoucir ni les commenter.',
  en: 'This book is adult literary fiction. It may treat dark themes (violence, sexuality, grief, despair) with literary seriousness; write those passages without softening or commenting on them.',
}

/** Said once when samples of the author's prose are sent: they are the strongest guide to the voice. */
const SAMPLES: Record<Lang, string> = {
  fr: '- <author_prose> contient des passages écrits par l\'auteur lui-même. C\'est la voix à reproduire : son rythme, son vocabulaire, la longueur de ses phrases, sa façon de couper les paragraphes et d\'écrire les dialogues. N\'en reprends jamais le contenu.',
  en: '- <author_prose> holds passages the author wrote themselves. That is the voice to match: their rhythm, vocabulary, sentence length, paragraphing and the way they write dialogue. Never reuse their content.',
}

export function systemRules(lang: Lang, title: string, opts: { adult?: boolean; sceneRules?: SceneRule[]; tense?: string; samples?: boolean } = {}): string {
  const extra = [
    opts.samples ? SAMPLES[lang] : '',
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
- Typographie française : guillemets « », tiret cadratin (—) pour les dialogues, points de suspension (…).
- Les italiques s'écrivent *comme ceci* (pensées, mots étrangers, insistance) : conserve ceux du texte et n'en mets qu'avec parcimonie.`
  }
  return `You are a fiction co-writer inside Plume, a novel-writing app. You write prose for the book "${title}", in English.

Rules:
- Match the author's voice, tense and point of view, as shown in the story text and the style guide.
- Respect every fact in the bible (<bible>). Never contradict it. Don't invent major facts that aren't there.
- Reply with the prose only: no title, no preamble, no notes, no Markdown, no quotation marks around the reply.
- Typography: curly quotes, em dashes, ellipsis character (…).
- Italics are written *like this* (thoughts, foreign words, emphasis): keep the ones in the text and use them sparingly.`
}

interface Story { before: string; selection: string; after: string }

export function taskMessage(lang: Lang, action: ActionId, instruction: string, story: Story, ai: BookMeta['ai'], sceneRange?: [number, number]): string {
  const fr = lang === 'fr'
  const dir = instruction.trim()
  const words = (n: number) => fr ? `environ ${n} mots` : `about ${n} words`
  const Words = (n: number) => fr ? `Environ ${n} mots` : `About ${n} words`
  const QUICK: Partial<Record<ActionId, { en: string; fr: string }>> = {
    expand: { en: 'Expand it: add concrete sensory detail, interiority and beats of action, about one and a half times longer, without changing what happens.', fr: 'Développe-le : ajoute des détails sensoriels concrets, de l’intériorité et des gestes, environ une fois et demie plus long, sans changer ce qui se passe.' },
    shorten: { en: 'Tighten it to about two thirds of its length: cut padding, repetition and weak words, keep what carries the scene.', fr: 'Resserre-le à environ deux tiers de sa longueur : coupe le remplissage, les répétitions et les mots faibles, garde ce qui porte la scène.' },
    show: { en: 'Show, don’t tell: replace statements of feeling or summary with concrete action, gesture, sensation and dialogue, in the same point of view.', fr: 'Montre, ne dis pas : remplace les émotions annoncées et les résumés par de l’action concrète, des gestes, des sensations et des dialogues, dans le même point de vue.' },
    dialogue: { en: 'Sharpen the dialogue: give each speaker their own voice, add subtext, cut small talk and tags that explain, keep the action beats.', fr: 'Aiguise les dialogues : donne à chaque personnage sa propre voix, ajoute du sous-texte, coupe les banalités et les incises qui expliquent, garde les gestes.' },
  }
  const quick = QUICK[action]
  if (action === 'rewrite' || quick) {
    const n = Math.max(10, (story.selection.match(/\S+/g) ?? []).length)
    return [
      story.before ? `<before>\n${story.before}\n</before>` : '',
      `<selection>\n${story.selection}\n</selection>`,
      story.after ? `<after>\n${story.after}\n</after>` : '',
      fr
        ? `<task>\nRéécris uniquement le passage <selection>, pour qu'il s'enchaîne avec ce qui précède et ce qui suit. ${quick ? '' : `Garde à peu près la même longueur (${words(n)}) sauf si la consigne dit autrement.\n`}Consigne : ${quick ? quick.fr + (dir ? ' ' + dir : '') : dir || 'améliore la prose sans changer le sens'}\nRéponds uniquement avec le passage réécrit.\n</task>`
        : `<task>\nRewrite only the <selection> passage so it flows from what comes before and into what follows. ${quick ? '' : `Keep roughly the same length (${words(n)}) unless the direction says otherwise.\n`}Direction: ${quick ? quick.en + (dir ? ' ' + dir : '') : dir || 'improve the prose without changing the meaning'}\nReply with the rewritten passage only.\n</task>`,
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
  if (action === 'describe') {
    return [
      storyBlock,
      fr
        ? `<task>\nÉcris une description (lieu, personnage ou objet) qui s'insère ici, en reprenant exactement là où le texte s'arrête. Détails concrets, plusieurs sens, vus par le personnage du point de vue ; pas de liste. Environ 120 mots.${dir ? `\nCe qu'il faut décrire : ${dir}` : '\nDécris ce que le personnage remarque en premier.'}\nRéponds uniquement avec la description.\n</task>`
        : `<task>\nWrite a description (place, character or object) that fits in here, picking up exactly where the story stops. Concrete detail, more than one sense, seen through the point-of-view character; no lists. About 120 words.${dir ? `\nWhat to describe: ${dir}` : '\nDescribe what the character notices first.'}\nReply with the description only.\n</task>`,
    ].join('\n\n')
  }
  if (action === 'scene') {
    const [a, b] = sceneRange ?? ai.chapterWords
    const range = fr ? `environ ${a} à ${b} mots` : `about ${a} to ${b} words`
    return [
      storyBlock,
      fr
        ? `<task>\nÉcris cette scène en entier d'après son plan (<scene>)${story.before.trim() ? ", en reprenant exactement là où le texte s'arrête" : ''} : entre dans le moment, mène-la jusqu'à ce que sa note dit qui change, et termine là. Longueur indicative : ${range} ; plus courte ou plus longue si la scène le demande.${dir ? `\nConsigne de l'auteur : ${dir}` : ''}\n</task>`
        : `<task>\nWrite this scene in full from its plan (<scene>)${story.before.trim() ? ', picking up exactly where the story stops' : ''}: go into the moment, carry it to what its note says changes, and end there. Length as a guide: ${range}; shorter or longer if the scene needs it.${dir ? `\nAuthor's direction: ${dir}` : ''}\n</task>`,
    ].join('\n\n')
  }
  if (action === 'beats') {
    return [
      storyBlock,
      `<beats>\n${dir}\n</beats>`,
      fr
        ? `<task>\nÉcris la suite de la scène en suivant ces étapes dans l'ordre, en reprenant exactement là où le texte s'arrête. N'écris que ce que disent ces étapes, sans ajouter d'événement, et arrête-toi une fois la dernière accomplie. ${Words(ai.beatsWords)}.\n</task>`
        : `<task>\nWrite the next part of the scene, following these beats in order, picking up exactly where the story stops. Write only what these beats say, add no other event, and stop once the last one is done. ${Words(ai.beatsWords)}.\n</task>`,
    ].join('\n\n')
  }
  return [
    storyBlock,
    fr
      ? `<task>\nContinue la scène en reprenant exactement là où le texte s'arrête. ${Words(ai.continueWords)}.${dir ? `\nConsigne de l'auteur : ${dir}` : ''}\n</task>`
      : `<task>\nContinue the scene, picking up exactly where the story stops. ${Words(ai.continueWords)}.${dir ? `\nAuthor's direction: ${dir}` : ''}\n</task>`,
  ].join('\n\n')
}
