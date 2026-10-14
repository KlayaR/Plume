// Export: the book out of Plume as EPUB (with a table of contents for KDP),
// Word (.docx, as a book or in submission format), or Markdown. The text is
// cleaned on the way: placeholders removed, typography fixed for the language.
// PDF is printed from Page view (window.print), see ExportDialog.
import type { Book, Chapter } from './types'
import { chapterLabels } from './chapters'
import { fixTypography } from './typography'
import { countWords, newId } from './text'
import { makeZip, utf8 } from './zip'
import { inlineDocx, inlineHtml } from './inline'
import { BACK, FRONT, matterPages } from './matter'

export type ExportFormat = 'epub' | 'docx' | 'md' | 'pdf' | 'html'
export type DocxLayout = 'book' | 'submission'

export interface ExportOptions { format: ExportFormat; layout: DocxLayout; titlePage: boolean; sceneBreak: string }

/** A scene's text as it should be published: no placeholders, clean typography, paragraphs. */
export function cleanParagraphs(text: string, book: Book): string[] {
  const clean = fixTypography(text.replace(/⟦[^⟧\n]*⟧/g, ''), book.meta.language)
  return clean.split('\n').map(p => p.replace(/[ \t]+/g, ' ').trim()).filter(Boolean)
}

interface Part { label: string; title: string; part?: string; scenes: string[][] }

function parts(book: Book): Part[] {
  const labels = chapterLabels(book.chapters, book.meta.language)
  return book.chapters.map((c: Chapter, i) => ({
    label: labels[i].label,
    title: c.title && c.title !== labels[i].label ? c.title : '',
    part: c.part?.trim() || undefined,
    scenes: c.scenes.map(s => cleanParagraphs(s.text, book)).filter(s => s.length),
  }))
}

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// --- Markdown -------------------------------------------------------------------------

export function toMarkdown(book: Book, o: ExportOptions): string {
  const out: string[] = [`# ${book.meta.title}`, book.meta.author ? `*${book.meta.author}*` : '']
  for (const m of matterPages(book, FRONT)) out.push(m.paras.join('\n\n'))
  for (const p of parts(book)) {
    if (p.part) out.push(`# ${p.part}`)
    out.push(`## ${p.label}${p.title ? ` : ${p.title}` : ''}`)
    out.push(p.scenes.map(s => s.join('\n\n')).join(`\n\n${o.sceneBreak}\n\n`))
  }
  for (const m of matterPages(book, BACK)) out.push(`## ${m.heading}`, m.paras.join('\n\n'))
  return out.filter(Boolean).join('\n\n') + '\n'
}

// --- HTML: one file for beta readers -------------------------------------------------

/** The book as a single web page: readable on any screen, light or dark, with a table of contents. Nothing to install. */
export function toHtml(book: Book, o: ExportOptions): string {
  const lang = book.meta.language
  const ps = parts(book)
  const front = matterPages(book, FRONT), back = matterPages(book, BACK)
  const toc = [
    ...ps.map((p, i) => `<li><a href="#c${i + 1}">${p.part ? `${esc(p.part)} · ` : ''}${esc(p.label)}${p.title ? ` : ${esc(p.title)}` : ''}</a></li>`),
    ...back.map(m => `<li><a href="#${m.key}">${esc(m.heading)}</a></li>`),
  ].join('\n')
  const frontHtml = front.map(m => `<section class="matter">${m.paras.map(p => `<p>${inlineHtml(p)}</p>`).join('\n')}</section>`).join('\n')
  const backHtml = back.map(m => `<section id="${m.key}"><h2>${esc(m.heading)}</h2>${m.paras.map(p => `<p>${inlineHtml(p)}</p>`).join('\n')}</section>`).join('\n')
  const body = ps.map((p, i) => `<section id="c${i + 1}">
${p.part ? `<h2 class="part">${esc(p.part)}</h2>` : ''}
<h2>${esc(p.label)}${p.title ? `<br><span>${esc(p.title)}</span>` : ''}</h2>
${p.scenes.map(s => s.map(para => `<p>${inlineHtml(para)}</p>`).join('\n')).join(`\n<p class="break">${esc(o.sceneBreak)}</p>\n`)}
</section>`).join('\n') + '\n' + backHtml
  return `<!DOCTYPE html>
<html lang="${lang}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${esc(book.meta.title)}</title>
<style>
:root { color-scheme: light dark; --bg: #fbf8f1; --fg: #25221d; --muted: #7a7366; }
@media (prefers-color-scheme: dark) { :root { --bg: #17160f; --fg: #e4dfd2; --muted: #968f80; } }
body { margin: 0; background: var(--bg); color: var(--fg); font: 1.15rem/1.7 Georgia, 'Times New Roman', serif; }
main { max-width: 36rem; margin: 0 auto; padding: 3rem 1.25rem 6rem; }
h1 { font-size: 2.2rem; text-align: center; margin: 3rem 0 .25rem; }
.author { text-align: center; color: var(--muted); margin-bottom: 3rem; }
nav { margin: 0 0 4rem; } nav ul { list-style: none; padding: 0; } nav a { color: var(--fg); text-decoration: none; border-bottom: 1px solid var(--muted); }
section.matter { margin: 5rem 0; text-align: center; font-style: italic; } section.matter p { text-align: center; text-indent: 0; margin-bottom: 1rem; } h2.part { font-size: 2rem; margin-top: 8rem; }
h2 { text-align: center; font-size: 1.4rem; margin: 5rem 0 2rem; } h2 span { font-weight: normal; color: var(--muted); font-size: 1.1rem; }
p { margin: 0; text-align: justify; hyphens: auto; } p + p { text-indent: 1.4em; } p.break { text-indent: 0; text-align: center; margin: 1.5rem 0; color: var(--muted); }
</style>
</head>
<body>
<main>
${o.titlePage ? `<h1>${esc(book.meta.title)}</h1>\n${book.meta.author ? `<div class="author">${esc(book.meta.author)}</div>` : ''}` : ''}
<nav><ul>
${toc}
</ul></nav>
${frontHtml}
${body}
</main>
</body>
</html>
`
}

// --- EPUB 3 (with an NCX for older readers and KDP) -------------------------------------

export async function toEpub(book: Book, o: ExportOptions): Promise<Uint8Array> {
  const lang = book.meta.language
  const id = `urn:uuid:${newId()}${newId()}-${newId()}`
  const ps = parts(book)
  const page = (title: string, body: string) => `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${lang}" lang="${lang}">
<head><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="style.css"/></head>
<body>
${body}
</body>
</html>`
  const matterHtml = (m: { paras: string[]; heading: string }) => page(m.heading || book.meta.title, `<section class="matter" epub:type="${m.heading ? 'backmatter' : 'frontmatter'}">${m.heading ? `<h1>${esc(m.heading)}</h1>` : ''}
${m.paras.map(p => `<p>${inlineHtml(p)}</p>`).join('\n')}
</section>`)
  const frontDocs = matterPages(book, FRONT).map((m, i) => ({ file: `front${i + 1}.xhtml`, title: m.heading, toc: false, html: matterHtml(m) }))
  const backDocs = matterPages(book, BACK).map((m, i) => ({ file: `back${i + 1}.xhtml`, title: m.heading, toc: true, html: matterHtml(m) }))
  const chapterDocs = ps.flatMap((p, i) => [
    ...(p.part ? [{ file: `part${String(i + 1).padStart(3, '0')}.xhtml`, title: p.part, toc: true, html: page(p.part, `<section class="partpage" epub:type="part"><h1>${esc(p.part)}</h1></section>`) }] : []),
    {
    file: `ch${String(i + 1).padStart(3, '0')}.xhtml`,
    toc: true,
    title: p.title ? `${p.label} : ${p.title}` : p.label,
    html: page(p.label, `<section epub:type="chapter">
<h1><span class="num">${esc(p.label)}</span>${p.title ? `<br/><span class="title">${esc(p.title)}</span>` : ''}</h1>
${p.scenes.map(s => s.map((para, j) => `<p${j === 0 ? ' class="first"' : ''}>${inlineHtml(para)}</p>`).join('\n')).join(`\n<p class="break">${esc(o.sceneBreak)}</p>\n`)}
</section>`),
  }])
  const chapters = [...frontDocs, ...chapterDocs, ...backDocs]
  const toc = lang === 'fr' ? 'Table des matières' : 'Contents'
  const files = [
    { name: 'mimetype', data: utf8('application/epub+zip'), store: true },
    { name: 'META-INF/container.xml', data: utf8(`<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>`) },
    { name: 'OEBPS/style.css', data: utf8(`body { font-family: serif; line-height: 1.45; margin: 0 5%; }
h1 { text-align: center; font-weight: normal; margin: 3em 0 2em; page-break-before: always; }
h1 .num { font-size: 0.7em; letter-spacing: 0.25em; text-transform: uppercase; }
h1 .title { font-size: 1.2em; }
p { margin: 0; text-indent: 1.5em; text-align: justify; }
p.first { text-indent: 0; }
p.break { text-align: center; text-indent: 0; margin: 1em 0; }
.titlepage { text-align: center; margin-top: 30%; }
.titlepage h1 { page-break-before: auto; font-size: 2em; }
.matter { text-align: center; margin-top: 25%; font-style: italic; }
.matter p { text-indent: 0; text-align: center; margin: 0 0 1em; }
.matter h1 { font-style: normal; margin-top: 0; }
.partpage { text-align: center; margin-top: 35%; }
.partpage h1 { font-size: 2em; letter-spacing: .1em; }`) },
    ...(o.titlePage ? [{ name: 'OEBPS/title.xhtml', data: utf8(page(book.meta.title, `<section class="titlepage" epub:type="titlepage"><h1>${esc(book.meta.title)}</h1>${book.meta.author ? `<p class="first">${esc(book.meta.author)}</p>` : ''}</section>`)) }] : []),
    ...chapters.map(c => ({ name: `OEBPS/${c.file}`, data: utf8(c.html) })),
    { name: 'OEBPS/nav.xhtml', data: utf8(page(toc, `<nav epub:type="toc" id="toc"><h1>${toc}</h1><ol>
${chapters.filter(c => c.toc).map(c => `<li><a href="${c.file}">${esc(c.title)}</a></li>`).join('\n')}
</ol></nav>`)) },
    { name: 'OEBPS/toc.ncx', data: utf8(`<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1"><head><meta name="dtb:uid" content="${id}"/></head>
<docTitle><text>${esc(book.meta.title)}</text></docTitle><navMap>
${chapters.filter(c => c.toc).map((c, i) => `<navPoint id="n${i + 1}" playOrder="${i + 1}"><navLabel><text>${esc(c.title)}</text></navLabel><content src="${c.file}"/></navPoint>`).join('\n')}
</navMap></ncx>`) },
    { name: 'OEBPS/content.opf', data: utf8(`<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${lang}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">${id}</dc:identifier>
<dc:title>${esc(book.meta.title)}</dc:title>
${book.meta.author ? `<dc:creator>${esc(book.meta.author)}</dc:creator>` : ''}
<dc:language>${lang}</dc:language>
<meta property="dcterms:modified">${new Date().toISOString().slice(0, 19)}Z</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>
<item id="css" href="style.css" media-type="text/css"/>
${o.titlePage ? '<item id="title" href="title.xhtml" media-type="application/xhtml+xml"/>' : ''}
${chapters.map((c, i) => `<item id="c${i + 1}" href="${c.file}" media-type="application/xhtml+xml"/>`).join('\n')}
</manifest>
<spine toc="ncx">
${o.titlePage ? '<itemref idref="title"/>' : ''}
<itemref idref="nav" linear="no"/>
${chapters.map((_, i) => `<itemref idref="c${i + 1}"/>`).join('\n')}
</spine>
</package>`) },
  ]
  return makeZip(files)
}

// --- Word (.docx) --------------------------------------------------------------------------

/**
 * Book layout: serif, 1.15 spacing, first-line indents, each chapter on a new page.
 * Submission layout: Times New Roman 12, numbered pages, chapters a third down the page;
 * French publishers: 1.5 spacing, 2.5 cm margins; English manuscript format: double spacing,
 * 1-inch margins, "Author / TITLE / page" in the header, word count on the title page.
 */
export async function toDocx(book: Book, o: ExportOptions): Promise<Uint8Array> {
  const fr = book.meta.language === 'fr'
  const sub = o.layout === 'submission'
  const font = sub ? 'Times New Roman' : 'Georgia'
  const line = sub ? (fr ? 360 : 480) : 276 // 240 = single spacing
  const margin = sub ? (fr ? 1418 : 1440) : 1247 // twips: 2.5 cm, 1 in, 2.2 cm
  const words = book.chapters.reduce((n, c) => n + c.scenes.reduce((m, s) => m + countWords(s.text), 0), 0)
  const run = (text: string) => `<w:r><w:t xml:space="preserve">${esc(text)}</w:t></w:r>`
  const para = (text: string, style: string, first = false) =>
    `<w:p><w:pPr><w:pStyle w:val="${style}"/>${first ? '<w:ind w:firstLine="0"/>' : ''}</w:pPr>${inlineDocx(text, esc)}</w:p>`
  const body: string[] = []
  if (o.titlePage) {
    if (sub && !fr) body.push(para(book.meta.author || '—', 'Plain'), para(`${Math.round(words / 1000) * 1000} words`, 'Plain'))
    body.push(`<w:p><w:pPr><w:pStyle w:val="Title"/><w:spacing w:before="${sub ? 4000 : 3000}"/></w:pPr>${run(book.meta.title)}</w:p>`)
    if (book.meta.author) body.push(para(book.meta.author, 'Subtitle'))
  }
  let started = o.titlePage
  const pageBreak = () => { const b = started ? '<w:pageBreakBefore/>' : ''; started = true; return b }
  for (const m of matterPages(book, FRONT)) m.paras.forEach((text, j) => body.push(`<w:p><w:pPr><w:pStyle w:val="Center"/>${j === 0 ? `${pageBreak()}<w:spacing w:before="3000"/>` : ''}</w:pPr>${inlineDocx(text, esc)}</w:p>`))
  parts(book).forEach(p => {
    if (p.part) body.push(`<w:p><w:pPr><w:pStyle w:val="Title"/>${pageBreak()}<w:spacing w:before="4000"/></w:pPr>${run(p.part)}</w:p>`)
    body.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/>${pageBreak()}${sub ? '<w:spacing w:before="3600"/>' : ''}</w:pPr>${run(p.label)}</w:p>`)
    if (p.title) body.push(para(p.title, 'Heading2'))
    p.scenes.forEach((s, si) => {
      if (si > 0) body.push(para(o.sceneBreak, 'Break'))
      s.forEach((text, j) => body.push(para(text, 'Body', j === 0)))
    })
  })
  for (const m of matterPages(book, BACK)) {
    body.push(`<w:p><w:pPr><w:pStyle w:val="Heading1"/>${pageBreak()}</w:pPr>${run(m.heading)}</w:p>`)
    m.paras.forEach((text, j) => body.push(para(text, 'Body', j === 0)))
  }
  const surname = (book.meta.author || '').trim().split(/\s+/).pop() ?? ''
  const header = sub && !fr ? `${surname} / ${book.meta.title.toUpperCase()} / ` : ''
  const document = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<w:body>
${body.join('\n')}
<w:sectPr>
${sub && !fr ? '<w:headerReference w:type="default" r:id="rIdHeader"/>' : '<w:footerReference w:type="default" r:id="rIdFooter"/>'}
<w:pgSz w:w="${sub ? (fr ? 11906 : 12240) : 8391}" w:h="${sub ? (fr ? 16838 : 15840) : 11906}"/>
<w:pgMar w:top="${margin}" w:right="${margin}" w:bottom="${margin}" w:left="${margin}" w:header="708" w:footer="708" w:gutter="0"/>
${o.titlePage ? '<w:titlePg/>' : ''}
</w:sectPr>
</w:body>
</w:document>`
  const pageField = '<w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText xml:space="preserve"> PAGE </w:instrText></w:r><w:r><w:fldChar w:fldCharType="separate"/></w:r><w:r><w:t>1</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r>'
  const footer = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:ftr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="center"/></w:pPr>${pageField}</w:p></w:ftr>`
  const headerXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:pPr><w:jc w:val="right"/></w:pPr>${run(header)}${pageField}</w:p></w:hdr>`
  const indent = sub ? 709 : 360
  const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
<w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="${font}" w:hAnsi="${font}" w:cs="${font}"/><w:sz w:val="24"/><w:lang w:val="${fr ? 'fr-FR' : 'en-US'}"/></w:rPr></w:rPrDefault>
<w:pPrDefault><w:pPr><w:spacing w:after="0" w:line="${line}" w:lineRule="auto"/></w:pPr></w:pPrDefault></w:docDefaults>
<w:style w:type="paragraph" w:default="1" w:styleId="Body"><w:name w:val="Body"/><w:pPr><w:ind w:firstLine="${indent}"/>${sub ? '' : '<w:jc w:val="both"/>'}</w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Plain"><w:name w:val="Plain"/></w:style>
<w:style w:type="paragraph" w:styleId="Center"><w:name w:val="Matter"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:rPr><w:i/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Break"><w:name w:val="Scene break"/><w:pPr><w:jc w:val="center"/><w:spacing w:before="240" w:after="240"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Title"><w:name w:val="Title"/><w:pPr><w:jc w:val="center"/><w:spacing w:after="240"/></w:pPr><w:rPr><w:sz w:val="${sub ? 28 : 44}"/></w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Subtitle"><w:name w:val="Subtitle"/><w:pPr><w:jc w:val="center"/></w:pPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading1"><w:name w:val="heading 1"/><w:pPr><w:keepNext/><w:jc w:val="center"/><w:spacing w:before="1200" w:after="480"/><w:outlineLvl w:val="0"/></w:pPr><w:rPr><w:caps/><w:spacing w:val="40"/>${sub ? '' : '<w:sz w:val="22"/>'}</w:rPr></w:style>
<w:style w:type="paragraph" w:styleId="Heading2"><w:name w:val="heading 2"/><w:pPr><w:keepNext/><w:jc w:val="center"/><w:spacing w:after="480"/><w:outlineLvl w:val="1"/></w:pPr><w:rPr><w:sz w:val="${sub ? 24 : 32}"/></w:rPr></w:style>
</w:styles>`
  return makeZip([
    { name: '[Content_Types].xml', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
<Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
<Override PartName="/word/footer1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.footer+xml"/>
<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>
</Types>`) },
    { name: '_rels/.rels', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`) },
    { name: 'word/_rels/document.xml.rels', data: utf8(`<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rIdStyles" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
<Relationship Id="rIdFooter" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/footer" Target="footer1.xml"/>
<Relationship Id="rIdHeader" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml"/>
</Relationships>`) },
    { name: 'word/document.xml', data: utf8(document) },
    { name: 'word/styles.xml', data: utf8(styles) },
    { name: 'word/footer1.xml', data: utf8(footer) },
    { name: 'word/header1.xml', data: utf8(headerXml) },
  ])
}
