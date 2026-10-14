// Plume's default voice: for fantasy, built on the usual guidelines of the genre
// (deep point of view, world shown through action, magic with limits and a cost,
// scenes with want and obstacle, strong verbs, no info-dumps, no clichés).
// New books start with it, and an existing book that has no voice yet gets it too.
// Everything here is plain text you can change in Settings → Voice.
import type { Lang, Rules, SceneRule, Voice } from './types'
import { DEFAULT_VOICE } from './types'

export const FANTASY_ID = 'preset-fantasy'
export const FANTASY_VERSION = 'fantasy-1'

export const FANTASY_PROMPT: Record<Lang, string> = {
  en: `You are co-writing epic and secondary-world fantasy. Write in {book.language}, in {book.tense}, in deep point of view with {scene.pov}: only what they perceive, know, want and fear, in their own words and rhythm. Keep the grammatical person (I, he, she) the story text already uses.

Craft:
- Start inside the moment. Anchor each scene in its place with two or three concrete details from different senses (smell, sound, touch, temperature, taste, not only sight) that this character would really notice.
- Show the world through action, conflict and dialogue. No info-dumps and no lectures: at most one new piece of lore per scene, tied to what the character wants right now. Never explain what the point-of-view character already knows.
- Magic and technology have limits and a cost. Obey every rule and fact in the bible exactly; never solve a problem with a power or an object that was not set up earlier.
- Use names, titles, places and terms exactly as the bible spells them. Do not invent new proper nouns, gods, factions or histories unless the task asks for them.
- Every scene has someone who wants something and something in the way. Make the choice cost. End on a turn, a consequence or a question, never on a summary or a reflection.
- Strong, concrete verbs; few adverbs; almost no stacked adjectives. Vary the sentence length: short and hard in action and fear, longer and flowing in reflection and awe. Cut any sentence the scene could lose.
- Show emotion through the body, the choice and the thing left unsaid; do not name it. Dialogue carries subtext: people rarely say exactly what they mean, they deflect and interrupt. Keep each voice distinct (follow the voice cards). Prefer "said" or an action beat to fancy dialogue tags.
- Keep the register of the world: no modern slang or idiom, in the narration or in a character's mouth, unless their voice card allows it.
- Avoid clichés and stock fantasy phrasing (chosen ones, ancient prophecies, "little did he know", eyes like gems, hearts that hammer, breaths held without knowing). Never use the words in {list.all}.
- No recap of what just happened, no moral, no comment to the author.`,
  fr: `Tu co-écris de la fantasy (monde secondaire, épique). Écris en {book.language}, au {book.tense}, en point de vue interne avec {scene.pov} : seulement ce que ce personnage perçoit, sait, veut et craint, avec ses mots et son rythme. Garde la personne grammaticale (je, il, elle) déjà utilisée dans le texte.

Métier :
- Entre dans la scène en plein mouvement. Ancre chaque scène dans son lieu avec deux ou trois détails concrets de sens différents (odeur, son, toucher, température, goût, pas seulement la vue) que ce personnage remarquerait vraiment.
- Montre le monde par l’action, le conflit et le dialogue. Pas de déversement d’informations ni de cours : au plus un élément nouveau du monde par scène, lié à ce que le personnage veut maintenant. N’explique jamais ce que le personnage point de vue sait déjà.
- La magie et la technologie ont des limites et un coût. Respecte exactement chaque règle et chaque fait de la bible ; ne résous jamais un problème avec un pouvoir ou un objet qui n’a pas été installé avant.
- Utilise les noms, titres, lieux et termes exactement comme la bible les écrit. N’invente ni nom propre, ni dieu, ni faction, ni histoire, sauf si la consigne le demande.
- Chaque scène a quelqu’un qui veut quelque chose et quelque chose qui l’en empêche. Fais payer le choix. Termine sur un retournement, une conséquence ou une question, jamais sur un résumé ni une réflexion.
- Verbes forts et concrets ; peu d’adverbes ; presque pas d’adjectifs empilés. Varie la longueur des phrases : courtes et dures dans l’action et la peur, plus longues et fluides dans la réflexion et l’émerveillement. Coupe toute phrase dont la scène peut se passer.
- Montre l’émotion par le corps, le choix et ce qui reste tu ; ne la nomme pas. Le dialogue porte un sous-texte : on dit rarement exactement ce qu’on pense, on esquive, on coupe la parole. Garde chaque voix distincte (suis les fiches de voix). Préfère « dit » ou une action à une incise fantaisiste.
- Garde le registre du monde : pas d’argot ni de tournure moderne, dans la narration comme dans la bouche d’un personnage, sauf si sa fiche de voix l’autorise.
- Évite les clichés et les formules toutes faites de la fantasy (élus, prophéties millénaires, « il ne savait pas encore que », yeux comme des gemmes, cœurs qui battent la chamade, souffles retenus sans le savoir). N’emploie jamais les mots de {list.all}.
- Pas de récapitulatif de ce qui vient de se passer, pas de morale, pas de commentaire à l’auteur.`,
}

export const FANTASY_STYLE: Record<Lang, string> = {
  en: `### Voice
Immersive, concrete, sensory. Plain strong verbs, few adverbs. Short sentences for action, longer ones for awe and reflection. Restraint beats ornament.

### Tense
The one the manuscript already uses (by default: past tense).

### POV rules
Deep point of view: only what the viewpoint character perceives, knows and feels, in their own voice. First or third person, as the manuscript does. No head-hopping inside a scene; change point of view only at a scene break.

### Words to avoid
See the word lists "AI-isms" and "Fantasy clichés".
`,
  fr: `### Voix
Immersive, concrète, sensorielle. Verbes simples et forts, peu d’adverbes. Phrases courtes dans l’action, plus longues pour l’émerveillement et la réflexion. La retenue vaut mieux que l’ornement.

### Temps
Celui que le manuscrit utilise déjà (par défaut : passé simple et imparfait).

### Point de vue
Point de vue interne : seulement ce que le personnage perçoit, sait et ressent, avec ses mots. Première ou troisième personne, comme le manuscrit. Pas de saut d’une tête à l’autre dans une scène ; on change de point de vue à la rupture de scène.

### Mots à éviter
Voir les listes de mots « Tics d’IA » et « Clichés de fantasy ».
`,
}

export const FANTASY_SCENE_RULES: SceneRule[] = ['medias-res', 'hook', 'show', 'no-summary', 'no-weather']

/** Fantasy prose can carry a little more passive and adverb than a thriller; dialogue dashes are French only. */
export const fantasyRules = (lang: Lang): Rules => ({ passiveMax: 4, adverbsPer250: 2, dialogueMaxWords: 60, sentenceMaxWords: 40, dashDialogue: lang === 'fr' })

export const fantasyVoice = (lang: Lang): Voice => ({
  ...DEFAULT_VOICE,
  prompt: FANTASY_ID,
  actionPrompts: {},
  sceneRules: [...FANTASY_SCENE_RULES],
  rules: fantasyRules(lang),
  snapshots: {},
  defaults: FANTASY_VERSION,
})

/** The two word lists a new book starts with: one phrase per line, banned from the AI's text and flagged by the checker. */
export const FANTASY_LISTS: Record<Lang, { name: string; full: string }[]> = {
  en: [
    { name: 'AI-isms', full: [
      'tapestry', 'testament to', 'delve', 'symphony of', 'dance of', 'ministrations', 'orbs', 'a mix of', 'a mixture of', 'couldn’t help but', 'could not help but',
      'palpable', 'unwavering', 'bustling', 'kaleidoscope', 'the weight of', 'shiver ran down', 'sent shivers', 'a testament', 'whispers of', 'eyes sparkled', 'heart hammered', 'heart pounded', 'heart skipped',
    ].join('\n') },
    { name: 'Fantasy clichés', full: [
      'chosen one', 'ancient prophecy', 'dark lord', 'little did he know', 'little did she know', 'unbeknownst', 'emerald eyes', 'sapphire eyes', 'eyes like', 'ragtag', 'since the dawn of time',
      'the fate of the world', 'ethereal', 'otherworldly', 'tendrils of', 'a hush fell', 'blood ran cold', 'steeled himself', 'steeled herself', 'breath he didn’t know', 'breath she didn’t know', 'a force to be reckoned with',
    ].join('\n') },
  ],
  fr: [
    { name: 'Tics d’IA', full: [
      'tapisserie', 'témoignage de', 'symphonie de', 'danse de', 'un mélange de', 'ne pouvait s’empêcher de', 'ne put s’empêcher de', 'palpable', 'indéfectible', 'inébranlable',
      'caléidoscope', 'murmure du vent', 'comme si le temps lui-même', 'un frisson lui parcourut l’échine', 'lueur d’espoir', 'tourbillon d’émotions', 'plongea son regard dans le sien', 'le poids de',
    ].join('\n') },
    { name: 'Clichés de fantasy', full: [
      'l’élu', 'l’élue', 'prophétie millénaire', 'seigneur des ténèbres', 'il ne savait pas encore', 'elle ne savait pas encore', 'yeux émeraude', 'yeux de saphir', 'depuis la nuit des temps',
      'le destin du monde', 'éthéré', 'son sang se glaça', 'battait la chamade', 'retint son souffle', 'un souffle qu’il ne savait pas retenir', 'un souffle qu’elle ne savait pas retenir', 'force de la nature',
    ].join('\n') },
  ],
}
