import test from 'node:test'
import assert from 'node:assert/strict'
import * as THREE from 'three'
import { exportPNG } from '../../src/engine/renderer/exportPNG.ts'

class FakeRenderer {
  public size = { x: 120, y: 80 }
  public domElement: {
    toBlob: (cb: (blob: Blob | null) => void, type: string) => void
  }
  public requestedBlob: Blob | null

  constructor(blob: Blob | null) {
    this.requestedBlob = blob
    this.domElement = {
      toBlob: (cb) => cb(this.requestedBlob),
    }
  }

  getSize(target: THREE.Vector2): THREE.Vector2 {
    target.set(this.size.x, this.size.y)
    return target
  }

  setSize(width: number, height: number): void {
    this.size = { x: width, y: height }
  }

  getContext(): { finish: () => void } {
    return { finish: () => {} }
  }
}

class FakePostProcessing {
  public lastSize = { x: 120, y: 80 }
  public renderCount = 0

  setSize(width: number, height: number): void {
    this.lastSize = { x: width, y: height }
  }

  render(): void {
    this.renderCount += 1
  }
}

test('exportPNG restores renderer and post-processing size after a successful export', async () => {
  const renderer = new FakeRenderer(new Blob(['ok'], { type: 'image/png' }))
  const post = new FakePostProcessing()

  const blob = await exportPNG(
    renderer as unknown as THREE.WebGLRenderer,
    post as unknown as { setSize: (width: number, height: number) => void; render: () => void },
    3,
  )

  assert.equal(blob.type, 'image/png')
  assert.deepEqual(renderer.size, { x: 120, y: 80 })
  assert.deepEqual(post.lastSize, { x: 120, y: 80 })
})

test('exportPNG should restore renderer size even when canvas export fails', async () => {
  const renderer = new FakeRenderer(null)
  const post = new FakePostProcessing()

  await assert.rejects(
    () =>
      exportPNG(
        renderer as unknown as THREE.WebGLRenderer,
        post as unknown as { setSize: (width: number, height: number) => void; render: () => void },
        4,
      ),
    /Failed to export PNG/,
  )

  assert.deepEqual(
    renderer.size,
    { x: 120, y: 80 },
    'renderer size should be restored after a failed export',
  )
  assert.deepEqual(
    post.lastSize,
    { x: 120, y: 80 },
    'post-processing size should be restored after a failed export',
  )
})
