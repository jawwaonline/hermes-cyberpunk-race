# Cyberpunk Racing Design Spec — Phase 1 Quick Wins

## 1. Color Palette A (Classic Synthwave)
- `#0A0E27` deep-space blue (base)
- `#FF006E` hot pink (accent)
- `#9D4EDD` purple (secondary)
- `#00F5FF` electric cyan (focus / speed)
- `#FFFFFF` bloom cores only

## 2. UI / HUD Layout (1280×720 reference)
| Corner | Element | Spec |
|--------|---------|------|
| Top-left | Position ("01 / 08") | Orbitron 700, 96 px, cyan `#00F5FF` |
| Top-right | Lap counter ("LAP 2 / 3") | Rajdhani 600, 32 px, pink `#FF006E` |
| Bottom-right | Speed gauge | 180° SVG arc, gradient cyan→magenta; Orbitron 500, 56 px numeric |
| Bottom-left | Mini-map | 160×160 SVG, track path cyan with glow, player triangle pink |
| Centre-bottom (modal) | Callouts | "WRONG WAY" / "+2 PLACEMENT" — VT323, hot pink, fade 200ms in / 1s out |

**Rule:** Never cover more than ~8% of viewport. Font pair: Orbitron (numerals) + VT323 (telemetry).

## 3. Track Visual Style — Three.js Recipe

```js
import { EffectComposer }  from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass }      from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { FilmPass }        from 'three/addons/postprocessing/FilmPass.js';
import { OutputPass }      from 'three/addons/postprocessing/OutputPass.js';

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
composer.addPass(new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  1.4,   // strength
  0.85,  // radius
  0.0    // threshold — bloom hits everything bright enough
));
composer.addPass(new FilmPass(0.25, false));
composer.addPass(new OutputPass());
```

**Construction:**
- Neon edges: low-ambient + high `emissiveIntensity` on `MeshStandardMaterial`
- Scrolling grid floor: PlaneGeometry + ShaderMaterial (horizontal bars scrolling Z, magenta→cyan gradient)
- Holographic checkpoints: TorusGeometry + MeshBasicMaterial with pulsing opacity
- Speed-line particles: THREE.Points, 64x64 radial-gradient sprite, additive blending
- Synthwave sun: inverted SphereGeometry with gradient + striped disk via smoothstep
- Optional: chromatic-aberration ShaderPass (R/G/B offset)

## 4. Car Visual Style — 3-Layer Recipe

1. **Body**: low-poly (~80 tri) BufferGeometry from Box+Cone primitives; `MeshStandardMaterial({color:'#1A1A2E', metalness:0.85, roughness:0.25, emissive:'#FF006E', emissiveIntensity:0.35})`
2. **Wireframe overlay**: same geometry cloned; `MeshBasicMaterial({color:'#00F5FF', wireframe:true, transparent:true, opacity:0.9})`
3. **Light trail**: 30-frame ring buffer of past positions → TubeGeometry via CatmullRomCurve3; or `meshline` package; `MeshBasicMaterial({color:'#FF006E', opacity:0.85})`

## 5. Typography (Google Fonts CDN)

```html
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Orbitron:wght@500;700&family=Rajdhani:wght@400;500;600&family=VT323&family=Audiowide&display=swap">
```

- **Orbitron** 700 — large readouts (position, speed, lap)
- **Rajdhani** 500 — small labels
- **VT323** — telemetry flavor ("[WRONG WAY]", "[BOOST]")
- **Audiowide** — menus only

## 6. Phase 1 Quick Wins (priority order)

1. **EffectComposer pipeline** (~30 LOC, biggest visual jump)
2. **Apply Palette A** to all materials (`emissiveIntensity:1.2` on cars)
3. **Google Fonts + 4-corner HUD panels**
4. **Synthwave sun/sky shader sphere** (dominates every frame)
5. **Per-car light trails** (TubeGeometry + bloom = speed read)

## 7. URL References
- https://threejs.org/examples/webgl_postprocessing_unreal_bloom.html
- https://threejs.org/docs/pages/UnrealBloomPass.html
- https://fonts.google.com/specimen/Orbitron
- https://fonts.google.com/specimen/Rajdhani
- https://www.gameuidatabase.com (search: Wipeout, F-Zero, Trackmania)
- https://github.com/redf0x1/camofox-browser (not directly related, but useful for testing in browser)
- https://github.com/lume/three-meshline (meshline package for light trails)