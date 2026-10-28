// Builds the app icons from src/app/icon.svg (run after changing the logo):
//   node scripts/generate-icons.mjs
// Writes public/icons/* for the web app manifest and src/app/apple-icon.png for iOS.
import { mkdir, readFile } from 'node:fs/promises'
import sharp from 'sharp'

const svg = await readFile('src/app/icon.svg')
await mkdir('public/icons', { recursive: true })

/** The pin centred on a square background, taking `scale` of the side. */
async function icon(size, scale, background, out) {
  const inner = Math.round(size * scale)
  const pin = await sharp(svg, { density: 1024 }).resize(inner, inner).png().toBuffer()
  await sharp({ create: { width: size, height: size, channels: 4, background } })
    .composite([{ input: pin, gravity: 'centre' }])
    .png({ compressionLevel: 9 })
    .toFile(out)
  console.log(out)
}

const clear = { r: 0, g: 0, b: 0, alpha: 0 }
const white = { r: 255, g: 255, b: 255, alpha: 1 }
const mint = { r: 0xe7, g: 0xf4, b: 0xef, alpha: 1 }

await icon(192, 0.9, clear, 'public/icons/icon-192.png')
await icon(512, 0.9, clear, 'public/icons/icon-512.png')
// Maskable: launchers crop to a circle or squircle, so the pin stays inside the middle 60%.
await icon(512, 0.6, mint, 'public/icons/maskable-512.png')
// iOS fills transparency with black, so the home-screen icon gets a white tile.
await icon(180, 0.78, white, 'src/app/apple-icon.png')
