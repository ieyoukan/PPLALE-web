import * as THREE from 'three';
import { ConvexGeometry } from 'three/addons/geometries/ConvexGeometry.js';

const SIZE = 1.6;
const BODY_COLOR = '#500611';
const FACE_SEGMENTS = 24;
const TEXTURE_SIZE = 512;
const PIP_RADIUS = 38;
const MATTE_SURFACE = {
  roughness: 1,
  metalness: 0,
  clearcoat: 0,
  specularIntensity: 0,
  envMapIntensity: .2,
};
const pipLayout: Record<number, number[]> = { 1: [4], 2: [0, 8], 3: [0, 4, 8], 4: [0, 2, 6, 8], 5: [0, 2, 4, 6, 8], 6: [0, 2, 3, 5, 6, 8] };

/** Six nearly circular, flat faces joined by planar cuts across the corners. */
export function createCutDieGeometry() {
  const half = SIZE / 2, faceRadius = half * .97;
  const points: THREE.Vector3[] = [];
  for (let axis = 0; axis < 3; axis++) {
    for (const sign of [-1, 1]) {
      for (let i = 0; i < FACE_SEGMENTS; i++) {
        const angle = i * Math.PI * 2 / FACE_SEGMENTS;
        const point = new THREE.Vector3();
        point.setComponent(axis, sign * half);
        point.setComponent((axis + 1) % 3, Math.cos(angle) * faceRadius);
        point.setComponent((axis + 2) % 3, Math.sin(angle) * faceRadius);
        points.push(point);
      }
    }
  }
  const hull = new ConvexGeometry(points);
  const positions = hull.getAttribute('position');
  const normals = hull.getAttribute('normal');
  const faces = Array.from({ length: 7 }, () => ({ positions: [] as number[], normals: [] as number[], uvs: [] as number[] }));
  for (let i = 0; i < positions.count; i += 3) {
    const nx = normals.getX(i), ny = normals.getY(i), nz = normals.getZ(i);
    const face = faceMaterialIndex(nx, ny, nz);
    const bucket = faces[face];
    for (let j = i; j < i + 3; j++) {
      const x = positions.getX(j), y = positions.getY(j), z = positions.getZ(j);
      bucket.positions.push(x, y, z);
      bucket.normals.push(normals.getX(j), normals.getY(j), normals.getZ(j));
      // Match BoxGeometry's face order and UV directions so results stay upright.
      const [u, v] = faceUV(face, x, y, z);
      bucket.uvs.push(u / SIZE + .5, v / SIZE + .5);
    }
  }
  const geometry = new THREE.BufferGeometry();
  const vertices: number[] = [], vertexNormals: number[] = [], uvs: number[] = [];
  for (const [material, face] of faces.entries()) {
    geometry.addGroup(vertices.length / 3, face.positions.length / 3, material);
    vertices.push(...face.positions);
    vertexNormals.push(...face.normals);
    uvs.push(...face.uvs);
  }
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('normal', new THREE.Float32BufferAttribute(vertexNormals, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  hull.dispose();
  return geometry;
}

function faceMaterialIndex(nx: number, ny: number, nz: number) {
  // Only axis-aligned triangles carry pips; all corner cuts share material 6.
  const aligned = .999999;
  if (Math.abs(nx) > aligned) return nx > 0 ? 0 : 1;
  if (Math.abs(ny) > aligned) return ny > 0 ? 2 : 3;
  if (Math.abs(nz) > aligned) return nz > 0 ? 4 : 5;
  return 6;
}

function faceUV(face: number, x: number, y: number, z: number): [number, number] {
  switch (face) {
    case 0: return [-z, y];
    case 1: return [z, y];
    case 2: return [x, -z];
    case 3: return [x, z];
    case 5: return [-x, y];
    default: return [x, y];
  }
}

function faceMaterial(value: number, anisotropy: number) {
  const canvas = document.createElement('canvas'), relief = document.createElement('canvas');
  canvas.width = canvas.height = relief.width = relief.height = TEXTURE_SIZE;
  const ctx = canvas.getContext('2d')!, bump = relief.getContext('2d')!;
  ctx.fillStyle = BODY_COLOR;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  bump.fillStyle = '#aaaaaa';
  bump.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  // A narrow shaded lip follows the circular face, leaving the large cuts flat.
  const edgeShade = ctx.createRadialGradient(256, 256, 222, 256, 256, 256);
  edgeShade.addColorStop(0, '#00000000');
  edgeShade.addColorStop(.65, '#0000000c');
  edgeShade.addColorStop(1, '#00000045');
  ctx.fillStyle = edgeShade;
  ctx.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  const edgeRelief = bump.createRadialGradient(256, 256, 231, 256, 256, 251);
  edgeRelief.addColorStop(0, '#aaaaaa');
  edgeRelief.addColorStop(1, '#888888');
  bump.fillStyle = edgeRelief;
  bump.fillRect(0, 0, TEXTURE_SIZE, TEXTURE_SIZE);
  for (const index of pipLayout[value]) {
    const x = 256 + (index % 3 - 1) * 115, y = 256 + (Math.floor(index / 3) - 1) * 115;
    const rimShade = ctx.createRadialGradient(x, y, 35, x, y, 45);
    rimShade.addColorStop(0, '#180107b3');
    rimShade.addColorStop(.5, '#18010766');
    rimShade.addColorStop(1, '#18010700');
    ctx.fillStyle = rimShade;
    ctx.beginPath();
    ctx.arc(x, y, 45, 0, Math.PI * 2);
    ctx.fill();
    // A shaded ivory bowl and a sloped rim make the enlarged pips read as inlays.
    const inset = ctx.createLinearGradient(x, y - PIP_RADIUS, x, y + PIP_RADIUS);
    inset.addColorStop(0, '#566169');
    inset.addColorStop(.28, '#aebbc0');
    inset.addColorStop(.65, '#f1f5f3');
    inset.addColorStop(1, '#ffffff');
    ctx.beginPath();
    ctx.arc(x, y, PIP_RADIUS, 0, Math.PI * 2);
    ctx.fillStyle = inset;
    ctx.fill();
    const cavity = bump.createRadialGradient(x, y, 0, x, y, 40);
    cavity.addColorStop(0, '#222222');
    cavity.addColorStop(.55, '#383838');
    cavity.addColorStop(.9, '#777777');
    cavity.addColorStop(1, '#aaaaaa');
    bump.fillStyle = cavity;
    bump.beginPath();
    bump.arc(x, y, 40, 0, Math.PI * 2);
    bump.fill();
  }
  const map = new THREE.CanvasTexture(canvas);
  const normalMap = createNormalMap(bump);
  map.colorSpace = THREE.SRGBColorSpace;
  map.anisotropy = normalMap.anisotropy = anisotropy;
  return new THREE.MeshPhysicalMaterial({ ...MATTE_SURFACE, map, normalMap });
}

/** Height gradients tilt each pixel's normal so recesses respond to the light. */
function createNormalMap(relief: CanvasRenderingContext2D) {
  const heights = relief.getImageData(0, 0, TEXTURE_SIZE, TEXTURE_SIZE).data;
  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = normalCanvas.height = TEXTURE_SIZE;
  const normalContext = normalCanvas.getContext('2d')!;
  const pixels = normalContext.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  const sample = (x: number, y: number) => {
    const column = Math.max(0, Math.min(TEXTURE_SIZE - 1, x));
    const row = Math.max(0, Math.min(TEXTURE_SIZE - 1, y));
    return heights[(row * TEXTURE_SIZE + column) * 4] / 255;
  };
  const recessDepth = .075;
  const slope = recessDepth * TEXTURE_SIZE / (2 * SIZE);
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const nx = (sample(x - 1, y) - sample(x + 1, y)) * slope;
      const ny = (sample(x, y + 1) - sample(x, y - 1)) * slope;
      // Canvas Y points down; tangent-space Y points up.
      const length = Math.hypot(nx, ny, 1);
      const offset = (y * TEXTURE_SIZE + x) * 4;
      pixels.data[offset] = (nx / length * .5 + .5) * 255;
      pixels.data[offset + 1] = (ny / length * .5 + .5) * 255;
      pixels.data[offset + 2] = (.5 / length + .5) * 255;
      pixels.data[offset + 3] = 255;
    }
  }
  normalContext.putImageData(pixels, 0, 0);
  return new THREE.CanvasTexture(normalCanvas);
}

export function createDieMaterials(anisotropy: number) {
  // +X, -X, +Y, -Y, +Z, -Z; opposite faces always add up to seven.
  const materials = [2, 5, 3, 4, 1, 6].map(value => faceMaterial(value, anisotropy));
  materials.push(new THREE.MeshPhysicalMaterial({
    ...MATTE_SURFACE,
    color: new THREE.Color(BODY_COLOR).multiplyScalar(.85),
  }));
  return materials;
}
