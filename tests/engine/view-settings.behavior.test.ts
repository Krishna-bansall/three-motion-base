import test from 'node:test'
import assert from 'node:assert/strict'
import {
  areViewSettingsEqual,
  cloneViewSettings,
  createDefaultViewSettings,
  updateViewSettings,
} from '../../src/engine/viewSettings.ts'

test('default view settings preserve current editor visual defaults', () => {
  assert.deepEqual(createDefaultViewSettings(), {
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
  })
})

test('cloneViewSettings isolates nested bloom and cinematic state', () => {
  const original = createDefaultViewSettings()
  const clone = cloneViewSettings(original)

  clone.bloom.strength = 1.2
  clone.cinematic.colorTemperature = -0.4

  assert.equal(original.bloom.strength, 0.3)
  assert.equal(original.cinematic.colorTemperature, 0)
})

test('areViewSettingsEqual compares nested editor view settings by value', () => {
  const left = createDefaultViewSettings()
  const right = createDefaultViewSettings()

  assert.equal(areViewSettingsEqual(left, right), true)

  right.cinematic.vignetteEnabled = false

  assert.equal(areViewSettingsEqual(left, right), false)
})

test('updateViewSettings returns a cloned next value without mutating the previous value', () => {
  const previous = createDefaultViewSettings()
  const next = updateViewSettings(previous, (draft) => {
    draft.activeHDRI = 'moody'
    draft.bloom.radius = 0.25
    draft.cinematic.filmGrain = 0.05
  })

  assert.deepEqual(previous, createDefaultViewSettings())
  assert.deepEqual(next, {
    ...createDefaultViewSettings(),
    activeHDRI: 'moody',
    bloom: { strength: 0.3, radius: 0.25, threshold: 0.85 },
    cinematic: {
      ...createDefaultViewSettings().cinematic,
      filmGrain: 0.05,
    },
  })
})
