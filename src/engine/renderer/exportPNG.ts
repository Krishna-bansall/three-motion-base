/** Exports a still frame by temporarily resizing the live renderer. */
import * as THREE from 'three'
import type { PostProcessing } from './PostProcessing'

export async function exportPNG(
  renderer: THREE.WebGLRenderer,
  postProcessing: PostProcessing,
  scale: number = 3,
): Promise<Blob> {
  const currentSize = renderer.getSize(new THREE.Vector2())
  const w = currentSize.x
  const h = currentSize.y

  renderer.setSize(w * scale, h * scale)
  postProcessing.setSize(w * scale, h * scale)

  try {
    postProcessing.render()

    const gl = renderer.getContext()
    gl.finish()

    return await new Promise<Blob>((resolve, reject) => {
      renderer.domElement.toBlob((b) => {
        if (b) resolve(b)
        else reject(new Error('Failed to export PNG'))
      }, 'image/png')
    })
  } finally {
    renderer.setSize(w, h)
    postProcessing.setSize(w, h)
  }
}
