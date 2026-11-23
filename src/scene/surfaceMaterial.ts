import { Color, RepeatWrapping, ShaderMaterial, SRGBColorSpace, type Texture, Vector3 } from 'three';
import { FLOOR } from './camera';

// One shader for the floor and every wall face: a plain color or a 1 m texture, with the white
// 1 m grid on top, drawn in the face's own plane (floor and wall tops in x/z, walls in x/y or z/y),
// so wall lines follow each wall's direction. Lines stay 1 css px wide at any zoom.
// Walls get a simple light so the two back walls read apart; the floor stays flat.

const LIGHT = new Vector3(3, 6, 5).normalize();

export interface SurfaceLook {
  color: string;
  map?: Texture | null;
  grid: number; // line opacity, 0 hides the grid
  lit: boolean;
}

export function surfaceMaterial(look: SurfaceLook): ShaderMaterial {
  const m = new ShaderMaterial({
    uniforms: {
      uColor: { value: new Color(look.color) },
      uMap: { value: null },
      uHasMap: { value: 0 },
      uLine: { value: new Color(FLOOR.grid_color) },
      uOpacity: { value: look.grid },
      uStep: { value: FLOOR.grid_step_m },
      uWidth: { value: 1 },
      uLit: { value: look.lit ? 1 : 0 },
      uLight: { value: LIGHT },
    },
    vertexShader: /* glsl */ `
      varying vec3 vWorld;
      varying vec3 vNormal;
      void main() {
        vec4 world = modelMatrix * vec4(position, 1.0);
        vWorld = world.xyz;
        vNormal = normalize(mat3(modelMatrix) * normal);
        gl_Position = projectionMatrix * viewMatrix * world;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      uniform sampler2D uMap;
      uniform float uHasMap;
      uniform vec3 uLine;
      uniform float uOpacity;
      uniform float uStep;
      uniform float uWidth;
      uniform float uLit;
      uniform vec3 uLight;
      varying vec3 vWorld;
      varying vec3 vNormal;
      float lineDistance(float v) {
        float g = v / uStep;
        float d = abs(fract(g + 0.5) - 0.5);
        float perPixel = length(vec2(dFdx(g), dFdy(g)));
        return d / max(perPixel, 1e-5);
      }
      void main() {
        vec3 n = normalize(vNormal);
        vec3 a = abs(n);
        // the face's own plane: (across, up) for walls, x/z for the floor and wall tops
        vec2 p = a.y > 0.5 ? vWorld.xz : (a.x > a.z ? vec2(vWorld.z, vWorld.y) : vec2(vWorld.x, vWorld.y));
        vec3 base = uColor;
        if (uHasMap > 0.5) base = texture2D(uMap, vec2(p.x, a.y > 0.5 ? -p.y : p.y) / uStep).rgb;
        if (uLit > 0.5) base *= min(1.0, 0.8 + 0.45 * max(dot(n, uLight), 0.0)) * (a.y > 0.5 ? 1.0 : 0.97 + 0.03 * a.z);
        float dist = min(lineDistance(p.x), lineDistance(p.y));
        float line = 1.0 - smoothstep(uWidth * 0.5 - 0.5, uWidth * 0.5 + 0.5, dist);
        gl_FragColor = vec4(mix(base, uLine, line * uOpacity), 1.0);
        #include <colorspace_fragment>
      }
    `,
  });
  setLook(m, look);
  return m;
}

export function setLook(m: ShaderMaterial, look: Partial<SurfaceLook> & { dpr?: number }) {
  if (look.color !== undefined) m.uniforms.uColor.value.set(look.color);
  if (look.grid !== undefined) m.uniforms.uOpacity.value = look.grid;
  if (look.dpr !== undefined) m.uniforms.uWidth.value = look.dpr;
  if (look.map !== undefined) {
    if (look.map) {
      look.map.wrapS = look.map.wrapT = RepeatWrapping;
      look.map.colorSpace = SRGBColorSpace;
      look.map.anisotropy = 4;
      look.map.needsUpdate = true;
    }
    m.uniforms.uMap.value = look.map ?? null;
    m.uniforms.uHasMap.value = look.map ? 1 : 0;
  }
}
