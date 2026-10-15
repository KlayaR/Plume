// The example book: a short bible, a plan and a few scenes, to try Plume on
// something real before starting your own. Also the mock's sample book.
import type { Lang } from './types'

export function exampleFiles(lang: Lang): Record<string, string> {
  return lang === 'fr' ? FR : EN
}

export const exampleTitle = (lang: Lang) => (lang === 'fr' ? 'Le Bal des Cendres' : 'The Ash Ball')

const FR: Record<string, string> = {
  'plume.json': JSON.stringify({
    format: 1, title: 'Le Bal des Cendres', author: 'Test', language: 'fr',
    order: [{ folder: 'ch-le-bal', scenes: ['sc-l-arrivee.md', 'sc-la-danse.md'] }, { folder: 'ch-la-fuite', scenes: ['sc-la-nuit.md'] }],
  }),
  'bible/style.md': '---\ntype: style\nname: Guide de style\ninclude: always\n---\n\n## Short\n\n## Full\n### Temps\nPassé simple, troisième personne.\n\n### Voix\nPhrases sobres, images sensorielles, peu d’adverbes.\n\n## Facts\n',
  'bible/characters/elise.md': '---\ntype: character\nname: Élise Varenne\naliases: [Élise, Lise, la Duchesse]\ninclude: auto\nlinks: [aube]\n---\n\n## Short\nJeune duchesse fière et imprudente, qui cache sa peur du feu.\n\n## Full\n### Apparence\nCheveux noirs, robe grise, une cicatrice au poignet.\n\n### Secrets\nElle a allumé l’incendie de Valombre, enfant.\n\n## Facts\n- [ch 1–2] Porte l’épée Aube sous sa cape.\n- [ch 5+] Aveugle de l’œil gauche.\n',
  'bible/objects/aube.md': '---\ntype: object\nname: Aube\ninclude: auto\n---\n\n## Short\nÉpée d’argent qui chauffe à l’approche de la magie.\n\n## Full\n\n## Facts\n',
  'bible/characters/marc.md': '---\ntype: character\nname: Marc Delorme\naliases: [Marc, le capitaine]\ninclude: auto\n---\n\n## Short\nCapitaine de la garde, loyal, amoureux d’Élise sans le dire.\n\n## Full\n\n## Facts\n',
  'bible/places/valombre.md': '---\ntype: place\nname: Valombre\ninclude: auto\n---\n\n## Short\nVille brûlée il y a quinze ans, encore en ruines au nord.\n\n## Full\n\n## Facts\n',
  'bible/lore/magie-du-feu.md': '---\ntype: lore\nname: La magie du feu\ninclude: always\n---\n\n## Short\nToute flamme magique coûte un souvenir à celui qui l’allume.\n\n## Full\n\n## Facts\n',
  'manuscript/ch-le-bal/chapter.md': '---\nid: c1\ntitle: Le bal\n---\n',
  'manuscript/ch-le-bal/sc-l-arrivee.md': '---\nid: s1\ntitle: L’arrivée\npov: elise\nstatus: revised\n---\n\nLa calèche s’arrêta devant les grilles. Élise resta un instant immobile, la main posée sur la garde d’Aube, cachée sous sa cape.\n\nMarc ouvrit la portière. — Duchesse, on vous attend.\n\nElle descendit sans répondre. Au loin, vers le nord, les ruines de Valombre découpaient le ciel comme des dents noires.',
  'manuscript/ch-le-bal/sc-la-danse.md': '---\nid: s2\ntitle: La danse\npov: elise\nstatus: draft\n---\n\nLa musique commença quand Lise entra dans la salle.',
  'manuscript/ch-la-fuite/chapter.md': '---\nid: c2\ntitle: La fuite\n---\n',
  'manuscript/ch-la-fuite/sc-la-nuit.md': '---\nid: s3\ntitle: La nuit\nstatus: draft\n---\n\n',
}

const EN: Record<string, string> = {
  'plume.json': JSON.stringify({
    format: 1, title: 'The Ash Ball', author: '', language: 'en',
    order: [{ folder: 'ch-the-ball', scenes: ['sc-arrival.md', 'sc-the-dance.md'] }, { folder: 'ch-the-flight', scenes: ['sc-the-night.md'] }],
  }),
  'bible/style.md': '---\ntype: style\nname: Style guide\ninclude: always\n---\n\n## Short\n\n## Full\n### Tense\nPast tense, third person.\n\n### Voice\nPlain sentences, sensory images, few adverbs.\n\n## Facts\n',
  'bible/characters/elise.md': '---\ntype: character\nname: Elise Varenne\naliases: [Elise, Lise, the Duchess]\ninclude: auto\nlinks: [dawn]\n---\n\n## Short\nA proud, reckless young duchess who hides her fear of fire.\n\n## Full\n### Appearance\nBlack hair, a grey gown, a scar on her wrist.\n\n### Secrets\nAs a child, she started the fire that burned Valombre.\n\n## Facts\n- [ch 1–2] Carries the sword Dawn under her cloak.\n- [ch 5+] Blind in the left eye.\n',
  'bible/objects/dawn.md': '---\ntype: object\nname: Dawn\ninclude: auto\n---\n\n## Short\nA silver sword that grows warm when magic is near.\n\n## Full\n\n## Facts\n',
  'bible/characters/marc.md': '---\ntype: character\nname: Marc Delorme\naliases: [Marc, the captain]\ninclude: auto\n---\n\n## Short\nCaptain of the guard, loyal, in love with Elise and never saying so.\n\n## Full\n\n## Facts\n',
  'bible/places/valombre.md': '---\ntype: place\nname: Valombre\ninclude: auto\n---\n\n## Short\nA city burned fifteen years ago, still in ruins to the north.\n\n## Full\n\n## Facts\n',
  'bible/lore/fire-magic.md': '---\ntype: lore\nname: Fire magic\ninclude: always\n---\n\n## Short\nEvery magic flame costs the one who lights it a memory.\n\n## Full\n\n## Facts\n',
  'manuscript/ch-the-ball/chapter.md': '---\nid: c1\ntitle: The ball\n---\n',
  'manuscript/ch-the-ball/sc-arrival.md': '---\nid: s1\ntitle: Arrival\npov: elise\nstatus: revised\n---\n\nThe carriage stopped at the gates. Elise sat still for a moment, her hand on Dawn’s hilt, hidden under her cloak.\n\nMarc opened the door. “Duchess, they are waiting for you.”\n\nShe stepped down without a word. Far to the north, the ruins of Valombre cut into the sky like black teeth.',
  'manuscript/ch-the-ball/sc-the-dance.md': '---\nid: s2\ntitle: The dance\npov: elise\nstatus: draft\n---\n\nThe music began as Lise walked into the hall.',
  'manuscript/ch-the-flight/chapter.md': '---\nid: c2\ntitle: The flight\n---\n',
  'manuscript/ch-the-flight/sc-the-night.md': '---\nid: s3\ntitle: The night\nstatus: draft\n---\n\n',
}
