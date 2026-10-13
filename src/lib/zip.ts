// A small zip reader and writer for backups, .docx import, and .docx / .epub
// export. Compression uses the browser's own deflate (CompressionStream).

export interface ZipEntry { name: string; data: Uint8Array; store?: boolean }

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

export function crc32(data: Uint8Array): number {
  let c = 0xffffffff
  for (let i = 0; i < data.length; i++) c = CRC_TABLE[(c ^ data[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

async function pipe(data: Uint8Array, stream: CompressionStream | DecompressionStream): Promise<Uint8Array> {
  const out = new Response(new Blob([new Uint8Array(data)]).stream().pipeThrough(stream))
  return new Uint8Array(await out.arrayBuffer())
}
const canDeflate = () => typeof CompressionStream !== 'undefined'

export const utf8 = (s: string) => new TextEncoder().encode(s)
export const fromUtf8 = (b: Uint8Array) => new TextDecoder().decode(b)

/** Builds a zip. Entries marked `store` (an EPUB's mimetype) are never compressed. */
export async function makeZip(entries: ZipEntry[]): Promise<Uint8Array> {
  const chunks: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  const now = new Date()
  const dosTime = (now.getHours() << 11) | (now.getMinutes() << 5) | (now.getSeconds() >> 1)
  const dosDate = ((now.getFullYear() - 1980) << 9) | ((now.getMonth() + 1) << 5) | now.getDate()
  for (const e of entries) {
    const name = utf8(e.name)
    const crc = crc32(e.data)
    const deflate = !e.store && canDeflate() && e.data.length > 64
    const body = deflate ? await pipe(e.data, new CompressionStream('deflate-raw')) : e.data
    const method = deflate ? 8 : 0
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true); local.setUint16(4, 20, true); local.setUint16(6, 0x0800, true); local.setUint16(8, method, true)
    local.setUint16(10, dosTime, true); local.setUint16(12, dosDate, true); local.setUint32(14, crc, true)
    local.setUint32(18, body.length, true); local.setUint32(22, e.data.length, true); local.setUint16(26, name.length, true); local.setUint16(28, 0, true)
    chunks.push(new Uint8Array(local.buffer), name, body)
    const cen = new DataView(new ArrayBuffer(46))
    cen.setUint32(0, 0x02014b50, true); cen.setUint16(4, 20, true); cen.setUint16(6, 20, true); cen.setUint16(8, 0x0800, true); cen.setUint16(10, method, true)
    cen.setUint16(12, dosTime, true); cen.setUint16(14, dosDate, true); cen.setUint32(16, crc, true); cen.setUint32(20, body.length, true)
    cen.setUint32(24, e.data.length, true); cen.setUint16(28, name.length, true); cen.setUint32(42, offset, true)
    central.push(new Uint8Array(cen.buffer), name)
    offset += 30 + name.length + body.length
  }
  const cenSize = central.reduce((s, c) => s + c.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true); end.setUint16(8, entries.length, true); end.setUint16(10, entries.length, true)
  end.setUint32(12, cenSize, true); end.setUint32(16, offset, true)
  const all = [...chunks, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((s, c) => s + c.length, 0))
  let at = 0
  for (const c of all) { out.set(c, at); at += c.length }
  return out
}

/** Reads every file of a zip (stored or deflated). */
export async function readZip(zip: Uint8Array): Promise<Map<string, Uint8Array>> {
  const v = new DataView(zip.buffer, zip.byteOffset, zip.byteLength)
  let end = zip.length - 22
  while (end >= 0 && v.getUint32(end, true) !== 0x06054b50) end--
  if (end < 0) throw new Error('Not a zip file')
  const count = v.getUint16(end + 10, true)
  let p = v.getUint32(end + 16, true)
  const out = new Map<string, Uint8Array>()
  for (let i = 0; i < count; i++) {
    const method = v.getUint16(p + 10, true)
    const size = v.getUint32(p + 20, true)
    const nameLen = v.getUint16(p + 28, true), extraLen = v.getUint16(p + 30, true), commentLen = v.getUint16(p + 32, true)
    const local = v.getUint32(p + 42, true)
    const name = fromUtf8(zip.subarray(p + 46, p + 46 + nameLen))
    const dataAt = local + 30 + v.getUint16(local + 26, true) + v.getUint16(local + 28, true)
    const raw = zip.subarray(dataAt, dataAt + size)
    out.set(name, method === 8 ? await pipe(raw, new DecompressionStream('deflate-raw')) : raw.slice())
    p += 46 + nameLen + extraLen + commentLen
  }
  return out
}

export function toBase64(data: Uint8Array): string {
  let s = ''
  for (let i = 0; i < data.length; i += 0x8000) s += String.fromCharCode(...data.subarray(i, i + 0x8000))
  return btoa(s)
}

export function fromBase64(b64: string): Uint8Array {
  const s = atob(b64)
  const out = new Uint8Array(s.length)
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i)
  return out
}
