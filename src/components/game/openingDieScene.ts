import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { createCutDieGeometry, createDieMaterials } from './openingDieAppearance';

export interface DieVisualState {
  value: number | null;
  rolling: boolean;
}

const SETTLE_FRACTION = .72;
const BOUNCES = [[.42, .65], [.24, .15], [.16, .035]] as const;

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
  for (const [duration, height] of BOUNCES) {
    if (elapsed <= duration) {
      const t = elapsed / duration;
      return 4 * height * t * (1 - t);
    }
    elapsed -= duration;
  }
  return 0;
}
export function createOpeningDieScene(
  host: HTMLElement,
  read: () => DieVisualState,
  duration: number,
  onContextLost: () => void,
  onReady: () => void,
) {
  const renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;
  renderer.setClearColor(0x000000, 0);
  host.appendChild(renderer.domElement);
  const scene = new THREE.Scene();
  // Soft illumination keeps the flat corner cuts visible without glossy reflections.
  const environmentRoom = new RoomEnvironment();
  const environmentGenerator = new THREE.PMREMGenerator(renderer);
  const environment = environmentGenerator.fromScene(environmentRoom, .04);
  scene.environment = environment.texture;
  environmentRoom.dispose();
  environmentGenerator.dispose();
  const camera = new THREE.OrthographicCamera(-2.5, 2.5, 2.8, -2.8, .1, 50);
  camera.zoom = 1.12;
  camera.position.set(4.5, 6.5, 8);
  camera.lookAt(0, 1.4, 0);
  scene.add(new THREE.HemisphereLight(0xf0f5ff, 0x261626, .65));
  const light = new THREE.DirectionalLight(0xffffff, 2.4);
  light.position.set(-3, 7, 4);
  light.castShadow = true;
  light.shadow.mapSize.set(2048, 2048);
  Object.assign(light.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: .5, far: 18 });
  light.shadow.normalBias = .012;
  light.shadow.bias = -.00015;
  light.shadow.radius = 1;
  scene.add(light);
  const rim = new THREE.PointLight(0xdceaff, 14);
  rim.position.set(4, 4, -3);
  scene.add(rim);
  const geometry = createCutDieGeometry();
  const anisotropy = Math.min(8, renderer.capabilities.getMaxAnisotropy());
  const materials = createDieMaterials(anisotropy);
  const die = new THREE.Mesh(geometry, materials);
  die.castShadow = true;
  die.receiveShadow = true;
  scene.add(die);
  // The visible floor receives the mesh's projected silhouette in world space.
  const floorGeometry = new THREE.CircleGeometry(2.05, 96);
  const floorMaterial = new THREE.MeshLambertMaterial({ color: '#35282f' });
  const floor = new THREE.Mesh(floorGeometry, floorMaterial);
  floor.rotation.x = -Math.PI / 2;
  floor.position.y = -.008;
  floor.receiveShadow = true;
  scene.add(floor);
  const resize = () => {
    const width = host.clientWidth || 300, height = host.clientHeight || 340;
    renderer.setSize(width, height, false);
    const aspect = width / height;
    camera.left = -2.8 * aspect;
    camera.right = 2.8 * aspect;
    camera.updateProjectionMatrix();
  };
  const observer = new ResizeObserver(resize);
  observer.observe(host);
  resize();
  const contextLost = (event: Event) => { event.preventDefault(); onContextLost(); };
  renderer.domElement.addEventListener('webglcontextlost', contextLost);
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)');
  const rotation = new THREE.Matrix4();
  const spin = new THREE.Quaternion();
  const start = new THREE.Quaternion();
  const spinEuler = new THREE.Euler();
  let frame = 0;
  let wasRolling = false;
  let began = 0;
  let presented = false;
  die.quaternion.copy(orientation(read().value ?? 1));
  function render(now: number) {
    const state = read();
    const target = orientation(state.value ?? 1);
    if (state.rolling && !wasRolling) {
      began = now;
      start.copy(die.quaternion);
    }
    let height = 0;
    die.position.x = 0;
    die.position.z = 0;
    if (state.rolling && !motion.matches) {
      const elapsed = (now - began) / 1000;
      const u = Math.min(1, elapsed * 1000 / (duration * SETTLE_FRACTION));
      const settled = 1 - Math.pow(1 - u, 3);
      die.quaternion.copy(start).slerp(target, settled);
      const remaining = Math.PI * (1 - settled);
      spin.setFromEuler(spinEuler.set(4 * remaining, 6 * remaining, 2 * remaining));
      die.quaternion.multiply(spin);
      height = jump(elapsed);
      die.position.x = -.45 * Math.sin(Math.PI * u);
      die.position.z = .18 * Math.sin(Math.PI * u);
    } else {
      die.quaternion.copy(target);
    }
    // Use the cut mesh's actual lowest vertex to keep every orientation on the floor.
    rotation.makeRotationFromQuaternion(die.quaternion);
    const e = rotation.elements;
    const vertices = geometry.getAttribute('position');
    let support = 0;
    for (let i = 0; i < vertices.count; i++) {
      support = Math.max(support, -(e[1] * vertices.getX(i) + e[5] * vertices.getY(i) + e[9] * vertices.getZ(i)));
    }
    die.position.y = support + height;
    wasRolling = state.rolling;
    renderer.render(scene, camera);
    if (!presented) {
      presented = true;
      onReady();
    }
    frame = requestAnimationFrame(render);
  }
  frame = requestAnimationFrame(render);
  return () => {
    cancelAnimationFrame(frame);
    observer.disconnect();
    renderer.domElement.removeEventListener('webglcontextlost', contextLost);
    geometry.dispose();
    floorGeometry.dispose();
    floorMaterial.dispose();
    for (const material of materials) {
      material.map?.dispose();
      material.normalMap?.dispose();
      material.dispose();
    }
    environment.dispose();
    light.shadow.map?.dispose();
    renderer.dispose();
    renderer.forceContextLoss();
    renderer.domElement.remove();
  };
}
