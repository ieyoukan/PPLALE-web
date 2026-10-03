import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';

export interface DieVisualState { value: number | null; rolling: boolean; interactive: boolean }
const SIZE = 1.6, RADIUS = .14;
const pipLayout: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };
function faceMaterial(value: number, anisotropy: number) {
  const canvas = document.createElement('canvas'), relief = document.createElement('canvas');
  canvas.width = canvas.height = relief.width = relief.height = 512;
  const ctx = canvas.getContext('2d')!, bump = relief.getContext('2d')!;
  ctx.fillStyle = '#723426'; ctx.fillRect(0, 0, 512, 512);
  bump.fillStyle = '#aaaaaa'; bump.fillRect(0, 0, 512, 512);
  for (const index of pipLayout[value]) {
    const x = 256 + (index % 3 - 1) * 115, y = 256 + (Math.floor(index / 3) - 1) * 115;
    ctx.beginPath(); ctx.arc(x, y, 27, 0, Math.PI * 2);
    ctx.fillStyle = '#f4ddb1'; ctx.fill();
    const cavity = bump.createRadialGradient(x, y, 20, x, y, 29);
    cavity.addColorStop(0, '#333333'); cavity.addColorStop(1, '#aaaaaa');
    bump.fillStyle = cavity; bump.beginPath(); bump.arc(x, y, 29, 0, Math.PI * 2); bump.fill();
  }
  const map = new THREE.CanvasTexture(canvas), bumpMap = new THREE.CanvasTexture(relief);
  map.colorSpace = THREE.SRGBColorSpace; map.anisotropy = bumpMap.anisotropy = anisotropy;
  return new THREE.MeshPhysicalMaterial({ map, bumpMap, bumpScale: .025, roughness: .32, metalness: 0, clearcoat: .28, clearcoatRoughness: .24 });
}
function orientation(value: number) {
  const rotations: Record<number, [number, number, number]> = {
    1: [-Math.PI / 2, 0, 0], 2: [0, 0, Math.PI / 2], 3: [0, 0, 0],
    4: [Math.PI, 0, 0], 5: [0, 0, -Math.PI / 2], 6: [Math.PI / 2, 0, 0],
  };
  const face = new THREE.Quaternion().setFromEuler(new THREE.Euler(...rotations[value]));
  return new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 1, 0), .25).multiply(face);
}
function jump(elapsed: number) {
  // Parabolic flight and successively lower bounces; y = v*t - g*t²/2.
  for (const [duration, height] of [[.85, 1.9], [.4, .38], [.3, .09]]) {
    if (elapsed <= duration) { const t = elapsed / duration; return 4 * height * t * (1 - t); }
    elapsed -= duration;
  }
  return 0;
}
export function createOpeningDieScene(host: HTMLElement, read: () => DieVisualState, duration: number, onContextLost: () => void, onReady: () => void) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-2.5, 2.5, 2.8, -2.8, .1, 50);
  camera.position.set(4.5, 6.5, 8); camera.lookAt(0, 1.4, 0);
  scene.add(new THREE.HemisphereLight(0xffedcf, 0x302538, 2));
  const light = new THREE.DirectionalLight(0xffefda, 4);
  light.position.set(-3, 7, 4); light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: .5, far: 18 });
  light.shadow.normalBias = .025; light.shadow.bias = -.00015; light.shadow.radius = 2;
  scene.add(light);
  const rim = new THREE.PointLight(0xffd3b3, 22); rim.position.set(4, 4, -3); scene.add(rim);
  const geometry = new RoundedBoxGeometry(SIZE, SIZE, SIZE, 6, RADIUS);
  const materials = [2, 5, 3, 4, 1, 6].map(value => faceMaterial(value, Math.min(8, renderer.capabilities.getMaxAnisotropy())));
  const die = new THREE.Mesh(geometry, materials); die.castShadow = true; die.receiveShadow = true; scene.add(die);
  const floorGeometry = new THREE.PlaneGeometry(12, 12), floorMaterial = new THREE.ShadowMaterial({ opacity: .55 });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial); floor.rotation.x = -Math.PI / 2; floor.receiveShadow = true; scene.add(floor);
  const resize = () => {
    const width = host.clientWidth || 300, height = host.clientHeight || 340;
    renderer.setSize(width, height, false);
    const aspect = width / height;
    camera.left = -2.8 * aspect; camera.right = 2.8 * aspect; camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize); observer.observe(host); resize();
  const contextLost = (event: Event) => { event.preventDefault(); onContextLost(); };
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const rotation = new THREE.Matrix4(), spin = new THREE.Quaternion(), start = new THREE.Quaternion();
  const spinEuler = new THREE.Euler(), idleEuler = new THREE.Euler();
  let frame = 0, wasRolling = false, began = 0, presented = false;
  die.quaternion.copy(orientation(read().value ?? 1));
  function render(now: number) {
    const state = read(), target = orientation(state.value ?? 1);
    if (state.rolling && !wasRolling) { began = now; start.copy(die.quaternion); }
    let height = 0;
    if (state.rolling && !motion.matches) {
      const elapsed = (now - began) / 1000, u = Math.min(1, elapsed * 1000 / duration);
      const settled = 1 - Math.pow(1 - u, 3);
      die.quaternion.copy(start).slerp(target, settled);
      spin.setFromEuler(spinEuler.set(4 * Math.PI * (1 - settled), 6 * Math.PI * (1 - settled), 2 * Math.PI * (1 - settled)));
      die.quaternion.multiply(spin);
      height = jump(elapsed);
    } else {
      die.quaternion.copy(target);
      if (state.interactive && !motion.matches) {
        const t = now / 1000;
        spin.setFromEuler(idleEuler.set(.04 * Math.sin(t * 2), 0, .035 * Math.cos(t * 2)));
        die.quaternion.multiply(spin);
        height = .045 * (1 + Math.sin(t * 2));
      }
    }
    // Support of a rounded cube: flat inner box plus the corner sphere radius.
    // This keeps the actual rotated silhouette above the floor at every bounce.
    rotation.makeRotationFromQuaternion(die.quaternion);
    const e = rotation.elements;
    die.position.y = (SIZE / 2 - RADIUS) * (Math.abs(e[1]) + Math.abs(e[5]) + Math.abs(e[9])) + RADIUS + height;
    wasRolling = state.rolling;
    renderer.render(scene, camera);
    if (!presented) { presented = true; onReady(); }
    frame = requestAnimationFrame(render);
  }
  frame = requestAnimationFrame(render);
  return () => {
    cancelAnimationFrame(frame); observer.disconnect();
    renderer.domElement.removeEventListener('webglcontextlost', contextLost);
    geometry.dispose(); floorGeometry.dispose(); floorMaterial.dispose();
    for (const material of materials) { material.map?.dispose(); material.bumpMap?.dispose(); material.dispose(); }
    light.shadow.map?.dispose(); renderer.dispose(); renderer.forceContextLoss(); renderer.domElement.remove();
  };
}
