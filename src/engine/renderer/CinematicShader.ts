/**
 * Step 2: CinematicShader
 * 
 * Custom GLSL shader combining vignette, chromatic aberration,
 * film grain, and color temperature in a single post-processing pass.
 */

export const CinematicShader = {
  name: 'CinematicShader',

  uniforms: {
    tDiffuse: { value: null },
    vignetteIntensity: { value: 0.35 },
    vignetteOffset: { value: 0.9 },
    vignetteEnabled: { value: 1.0 },
    chromaticStrength: { value: 0.003 },
    grainIntensity: { value: 0.0 },
    grainTime: { value: 0.0 },
    colorTemperature: { value: 0.0 }, // -1 cool … 0 neutral … +1 warm
  },

  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,

  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float vignetteIntensity;
    uniform float vignetteOffset;
    uniform float vignetteEnabled;
    uniform float chromaticStrength;
    uniform float grainIntensity;
    uniform float grainTime;
    uniform float colorTemperature;

    varying vec2 vUv;

    // ── Pseudo-random hash ──
    float hash(vec2 p) {
      vec3 p3 = fract(vec3(p.xyx) * 0.1031);
      p3 += dot(p3, p3.yzx + 33.33);
      return fract((p3.x + p3.y) * p3.z);
    }

    void main() {
      vec2 center = vec2(0.5);
      vec2 uv = vUv;
      vec2 dir = uv - center;
      float dist = length(dir);

      // ── Chromatic Aberration ──
      float offset = chromaticStrength * dist;
      vec2 offsetDir = normalize(dir + 0.0001);

      float r = texture2D(tDiffuse, uv + offsetDir * offset).r;
      float g = texture2D(tDiffuse, uv).g;
      float b = texture2D(tDiffuse, uv - offsetDir * offset).b;

      vec3 color = vec3(r, g, b);

      // ── Color Temperature ──
      // Warm pushes toward orange, cool pushes toward blue
      if (colorTemperature > 0.0) {
        // Warm: boost red slightly, reduce blue
        color.r += colorTemperature * 0.06;
        color.g += colorTemperature * 0.02;
        color.b -= colorTemperature * 0.06;
      } else if (colorTemperature < 0.0) {
        // Cool: boost blue slightly, reduce red
        float cool = -colorTemperature;
        color.r -= cool * 0.06;
        color.g += cool * 0.01;
        color.b += cool * 0.06;
      }

      // ── Film Grain ──
      if (grainIntensity > 0.0) {
        float grain = hash(uv * 1000.0 + grainTime) * 2.0 - 1.0;
        color += grain * grainIntensity;
      }

      // ── Vignette ──
      if (vignetteEnabled > 0.5) {
        float vignette = smoothstep(vignetteOffset, vignetteOffset - vignetteIntensity, dist * 1.4);
        color *= vignette;
      }

      gl_FragColor = vec4(color, 1.0);
    }
  `,
}
