/** Owns the post-processing stack applied on top of the main scene render. */
import * as THREE from 'three'
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js'
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js'
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js'
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js'
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js'
import { CinematicShader } from './CinematicShader'

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

export class PostProcessing {
  readonly composer: EffectComposer
  private bloomPass: UnrealBloomPass
  private cinematicPass: ShaderPass

  constructor(
    renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.PerspectiveCamera,
  ) {
    this.composer = new EffectComposer(renderer)

    const renderPass = new RenderPass(scene, camera)
    this.composer.addPass(renderPass)

    const size = renderer.getSize(new THREE.Vector2())
    this.bloomPass = new UnrealBloomPass(size, 0.3, 0.6, 0.85)
    this.composer.addPass(this.bloomPass)

    this.cinematicPass = new ShaderPass(CinematicShader)
    this.composer.addPass(this.cinematicPass)

    const outputPass = new OutputPass()
    this.composer.addPass(outputPass)
  }

  setBloom(strength: number, radius: number, threshold: number): void {
    this.bloomPass.strength = strength
    this.bloomPass.radius = radius
    this.bloomPass.threshold = threshold
  }

  getBloom(): BloomSettings {
    return {
      strength: this.bloomPass.strength,
      radius: this.bloomPass.radius,
      threshold: this.bloomPass.threshold,
    }
  }

  setVignette(intensity: number, offset: number): void {
    this.cinematicPass.uniforms.vignetteIntensity.value = intensity
    this.cinematicPass.uniforms.vignetteOffset.value = offset
  }

  setVignetteEnabled(enabled: boolean): void {
    this.cinematicPass.uniforms.vignetteEnabled.value = enabled ? 1.0 : 0.0
  }

  setChromaticAberration(strength: number): void {
    this.cinematicPass.uniforms.chromaticStrength.value = strength
  }

  setFilmGrain(intensity: number): void {
    this.cinematicPass.uniforms.grainIntensity.value = intensity
  }

  setColorTemperature(temperature: number): void {
    this.cinematicPass.uniforms.colorTemperature.value = temperature
  }

  getCinematic(): CinematicSettings {
    return {
      vignette: this.cinematicPass.uniforms.vignetteIntensity.value,
      vignetteEnabled: this.cinematicPass.uniforms.vignetteEnabled.value > 0.5,
      chromaticAberration: this.cinematicPass.uniforms.chromaticStrength.value,
      filmGrain: this.cinematicPass.uniforms.grainIntensity.value,
      colorTemperature: this.cinematicPass.uniforms.colorTemperature.value,
    }
  }

  setSize(width: number, height: number): void {
    this.composer.setSize(width, height)
  }

  render(elapsedTime: number = 0): void {
    this.cinematicPass.uniforms.grainTime.value = elapsedTime
    this.composer.render()
  }

  dispose(): void {
    this.composer.dispose()
  }
}
