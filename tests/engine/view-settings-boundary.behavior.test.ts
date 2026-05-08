import test from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'

test('runtime view setting types are sourced from the shared view settings module', async () => {
  const runtimeTypes = await readFile(new URL('../../src/engine/runtime/types.ts', import.meta.url), 'utf8')
  const runtimeAdapter = await readFile(new URL('../../src/engine/runtime/RuntimeAdapter.ts', import.meta.url), 'utf8')

  assert.match(runtimeTypes, /export type \{[^}]*HDRIPreset[^}]*ViewSettings[^}]*\} from '\.\.\/viewSettings'/s)
  assert.match(runtimeAdapter, /import type \{[^}]*ViewSettings[^}]*\} from '\.\.\/viewSettings\.ts'/s)
  assert.doesNotMatch(runtimeTypes, /export interface ViewSettings/)
  assert.doesNotMatch(runtimeTypes, /export type HDRIPreset =/)
})

test('ThreeAdapter uses the shared view settings defaults and clone helper', async () => {
  const threeAdapter = await readFile(new URL('../../src/engine/runtime/three/ThreeAdapter.ts', import.meta.url), 'utf8')

  assert.match(threeAdapter, /import \{[^}]*cloneViewSettings[^}]*createDefaultViewSettings[^}]*\} from '\.\.\/\.\.\/viewSettings'/s)
  assert.doesNotMatch(threeAdapter, /const DEFAULT_VIEW_SETTINGS/)
  assert.doesNotMatch(threeAdapter, /function cloneViewSettings/)
})

test('PostProcessing consumes editor view setting types without owning them', async () => {
  const postProcessing = await readFile(new URL('../../src/engine/renderer/PostProcessing.ts', import.meta.url), 'utf8')
  const sourceFiles = [
    '../../src/store/useEngineStore.ts',
    '../../src/engine/store/engineStateBridge.ts',
    '../../src/engine/runtime/types.ts',
  ]
  const consumers = await Promise.all(
    sourceFiles.map((sourceFile) => readFile(new URL(sourceFile, import.meta.url), 'utf8')),
  )

  assert.match(postProcessing, /import type \{[^}]*BloomSettings[^}]*CinematicSettings[^}]*\} from '\.\.\/viewSettings'/s)
  assert.doesNotMatch(postProcessing, /export interface BloomSettings/)
  assert.doesNotMatch(postProcessing, /export interface CinematicSettings/)

  for (const consumer of consumers) {
    assert.doesNotMatch(consumer, /renderer\/PostProcessing/)
  }
})
