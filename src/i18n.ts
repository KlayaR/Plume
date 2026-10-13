// Interface language. Code is written in English and wrapped in t('...');
// FR maps each English phrase to French. A phrase missing here shows in English.
// The book's own language (prompts, typography, entry templates) is separate.
import { useStore } from './store'

export type UiLang = 'fr' | 'en'

export const defaultUiLang = (): UiLang =>
  typeof navigator !== 'undefined' && navigator.language?.toLowerCase().startsWith('fr') ? 'fr' : 'en'

const FR: Record<string, string> = {
  // Shell and spaces
  'Bible': 'Bible', 'Plan': 'Plan', 'Manuscript': 'Manuscrit', 'Book': 'Livre', 'Switch book': 'Changer de livre',
  'Novel writing': 'Écriture de romans', 'Dismiss': 'Fermer',
  // Start
  'Open a book or start a new one': 'Ouvrez un livre ou commencez-en un',
  'New book': 'Nouveau livre', 'Title': 'Titre', 'Author': 'Auteur', 'Language of the book': 'Langue du livre',
  'Saved in': 'Enregistré dans', 'Change…': 'Changer…', 'Create book': 'Créer le livre', 'Open': 'Ouvrir',
  'Open folder…': 'Ouvrir un dossier…', 'No recent books yet.': 'Aucun livre récent.',
  'Open a Plume book': 'Ouvrir un livre Plume', 'Where to save the book': 'Où enregistrer le livre',
  'No Plume book in this folder (plume.json is missing).': 'Aucun livre Plume dans ce dossier (plume.json est absent).',
  'Could not open the book: {e}': 'Impossible d’ouvrir le livre : {e}',
  'Could not create the book: {e}': 'Impossible de créer le livre : {e}',
  'This folder already holds a book.': 'Ce dossier contient déjà un livre.',
  // Manuscript
  'Pick or add a scene on the left.': 'Choisissez ou ajoutez une scène à gauche.',
  'Write': 'Écrire', 'Review': 'Relire', 'Plain': 'Texte', 'Page': 'Page', 'Mode': 'Mode', 'View': 'Affichage',
  'Scene title': 'Titre de la scène', 'Chapter title': 'Titre du chapitre', 'POV': 'Point de vue', 'None': 'Aucun',
  'Status': 'État', 'Draft': 'Brouillon', 'Revised': 'Révisée', 'Done': 'Terminée',
  'New scene': 'Nouvelle scène', 'New chapter': 'Nouveau chapitre', 'Remove scene': 'Supprimer la scène',
  'Untitled': 'Sans titre', 'Scene break': 'Changement de scène', 'Chapters and scenes': 'Chapitres et scènes',
  'Move "{title}" to the book\'s trash folder?': 'Mettre « {title} » dans la corbeille du livre ?',
  'Numbered chapter': 'Chapitre numéroté', 'Prologue': 'Prologue', 'Epilogue': 'Épilogue',
  '{kind}: click to switch ({kinds})': '{kind} : cliquez pour changer ({kinds})',
  'page': 'page', 'pages': 'pages',
  'New scene. Enter again: new chapter.': 'Nouvelle scène. Encore Entrée : nouveau chapitre.',
  'New chapter.': 'Nouveau chapitre.', 'Undo': 'Annuler', 'Scene': 'Scène', 'Chapter': 'Chapitre',
  // AI panel
  'Continue': 'Continuer', 'Rewrite': 'Réécrire', 'Beats': 'Étapes', 'Rewrite selection': 'Réécrire la sélection',
  'Write from beats': 'Écrire depuis les étapes', 'Beats to prose': 'Étapes en prose',
  'Optional direction, e.g. "she refuses, coldly"': 'Consigne facultative, ex. « elle refuse, froidement »',
  'How to rewrite, e.g. "tighter, more tension"': 'Comment réécrire, ex. « plus serré, plus de tension »',
  'One beat per line': 'Une étape par ligne', '@Name sends the full entry': '@Nom envoie la fiche complète',
  'AI action': 'Action IA', 'Model': 'Modèle', 'Effort': 'Effort', 'Low': 'Faible', 'Medium': 'Moyen', 'High': 'Élevé',
  'Stop': 'Arrêter', 'Proposal': 'Proposition', 'Accept': 'Accepter', 'Retry': 'Réessayer', 'Discard': 'Rejeter',
  'Request size': 'Taille de la requête', 'Estimate: no tokenizer is available offline': 'Estimation : pas de compteur de jetons hors ligne',
  'tokens': 'jetons', 'Preview the prompt': 'Voir le prompt', 'Rules': 'Règles', 'Story': 'Texte', 'Task': 'Tâche',
  'The rules and bible are cached by the CLI for an hour, so repeat calls in this scene cost much less.':
    'Les règles et la bible restent en cache une heure : les appels suivants dans cette scène coûtent bien moins.',
  'Bible entries sent': 'Fiches envoyées', 'No bible names in the text near the cursor yet.': 'Aucun nom de la bible près du curseur pour l’instant.',
  'cut by budget': 'coupée par le budget', 'Version': 'Version', 'Reset choices': 'Annuler mes choix',
  'Send {name}': 'Envoyer {name}', 'Prompt preview': 'Aperçu du prompt', 'System prompt (cached)': 'Prompt système (en cache)',
  'Message': 'Message', 'always': 'toujours', 'mentioned {n}×': 'citée {n}×', '@-mentioned': '@-citée',
  'linked from {name}': 'liée à {name}',
  // AI errors
  'The claude command line was not found. Set its path in Settings.': 'La ligne de commande claude est introuvable. Indiquez son chemin dans les Paramètres.',
  'Accept or discard the current proposal first.': 'Acceptez ou rejetez d’abord la proposition en cours.',
  'Select the passage to rewrite first.': 'Sélectionnez d’abord le passage à réécrire.',
  'Write the beats first, one per line.': 'Écrivez d’abord les étapes, une par ligne.',
  'The request failed.': 'La requête a échoué.', 'Stopped.': 'Arrêté.',
  'Claude is not signed in. Open a terminal, run `claude`, then type /login.': 'Claude n’est pas connecté. Ouvrez un terminal, lancez `claude`, puis tapez /login.',
  'Usage limit reached: {said}': 'Limite d’utilisation atteinte : {said}',
  'The claude command stopped (code {code}).': 'La commande claude s’est arrêtée (code {code}).',
  'Could not save: {e}': 'Enregistrement impossible : {e}',
  // Review
  'Words': 'Mots', 'Signs': 'Signes', 'Feuillets (1 500 signs)': 'Feuillets (1 500 signes)', 'Paragraphs': 'Paragraphes',
  'Sentences': 'Phrases', 'Average sentence': 'Phrase moyenne', 'Longest sentence': 'Phrase la plus longue', 'Dialogue': 'Dialogue',
  'words': 'mots', 'This scene': 'Cette scène', 'The whole book': 'Tout le livre',
  'Review: spellcheck is on and you can fix the text. Echo words, rhythm, voice and continuity checks arrive in 0.7.0.':
    'Relecture : le correcteur est actif et vous pouvez corriger le texte. Échos, rythme, voix et cohérence arrivent en 0.7.0.',
  // Plan
  'Every chapter and scene as a card; click one to write it': 'Chaque chapitre et scène en fiche ; cliquez pour l’écrire',
  'Editable cards, structure templates, story time and story lines arrive in 0.5.0.':
    'Fiches modifiables, structures narratives, temps du récit et intrigues arrivent en 0.5.0.',
  // Bible
  'Characters, places, objects, lore and story lines the AI can draw on': 'Personnages, lieux, objets, univers et intrigues que l’IA peut utiliser',
  'New entry': 'Nouvelle fiche', 'Search names and aliases': 'Chercher noms et alias', 'Name': 'Nom', 'Cancel': 'Annuler', 'Add': 'Ajouter',
  'Bible entries': 'Fiches de la bible', 'never': 'jamais', 'Pick an entry, or add one with New entry.': 'Choisissez une fiche, ou ajoutez-en une avec Nouvelle fiche.',
  'Remove entry': 'Supprimer la fiche', 'Aliases': 'Alias', 'Comma-separated. End one with ! to match its exact capitals (Rose!).':
    'Séparés par des virgules. Terminez par ! pour exiger les majuscules exactes (Rose!).',
  'Sent to the AI': 'Envoyée à l’IA', 'When mentioned': 'Quand elle est citée', 'Always': 'Toujours', 'Never (unless @-mentioned)': 'Jamais (sauf @-citée)',
  'Links': 'Liens', 'Remove link': 'Retirer le lien', 'Add a link…': 'Ajouter un lien…',
  'Linked entries are sent too (short version) when this one is.': 'Les fiches liées sont envoyées aussi (version courte) avec celle-ci.',
  'Short version': 'Version courte', 'One or two lines, sent by default.': 'Une ou deux lignes, envoyées par défaut.',
  'Style guide (always sent)': 'Guide de style (toujours envoyé)', 'Full version': 'Version complète',
  "Sent for the scene's POV character, or when you write @{name} in an instruction.": 'Envoyée pour le personnage point de vue, ou si vous écrivez @{name} dans une consigne.',
  'Facts': 'Faits', 'One per line. [ch 3–8], [ch 12+] or [ch 5] limit a fact to those chapters; no bracket = always true.':
    'Un par ligne. [ch 3–8], [ch 12+] ou [ch 5] limitent un fait à ces chapitres ; sans crochets = toujours vrai.',
  'Mentions': 'Apparitions', 'Not mentioned in any scene yet.': 'Citée dans aucune scène pour l’instant.',
  'No short version yet.': 'Pas encore de version courte.',
  'Character': 'Personnage', 'Characters': 'Personnages', 'Place': 'Lieu', 'Places': 'Lieux', 'Object': 'Objet', 'Objects': 'Objets',
  'Lore & rules': 'Univers et règles', 'Faction': 'Faction', 'Factions': 'Factions', 'Story line': 'Intrigue', 'Story lines': 'Intrigues',
  'Theme': 'Thème', 'Themes': 'Thèmes', 'Style guide': 'Guide de style', 'New {type}': 'Nouveau : {type}',
  // Settings
  'Interface language': 'Langue de l’interface', 'Menus and buttons; each book keeps its own language': 'Menus et boutons ; chaque livre garde sa propre langue',
  'Typography': 'Typographie', 'How the manuscript looks on this computer.': 'L’aspect du manuscrit sur cet ordinateur.', 'Reset': 'Réinitialiser',
  'Font': 'Police', 'Size': 'Taille', '{n} px in Plain view': '{n} px en affichage Texte', 'Line spacing': 'Interligne',
  'Text width': 'Largeur du texte', '{n} rem in Plain view': '{n} rem en affichage Texte', 'Page size': 'Format de page',
  'Used by Page view': 'Utilisé par l’affichage Page', "From the book's language": 'Selon la langue du livre', 'Page zoom': 'Zoom de la page',
  'Paper': 'Papier', 'Ivory': 'Ivoire', 'White': 'Blanc', 'Sepia': 'Sépia', 'Night': 'Nuit', 'Ivory by day, night in the dark theme': 'Ivoire le jour, nuit en thème sombre',
  'Writing': 'Écriture', 'Focus mode': 'Mode concentration', 'The controls fade while you type and come back when the mouse moves':
    'Les commandes s’effacent pendant la frappe et reviennent quand la souris bouge',
  'Enter, Enter, Enter': 'Entrée, Entrée, Entrée', 'At the end of a scene, Enter twice starts a new scene, three times a new chapter':
    'En fin de scène, deux fois Entrée crée une nouvelle scène, trois fois un nouveau chapitre',
  'Claude': 'Claude', 'Plume uses the claude command line, signed in with your subscription.': 'Plume utilise la ligne de commande claude, connectée à votre abonnement.',
  'Command line': 'Ligne de commande', 'Looking…': 'Recherche…', 'Found: {path}': 'Trouvée : {path}',
  'Not found. Install Claude Code, or set the path to claude.exe.': 'Introuvable. Installez Claude Code, ou indiquez le chemin de claude.exe.',
  'Automatic': 'Automatique', 'Detect': 'Détecter', 'AI for this book': 'IA pour ce livre', "Saved in the book's plume.json.": 'Enregistré dans le plume.json du livre.',
  'Low effort': 'Effort faible', 'Medium effort': 'Effort moyen', 'High effort': 'Effort élevé',
  'Bible budget': 'Budget bible', 'Most tokens of bible entries sent per request': 'Maximum de jetons de fiches par requête',
  'Story window': 'Fenêtre de texte', 'Words before the cursor sent as context': 'Mots avant le curseur envoyés en contexte',
  'Continue length': 'Longueur de Continuer', 'Words asked for by Continue': 'Mots demandés par Continuer',
  'Beats length': 'Longueur des étapes', 'Words asked for by Beats to prose': 'Mots demandés par Étapes en prose',
  // Status bar
  'Signs: characters including spaces, as French publishers count': 'Signes : caractères espaces comprises, comme les éditeurs les comptent',
  'A feuillet is 1,500 signs': 'Un feuillet fait 1 500 signes', 'signs': 'signes', 'feuillets': 'feuillets',
  'Looking for claude…': 'Recherche de claude…', 'claude not found': 'claude introuvable', 'Writing…': 'Écriture…', 'claude ready': 'claude prêt',
  'Last call, as reported by the CLI: new input, input read from the cache, output': 'Dernier appel, selon le CLI : entrée nouvelle, entrée lue en cache, sortie',
  'Last': 'Dernier', 'new': 'nouveaux', 'cached': 'en cache', 'out': 'sortie', 'Today': 'Aujourd’hui', 'calls': 'appels',
  'Today: {input} new, {cached} cached, {output} out': 'Aujourd’hui : {input} nouveaux, {cached} en cache, {output} en sortie',
  'Resets {when}': 'Réinitialisé {when}', '5 h': '5 h', 'Week': 'Semaine',
  // Fonts and pages
  'Courier Prime (typewriter)': 'Courier Prime (machine à écrire)', 'Sans serif (interface)': 'Sans empattement (interface)',
  'French paperback 13 × 20 cm': 'Poche français 13 × 20 cm', 'Trade 6 × 9 in': 'Format US 6 × 9 po', 'A5 14.8 × 21 cm': 'A5 14,8 × 21 cm',
  'Start writing…': 'Commencez à écrire…',
  // Display options and Settings tabs
  'Justify the Sheet': 'Justifier la Feuille', 'Page view is always justified, like a printed book': 'L’affichage Page est toujours justifié, comme un livre imprimé',
  'Above the text': 'Au-dessus du texte', 'Point of view': 'Point de vue',
  'Status (draft, revised, done)': 'État (brouillon, révisée, terminée)', 'Sizes': 'Dimensions', 'Sheet width': 'Largeur de la Feuille',
  'Reset the manuscript look': 'Rétablir l’aspect par défaut', 'Display': 'Affichage',
  'Display: font, size, justify, what the page shows': 'Affichage : police, taille, justification, ce que montre la page',
  'More in Settings…': 'Plus dans les Paramètres…', 'Appearance': 'Apparence', 'This book': 'Ce livre', 'About': 'À propos', 'Close': 'Fermer',
  'How the manuscript looks on this computer. The quick ones are also under Aa in the bottom bar.': 'L’aspect du manuscrit sur cet ordinateur. Les réglages rapides sont aussi sous Aa, dans la barre du bas.',
  'Auto follows the Windows setting': 'Auto suit le réglage de Windows',
  'Chapters pane': 'Panneau des chapitres', 'Pinned open, or sliding in from the left edge': 'Toujours ouvert, ou glissant depuis le bord gauche',
  'Claude pane': 'Panneau Claude', 'Pinned open, or sliding in from the right edge': 'Toujours ouvert, ou glissant depuis le bord droit',
  'Design': 'Design', 'After NEO by Hugh Howey (MIT)': 'D’après NEO de Hugh Howey (MIT)',
  'Page view': 'Affichage Page', 'Page numbers': 'Numéros de page', 'Not on a chapter’s opening page, as in printed books': 'Sauf sur la page d’ouverture d’un chapitre, comme dans les livres imprimés',
  'Double-click a paragraph to edit it': 'Double-cliquez un paragraphe pour le modifier',
  // NEO-style room
  'Write: the AI panel, no spellcheck': 'Écrire : le panneau IA, sans correcteur',
  'Review: spellcheck and text figures': 'Relire : correcteur et chiffres du texte',
  'Sheet: a wide page, left-aligned, for writing': 'Feuille : une page large, alignée à gauche, pour écrire',
  'Page: as a printed book (read-only)': 'Page : comme un livre imprimé (lecture seule)',
  'Chapter headings, typography (« » and spaces in French), the spellcheck dictionary and the language Claude writes in': 'Titres des chapitres, typographie (« » et espaces en français), dictionnaire de l’orthographe et langue dans laquelle Claude écrit',
  'Show': 'Afficher', 'Show the current scene only': 'Afficher seulement la scène en cours',
  'Show the whole chapter': 'Afficher tout le chapitre', 'Show the whole book, chapter after chapter': 'Afficher tout le livre, chapitre après chapitre',
  'Sheet': 'Feuille', 'Spaces': 'Espaces', 'Chapters': 'Chapitres', 'Pin open': 'Garder ouvert', 'Unpin': 'Ne plus garder ouvert',
  'Recent books': 'Livres récents', 'Your books will stand here. Start one with +.': 'Vos livres se rangeront ici. Commencez-en un avec +.',
  'Settings': 'Paramètres', 'Auto and White: the classic white page. Night: dark paper.': 'Auto et Blanc : la page blanche classique. Nuit : papier sombre.',
}

const SHELL = {
  fr: {
    settings: 'Paramètres', appearance: 'Apparence', theme: 'Thème', themeHint: 'Auto suit le réglage de Windows',
    about: 'À propos', done: 'Terminé', close: 'Fermer', expand: 'Déplier la barre', collapse: 'Replier la barre',
    auto: 'Auto', dark: 'Sombre', light: 'Clair',
  },
  en: {
    settings: 'Settings', appearance: 'Appearance', theme: 'Theme', themeHint: 'Auto follows the Windows setting',
    about: 'About', done: 'Done', close: 'Close', expand: 'Expand sidebar', collapse: 'Collapse sidebar',
    auto: 'Auto', dark: 'Dark', light: 'Light',
  },
}
export const shellStrings = (lang: UiLang) => SHELL[lang]

export function translate(lang: UiLang, text: string, vars?: Record<string, string | number>): string {
  let s = lang === 'fr' ? FR[text] ?? text : text
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v))
  return s
}

/** Number formatting that follows the interface language (1 390 / 1,390). */
export const numLocale = () => (useStore.getState().prefs.ui === 'fr' ? 'fr-FR' : 'en-US')

/** For code outside React (store, AI actions). */
export const t = (text: string, vars?: Record<string, string | number>) => translate(useStore.getState().prefs.ui, text, vars)

/** For components: re-renders when the interface language changes. */
export function useT() {
  const lang = useStore(s => s.prefs.ui)
  return (text: string, vars?: Record<string, string | number>) => translate(lang, text, vars)
}
