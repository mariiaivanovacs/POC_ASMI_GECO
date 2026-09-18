// Celebration burst: a Three.js overlay (transparent WebGL canvas in pixel space) that throws a handful of
// confetti plates and gems from a screen point, with gravity, spin and fade. Falls back to CSS particles when
// WebGL is unavailable (headless browsers, old devices) and does nothing under prefers-reduced-motion.
import * as THREE from 'three';

export interface CelebrateOptions { count?: number; power?: number; colors?: number[] }

const PALETTE = [0x3b82f6, 0x2fb673, 0xf2a93b, 0xe0554f, 0x6b3fd6, 0x60a5fa, 0xffffff];

interface Particle { mesh: THREE.Mesh; vx: number; vy: number; vz: number; rx: number; ry: number; rz: number; life: number; ttl: number }

let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.OrthographicCamera | null = null;
let canvas: HTMLCanvasElement | null = null;
let particles: Particle[] = [];
let raf = 0;
let last = 0;
let webglFailed = false;

const plate = new THREE.BoxGeometry(10, 6, 1.5);
const gem = new THREE.IcosahedronGeometry(5, 0);
const tetra = new THREE.TetrahedronGeometry(6, 0);
const GEOMS = [plate, plate, plate, gem, tetra];

function reducedMotion(): boolean {
  return typeof window !== 'undefined' && !!window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function ensureRenderer(): boolean {
  if (renderer) return true;
  if (webglFailed || typeof document === 'undefined') return false;
  try {
    canvas = document.createElement('canvas');
    canvas.setAttribute('data-testid', 'celebration-canvas');
    Object.assign(canvas.style, { position: 'fixed', inset: '0', width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: '60' } as CSSStyleDeclaration);
    renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true, powerPreference: 'low-power' });
    renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1));
    renderer.setClearColor(0x000000, 0);
    scene = new THREE.Scene();
    camera = new THREE.OrthographicCamera(0, 1, 0, 1, -1000, 1000);
    // A little light so gems shade like solid pieces instead of flat colour.
    scene.add(new THREE.AmbientLight(0xffffff, 0.9));
    const key = new THREE.DirectionalLight(0xffffff, 1.2);
    key.position.set(0.5, -1, 1);
    scene.add(key);
    resize();
    window.addEventListener('resize', resize);
    return true;
  } catch {
    webglFailed = true;
    renderer = null;
    if (canvas?.parentNode) canvas.parentNode.removeChild(canvas);
    return false;
  }
}

function resize() {
  if (!renderer || !camera) return;
  const w = window.innerWidth, h = window.innerHeight;
  renderer.setSize(w, h, false);
  camera.left = 0; camera.right = w; camera.top = 0; camera.bottom = h;
  camera.updateProjectionMatrix();
}

function frame(t: number) {
  if (!renderer || !scene || !camera) return;
  const dt = Math.min(0.05, (t - last) / 1000 || 0.016);
  last = t;
  const g = 1400;
  for (const p of particles) {
    p.life += dt;
    p.vy += g * dt;
    p.vx *= 0.985;
    p.mesh.position.x += p.vx * dt;
    p.mesh.position.y += p.vy * dt;
    p.mesh.position.z += p.vz * dt;
    p.mesh.rotation.x += p.rx * dt;
    p.mesh.rotation.y += p.ry * dt;
    p.mesh.rotation.z += p.rz * dt;
    const k = 1 - p.life / p.ttl;
    (p.mesh.material as THREE.MeshStandardMaterial).opacity = Math.max(0, Math.min(1, k * 1.6));
  }
  particles = particles.filter((p) => {
    const dead = p.life >= p.ttl || p.mesh.position.y > window.innerHeight + 40;
    if (dead) { scene!.remove(p.mesh); (p.mesh.material as THREE.Material).dispose(); }
    return !dead;
  });
  renderer.render(scene, camera);
  if (particles.length) raf = requestAnimationFrame(frame);
  else { raf = 0; if (canvas?.parentNode) canvas.parentNode.removeChild(canvas); }
}

function burstWebGL(x: number, y: number, o: Required<CelebrateOptions>) {
  if (!ensureRenderer() || !scene || !canvas) return false;
  if (!canvas.parentNode) document.body.appendChild(canvas);
  for (let i = 0; i < o.count; i++) {
    const geom = GEOMS[i % GEOMS.length];
    const mat = new THREE.MeshStandardMaterial({ color: o.colors[i % o.colors.length], transparent: true, opacity: 1, roughness: 0.4, metalness: 0.2, side: THREE.DoubleSide });
    const mesh = new THREE.Mesh(geom, mat);
    mesh.position.set(x, y, 0);
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI * 1.1;
    const v = o.power * (0.55 + Math.random() * 0.75);
    particles.push({ mesh, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 0, rx: (Math.random() - 0.5) * 12, ry: (Math.random() - 0.5) * 12, rz: (Math.random() - 0.5) * 8, life: 0, ttl: 1.3 + Math.random() * 0.7 });
    scene.add(mesh);
  }
  if (!raf) { last = performance.now(); raf = requestAnimationFrame(frame); }
  return true;
}

function burstCSS(x: number, y: number, o: Required<CelebrateOptions>) {
  const host = document.createElement('div');
  host.setAttribute('data-testid', 'celebration-css');
  Object.assign(host.style, { position: 'fixed', left: '0', top: '0', pointerEvents: 'none', zIndex: '60' });
  for (let i = 0; i < Math.min(o.count, 24); i++) {
    const s = document.createElement('i');
    const a = -Math.PI / 2 + (Math.random() - 0.5) * Math.PI;
    const d = o.power * 0.25 * (0.6 + Math.random());
    const color = '#' + o.colors[i % o.colors.length].toString(16).padStart(6, '0');
    Object.assign(s.style, { position: 'absolute', left: x + 'px', top: y + 'px', width: '9px', height: '6px', background: color, borderRadius: '2px', transition: 'transform .9s cubic-bezier(.2,.7,.3,1), opacity .9s ease', opacity: '1' });
    host.appendChild(s);
    requestAnimationFrame(() => { s.style.transform = 'translate(' + Math.cos(a) * d + 'px,' + (Math.sin(a) * d + 120) + 'px) rotate(' + (Math.random() * 720 - 360) + 'deg)'; s.style.opacity = '0'; });
  }
  document.body.appendChild(host);
  setTimeout(() => host.remove(), 1000);
}

/** Fire a celebration at a screen point (defaults to the centre of `el`). Returns false if motion is reduced. */
export function celebrate(target?: HTMLElement | { x: number; y: number } | null, opts: CelebrateOptions = {}): boolean {
  if (typeof window === 'undefined' || reducedMotion()) return false;
  let x = window.innerWidth / 2, y = window.innerHeight / 2;
  if (target && 'getBoundingClientRect' in target) { const r = target.getBoundingClientRect(); x = r.left + r.width / 2; y = r.top + r.height / 2; }
  else if (target) { x = target.x; y = target.y; }
  const o: Required<CelebrateOptions> = { count: opts.count ?? 48, power: opts.power ?? 900, colors: opts.colors ?? PALETTE };
  if (!burstWebGL(x, y, o)) burstCSS(x, y, o);
  window.dispatchEvent(new CustomEvent('helmlearn:celebrate', { detail: { x, y, count: o.count } }));
  return true;
}
