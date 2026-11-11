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
        '**Ctrl+.** on an action in Ctrl+K gives it a short name or a shortcut of your own, and the actions of the space you are in come first. The tabs of the Plan and the Bible are in Ctrl+K too.',
        '**Ctrl+J** opens the **scratch pad** from any space: notes, tasks and an inbox for the whole book, kept with it and never sent to Claude. The **⋯** beside an item pins it, or sends it to the scene, a new card, the grid or a bible entry. Its **In the book** tab lists the loose ideas, placeholders and comments; a click goes to the spot.',
        'Plume reopens a book where you stopped, cursor included; the start screen offers **Continue writing**. **F11** leaves only the page (and can dim every paragraph but yours). The instructions you give the Assistant come back as chips above its box: right-click one to pin it.',
        'The button at the right of the bottom bar shows a second space beside the first (for example the Bible next to your text).',
      ],
      fr: [
        'Plume a trois espaces, dans la barre du bas : **Bible** (votre univers), **Plan** (votre structure) et **Manuscrit** (là où vous écrivez).',
        'Un livre est un dossier de fichiers Markdown sur votre disque. Rien n\'est caché : vous pouvez les ouvrir dans n\'importe quel éditeur et les sauvegarder comme un dossier. Ce que vous supprimez va dans la corbeille du livre, jamais effacé.',
        'Dans le Manuscrit, le panneau de gauche liste chapitres et scènes ; celui de droite a **Assistant** (demander à Claude), **Chat** (remue-méninges) et **Marge** (commentaires, résumé, historique).',
        '**Ctrl+K** va à n\'importe quelle scène ou fiche de la bible, et lance des actions (Exporter, Nouveau chapitre, Réglages…). **Ctrl+/** liste tous les raccourcis. **Clic droit** presque partout pour voir ce qu\'on peut faire.',
        '**Ctrl+.** sur une action de Ctrl+K lui donne un nom court ou un raccourci à vous, et les actions de l’espace où vous êtes viennent en premier. Les onglets du Plan et de la Bible sont aussi dans Ctrl+K.',
        '**Ctrl+J** ouvre le **bloc-notes** depuis n’importe quel espace : notes, tâches et une liste **À trier** pour tout le livre, gardées avec lui et jamais envoyées à Claude. Le **⋯** à côté d’un élément l’épingle, ou l’envoie dans la scène, vers une nouvelle carte, la grille ou une fiche de la bible. Son onglet **Dans le livre** liste les idées en vrac, les espaces réservés et les commentaires ; un clic mène à l’endroit.',
        'Plume rouvre un livre là où vous vous êtes arrêté, curseur compris ; l’écran d’accueil propose **Reprendre l’écriture**. **F11** ne laisse que la page (et peut estomper tous les paragraphes sauf le vôtre). Les consignes données à l’Assistant reviennent en pastilles au-dessus de sa zone : clic droit pour en épingler une.',
        'Le bouton à droite de la barre du bas affiche un second espace à côté du premier (par exemple la Bible à côté du texte).',
      ],
    },
  },
  {
    id: 'serial',
    title: { en: 'Web novels (Royal Road)', fr: 'Web novels (Royal Road)' },
    lines: {
      en: [
        'Choose **Web novel** when you create a book, or in **Settings → This book**. Chapters default to 2,000–3,500 words, one scene each, and Settings gets your **release days**.',
        '**Plan → Release** shows the **buffer** (chapters written ahead and until when they last), the next release, this week and how many weeks you kept the schedule. **Copy for Royal Road** puts a chapter on the clipboard as Royal Road\'s editor takes it; **Mark as published today** locks it.',
        'A published chapter is canon: it is read-only until you press **Edit anyway**, and Claude is told never to contradict it. Publishing also brings its summary up to date.',
        'Each chapter has an **opening hook**, **what it gives the reader** and **how it ends** (Plan → Release or Outline). **Check hooks with Claude** rates the written ones from their first and last lines only.',
        '**Arcs** replace the single structure: right-click a chapter → **Start an arc here**, give it a shape and a planned length, and each beat says around which chapter it is due. **Volumes** group arcs; **Export → Chapters** turns a volume into an ebook or a Plume book of its own.',
        '**Plan → Analysis → Threads** keeps the mysteries and promises open for the reader, and flags one untouched for too long. **Find threads with Claude** reads your chapter summaries.',
        'For long serials, Claude reads finished arcs as their summaries and the current arc chapter by chapter, so it stays consistent at chapter 300. Keep summaries up to date (Plan → Dashboard).',
        '**LitRPG** (Settings → This book): lines starting with **|** are system windows (| Level: 12), drawn as a box and exported as one. Characters get **Stats** by chapter (bible → Advanced); right-click a status box → **Update stats from this box**. The Dashboard flags boxes that disagree.',
      ],
      fr: [
        'Choisissez **Web novel** en créant un livre, ou dans **Paramètres → Ce livre**. Les chapitres font par défaut 2 000 à 3 500 mots, une scène chacun, et les Paramètres ont vos **jours de publication**.',
        '**Plan → Publication** montre l’**avance** (les chapitres écrits d’avance et jusqu’à quand ils tiennent), la prochaine publication, la semaine et le nombre de semaines tenues. **Copier pour Royal Road** met un chapitre dans le presse-papiers comme l’éditeur de Royal Road le prend ; **Marquer comme publié aujourd’hui** le verrouille.',
        'Un chapitre publié fait foi : il n’est plus modifiable jusqu’à **Modifier quand même**, et Claude a pour consigne de ne jamais le contredire. La publication met aussi son résumé à jour.',
        'Chaque chapitre a une **accroche d’ouverture**, **ce qu’il offre au lecteur** et **sa fin** (Plan → Publication ou Structure). **Vérifier les accroches avec Claude** note ceux qui sont écrits à partir de leurs premières et dernières lignes seulement.',
        'Les **arcs** remplacent la structure unique : clic droit sur un chapitre → **Commencer un arc ici**, donnez-lui une forme et une longueur prévue, et chaque temps fort dit vers quel chapitre il est attendu. Les **volumes** regroupent les arcs ; **Exporter → Chapitres** fait d’un volume un livre numérique ou un livre Plume à part.',
        '**Plan → Analyse → Fils** suit les mystères et promesses ouverts pour le lecteur, et signale ceux laissés trop longtemps. **Trouver les fils avec Claude** lit vos résumés de chapitres.',
        'Pour un long feuilleton, Claude lit les arcs terminés en résumé et l’arc en cours chapitre par chapitre, pour rester cohérent au chapitre 300. Gardez les résumés à jour (Plan → Tableau de bord).',
        '**LitRPG** (Paramètres → Ce livre) : les lignes qui commencent par **|** sont des fenêtres du système (| Niveau : 12), dessinées en encadré et exportées comme telles. Les personnages ont des **Statistiques** par chapitre (bible → Avancé) ; clic droit sur une fenêtre de statut → **Mettre à jour les statistiques**. Le tableau de bord signale les fenêtres qui les contredisent.',
      ],
    },
  },
  {
    id: 'writing',
    title: { en: 'Writing', fr: 'Écrire' },
    lines: {
      en: [
        '**Sheet** is a wide page for writing; **Page** shows real book pages. **Scene / Chapter / Book** chooses how much you see at once. All three are in the **View** menu above the page, with the font and the paper.',
        'At the end of a scene, press **Enter twice** for a new scene, **three times** for a new chapter.',
        'Typography fixes itself as you type (quotes, dashes, ellipses, French spaces) and sentences start with a capital. **Ctrl+Z right after** gives back what you typed.',
        '**Ctrl+I** italic, **Ctrl+B** bold. Pasting from Word or the web keeps only italics and bold.',
        '**Ctrl+Shift+X** drops a placeholder to fill in later (a red dot shows in the chapter list). **Ctrl+Shift+D** cuts a passage into the **darlings** drawer instead of deleting it: it can be put back.',
        'In the **Margin** tab: margin comments on a selection, a short summary of the scene (it feeds Claude\'s "story so far"), and the scene\'s version history.',
        'The scene card (Plan) has a note, shown in grey above the text; story time, place and point of view are editable above the text.',
        '**Capture lines:** start a line with **::idea**, **::todo**, **::bible Name:** or **::comment** (the French words ::idee, ::tache, ::fiche and ::commentaire work too) and press Enter. The line leaves the text and lands in the scratch pad, your tasks or the margin.',
        '**Draft mode** (its button in the bottom bar, or Ctrl+K) keeps you going: the text only goes forward. Typing lands at the end, Backspace stays within the word, undo and moving the cursor are off. **Esc** leaves it. Settings → Manuscript can turn Backspace off altogether and add typewriter sounds.',
        '**Comments** sit beside the text, level with their passages, when there is room next to the sheet (otherwise in the Margin tab); those whose passage is gone are set apart at the bottom.',
        'A scene with a card note or beats but no text yet shows them in its place, never printed, with **Write it** to have Claude write it from the plan.',
      ],
      fr: [
        '**Feuille** est une page large pour écrire ; **Page** montre de vraies pages de livre. **Scène / Chapitre / Livre** choisit ce que vous voyez d\'un coup. Les trois sont dans le menu **Vue**, au-dessus de la page, avec la police et le papier.',
        'En fin de scène, **Entrée deux fois** crée une scène, **trois fois** un chapitre.',
        'La typographie se corrige en tapant (guillemets, tirets, points de suspension, espaces français) et les phrases commencent par une majuscule. **Ctrl+Z juste après** redonne ce que vous aviez tapé.',
        '**Ctrl+I** italique, **Ctrl+B** gras. Coller depuis Word ou le web ne garde que l\'italique et le gras.',
        '**Ctrl+Maj+X** pose un repère à remplir plus tard (un point rouge apparaît dans la liste des chapitres). **Ctrl+Maj+D** coupe un passage vers le tiroir des **chouchous** au lieu de l\'effacer : on peut le remettre.',
        'Dans l\'onglet **Marge** : commentaires en marge sur une sélection, un court résumé de la scène (il alimente le « résumé de l\'histoire » donné à Claude), et l\'historique des versions de la scène.',
        'La carte de la scène (Plan) a une note, affichée en gris au-dessus du texte ; moment, lieu et point de vue se modifient au-dessus du texte.',
        '**Lignes de capture :** commencez une ligne par **::idee**, **::tache**, **::fiche Nom :** ou **::commentaire** (les mots anglais ::idea, ::todo, ::bible et ::comment marchent aussi) et appuyez sur Entrée. La ligne quitte le texte et va dans le bloc-notes, vos tâches ou la marge.',
        'Le **mode premier jet** (son bouton dans la barre du bas, ou Ctrl+K) vous fait avancer : le texte ne va que vers l’avant. La frappe arrive à la fin, Retour arrière reste dans le mot, l’annulation et le déplacement du curseur sont coupés. **Échap** en sort. Paramètres → Manuscrit peut couper tout à fait Retour arrière et ajouter des sons de machine à écrire.',
        'Les **commentaires** se placent à côté du texte, à hauteur de leurs passages, quand la feuille laisse la place (sinon dans l’onglet Marge) ; ceux dont le passage a disparu sont mis à part en bas.',
        'Une scène qui a une note de carte ou des étapes mais pas encore de texte les montre à sa place, sans jamais les imprimer, avec **L’écrire** pour que Claude l’écrive d’après le plan.',
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
        'Below the proposal, a **scorecard** checks it against your own rules (passive voice, adverbs, banned words, **AI tells** like "not X, but Y" used as a habit…). "Retry fixing" sends back only the proposal and what Claude may fix (banned words, AI habits, your longest sentence and line, dialogue dashes) and changes only those sentences; rates like passive voice and adverbs stay for you to judge.',
        'Claude matches **your voice** from samples of your own prose: your excerpts (Settings → Voice) and passages of your revised or done scenes that Claude wrote little of. Right-click a scene → **Sample of my voice** to include or leave out one.',
        'The box above the buttons is your **direction** ("tighter, more tension"). Write **@Name** to send that bible entry in full.',
        'Right-click selected text for the same actions without leaving the page. Choose the model next to the buttons; Settings → Claude sets the model and effort for writing, for editing and planning, and for small jobs.',
        'Claude only sees what it needs: your rules, the bible entries named in the passage, and the text around it. The line under the button shows the size before you send; open it for the model, the prompt and each entry.',
        'On a proposal that replaces text, **Change by change** puts each difference in the text, with ✓ and ✕ to accept or reject it.',
        '**Suggest** is for when you want to write it yourself: Claude reads the same as for Continue, then proposes three ways the scene could go on and asks one question, and writes nothing. **Note it** puts a suggestion at the cursor as ⟦a note⟧ to yourself. On a proposal of new text, **By paragraph** lets you take it a paragraph at a time, and **Edit** puts it in your text to rework.',
        '**Which prompt writes your book best?** Settings → Voice → **Compare prompts** writes the scene you are in with two or three setups (prompt, model, how much of your prose is sent) and shows the texts without their labels; pick the one you would keep, and Plume says which it was. A scene with six beats or more is written in several parts, each played in full. Under a finished proposal, **Against the bible** lists what it contradicts in the entries that were sent. After you leave a scene, what it establishes that the bible lacks is drafted in Bible → To review.',
        '**Talk to a character**: on a character’s entry, **Talk to them** opens a chat where Claude answers as that character, in their voice, knowing only what they know at the chapter you are in; write in [square brackets] to step out of the role. **Reads…** under the chat ticks the scenes and entries a conversation must read in full. A saved prompt can be a **fragment** that others pull in with {include.Name}, and a prompt can name its own model. When the book is finished, Agent tasks → **Blurb, synopsis and pitch** writes what presents it.',
        '**From the idea to the writing, in the tabs you know.** In the chat, **Start the guided brainstorm** opens a conversation that Claude leads, one question at a time, until there is enough to structure the book; **Draft the essential entries** then drafts the main entries and lists the others for later. In Plan → Outline, the buttons follow the order of the work: Claude → Outline from a premise, **Quality check**, **Detail all**, **Bible check**, **Ready to write?** (what the outline and the bible still lack before writing: thin chapter cards, missing entries, unfinished character arcs, contradictions). In the Manuscript, the toolbar has **Write the chapter** and **Edit the chapter** for the chapter you are in. The simpler view (Settings → Writing → Show everything, off) keeps the Assistant to Continue, Rewrite, Beats, Expand and Shorten.',
        '**Editing** (fourth space in the bottom bar) analyses the whole book, or the chapter you pick on the left: a score out of 100 (100 = every report within its target), one score per category and per chapter, and **Fix first**, the reports furthest over their target with about how many to cut. Open a report to see why it matters, the flagged words with their counts, and every passage in its sentence; a click opens the passage in the Manuscript with the highlights on. For a chapter, **Edit this chapter** is an editor’s read by Claude (each problem with the exact words and a fix), and **Rewrite until it holds** lets the editor and the writer take turns, up to three rounds, on a snapshot.',
      ],
      fr: [
        '**Continuer** (Ctrl+Entrée) écrit la suite à partir du curseur. **Réécrire** travaille sur le texte sélectionné. **Étapes en prose** transforme une liste d\'étapes en passage. Actions rapides : **Développer, Raccourcir, Le montrer, Aiguiser les dialogues** (sur une sélection) et **Décrire** (au curseur).',
        'La réponse est une **proposition** dans le texte : l\'ancien texte est barré, le nouveau surligné. Le texte est verrouillé tant que vous n\'avez pas décidé : **Tab** accepte, **Échap** rejette. L\'onglet Assistant a aussi Accepter, **Réessayer**, Rejeter, et **×3** (trois versions côte à côte).',
        'Sous la proposition, une **fiche de contrôle** la vérifie selon vos propres règles (voix passive, adverbes, mots interdits, **tics d’IA** comme « ce n’est pas X, c’est Y » à répétition…). « Réessayer en corrigeant » ne renvoie que la proposition et ce que Claude peut corriger (mots interdits, tics d’IA, vos limites de phrase et de réplique, tirets de dialogue) et ne change que ces phrases ; les taux comme la voix passive et les adverbes restent à votre jugement.',
        'Claude reprend **votre voix** à partir d’échantillons de votre propre prose : vos extraits (Réglages → Voix) et des passages de vos scènes relues ou terminées que Claude a peu écrites. Clic droit sur une scène → **Échantillon de ma voix** pour en inclure ou en écarter une.',
        'La zone au-dessus des boutons est votre **consigne** (« plus serré, plus de tension »). Écrivez **@Nom** pour envoyer cette fiche de la bible en entier.',
        'Clic droit sur un texte sélectionné pour les mêmes actions sans quitter la page. Choisissez le modèle à côté des boutons ; Paramètres → Claude règle le modèle et l’effort pour écrire, pour corriger et planifier, et pour les petites tâches.',
        'Claude ne voit que ce qu\'il lui faut : vos règles, les fiches de la bible citées dans le passage, et le texte autour. La ligne sous le bouton montre la taille avant l’envoi ; ouvrez-la pour le modèle, le prompt et chaque fiche.',
        'Sur une proposition qui remplace du texte, **Modification par modification** place chaque différence dans le texte, avec ✓ et ✕ pour l’accepter ou la refuser.',
        '**Suggérer**, pour quand vous voulez écrire vous-même : Claude lit la même chose que pour Continuer, propose trois façons dont la scène pourrait continuer et pose une question, sans rien écrire. **Noter** place une suggestion au curseur comme ⟦une note⟧ pour vous. Sur une proposition de texte nouveau, **Par paragraphe** la prend un paragraphe à la fois, et **Modifier** la met dans votre texte pour la retravailler.',
        '**Quel prompt écrit le mieux votre livre ?** Paramètres → Voix → **Comparer les prompts** écrit la scène ouverte avec deux ou trois réglages (prompt, modèle, quantité de votre prose envoyée) et montre les textes sans leur nom ; choisissez celui que vous garderiez, et Plume dit lequel c’était. Une scène de six étapes ou plus s’écrit en plusieurs parties, chacune jouée en entier. Sous une proposition terminée, **Face à la bible** liste ce qu’elle contredit dans les fiches envoyées. Quand vous quittez une scène, ce qu’elle établit et que la bible ne contient pas est préparé dans Bible → À relire.',
        '**Parler à un personnage** : sur la fiche d’un personnage, **Lui parler** ouvre une discussion où Claude répond à sa place, avec sa voix, en ne sachant que ce qu’il sait au chapitre où vous êtes ; écrivez entre [crochets] pour sortir du rôle. **Lit…** sous la discussion coche les scènes et les fiches qu’une conversation doit lire en entier. Un prompt enregistré peut être un **fragment** que d’autres insèrent avec {include.Nom}, et un prompt peut avoir son propre modèle. Le livre terminé, Tâches d’agent → **Quatrième de couverture, synopsis et pitch** écrit ce qui le présente.',
        '**De l’idée à l’écriture, dans les onglets que vous connaissez.** Dans la discussion, **Commencer le brainstorming guidé** ouvre une conversation que Claude mène, une question à la fois, jusqu’à ce qu’il y ait assez de matière pour structurer le livre ; **Préparer les fiches essentielles** prépare alors les fiches principales et liste les autres pour plus tard. Dans Plan → Plan détaillé, les boutons suivent l’ordre du travail : Claude → Plan à partir d’un pitch, **Contrôle qualité**, **Tout détailler**, **Contrôle de la bible**, **Prêt à écrire ?** (ce qui manque encore au plan et à la bible avant d’écrire : cartes de chapitre trop minces, fiches manquantes, arcs de personnages inachevés, contradictions). Dans le Manuscrit, la barre d’outils a **Écrire le chapitre** et **Éditer le chapitre** pour le chapitre où vous êtes. La vue simplifiée (Paramètres → Écriture → Tout afficher, désactivé) limite l’Assistant à Continuer, Réécrire, Étapes, Développer et Raccourcir.',
        '**Édition** (quatrième espace de la barre du bas) analyse le livre entier, ou le chapitre choisi à gauche : un score sur 100 (100 = chaque rapport dans sa cible), un score par catégorie et par chapitre, et **À corriger en premier**, les rapports les plus au-dessus de leur cible avec le nombre approximatif à retirer. Ouvrez un rapport pour voir pourquoi il compte, les mots relevés avec leur nombre, et chaque passage dans sa phrase ; un clic ouvre le passage dans le Manuscrit, surlignages activés. Pour un chapitre, **Éditer ce chapitre** est la lecture d’un éditeur par Claude (chaque problème avec les mots exacts et une correction), et **Réécrire jusqu’à ce que ça tienne** fait alterner l’éditeur et l’écrivain, trois tours au plus, après un instantané.',
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
        'The list groups entries in five families: **People, Places, Things, Lore, Story lines**. Click a family to fold it. Give characters a **rank** (main, secondary, minor, mentioned; in the entry or by right-click) and People is split by rank.',
        'Links, facts, tags, private notes and (for characters) the **voice card** and **Knows / Doesn\'t know** are under **Advanced** in the entry. Plume remembers if you leave it open.',
        '**Word lists, excerpts and the style guide** shape how Claude writes, not the story: they are in **Settings → Voice**, under "Your voice materials".',
        '**Entries** switch between **List**, **Table** and **Gallery**. **Analysis** holds Presence (who appears where), Map, Relations and Contradictions. The page button at the top of an entry shows it on paper.',
        'The **AI check** tab lists what makes Claude\'s context worse (missing short versions, bloated entries, duplicate names…) with one-click fixes.',
        'Select a name in the text and press **Ctrl+Shift+B** to make an entry from it; Claude drafts it from how the book uses the name. Hover a name in the text to see its card.',
        '**Fields:** add one such as Age or Role under **Fields** in an entry, and every entry of that type gets the row; its menu says whether it is sent to the AI. **Table** compares the entries of a type and edits them in place; **Gallery** shows their portraits.',
        'Type **[[** in an entry to link another entry or make a new one. **Mentions** go to the name itself in the scene (click again for the next one), and **Ctrl+click** on a name in the text opens its entry. Turn off **Detect the name in the text** (right-click the entry) for a name that is also an ordinary word.',
        '**Earlier versions…** (right-click an entry) shows what the entry was, one version kept at most every ten minutes, and can restore one.',
      ],
      fr: [
        'Une fiche a une **version courte** (envoyée chaque fois que son nom apparaît dans le passage) et une **version complète** (envoyée pour le personnage de point de vue de la scène, ou quand vous écrivez @Nom).',
        'La version complète est une pile de **blocs** (Apparence, Secrets…). Chaque bloc a un interrupteur : **toujours envoyé**, **avec la fiche complète**, ou **jamais envoyé**. Un bloc « jamais » reste dans votre fichier mais Claude ne le lit jamais.',
        '**Envoyée à l\'IA** (par fiche) : quand elle est citée, toujours, jamais (sauf @-citée), ou **secret** (jamais, même avec @).',
        'Les **alias** sont d\'autres noms (« Lise », « la Duchesse ») ; terminez-en un par **!** pour exiger les majuscules exactes. Les **liens** envoient aussi la version courte de la fiche liée. Les **faits** peuvent être datés : `[ch 3-8]`, `[ch 12+]`.',
        'La liste range les fiches en cinq familles : **Personnes, Lieux, Choses, Univers, Intrigues**. Cliquez sur une famille pour la replier. Donnez un **rang** aux personnages (principal, secondaire, figurant, évoqué ; dans la fiche ou par clic droit) et Personnes se découpe par rang.',
        'Liens, faits, étiquettes, notes privées et (pour les personnages) la **fiche de voix** et **Sait / Ignore** sont sous **Avancé** dans la fiche. Plume se souvient si vous le laissez ouvert.',
        'Les **listes de mots, extraits et le guide de style** règlent la façon dont Claude écrit, pas l\'histoire : ils sont dans **Réglages → Voix**, sous « Vos matériaux de voix ».',
        'Les **fiches** s’affichent en **Liste**, **Tableau** ou **Galerie**. **Analyse** regroupe Présence (qui apparaît où), Carte du monde, Relations et Contradictions. Le bouton page en haut d’une fiche l’affiche sur papier.',
        'L\'onglet **Contrôle IA** liste ce qui dégrade le contexte de Claude (versions courtes manquantes, fiches trop lourdes, noms en double…) avec des corrections en un clic.',
        'Sélectionnez un nom dans le texte et tapez **Ctrl+Maj+B** pour en faire une fiche ; Claude la rédige d\'après la façon dont le livre emploie ce nom. Survolez un nom dans le texte pour voir sa fiche.',
        '**Champs :** ajoutez-en un comme Âge ou Rôle sous **Champs** dans une fiche, et chaque fiche de ce type reçoit la ligne ; son menu dit s’il part à l’IA. **Tableau** compare les fiches d’un type et les modifie sur place ; **Galerie** montre leurs portraits.',
        'Tapez **[[** dans une fiche pour en lier une autre ou en créer une. Chaque ligne d’**Apparitions** va au nom lui-même dans la scène (cliquez encore pour le suivant), et **Ctrl+clic** sur un nom dans le texte ouvre sa fiche. Coupez **Repérer le nom dans le texte** (clic droit sur la fiche) pour un nom qui est aussi un mot courant.',
        '**Versions précédentes…** (clic droit sur une fiche) montre ce qu’était la fiche, une version gardée au plus toutes les dix minutes, et peut en restaurer une.',
      ],
    },
  },
  {
    id: 'plan',
    title: { en: 'Plan', fr: 'Plan' },
    lines: {
      en: [
        '**Outline**: the whole outline on one page, every field editable in place: each chapter\'s goal and ending, and for each scene its summary, POV, place, time, who is there, its numbered **beats**, what the reader learns, the arc and the pace. Claude writes from all of it.',
        'In the Outline, **Detail** has Claude fill in a chapter\'s cards; **Regenerate…** rewrites it with your direction (locked cards stay as they are). What Claude proposes appears first beside what is there: **Accept** (with Undo) or **Reject**. **Check the outline** lists gaps, dropped threads and chapters with no turn. **Revise the outline…** takes one instruction for the whole outline (add a chapter at the start, move an event, kill a character earlier…): Claude proposes the changes, you tick the ones to keep, and Undo puts the whole outline back. Merge or split scenes, merge chapters, lock a card: right-click it.',
        '**The story** (top of the Outline): your premise and the **foundation** (logline, subgenre and shape, tone, comparable books, what the protagonist wants and needs, antagonist, stakes, theme, magic system; the tone also goes with every writing request, the comparable books never do) and the **turning points**. Claude can ask you questions in the chat, then **Propose**; every outline request reads them. **Check the outline** now looks for setups never paid off and pace, with a **Fix** button per problem. Every change Claude makes keeps an **earlier version** (chapter menu). **Clean outline** (⋯) starts over. In a series, **The series** (above The story) holds the whole series’ arc, one line per book and the big reveals; entries get **Later in the series** and cards get **Seeds for later books**. Claude plans with them and plants clues, but never plays out later books, and prose never sees them. Timeline, Story lines and Dashboard are under **Analysis**; revision passes are in Manuscript → Review.',
        '**Cards / List / Board** (top of the Outline): **List** is an outline you type. **Enter** makes a new row, **Tab** and **Shift+Tab** change its level (chapter, scene, beat), **Alt+Up** and **Alt+Down** move it, **Ctrl+Enter** opens its note. A change that would lose text or notes is refused.',
        '**Board**: each card is a real scene. Drag cards to reorder (the text moves with them), double-click to write, **Ctrl+Z** takes back a move. With the keyboard: arrows go from card to card, **Alt+arrows** move the card, **Enter** shows its details, **Ctrl+Enter** writes it. Colour cards by POV, story line or tension; filter by POV or story line. Type a part title above a chapter to start a **part**.',
        '**Grid**: open sheets to think on, with tiles, sticky notes and titles, and lines between them. Double-click to add a tile, drag from the dot on its edge to draw a line; the wheel moves around, Ctrl+wheel zooms. A tile can stand for a scene or a bible entry (**Put on the grid** in their menus, or right-click the sheet); removing the tile leaves them alone. The grid is never sent to the AI.',
        '**Structure** (under Analysis): pick a template (three acts, hero\'s journey…) and place its beats on your scenes. The **tension curve** shows how tense each scene is (Claude rates them; click the chart to correct), and warns when a beat that should peak sits on a calm scene.',
        '**Timeline** and **Story lines** show story time and which scene moves which thread. **Dashboard**: chapter-by-chapter charts and a "needs attention" list. **Revision**: tick off passes (structure, line edit, proofread) scene by scene. In **Story lines**, click a square to choose the scenes; **By scene** shows each scene.',
        '**Outline from a premise** (the **Claude** menu of the Outline): write a few lines, Claude proposes chapters and scenes, and you untick what you don\'t want.',
        '**Agent tasks** (the More menu at the bottom, or Ctrl+K) is the book’s list of findings, and runs reads of the whole book: the **Editor’s letter** (Claude reads the whole manuscript in one request: what works, what to revise first, and continuity checked on the text), **A reader’s read** (interest chapter by chapter, and where attention drops), **Where the book left the plan** (each written scene against its card; the outline then shows what was written, and the cards that left the plan), **Series continuity** (this book against the other books of its series that Plume knows) and the free **Repetitions across the book**. The whole-book reads are large requests: their size shows before you run them.',
      ],
      fr: [
        '**Plan détaillé** : tout le plan sur une page, chaque champ modifiable sur place : le but et la fin de chaque chapitre, et pour chaque scène son résumé, point de vue, lieu, moment, qui est là, ses **étapes** numérotées, ce que le lecteur apprend, le trajet intérieur et le rythme. Claude écrit à partir de tout cela.',
        'Dans le Plan détaillé, **Détailler** fait remplir par Claude les cartes d’un chapitre ; **Régénérer…** le réécrit selon votre consigne (les cartes verrouillées ne bougent pas). Ce que Claude propose s’affiche d’abord à côté de l’existant : **Accepter** (avec Annuler) ou **Rejeter**. **Vérifier le plan** liste les trous, les fils abandonnés et les chapitres sans tournant. **Modifier le plan…** prend une seule consigne pour tout le plan (ajouter un chapitre au début, déplacer un événement, faire mourir un personnage plus tôt…) : Claude propose les changements, vous cochez ceux à garder, et Annuler remet tout le plan comme avant. Fusionner ou couper des scènes, fusionner des chapitres, verrouiller une carte : clic droit.',
        '**L’histoire** (en haut du Plan détaillé) : votre pitch, les **fondations** (pitch en une phrase, sous-genre et forme, ton, livres comparables, ce que veut et ce dont a besoin le protagoniste, antagoniste, enjeux, thème, système de magie ; le ton part aussi avec chaque demande d’écriture, les livres comparables jamais) et les **tournants**. Claude peut vous poser des questions dans le chat, puis **Proposer** ; toutes les demandes de plan les lisent. **Vérifier le plan** cherche aussi les indices jamais repris et le rythme, avec un bouton **Corriger** par problème. Chaque changement de Claude garde une **version précédente** (menu du chapitre). **Effacer le plan** (⋯) repart de zéro. Dans une série, **La série** (au-dessus de L’histoire) garde l’arc de toute la série, une ligne par tome et les grandes révélations ; les fiches ont **Plus tard dans la série** et les cartes **Graines pour la suite**. Claude s’en sert pour le plan et pose des indices, sans jamais raconter les tomes suivants, et la prose ne les voit jamais. Chronologie, Intrigues et Tableau de bord sont dans **Analyse** ; les passes de révision dans Manuscrit → Relecture.',
        '**Cartes / Liste / Tableau** (en haut du Plan détaillé) : **Liste** est un plan à taper. **Entrée** crée une ligne, **Tab** et **Maj+Tab** changent son niveau (chapitre, scène, étape), **Alt+Haut** et **Alt+Bas** la déplacent, **Ctrl+Entrée** ouvre sa note. Un changement qui perdrait du texte ou des notes est refusé.',
        '**Tableau** : chaque carte est une vraie scène. Glissez pour réordonner (le texte suit), double-cliquez pour écrire, **Ctrl+Z** annule un déplacement. Au clavier : les flèches vont de carte en carte, **Alt+flèches** déplace la carte, **Entrée** affiche ses détails, **Ctrl+Entrée** l’écrit. Colorez les cartes par point de vue, intrigue ou tension ; filtrez par point de vue ou intrigue. Tapez un titre de partie au-dessus d\'un chapitre pour ouvrir une **partie**.',
        '**Grille** : des feuilles ouvertes pour réfléchir, avec des tuiles, des pense-bêtes et des titres, et des traits entre eux. Double-cliquez pour ajouter une tuile, tirez depuis le point sur son bord pour tracer un trait ; la molette déplace, Ctrl+molette zoome. Une tuile peut représenter une scène ou une fiche de la bible (**Mettre sur la grille** dans leurs menus, ou clic droit sur la feuille) ; retirer la tuile ne les touche pas. La grille n’est jamais envoyée à l’IA.',
        '**Structure** (sous Analyse) : choisissez un modèle (trois actes, voyage du héros…) et placez ses temps forts sur vos scènes. La **courbe de tension** montre la tension de chaque scène (Claude les note ; cliquez le graphique pour corriger) et prévient quand un temps fort censé culminer tombe sur une scène calme.',
        '**Chronologie** et **Intrigues** montrent le temps de l\'histoire et quelle scène fait avancer quel fil. **Tableau de bord** : graphiques chapitre par chapitre et liste « à surveiller ». **Révision** : cochez les passes (structure, style, relecture) scène par scène. Dans **Intrigues**, cliquez sur une case pour choisir les scènes ; **Par scène** montre chaque scène.',
        '**Plan à partir d\'un pitch** (menu **Claude** du Plan détaillé) : écrivez quelques lignes, Claude propose chapitres et scènes, vous décochez ce que vous ne voulez pas.',
        '**Tâches d’agent** (menu Plus en bas, ou Ctrl+K) est la liste des remarques du livre, et lance des lectures du livre entier : la **Lettre d’éditeur** (Claude lit tout le manuscrit en une requête : ce qui fonctionne, ce qu’il faut réviser d’abord, et la continuité vérifiée sur le texte), **La lecture d’un lecteur** (l’intérêt chapitre par chapitre, et où l’attention retombe), **Où le livre s’écarte du plan** (chaque scène écrite face à sa fiche ; le plan détaillé montre ensuite ce qui a été écrit, et les fiches dont le texte s’est écarté), **Continuité de la série** (ce tome face aux autres tomes que Plume connaît) et les **Répétitions dans tout le livre**, gratuites. Les lectures du livre entier sont de grosses requêtes : leur taille s’affiche avant de les lancer.',
      ],
    },
  },
  {
    id: 'review',
    title: { en: 'Review mode', fr: 'Mode Relecture' },
    lines: {
      en: [
        'Switch **Write / Review** at the top. Review shows how many reports are over their target, and the reports for pacing, dialogue, strong writing, word choice, repetition and readability; click a report to highlight its findings in the text and step through them.',
        'It opens on the **three reports worth a look first** (furthest above their target); **All reports** shows the rest. New installs start in a simpler mode that hides the less used tabs and reports: **Show everything** (or Settings → Writing) brings them back.',
        'Targets come from Plume\'s defaults, or from **reference books** you add in Settings → Voice (novels you admire, measured on your computer; only the numbers are kept).',
        '**Who says what** shows each character\'s share of the dialogue, their tics, and lines that break their voice card. **Read aloud** speaks the scene.',
        'Spelling and grammar come from **LanguageTool** (any book language) or the Windows spellchecker; choose in Settings → Writing. LanguageTool also checks every other text box: bible entries, the outline, notes, chat. The AI checks (beta reader, line edit, voices, continuity) cost tokens and say so first. **Edit this chapter** (Review panel, chapter menu, Ctrl+K) does them all at once on a whole chapter, Polish or Deep, then fixes what you keep as tracked changes. **Fix what’s flagged** (Review panel, for the scene or the chapter; chapter menu, Ctrl+K) goes straight to what Plume measures, your rules, AI tells and the reports well over target, on text already written: a snapshot first, tracked changes, and a count of what would still be flagged.',
        '**Proofreading for publication.** For a long book, run LanguageTool on your own computer: install Java, download the LanguageTool server, start it with `java -cp languagetool-server.jar org.languagetool.server.HTTPServer --port 8081 --allow-origin *`, then set the server to `http://localhost:8081` in Settings → Writing. Your text then never leaves your computer, and there is no daily limit. For Antidote or Word: **Copy for Antidote or Word** in a chapter’s menu puts the chapter on the clipboard with its italics; correct it there and bring the changes back.',
      ],
      fr: [
        'Basculez **Écrire / Relire** en haut. Relire montre combien de rapports dépassent leur cible, et les rapports sur le rythme, les dialogues, l\'écriture forte, le choix des mots, les répétitions et la lisibilité ; cliquez un rapport pour surligner ses résultats dans le texte et les parcourir.',
        'Elle s’ouvre sur les **trois rapports à regarder d’abord** (les plus au-dessus de leur cible) ; **Tous les rapports** montre le reste. Une nouvelle installation démarre dans un mode plus simple qui masque les onglets et rapports moins utilisés : **Tout afficher** (ou Réglages → Écriture) les fait revenir.',
        'Les cibles viennent des valeurs par défaut de Plume, ou des **livres de référence** que vous ajoutez dans Paramètres → Voix (des romans que vous admirez, mesurés sur votre ordinateur ; seuls les chiffres sont gardés).',
        '**Qui dit quoi** montre la part de dialogue de chaque personnage, ses tics, et les répliques qui contredisent sa fiche de voix. **Lecture à voix haute** lit la scène.',
        'L\'orthographe et la grammaire viennent de **LanguageTool** (toute langue de livre) ou du correcteur de Windows ; choisissez dans Paramètres → Écriture. LanguageTool vérifie aussi toutes les autres zones de texte : fiches de la bible, plan, notes, chat. Les contrôles par IA (bêta-lecteur, relecture de style, voix, continuité) coûtent des tokens et le disent avant. **Corriger ce chapitre** (panneau Relecture, menu du chapitre, Ctrl+K) les fait tous d’un coup sur un chapitre entier, en finition ou en profondeur, puis corrige ce que vous gardez en modifications suivies. **Corriger ce qui est signalé** (panneau Relecture, pour la scène ou le chapitre ; menu du chapitre, Ctrl+K) va droit à ce que Plume mesure, vos règles, les tics d’IA et les rapports très au-dessus de leur cible, sur un texte déjà écrit : instantané d’abord, modifications suivies, et le compte de ce qui resterait signalé.',
        '**Corriger pour publier.** Pour un livre entier, faites tourner LanguageTool sur votre ordinateur : installez Java, téléchargez le serveur LanguageTool, lancez-le avec `java -cp languagetool-server.jar org.languagetool.server.HTTPServer --port 8081 --allow-origin *`, puis indiquez le serveur `http://localhost:8081` dans Paramètres → Écriture. Votre texte ne quitte alors plus votre ordinateur, sans limite par jour. Pour Antidote ou Word : **Copier pour Antidote ou Word** dans le menu d’un chapitre met le chapitre dans le presse-papiers avec ses italiques ; corrigez-le là-bas et reportez les corrections.',
      ],
    },
  },
  {
    id: 'safe',
    title: { en: 'Export, history and safety', fr: 'Export, historique et sécurité' },
    lines: {
      en: [
        '**Export…** (⋯ menu): the book as EPUB, Word, PDF, web page or Markdown; the **bible** or the **outline** on their own as Word or Markdown (also in Ctrl+K, the Outline\'s ⋯ menu and an entry\'s right-click menu). Secret entries and private notes stay out of a bible export unless you tick them. **Front and back matter** (copyright, dedication, epigraph, acknowledgments, about the author) are written in Settings → This book.',
        '**Snapshots** (⋯ menu) keep a named copy of the whole book, with its bible and its plan; compare it later and put back a scene, an entry or part of the plan. Each scene also keeps its own **version history** (Margin).',
        '**Ctrl+Z** and **Ctrl+Y** in the Plan and the Bible, outside a text box, take back or redo the last change, deletions and renames included, until the book closes.',
        '**Find and replace** (Ctrl+Shift+F) works on the whole book and keeps the old text in each scene\'s history.',
        'Plume saves as you type, makes a **daily backup** (the last ten, then one a week) in its own folder, and keeps a lock so two copies of the app don\'t overwrite each other.',
      ],
      fr: [
        '**Exporter…** (menu ⋯) : le livre en EPUB, Word, PDF, page web ou Markdown ; la **bible** ou le **plan détaillé** seuls en Word ou Markdown (aussi dans Ctrl+K, le menu ⋯ du Plan détaillé et le clic droit sur une fiche). Les fiches secrètes et les notes privées restent hors de l’export de la bible sauf si vous les cochez. Les **pages liminaires et finales** (copyright, dédicace, épigraphe, remerciements, à propos de l\'auteur) s\'écrivent dans Paramètres → Ce livre.',
        '**Instantanés** (menu ⋯) gardent une copie nommée du livre entier, avec sa bible et son plan ; comparez-la plus tard et rétablissez une scène, une fiche ou une partie du plan. Chaque scène garde aussi son **historique de versions** (Marge).',
        '**Ctrl+Z** et **Ctrl+Y** dans le Plan et la Bible, hors d’une zone de texte, annulent ou rétablissent le dernier changement, suppressions et renommages compris, jusqu’à la fermeture du livre.',
        '**Rechercher et remplacer** (Ctrl+Maj+F) agit sur tout le livre et garde l\'ancien texte dans l\'historique de chaque scène.',
        'Plume enregistre en tapant, fait une **sauvegarde quotidienne** (les dix dernières, puis une par semaine) dans son propre dossier, et pose un verrou pour que deux copies de l\'application ne s\'écrasent pas.',
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
        'Never sent to any AI: **secret** entries, **private notes** on entries, blocks marked **never sent**, the **scratch pad** and the **grid**.',
      ],
      fr: [
        'Plume parle à la **ligne de commande claude**, connectée à votre abonnement Claude. La barre du bas montre votre usage sur 5 heures et sur la semaine. Le **mode économe** (Paramètres → Claude) passe à Haiku au-delà d\'une part de votre limite.',
        'Dans Paramètres → Claude, ajoutez une clé **OpenRouter** pour utiliser d\'autres modèles, ou continuer à écrire quand votre forfait Claude est épuisé (« Quand Claude est épuisé »). Les **préréglages de modèle** sont des choix nommés de modèle et d\'effort, choisis dans l\'Assistant et dans Paramètres → Ce livre.',
        'Jamais envoyés à une IA : les fiches **secrètes**, les **notes privées** des fiches, les blocs marqués **jamais envoyé**, le **bloc-notes** et la **grille**.',
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
