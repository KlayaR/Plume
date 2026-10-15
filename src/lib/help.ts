// The in-app help: how to use Plume, topic by topic, in both interface
// languages. Plain data so it can be searched; **bold** marks what to look for.

export interface HelpTopic { id: string; title: { en: string; fr: string }; lines: { en: string[]; fr: string[] } }

export const HELP: HelpTopic[] = [
  {
    id: 'start',
    title: { en: 'Start here', fr: 'Pour commencer' },
    lines: {
      en: [
        'Plume has three spaces, in the bar at the bottom: **Bible** (your world), **Plan** (your outline) and **Manuscript** (where you write).',
        'A book is a folder of Markdown files on your disk. Nothing is hidden: you can open them in any editor, and back them up like any folder. Removed things go to the book\'s trash folder, never deleted.',
        'In the Manuscript, the left pane lists chapters and scenes; the right pane has **Assistant** (ask Claude), **Chat** (brainstorm) and **Margin** (comments, summary, history).',
        '**Ctrl+K** jumps to any scene or bible entry, and runs actions (Export, New chapter, Settings…). **Ctrl+/** lists every shortcut. **Right-click** almost anywhere for what you can do there.',
        'Plume reopens a book where you stopped, cursor included; the start screen offers **Continue writing**. **F11** leaves only the page (and can dim every paragraph but yours). The instructions you give the Assistant come back as chips above its box: right-click one to pin it.',
        'The button at the right of the bottom bar shows a second space beside the first (for example the Bible next to your text).',
      ],
      fr: [
        'Plume a trois espaces, dans la barre du bas : **Bible** (votre univers), **Plan** (votre structure) et **Manuscrit** (là où vous écrivez).',
        'Un livre est un dossier de fichiers Markdown sur votre disque. Rien n\'est caché : vous pouvez les ouvrir dans n\'importe quel éditeur et les sauvegarder comme un dossier. Ce que vous supprimez va dans la corbeille du livre, jamais effacé.',
        'Dans le Manuscrit, le panneau de gauche liste chapitres et scènes ; celui de droite a **Assistant** (demander à Claude), **Chat** (remue-méninges) et **Marge** (commentaires, résumé, historique).',
        '**Ctrl+K** va à n\'importe quelle scène ou fiche de la bible, et lance des actions (Exporter, Nouveau chapitre, Réglages…). **Ctrl+/** liste tous les raccourcis. **Clic droit** presque partout pour voir ce qu\'on peut faire.',
        'Plume rouvre un livre là où vous vous êtes arrêté, curseur compris ; l’écran d’accueil propose **Reprendre l’écriture**. **F11** ne laisse que la page (et peut estomper tous les paragraphes sauf le vôtre). Les consignes données à l’Assistant reviennent en pastilles au-dessus de sa zone : clic droit pour en épingler une.',
        'Le bouton à droite de la barre du bas affiche un second espace à côté du premier (par exemple la Bible à côté du texte).',
      ],
    },
  },
  {
    id: 'writing',
    title: { en: 'Writing', fr: 'Écrire' },
    lines: {
      en: [
        '**Sheet** is a wide page for writing; **Page** shows real book pages. **Scene / Chapter / Book** chooses how much you see at once.',
        'At the end of a scene, press **Enter twice** for a new scene, **three times** for a new chapter.',
        'Typography fixes itself as you type (quotes, dashes, ellipses, French spaces) and sentences start with a capital. **Ctrl+Z right after** gives back what you typed.',
        '**Ctrl+I** italic, **Ctrl+B** bold. Pasting from Word or the web keeps only italics and bold.',
        '**Ctrl+Shift+X** drops a placeholder to fill in later (a red dot shows in the chapter list). **Ctrl+Shift+D** cuts a passage into the **darlings** drawer instead of deleting it: it can be put back.',
        'In the **Margin** tab: margin comments on a selection, a short summary of the scene (it feeds Claude\'s "story so far"), and the scene\'s version history.',
        'The scene card (Plan) has a note, shown in grey above the text; story time, place and point of view are editable above the text.',
      ],
      fr: [
        '**Feuille** est une page large pour écrire ; **Page** montre de vraies pages de livre. **Scène / Chapitre / Livre** choisit ce que vous voyez d\'un coup.',
        'En fin de scène, **Entrée deux fois** crée une scène, **trois fois** un chapitre.',
        'La typographie se corrige en tapant (guillemets, tirets, points de suspension, espaces français) et les phrases commencent par une majuscule. **Ctrl+Z juste après** redonne ce que vous aviez tapé.',
        '**Ctrl+I** italique, **Ctrl+B** gras. Coller depuis Word ou le web ne garde que l\'italique et le gras.',
        '**Ctrl+Maj+X** pose un repère à remplir plus tard (un point rouge apparaît dans la liste des chapitres). **Ctrl+Maj+D** coupe un passage vers le tiroir des **chouchous** au lieu de l\'effacer : on peut le remettre.',
        'Dans l\'onglet **Marge** : commentaires en marge sur une sélection, un court résumé de la scène (il alimente le « résumé de l\'histoire » donné à Claude), et l\'historique des versions de la scène.',
        'La fiche de scène (Plan) a une note, affichée en gris au-dessus du texte ; moment, lieu et point de vue se modifient au-dessus du texte.',
      ],
    },
  },
  {
    id: 'claude',
    title: { en: 'Asking Claude (Assistant)', fr: 'Demander à Claude (Assistant)' },
    lines: {
      en: [
        '**Continue** (Ctrl+Enter) writes on from the cursor. **Rewrite** works on the text you selected. **Beats to prose** turns a list of beats into a passage. Quick actions: **Expand, Shorten, Show it, Sharpen dialogue** (on a selection) and **Describe** (at the cursor).',
        'The answer is a **proposal** in the text: the old text is struck through, the new text highlighted. The text is locked until you decide: **Tab** accepts, **Esc** discards. The Assistant tab also has Accept, **Retry**, Discard, and **x3** (three versions side by side).',
        'Below the proposal, a **scorecard** checks it against your own rules (passive voice, adverbs, banned words, **AI tells** like "not X, but Y" used as a habit…). "Retry fixing" sends back only the proposal and what failed, and changes only those sentences.',
        'Claude matches **your voice** from samples of your own prose: your excerpts (Settings → Voice) and passages of your revised or done scenes that Claude wrote little of. Right-click a scene → **Sample of my voice** to include or leave out one.',
        'The box above the buttons is your **direction** ("tighter, more tension"). Write **@Name** to send that bible entry in full.',
        'Right-click selected text for the same actions without leaving the page. Choose the model (a **preset**) next to the buttons; presets are made in Settings → Claude.',
        'Claude only sees what it needs: your rules, the bible entries named in the passage, and the text around it. The size meter shows it before you send.',
      ],
      fr: [
        '**Continuer** (Ctrl+Entrée) écrit la suite à partir du curseur. **Réécrire** travaille sur le texte sélectionné. **Étapes en prose** transforme une liste d\'étapes en passage. Actions rapides : **Développer, Raccourcir, Le montrer, Aiguiser les dialogues** (sur une sélection) et **Décrire** (au curseur).',
        'La réponse est une **proposition** dans le texte : l\'ancien texte est barré, le nouveau surligné. Le texte est verrouillé tant que vous n\'avez pas décidé : **Tab** accepte, **Échap** rejette. L\'onglet Assistant a aussi Accepter, **Réessayer**, Rejeter, et **×3** (trois versions côte à côte).',
        'Sous la proposition, une **fiche de contrôle** la vérifie selon vos propres règles (voix passive, adverbes, mots interdits, **tics d’IA** comme « ce n’est pas X, c’est Y » à répétition…). « Réessayer en corrigeant » ne renvoie que la proposition et ce qui a échoué, et ne change que ces phrases.',
        'Claude reprend **votre voix** à partir d’échantillons de votre propre prose : vos extraits (Réglages → Voix) et des passages de vos scènes relues ou terminées que Claude a peu écrites. Clic droit sur une scène → **Échantillon de ma voix** pour en inclure ou en écarter une.',
        'La zone au-dessus des boutons est votre **consigne** (« plus serré, plus de tension »). Écrivez **@Nom** pour envoyer cette fiche de la bible en entier.',
        'Clic droit sur un texte sélectionné pour les mêmes actions sans quitter la page. Choisissez le modèle (un **préréglage**) à côté des boutons ; les préréglages se créent dans Paramètres → Claude.',
        'Claude ne voit que ce qu\'il lui faut : vos règles, les fiches de la bible citées dans le passage, et le texte autour. Le compteur de taille le montre avant l\'envoi.',
      ],
    },
  },
  {
    id: 'chat',
    title: { en: 'Brainstorm chat', fr: 'Chat de remue-méninges' },
    lines: {
      en: [
        'The **Chat** tab talks with Claude about your book; it knows your bible. Under the box, choose **which AI** answers (Claude command line or OpenRouter), then the **model**.',
        '**Turn into entries** drafts bible entries from the conversation into the Bible\'s **To review** tab, where you accept, edit or reject each one.',
        'In a bible entry, **Interview me** makes Claude ask you questions to fill the gaps.',
        'The clock icon lists **past conversations**; they are saved with the book. Right-click a message to copy it, insert it in the manuscript, or delete it.',
      ],
      fr: [
        'L\'onglet **Chat** discute de votre livre avec Claude ; il connaît votre bible. Sous la zone de texte, choisissez **quelle IA** répond (ligne de commande Claude ou OpenRouter), puis le **modèle**.',
        '**Transformer en fiches** rédige des fiches de bible à partir de la conversation, dans l\'onglet **À relire** de la Bible, où vous acceptez, modifiez ou rejetez chacune.',
        'Dans une fiche de la bible, **M\'interroger** fait poser des questions par Claude pour combler les manques.',
        'L\'icône d\'horloge liste les **conversations passées** ; elles sont enregistrées avec le livre. Clic droit sur un message pour le copier, l\'insérer dans le manuscrit ou le supprimer.',
      ],
    },
  },
  {
    id: 'bible',
    title: { en: 'The bible', fr: 'La bible' },
    lines: {
      en: [
        'An entry has a **short version** (sent every time its name appears in the passage you ask about) and a **full version** (sent for the scene\'s point-of-view character, or when you write @Name).',
        'The full version is a stack of **blocks** (Appearance, Secrets…). Each block has a switch: **always sent**, **with the full entry**, or **never sent**. A "never" block stays in your file but Claude never reads it.',
        '**Sent to the AI** (per entry): when mentioned, always, never (unless @-mentioned), or **secret** (never, not even @-mentioned).',
        '**Aliases** are other names ("Lise", "the Duchess"); end one with **!** to match exact capitals. **Links** send a linked entry\'s short version along. **Facts** can be dated: `[ch 3-8]`, `[ch 12+]`.',
        'The list groups entries in five families: **People, Places, Things, Lore, Story lines**. Click a family to fold it.',
        'Links, facts, tags, private notes and (for characters) the **voice card** and **Knows / Doesn\'t know** are under **Advanced** in the entry. Plume remembers if you leave it open.',
        '**Word lists, excerpts and the style guide** shape how Claude writes, not the story: they are in **Settings → Voice**, under "Your voice materials".',
        'The **More** tab holds Presence (who appears where), Map, Relations and Contradictions.',
        'The **AI check** tab lists what makes Claude\'s context worse (missing short versions, bloated entries, duplicate names…) with one-click fixes.',
        'Select a name in the text and press **Ctrl+Shift+B** to make an entry from it; Claude drafts it from how the book uses the name. Hover a name in the text to see its card.',
      ],
      fr: [
        'Une fiche a une **version courte** (envoyée chaque fois que son nom apparaît dans le passage) et une **version complète** (envoyée pour le personnage de point de vue de la scène, ou quand vous écrivez @Nom).',
        'La version complète est une pile de **blocs** (Apparence, Secrets…). Chaque bloc a un interrupteur : **toujours envoyé**, **avec la fiche complète**, ou **jamais envoyé**. Un bloc « jamais » reste dans votre fichier mais Claude ne le lit jamais.',
        '**Envoyée à l\'IA** (par fiche) : quand elle est citée, toujours, jamais (sauf @-citée), ou **secret** (jamais, même avec @).',
        'Les **alias** sont d\'autres noms (« Lise », « la Duchesse ») ; terminez-en un par **!** pour exiger les majuscules exactes. Les **liens** envoient aussi la version courte de la fiche liée. Les **faits** peuvent être datés : `[ch 3-8]`, `[ch 12+]`.',
        'La liste range les fiches en cinq familles : **Personnes, Lieux, Choses, Univers, Intrigues**. Cliquez sur une famille pour la replier.',
        'Liens, faits, étiquettes, notes privées et (pour les personnages) la **fiche de voix** et **Sait / Ignore** sont sous **Avancé** dans la fiche. Plume se souvient si vous le laissez ouvert.',
        'Les **listes de mots, extraits et le guide de style** règlent la façon dont Claude écrit, pas l\'histoire : ils sont dans **Réglages → Voix**, sous « Vos matériaux de voix ».',
        'L\'onglet **Plus** regroupe Présence (qui apparaît où), Carte du monde, Relations et Contradictions.',
        'L\'onglet **Contrôle IA** liste ce qui dégrade le contexte de Claude (versions courtes manquantes, fiches trop lourdes, noms en double…) avec des corrections en un clic.',
        'Sélectionnez un nom dans le texte et tapez **Ctrl+Maj+B** pour en faire une fiche ; Claude la rédige d\'après la façon dont le livre emploie ce nom. Survolez un nom dans le texte pour voir sa fiche.',
      ],
    },
  },
  {
    id: 'plan',
    title: { en: 'Plan', fr: 'Plan' },
    lines: {
      en: [
        '**Outline**: the whole outline on one page, every field editable in place: each chapter\'s goal and ending, and for each scene its summary, POV, place, time, who is there, its numbered **beats**, what the reader learns, the arc and the pace. Claude writes from all of it.',
        'In the Outline, **Detail** has Claude fill in a chapter\'s cards; **Regenerate…** rewrites it with your direction (locked cards stay as they are). What Claude proposes appears first beside what is there: **Accept** (with Undo) or **Reject**. **Check the outline** lists gaps, dropped threads and chapters with no turn. Merge or split scenes, merge chapters, lock a card: right-click it.',
        '**The story** (top of the Outline): your premise and the **foundation** (logline, subgenre and shape, tone, comparable books, what the protagonist wants and needs, antagonist, stakes, theme, magic system; the tone also goes with every writing request, the comparable books never do) and the **turning points**. Claude can ask you questions in the chat, then **Propose**; every outline request reads them. **Check the outline** now looks for setups never paid off and pace, with a **Fix** button per problem. Every change Claude makes keeps an **earlier version** (chapter menu). **Clean outline** (⋯) starts over. Timeline, Story lines and Dashboard are under **Analysis**; revision passes are in Manuscript → Review.',
        '**Board**: each card is a real scene. Drag cards to reorder (the text moves with them), double-click to write, **Ctrl+Z** takes back a move. Colour cards by POV, story line or tension; filter by POV or story line. Type a part title above a chapter to start a **part**.',
        '**Structure**: pick a template (three acts, hero\'s journey…) and place its beats on your scenes. The **tension curve** shows how tense each scene is (Claude rates them; click the chart to correct), and warns when a beat that should peak sits on a calm scene.',
        '**Timeline** and **Story lines** show story time and which scene moves which thread. **Dashboard**: chapter-by-chapter charts and a "needs attention" list. **Revision**: tick off passes (structure, line edit, proofread) scene by scene.',
        '**Outline from a premise** (Board): write a few lines, Claude proposes chapters and scenes, and you untick what you don\'t want.',
      ],
      fr: [
        '**Plan détaillé** : tout le plan sur une page, chaque champ modifiable sur place : le but et la fin de chaque chapitre, et pour chaque scène son résumé, point de vue, lieu, moment, qui est là, ses **étapes** numérotées, ce que le lecteur apprend, le trajet intérieur et le rythme. Claude écrit à partir de tout cela.',
        'Dans le Plan détaillé, **Détailler** fait remplir par Claude les fiches d’un chapitre ; **Régénérer…** le réécrit selon votre consigne (les fiches verrouillées ne bougent pas). Ce que Claude propose s’affiche d’abord à côté de l’existant : **Accepter** (avec Annuler) ou **Rejeter**. **Vérifier le plan** liste les trous, les fils abandonnés et les chapitres sans tournant. Fusionner ou couper des scènes, fusionner des chapitres, verrouiller une fiche : clic droit.',
        '**L’histoire** (en haut du Plan détaillé) : votre pitch, les **fondations** (pitch en une phrase, sous-genre et forme, ton, livres comparables, ce que veut et ce dont a besoin le protagoniste, antagoniste, enjeux, thème, système de magie ; le ton part aussi avec chaque demande d’écriture, les livres comparables jamais) et les **tournants**. Claude peut vous poser des questions dans le chat, puis **Proposer** ; toutes les demandes de plan les lisent. **Vérifier le plan** cherche aussi les indices jamais repris et le rythme, avec un bouton **Corriger** par problème. Chaque changement de Claude garde une **version précédente** (menu du chapitre). **Effacer le plan** (⋯) repart de zéro. Chronologie, Intrigues et Tableau de bord sont dans **Analyse** ; les passes de révision dans Manuscrit → Relecture.',
        '**Tableau** : chaque carte est une vraie scène. Glissez pour réordonner (le texte suit), double-cliquez pour écrire, **Ctrl+Z** annule un déplacement. Colorez les cartes par point de vue, intrigue ou tension ; filtrez par point de vue ou intrigue. Tapez un titre de partie au-dessus d\'un chapitre pour ouvrir une **partie**.',
        '**Structure** : choisissez un modèle (trois actes, voyage du héros…) et placez ses temps forts sur vos scènes. La **courbe de tension** montre la tension de chaque scène (Claude les note ; cliquez le graphique pour corriger) et prévient quand un temps fort censé culminer tombe sur une scène calme.',
        '**Chronologie** et **Intrigues** montrent le temps de l\'histoire et quelle scène fait avancer quel fil. **Tableau de bord** : graphiques chapitre par chapitre et liste « à surveiller ». **Révision** : cochez les passes (structure, style, relecture) scène par scène.',
        '**Plan à partir d\'un pitch** (Tableau) : écrivez quelques lignes, Claude propose chapitres et scènes, vous décochez ce que vous ne voulez pas.',
      ],
    },
  },
  {
    id: 'review',
    title: { en: 'Review mode', fr: 'Mode Relecture' },
    lines: {
      en: [
        'Switch **Write / Review** at the top. Review shows a score and reports for pacing, dialogue, strong writing, word choice, repetition and readability; click a report to highlight its findings in the text and step through them.',
        'It opens on the **three reports worth a look first** (furthest above their target); **All reports** shows the rest. New installs start in a simpler mode that hides the less used tabs and reports: **Show everything** (or Settings → Appearance) brings them back.',
        'Targets come from Plume\'s defaults, or from **reference books** you add in Settings → Voice (novels you admire, measured on your computer; only the numbers are kept).',
        '**Who says what** shows each character\'s share of the dialogue, their tics, and lines that break their voice card. **Read aloud** speaks the scene.',
        'Spelling and grammar come from **LanguageTool** (any book language) or the Windows spellchecker; choose in Settings → Writing. LanguageTool also checks every other text box: bible entries, the outline, notes, chat. The AI checks (beta reader, line edit, voices, continuity) cost tokens and say so first.',
      ],
      fr: [
        'Basculez **Écrire / Relire** en haut. Relire montre une note et des rapports sur le rythme, les dialogues, l\'écriture forte, le choix des mots, les répétitions et la lisibilité ; cliquez un rapport pour surligner ses résultats dans le texte et les parcourir.',
        'Elle s’ouvre sur les **trois rapports à regarder d’abord** (les plus au-dessus de leur cible) ; **Tous les rapports** montre le reste. Une nouvelle installation démarre dans un mode plus simple qui masque les onglets et rapports moins utilisés : **Tout afficher** (ou Réglages → Apparence) les fait revenir.',
        'Les cibles viennent des valeurs par défaut de Plume, ou des **livres de référence** que vous ajoutez dans Paramètres → Voix (des romans que vous admirez, mesurés sur votre ordinateur ; seuls les chiffres sont gardés).',
        '**Qui dit quoi** montre la part de dialogue de chaque personnage, ses tics, et les répliques qui contredisent sa fiche de voix. **Lecture à voix haute** lit la scène.',
        'L\'orthographe et la grammaire viennent de **LanguageTool** (toute langue de livre) ou du correcteur de Windows ; choisissez dans Paramètres → Écriture. LanguageTool vérifie aussi toutes les autres zones de texte : fiches de la bible, plan, notes, chat. Les contrôles par IA (bêta-lecteur, relecture de style, voix, continuité) coûtent des tokens et le disent avant.',
      ],
    },
  },
  {
    id: 'safe',
    title: { en: 'Export, history and safety', fr: 'Export, historique et sécurité' },
    lines: {
      en: [
        '**Export the book** (⋯ menu): EPUB, Word, PDF, web page, Markdown. **Front and back matter** (copyright, dedication, epigraph, acknowledgments, about the author) are written in Settings → This book.',
        '**Snapshots** (⋯ menu) keep a named copy of the whole book; compare it later scene by scene and restore a scene. Each scene also keeps its own **version history** (Margin).',
        '**Find and replace** (Ctrl+Shift+F) works on the whole book and keeps the old text in each scene\'s history.',
        'Plume saves as you type, makes a **daily backup** (kept two weeks) in its own folder, and keeps a lock so two copies of the app don\'t overwrite each other.',
      ],
      fr: [
        '**Exporter le livre** (menu ⋯) : EPUB, Word, PDF, page web, Markdown. Les **pages liminaires et finales** (copyright, dédicace, épigraphe, remerciements, à propos de l\'auteur) s\'écrivent dans Paramètres → Ce livre.',
        '**Instantanés** (menu ⋯) gardent une copie nommée du livre entier ; comparez-la plus tard scène par scène et restaurez une scène. Chaque scène garde aussi son **historique de versions** (Marge).',
        '**Rechercher et remplacer** (Ctrl+Maj+F) agit sur tout le livre et garde l\'ancien texte dans l\'historique de chaque scène.',
        'Plume enregistre en tapant, fait une **sauvegarde quotidienne** (gardée deux semaines) dans son propre dossier, et pose un verrou pour que deux copies de l\'application ne s\'écrasent pas.',
      ],
    },
  },
  {
    id: 'engines',
    title: { en: 'Claude, OpenRouter and cost', fr: 'Claude, OpenRouter et coût' },
    lines: {
      en: [
        'Plume talks to the **claude command line**, signed in with your Claude subscription. The bottom bar shows your 5-hour and weekly usage. **Cheap mode** (Settings → Claude) switches to Haiku past a share of your limit.',
        'In Settings → Claude, add an **OpenRouter** key to use other models, or to keep writing when your Claude plan runs out ("When Claude runs out"). **Model presets** are named choices of model and effort, picked in the Assistant and in Settings → This book.',
        'Never sent to any AI: **secret** entries, **private notes** on entries, and blocks marked **never sent**.',
      ],
      fr: [
        'Plume parle à la **ligne de commande claude**, connectée à votre abonnement Claude. La barre du bas montre votre usage sur 5 heures et sur la semaine. Le **mode économe** (Paramètres → Claude) passe à Haiku au-delà d\'une part de votre limite.',
        'Dans Paramètres → Claude, ajoutez une clé **OpenRouter** pour utiliser d\'autres modèles, ou continuer à écrire quand votre forfait Claude est épuisé (« Quand Claude est épuisé »). Les **préréglages de modèle** sont des choix nommés de modèle et d\'effort, choisis dans l\'Assistant et dans Paramètres → Ce livre.',
        'Jamais envoyés à une IA : les fiches **secrètes**, les **notes privées** des fiches, et les blocs marqués **jamais envoyé**.',
      ],
    },
  },
]

/** Topics with a line (or title) containing every word of the query. */
export function searchHelp(query: string, lang: 'en' | 'fr'): HelpTopic[] {
  const words = query.toLowerCase().split(/\s+/).filter(Boolean)
  if (!words.length) return HELP
  return HELP.filter(h => {
    const text = `${h.title[lang]} ${h.lines[lang].join(' ')}`.toLowerCase().replace(/\*\*/g, '')
    return words.every(w => text.includes(w))
  })
}
