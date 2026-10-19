import { defineConfig, minimal2023Preset } from '@vite-pwa/assets-generator/config'

// Placeholder icon source; replace assets-src/pwa-icon.svg with the official
// icon and re-run `npm run generate-pwa-assets`.
export default defineConfig({
  preset: {
    ...minimal2023Preset,
    maskable: { ...minimal2023Preset.maskable, resizeOptions: { background: '#0a0a1a' } },
    apple: { ...minimal2023Preset.apple, resizeOptions: { background: '#0a0a1a' } },
  },
  images: ['assets-src/pwa-icon.svg'],
})
