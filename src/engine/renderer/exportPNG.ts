/**
 * Step 8: PNG Export
 * 
 * Renders at 3× resolution and exports as PNG blob.
 */
import * as THREE from 'three'
import type { PostProcessing } from './PostProcessing'

/**
 * Captures the current scene at `scale`× resolution as a PNG blob.
 * Temporarily resizes the renderer, renders one frame, then restores.
 */
export async function exportPNG(
  renderer: THREE.WebGLRenderer,
  postProcessing: PostProcessing,
  scale: number = 3,
): Promise<Blob> {
  const currentSize = renderer.getSize(new THREE.Vector2())
  const w = currentSize.x
  const h = currentSize.y

  // Scale up
  renderer.setSize(w * scale, h * scale)
  postProcessing.setSize(w * scale, h * scale)

  // Render one frame
  postProcessing.render()

  // Force GPU flush so the canvas holds the completed frame
  const gl = renderer.getContext()
  gl.finish()

  // Capture
  const blob = await new Promise<Blob>((resolve, reject) => {
    renderer.domElement.toBlob((b) => {
      if (b) resolve(b)
      else reject(new Error('Failed to export PNG'))
    }, 'image/png')
  })

  // Restore
  renderer.setSize(w, h)
  postProcessing.setSize(w, h)

  return blob
}
