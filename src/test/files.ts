/** Small, structurally valid files for upload tests. Built byte by byte so tests need no fixtures on disk. */

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0))
const u16be = (n: number) => [(n >> 8) & 0xff, n & 0xff]
const u32be = (n: number) => [(n >>> 24) & 0xff, (n >>> 16) & 0xff, (n >>> 8) & 0xff, n & 0xff]
const u32le = (n: number) => [n & 0xff, (n >>> 8) & 0xff, (n >>> 16) & 0xff, (n >>> 24) & 0xff]

/** A text marker that must never survive metadata stripping. */
export const SECRET_GPS = 'GPS 18.5074N 73.8077E'

/** JPEG with a JFIF header, an EXIF segment carrying GPS text, then image data. */
export function jpegWithExif(): Uint8Array {
  const app0 = [0xff, 0xe0, ...u16be(16), ...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0]
  const exifBody = [...ascii('Exif'), 0, 0, ...ascii(SECRET_GPS)]
  const app1 = [0xff, 0xe1, ...u16be(exifBody.length + 2), ...exifBody]
  const dqt = [0xff, 0xdb, ...u16be(4), 0, 1]
  const sos = [0xff, 0xda, ...u16be(8), 1, 1, 0, 0, 0x3f, 0, 0x12, 0x34, 0x56]
  return new Uint8Array([0xff, 0xd8, ...app0, ...app1, ...dqt, ...sos, 0xff, 0xd9])
}

function pngChunk(type: string, data: number[]): number[] {
  // CRCs are not checked by the stripper; a fixed value keeps the builder simple.
  return [...u32be(data.length), ...ascii(type), ...data, 0, 0, 0, 0]
}

/** PNG with a tEXt chunk carrying GPS text. */
export function pngWithText(): Uint8Array {
  return new Uint8Array([
    0x89,
    0x50,
    0x4e,
    0x47,
    0x0d,
    0x0a,
    0x1a,
    0x0a,
    ...pngChunk('IHDR', [...u32be(1), ...u32be(1), 8, 2, 0, 0, 0]),
    ...pngChunk('tEXt', [...ascii('Comment'), 0, ...ascii(SECRET_GPS)]),
    ...pngChunk('IDAT', [0x78, 0x9c, 0x63, 0x60, 0, 0, 0, 2, 0, 1]),
    ...pngChunk('IEND', []),
  ])
}

function riffChunk(type: string, data: number[]): number[] {
  const padded = data.length % 2 ? [...data, 0] : data
  return [...ascii(type), ...u32le(data.length), ...padded]
}

/** Extended WebP with an EXIF chunk (flag set in VP8X). */
export function webpWithExif(): Uint8Array {
  const body = [
    ...ascii('WEBP'),
    ...riffChunk('VP8X', [0x08, 0, 0, 0, 0, 0, 0, 0, 0, 0]),
    ...riffChunk('VP8 ', [1, 2, 3, 4, 5]),
    ...riffChunk('EXIF', ascii(SECRET_GPS)),
  ]
  return new Uint8Array([...ascii('RIFF'), ...u32le(body.length), ...body])
}

export function tinyPdf(): Uint8Array {
  return new Uint8Array(ascii('%PDF-1.4\n1 0 obj << >> endobj\ntrailer << >>\n%%EOF\n'))
}

/** An HTML page renamed to .jpg: must be rejected however it is labelled. */
export function htmlPretendingToBeJpeg(): Uint8Array {
  return new Uint8Array(ascii('<html><script>alert(1)</script></html>'))
}

export const containsText = (bytes: Uint8Array, text: string) =>
  Buffer.from(bytes).includes(Buffer.from(text))
