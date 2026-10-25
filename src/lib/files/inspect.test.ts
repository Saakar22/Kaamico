import { describe, expect, it } from 'vitest'
import {
  containsText,
  htmlPretendingToBeJpeg,
  jpegWithExif,
  pngWithText,
  SECRET_GPS,
  tinyPdf,
  webpWithExif,
} from '@/test/files'
import { InvalidFileError, sniffType, stripMetadata } from './inspect'

describe('sniffType', () => {
  it('recognises supported files by their content', () => {
    expect(sniffType(jpegWithExif())).toBe('image/jpeg')
    expect(sniffType(pngWithText())).toBe('image/png')
    expect(sniffType(webpWithExif())).toBe('image/webp')
    expect(sniffType(tinyPdf())).toBe('application/pdf')
  })

  it('rejects anything else, whatever its name says', () => {
    expect(sniffType(htmlPretendingToBeJpeg())).toBeNull()
    expect(
      sniffType(new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg"/>')),
    ).toBeNull()
    expect(sniffType(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBeNull() // ZIP
    expect(sniffType(new Uint8Array())).toBeNull()
  })
})

describe('stripMetadata', () => {
  it('removes EXIF from JPEGs and keeps the image data', () => {
    const input = jpegWithExif()
    expect(containsText(input, SECRET_GPS)).toBe(true)
    const output = stripMetadata(input, 'image/jpeg')
    expect(containsText(output, SECRET_GPS)).toBe(false)
    expect(containsText(output, 'JFIF')).toBe(true)
    expect(sniffType(output)).toBe('image/jpeg')
    expect([...output.slice(-2)]).toEqual([0xff, 0xd9])
  })

  it('removes text chunks from PNGs', () => {
    const output = stripMetadata(pngWithText(), 'image/png')
    expect(containsText(output, SECRET_GPS)).toBe(false)
    expect(containsText(output, 'IDAT')).toBe(true)
    expect(containsText(output, 'IEND')).toBe(true)
  })

  it('removes EXIF from WebP, fixes the RIFF size and clears the EXIF flag', () => {
    const output = stripMetadata(webpWithExif(), 'image/webp')
    expect(containsText(output, SECRET_GPS)).toBe(false)
    const view = new DataView(output.buffer, output.byteOffset)
    expect(view.getUint32(4, true)).toBe(output.length - 8)
    expect(output[20] & 0x08).toBe(0) // VP8X flags byte
    expect(sniffType(output)).toBe('image/webp')
  })

  it('leaves PDFs unchanged', () => {
    const pdf = tinyPdf()
    expect(stripMetadata(pdf, 'application/pdf')).toBe(pdf)
  })

  it('rejects truncated or malformed images', () => {
    expect(() => stripMetadata(jpegWithExif().slice(0, 12), 'image/jpeg')).toThrow(InvalidFileError)
    expect(() => stripMetadata(pngWithText().slice(0, 30), 'image/png')).toThrow(InvalidFileError)
    expect(() => stripMetadata(new Uint8Array([0xff, 0xd8, 0x00, 0x00]), 'image/jpeg')).toThrow(
      InvalidFileError,
    )
  })
})
