export type HDRIPreset = 'studio' | 'moody' | 'daylight'

export interface BloomSettings {
  strength: number
  radius: number
  threshold: number
}

export interface CinematicSettings {
  vignette: number
  vignetteEnabled: boolean
  chromaticAberration: number
  filmGrain: number
  colorTemperature: number
}

export interface ViewSettings {
  activeHDRI: HDRIPreset
  exposure: number
  bloom: BloomSettings
  cinematic: CinematicSettings
  autoRotate: boolean
  autoRotateSpeed: number
}

export interface ViewSettingsLook {
  exposure: number
  bloom: BloomSettings
  cinematic: CinematicSettings
}

export function createDefaultViewSettings(): ViewSettings {
  return {
    activeHDRI: 'studio',
    exposure: 1,
    bloom: { strength: 0.3, radius: 0.6, threshold: 0.85 },
    cinematic: {
      vignette: 0.35,
      vignetteEnabled: true,
      chromaticAberration: 0.003,
      filmGrain: 0,
      colorTemperature: 0,
    },
    autoRotate: false,
    autoRotateSpeed: 0.3,
  }
}

export function cloneViewSettings(settings: ViewSettings): ViewSettings {
  return {
    activeHDRI: settings.activeHDRI,
    exposure: settings.exposure,
    bloom: { ...settings.bloom },
    cinematic: { ...settings.cinematic },
    autoRotate: settings.autoRotate,
    autoRotateSpeed: settings.autoRotateSpeed,
  }
}

export function areViewSettingsEqual(left: ViewSettings, right: ViewSettings): boolean {
  return (
    left.activeHDRI === right.activeHDRI
    && left.exposure === right.exposure
    && left.bloom.strength === right.bloom.strength
    && left.bloom.radius === right.bloom.radius
    && left.bloom.threshold === right.bloom.threshold
    && left.cinematic.vignette === right.cinematic.vignette
    && left.cinematic.vignetteEnabled === right.cinematic.vignetteEnabled
    && left.cinematic.chromaticAberration === right.cinematic.chromaticAberration
    && left.cinematic.filmGrain === right.cinematic.filmGrain
    && left.cinematic.colorTemperature === right.cinematic.colorTemperature
    && left.autoRotate === right.autoRotate
    && left.autoRotateSpeed === right.autoRotateSpeed
  )
}

export function updateViewSettings(
  previous: ViewSettings,
  mutator: (draft: ViewSettings) => void,
): ViewSettings {
  const next = cloneViewSettings(previous)
  mutator(next)
  return next
}

export function applyProjectLookToViewSettings(
  previous: ViewSettings,
  look: ViewSettingsLook,
): ViewSettings {
  return updateViewSettings(previous, (next) => {
    next.exposure = look.exposure
    next.bloom = { ...look.bloom }
    next.cinematic = { ...look.cinematic }
  })
}
