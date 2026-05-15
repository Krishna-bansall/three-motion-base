import type { EnvironmentPreview, HDRIPreset } from './types'

const publicAsset = (path: string): string => `${import.meta.env.BASE_URL}${path}`

/** Bundled HDRI files served from `public/hdri`. */
export const HDRI_PATHS: Record<HDRIPreset, string> = {
  studio: publicAsset('hdri/studio.hdr'),
  moody: publicAsset('hdri/moody.hdr'),
  daylight: publicAsset('hdri/daylight.hdr'),
}

const PREVIEW_THEMES: Record<
  HDRIPreset,
  Omit<EnvironmentPreview, 'preset' | 'imageUrl'>
> = {
  studio: {
    label: 'Studio',
    mood: 'Clean Focus',
    icon: 'wb_incandescent',
  },
  moody: {
    label: 'Moody',
    mood: 'Night Drama',
    icon: 'dark_mode',
  },
  daylight: {
    label: 'Daylight',
    mood: 'Open Air',
    icon: 'light_mode',
  },
}

const PREVIEW_COLORS: Record<HDRIPreset, [string, string, string]> = {
  studio: ['#f3efe4', '#c9d6ee', '#293547'],
  moody: ['#132038', '#50628c', '#f6bf7a'],
  daylight: ['#eef9ff', '#89c2ff', '#2d5b83'],
}

/** Returns static card metadata so the UI does not depend on Three.js. */
export function getEnvironmentPreviews(): EnvironmentPreview[] {
  return (Object.keys(PREVIEW_THEMES) as HDRIPreset[]).map((preset) => ({
    preset,
    ...PREVIEW_THEMES[preset],
    imageUrl: createPreviewDataUrl(PREVIEW_COLORS[preset]),
  }))
}

function createPreviewDataUrl([start, end, accent]: [string, string, string]): string {
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 220">
      <defs>
        <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${start}" />
          <stop offset="100%" stop-color="${end}" />
        </linearGradient>
        <radialGradient id="halo" cx="50%" cy="42%" r="45%">
          <stop offset="0%" stop-color="rgba(255,255,255,0.92)" />
          <stop offset="100%" stop-color="rgba(255,255,255,0)" />
        </radialGradient>
        <linearGradient id="metal" x1="20%" y1="0%" x2="80%" y2="100%">
          <stop offset="0%" stop-color="#ffffff" />
          <stop offset="100%" stop-color="${accent}" />
        </linearGradient>
      </defs>
      <rect width="320" height="220" rx="28" fill="url(#bg)" />
      <circle cx="156" cy="72" r="82" fill="url(#halo)" opacity="0.88" />
      <ellipse cx="160" cy="132" rx="64" ry="64" fill="url(#metal)" opacity="0.96" />
      <ellipse cx="160" cy="180" rx="92" ry="16" fill="rgba(0,0,0,0.14)" />
      <path d="M114 165h92" stroke="rgba(255,255,255,0.48)" stroke-width="6" stroke-linecap="round" />
    </svg>
  `.trim()

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`
}
