/**
 * File-type detection from content (never the name or the browser's claimed type) and
 * removal of embedded metadata such as EXIF GPS coordinates from photos.
 */

export type SniffedType = 'image/jpeg' | 'image/png' | 'image/webp' | 'application/pdf'

export const IMAGE_TYPES: readonly SniffedType[] = ['image/jpeg', 'image/png', 'image/webp']

const startsWith = (bytes: Uint8Array, signature: readonly number[], offset = 0) =>
  bytes.length >= offset + signature.length && signature.every((b, i) => bytes[offset + i] === b)

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0))

/** The real type from magic bytes, or null for anything we do not accept. */
export function sniffType(bytes: Uint8Array): SniffedType | null {
  if (startsWith(bytes, [0xff, 0xd8, 0xff])) return 'image/jpeg'
  if (startsWith(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return 'image/png'
  if (startsWith(bytes, ascii('RIFF')) && startsWith(bytes, ascii('WEBP'), 8)) return 'image/webp'
  if (startsWith(bytes, ascii('%PDF-'))) return 'application/pdf'
  return null
}

export class InvalidFileError extends Error {
  constructor(message = 'The file is damaged or not a supported image') {
    super(message)
    this.name = 'InvalidFileError'
  }
}

/**
 * JPEG: drops APP1 (EXIF, XMP) and APP13 (IPTC) segments before the image data.
 * Keeps APP0 (JFIF), APP2 (colour profile) and APP14 (Adobe colour transform).
 */
function stripJpeg(input: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [input.subarray(0, 2)]
  let i = 2
  while (i < input.length) {
    if (input[i] !== 0xff) throw new InvalidFileError()
    const marker = input[i + 1]
    if (marker === undefined) throw new InvalidFileError()
    // Fill bytes between segments.
    if (marker === 0xff) {
      i++
      continue
    }
    // Start of scan: everything from here on is image data.
    if (marker === 0xda) {
      parts.push(input.subarray(i))
      break
    }
    // Standalone markers without a length.
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
      parts.push(input.subarray(i, i + 2))
      i += 2
      continue
    }
    if (marker === 0xd9) {
      parts.push(input.subarray(i, i + 2))
      break
    }
    if (i + 4 > input.length) throw new InvalidFileError()
    const length = (input[i + 2] << 8) | input[i + 3]
    if (length < 2 || i + 2 + length > input.length) throw new InvalidFileError()
    const drop = marker === 0xe1 || marker === 0xed
    if (!drop) parts.push(input.subarray(i, i + 2 + length))
    i += 2 + length
  }
  return concat(parts)
}

const PNG_METADATA_CHUNKS = new Set(['eXIf', 'tEXt', 'iTXt', 'zTXt', 'tIME'])

/** PNG: drops text, EXIF and timestamp chunks. Each chunk has its own CRC, so others stay valid. */
function stripPng(input: Uint8Array): Uint8Array {
  const parts: Uint8Array[] = [input.subarray(0, 8)]
  let i = 8
  let sawEnd = false
  while (i < input.length) {
    if (i + 12 > input.length) throw new InvalidFileError()
    const length = readUint32BE(input, i)
    const type = String.fromCharCode(...input.subarray(i + 4, i + 8))
    const end = i + 12 + length
    if (end > input.length) throw new InvalidFileError()
    if (!PNG_METADATA_CHUNKS.has(type)) parts.push(input.subarray(i, end))
    i = end
    if (type === 'IEND') {
      sawEnd = true
      break
    }
  }
  if (!sawEnd) throw new InvalidFileError()
  return concat(parts)
}

/** WebP: drops EXIF and XMP chunks and clears their flags in the VP8X header. */
function stripWebp(input: Uint8Array): Uint8Array {
  const chunks: Uint8Array[] = []
  let i = 12
  while (i < input.length) {
    if (i + 8 > input.length) throw new InvalidFileError()
    const type = String.fromCharCode(...input.subarray(i, i + 4))
    const size = readUint32LE(input, i + 4)
    const end = i + 8 + size + (size % 2) // chunks are padded to an even length
    if (i + 8 + size > input.length) throw new InvalidFileError()
    if (type !== 'EXIF' && type !== 'XMP ') {
      const chunk = input.slice(i, Math.min(end, input.length))
      // VP8X flags byte: bit 3 = EXIF, bit 2 = XMP.
      if (type === 'VP8X' && chunk.length > 8) chunk[8] &= ~0x0c
      chunks.push(chunk)
    }
    i = end
  }
  const body = concat(chunks)
  const header = new Uint8Array(12)
  header.set(ascii('RIFF'), 0)
  writeUint32LE(header, 4, body.length + 4)
  header.set(ascii('WEBP'), 8)
  return concat([header, body])
}

/** Returns a copy of an image without location or camera metadata. PDFs pass through. */
export function stripMetadata(bytes: Uint8Array, type: SniffedType): Uint8Array {
  switch (type) {
    case 'image/jpeg':
      return stripJpeg(bytes)
    case 'image/png':
      return stripPng(bytes)
    case 'image/webp':
      return stripWebp(bytes)
    case 'application/pdf':
      return bytes
  }
}

function readUint32BE(b: Uint8Array, i: number): number {
  return ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
}

function readUint32LE(b: Uint8Array, i: number): number {
  return (b[i] | (b[i + 1] << 8) | (b[i + 2] << 16) | (b[i + 3] << 24)) >>> 0
}

function writeUint32LE(b: Uint8Array, i: number, value: number): void {
  b[i] = value & 0xff
  b[i + 1] = (value >>> 8) & 0xff
  b[i + 2] = (value >>> 16) & 0xff
  b[i + 3] = (value >>> 24) & 0xff
}

function concat(parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let offset = 0
  for (const p of parts) {
    out.set(p, offset)
    offset += p.length
  }
  return out
}
