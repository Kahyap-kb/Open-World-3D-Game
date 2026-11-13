import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { SoundEngine } from './audio';
import {
  createCitadelMonument,
  createEnemyMesh,
  createPlayerRig,
  createShrineAltar,
  createStoneBridge,
  createWindmillOutpost,
  type EnemyRig,
  type PlayerRig,
  type ShrineRig,
  type WindmillRig,
} from './models';
import { createProceduralTextures, type ProceduralTextureSet } from './textures';
import {
  CITADEL_PLATEAU,
  ORB_DEFS,
  PLAYER_MAX_HP,
  PLAYER_MAX_STAMINA,
  PLAYER_RADIUS,
  SHRINE_DEFS,
  SPAWN_POS,
  TERRAIN_EXTENT,
  WATER_LEVEL,
  WORLD_RADIUS,
  checkMeleeArcHit,
  evaluateGameOutcome,
  getRegionLabelAt,
  getTerrainSlope,
  getTrailFactor,
  getWalkableHeightAt,
  groundHeightAt,
  mulberry32,
  resolveCircleCollisions,
  stepPlayerVertical,
  type CircleCollider,
  type EnemyKind,
  type GameOutcome,
  type GameStateMode,
  type VerticalPhysicsState,
} from './worldMath';

export interface MinimapBlip {
  x: number;
  z: number;
  kind: 'shrine-lit' | 'shrine-unlit' | 'enemy' | 'orb';
}

export interface HudSnapshot {
  mode: GameStateMode;
  outcome: GameOutcome;
  hp: number;
  maxHp: number;
  stamina: number;
  maxStamina: number;
  score: number;
  bestScore: number;
  orbsCollected: number;
  totalOrbs: number;
  shrinesRestored: number;
  totalShrines: number;
  enemiesDefeated: number;
  elapsedSeconds: number;
  regionName: string;
  playerX: number;
  playerZ: number;
  playerYaw: number;
  cameraYaw: number;
  gliding: boolean;
  muted: boolean;
  nearPrompt: string | null;
  bannerText: string | null;
  blips: MinimapBlip[];
}

interface ShrineEntity {
  id: string;
  name: string;
  region: string;
  x: number;
  y: number;
  z: number;
  radius: number;
  restored: boolean;
  rig: ShrineRig;
}

interface OrbEntity {
  id: string;
  x: number;
  baseY: number;
  z: number;
  collected: boolean;
  mesh: THREE.Mesh;
}

interface EnemyEntity {
  id: number;
  kind: EnemyKind;
  homeX: number;
  homeZ: number;
  x: number;
  y: number;
  z: number;
  vx: number;
  vz: number;
  yaw: number;
  radius: number;
  hp: number;
  maxHp: number;
  state: 'patrol' | 'chase' | 'windup' | 'attack' | 'recover' | 'dying' | 'dead';
  stateTimer: number;
  hitFlashTimer: number;
  koTimer: number;
  patrolPhase: number;
  hasToken: boolean;
  rig: EnemyRig;
}

interface ProjectileEntity {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  mesh: THREE.Mesh;
}

interface ParticleSlot {
  active: boolean;
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  maxLife: number;
  size: number;
  color: THREE.Color;
}

// Zero-GC scratch objects reused across frames
const _v1 = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _v3 = new THREE.Vector3();
const _mat4 = new THREE.Matrix4();
const _quat = new THREE.Quaternion();
const _scale = new THREE.Vector3();
const _euler = new THREE.Euler();

const BEST_SCORE_STORAGE_KEY = 'aethermoor_best_score_v1';

function detectSoftwareGl(): boolean {
  try {
    const probe = document.createElement('canvas');
    const gl = probe.getContext('webgl2') || probe.getContext('webgl');
    if (!gl) return true;
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
  } catch {
    return true;
  }
}

export class OpenWorldEngine {
  private container: HTMLElement;
  private onHudUpdate: (snapshot: HudSnapshot) => void;
  private onModeChange: (mode: GameStateMode) => void;

  private renderer!: THREE.WebGLRenderer;
  private scene!: THREE.Scene;
  private camera!: THREE.PerspectiveCamera;
  private sunLight!: THREE.DirectionalLight;
  private textures!: ProceduralTextureSet;
  private sound = new SoundEngine();

  private isSoftwareGl = false;
  private frameId = 0;
  private disposed = false;
  private lastTimestamp = 0;

  // World objects
  private playerRig!: PlayerRig;
  private windmillRig!: WindmillRig;
  private waterMesh!: THREE.Mesh;
  private colliders: CircleCollider[] = [];
  private shrines: ShrineEntity[] = [];
  private orbs: OrbEntity[] = [];
  private enemies: EnemyEntity[] = [];
  private projectiles: ProjectileEntity[] = [];

  // Pooled particles
  private particleMesh!: THREE.InstancedMesh;
  private particles: ParticleSlot[] = [];
  private particleCursor = 0;

  // Game state
  private mode: GameStateMode = 'title';
  private outcome: GameOutcome = 'none';
  private elapsedSeconds = 0;
  private titleTourTime = 0;
  private hitstopTimer = 0;
  private cameraTrauma = 0;
  private hudEmitAccum = 0;
  private bannerText: string | null = null;
  private bannerTimer = 0;

  // Player state
  private playerX = SPAWN_POS.x;
  private playerZ = SPAWN_POS.z;
  private playerVx = 0;
  private playerVz = 0;
  private playerYaw = SPAWN_POS.yaw;
  private vertical: VerticalPhysicsState = {
    y: getWalkableHeightAt(SPAWN_POS.x, SPAWN_POS.z),
    vy: 0,
    grounded: true,
    gliding: false,
    coyoteTimer: 0,
    jumpBufferTimer: 0,
  };
  private hp = PLAYER_MAX_HP;
  private stamina = PLAYER_MAX_STAMINA;
  private score = 0;
  private bestScore = 0;
  private orbsCollected = 0;
  private shrinesRestored = 0;
  private enemiesDefeated = 0;
  private invulnTimer = 0;
  private dashTimer = 0;
  private dashCooldown = 0;
  private attackTimer = 0;
  private attackCooldown = 0;
  private attackHitApplied = false;
  private comboStep = 0;
  private walkDistance = 0;
  private squashX = 1;
  private squashY = 1;

  // Camera rig state
  private cameraYaw = 0;
  private cameraPitch = 0.34;
  private cameraDistance = 8.4;
  private camCurrentPos = new THREE.Vector3(0, 8, 42);
  private camCurrentLook = new THREE.Vector3(0, 2, 20);
  private pointerDragging = false;
  private lastPointerX = 0;
  private lastPointerY = 0;

  // Unified input hub
  private keysHeld = new Set<string>();
  private justPressed = new Set<string>();
  private resizeObserver?: ResizeObserver;

  constructor(
    container: HTMLElement,
    onHudUpdate: (snapshot: HudSnapshot) => void,
    onModeChange: (mode: GameStateMode) => void,
  ) {
    this.container = container;
    this.onHudUpdate = onHudUpdate;
    this.onModeChange = onModeChange;

    try {
      const saved = localStorage.getItem(BEST_SCORE_STORAGE_KEY);
      if (saved) this.bestScore = Math.max(0, parseInt(saved, 10) || 0);
    } catch {
      // ignore storage errors
    }

    this.initScene();
    this.bindEvents();
    this.resetWorldState('title');
    this.emitHudSnapshot(true);
    this.updateTitleTour(0);
    this.renderer.render(this.scene, this.camera);

    this.lastTimestamp = performance.now();
    this.scheduleNextFrame();
  }

  private initScene(): void {
    this.isSoftwareGl = detectSoftwareGl();

    this.renderer = new THREE.WebGLRenderer({
      antialias: !this.isSoftwareGl,
      powerPreference: 'high-performance',
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.95;
    this.renderer.setPixelRatio(this.isSoftwareGl ? 1 : Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.shadowMap.enabled = !this.isSoftwareGl;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;

    const width = Math.max(1, this.container.clientWidth || window.innerWidth);
    const height = Math.max(1, this.container.clientHeight || window.innerHeight);
    this.renderer.setSize(width, height);
    this.renderer.domElement.style.display = 'block';
    this.renderer.domElement.style.width = '100%';
    this.renderer.domElement.style.height = '100%';
    this.container.appendChild(this.renderer.domElement);

    this.scene = new THREE.Scene();
    this.scene.fog = new THREE.FogExp2(0xbfd1d6, 0.0044);

    this.camera = new THREE.PerspectiveCamera(58, width / height, 0.1, 450);

    // Mandatory Studio Environment Reflections (RoomEnvironment)
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.textures = createProceduralTextures(this.renderer.capabilities.getMaxAnisotropy());

    // Sky Dome
    const sky = new Sky();
    sky.scale.setScalar(1000);
    this.scene.add(sky);
    const skyUniforms = sky.material.uniforms;
    skyUniforms['turbidity'].value = 4.2;
    skyUniforms['rayleigh'].value = 1.65;
    skyUniforms['mieCoefficient'].value = 0.004;
    skyUniforms['mieDirectionalG'].value = 0.82;
    const sunVec = new THREE.Vector3();
    const phi = THREE.MathUtils.degToRad(90 - 24);
    const theta = THREE.MathUtils.degToRad(148);
    sunVec.setFromSphericalCoords(1, phi, theta);
    skyUniforms['sunPosition'].value.copy(sunVec);

    // Warm/Cool Lighting Contrast
    const hemi = new THREE.HemisphereLight(0x8ecae6, 0x2f3e2c, 0.68);
    this.scene.add(hemi);

    this.sunLight = new THREE.DirectionalLight(0xffdfb0, 1.85);
    this.sunLight.position.copy(sunVec).multiplyScalar(90);
    this.sunLight.castShadow = !this.isSoftwareGl;
    this.sunLight.shadow.mapSize.set(1024, 1024);
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 210;
    const d = 48;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.sunLight.shadow.bias = -0.0005;
    this.sunLight.shadow.normalBias = 0.02;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    const rimLight = new THREE.DirectionalLight(0xa5d8ff, 0.55);
    rimLight.position.set(-45, 30, -55);
    this.scene.add(rimLight);

    this.buildTerrainAndWater();
    this.buildLandmarksAndFoliage();
    this.buildInteractiveEntities();
    this.buildParticlePool();

    this.playerRig = createPlayerRig(this.textures);
    this.scene.add(this.playerRig.root);

    if (!this.isSoftwareGl) {
      this.renderer.compile(this.scene, this.camera);
    }
  }

  private buildTerrainAndWater(): void {
    const segs = 136;
    const size = TERRAIN_EXTENT * 2;
    const geo = new THREE.PlaneGeometry(size, size, segs, segs);
    geo.rotateX(-Math.PI / 2);

    const pos = geo.attributes.position;
    const colors = new Float32Array(pos.count * 3);
    const cMeadow = new THREE.Color(0x467639);
    const cGrove = new THREE.Color(0x2a5432);
    const cTrail = new THREE.Color(0xb19772);
    const cSand = new THREE.Color(0xc2ae81);
    const cCanyon = new THREE.Color(0x8e5938);
    const cCliff = new THREE.Color(0x495159);
    const tmp = new THREE.Color();

    for (let i = 0; i < pos.count; i++) {
      const x = pos.getX(i);
      const z = pos.getZ(i);
      const y = groundHeightAt(x, z);
      pos.setY(i, y);

      const slope = getTerrainSlope(x, z);
      const trail = getTrailFactor(x, z);
      const lagoonDist = Math.hypot((x - 46) * 0.95, (z + 12) * 0.85);

      tmp.copy(cMeadow);
      if (x < -16 && z > -28 && z < 16) {
        tmp.lerp(cGrove, 0.72);
      }
      if (x < -14 && z < -28) {
        tmp.lerp(cCanyon, 0.78);
      }
      if (lagoonDist < 24 || y < WATER_LEVEL + 0.45) {
        const sandW = Math.max(0, 1 - Math.max(0, y - (WATER_LEVEL - 0.2)) * 0.7);
        tmp.lerp(cSand, Math.min(1, sandW * 0.9));
      }
      if (trail > 0.05) {
        tmp.lerp(cTrail, trail * 0.85);
      }
      if (slope > 0.52 || Math.hypot(x, z) > WORLD_RADIUS - 2) {
        const rockW = Math.min(1, Math.max(0, (slope - 0.42) * 1.45));
        tmp.lerp(cCliff, rockW);
      }

      colors[i * 3] = tmp.r;
      colors[i * 3 + 1] = tmp.g;
      colors[i * 3 + 2] = tmp.b;
    }

    geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geo.computeVertexNormals();

    const terrainMat = new THREE.MeshStandardMaterial({
      vertexColors: true,
      bumpMap: this.textures.terrainBump,
      bumpScale: 0.08,
      roughness: 0.92,
      metalness: 0.02,
    });
    const terrain = new THREE.Mesh(geo, terrainMat);
    terrain.receiveShadow = true;
    this.scene.add(terrain);

    // Animated Crystal Lagoon Water Surface
    const waterGeo = new THREE.PlaneGeometry(76, 72, 24, 24);
    waterGeo.rotateX(-Math.PI / 2);
    const waterMat = new THREE.MeshStandardMaterial({
      color: 0x2689a3,
      roughness: 0.14,
      metalness: 0.25,
      transparent: true,
      opacity: 0.82,
    });
    waterMat.onBeforeCompile = (shader) => {
      shader.uniforms.uTime = { value: 0 };
      waterMat.userData.shader = shader;
      shader.vertexShader =
        'uniform float uTime;\n' +
        shader.vertexShader.replace(
          '#include <begin_vertex>',
          `#include <begin_vertex>
           transformed.y += sin(position.x * 0.45 + uTime * 2.2) * 0.05 + cos(position.z * 0.5 + uTime * 1.7) * 0.04;`,
        );
    };
    this.waterMesh = new THREE.Mesh(waterGeo, waterMat);
    this.waterMesh.position.set(42, WATER_LEVEL, -14);
    this.waterMesh.receiveShadow = true;
    this.scene.add(this.waterMesh);
  }

  private buildLandmarksAndFoliage(): void {
    // 1. Windmill Outpost beside starting meadow
    const millX = -12;
    const millZ = 16;
    this.windmillRig = createWindmillOutpost(this.textures);
    this.windmillRig.root.position.set(millX, groundHeightAt(millX, millZ), millZ);
    this.windmillRig.root.rotation.y = 0.55;
    this.scene.add(this.windmillRig.root);
    this.colliders.push({ x: millX, z: millZ, radius: 3.4, kind: 'building' });

    // 2. Towering Sunspire Citadel Monument in northern vista
    const citadel = createCitadelMonument(this.textures);
    citadel.position.set(CITADEL_PLATEAU.x, 0, CITADEL_PLATEAU.z);
    this.scene.add(citadel);
    // Citadel rear arch tower colliders so player can't walk into stone columns
    this.colliders.push({ x: -5.2, z: CITADEL_PLATEAU.z - 7.5, radius: 1.5, kind: 'pillar' });
    this.colliders.push({ x: 5.2, z: CITADEL_PLATEAU.z - 7.5, radius: 1.5, kind: 'pillar' });

    // 3. Amber Canyon Arched Stone Bridge
    const bridge = createStoneBridge(this.textures);
    bridge.position.set(-19, 0, -41.5);
    this.scene.add(bridge);

    // 4. Ruins Archway framing the starting path vista
    const archStoneMat = new THREE.MeshStandardMaterial({
      map: this.textures.stoneMap,
      bumpMap: this.textures.stoneBump,
      bumpScale: 0.05,
      color: 0xffffff,
      roughness: 0.86,
      metalness: 0.06,
    });
    const archGroup = new THREE.Group();
    const archZ = 12;
    const archY = groundHeightAt(0, archZ);
    for (const sx of [-4.1, 4.1]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(1.1, 5.4, 1.1), archStoneMat);
      col.position.set(sx, 2.7, 0);
      col.castShadow = true;
      col.receiveShadow = true;
      archGroup.add(col);
      this.colliders.push({ x: sx, z: archZ, radius: 0.8, kind: 'pillar' });
    }
    const lintel = new THREE.Mesh(new THREE.BoxGeometry(10.2, 0.95, 1.35), archStoneMat);
    lintel.position.set(0, 5.85, 0);
    lintel.castShadow = true;
    archGroup.add(lintel);
    archGroup.position.set(0, archY, archZ);
    this.scene.add(archGroup);

    // 5. Instanced Pine Trees (trunks + 2 foliage cones) & Boulders
    const rand = mulberry32(421337);
    const treePlacements: Array<{ x: number; y: number; z: number; scale: number; tint: number }> = [];

    for (let i = 0; i < 420 && treePlacements.length < 165; i++) {
      const angle = rand() * Math.PI * 2;
      const rad = 14 + rand() * (WORLD_RADIUS + 8);
      const tx = Math.cos(angle) * rad;
      const tz = Math.sin(angle) * rad;

      // Keep clear of spawn, trails, bridge, citadel, shrines, and lagoon water
      if (Math.hypot(tx - SPAWN_POS.x, tz - SPAWN_POS.z) < 11) continue;
      if (Math.hypot(tx - millX, tz - millZ) < 9) continue;
      if (Math.hypot(tx - CITADEL_PLATEAU.x, tz - CITADEL_PLATEAU.z) < 22) continue;
      if (getTrailFactor(tx, tz) > 0.15) continue;
      if (SHRINE_DEFS.some((s) => Math.hypot(tx - s.x, tz - s.z) < 8.5)) continue;
      if (Math.abs(tx + 19) < 9 && tz < -26 && tz > -62) continue;

      const ty = groundHeightAt(tx, tz);
      if (ty < WATER_LEVEL + 0.5 || getTerrainSlope(tx, tz) > 0.65) continue;

      treePlacements.push({
        x: tx,
        y: ty,
        z: tz,
        scale: 0.85 + rand() * 0.42,
        tint: 0.85 + rand() * 0.3,
      });
    }

    const count = treePlacements.length;
    const trunkGeo = new THREE.CylinderGeometry(0.22, 0.34, 2.2, 7);
    trunkGeo.translate(0, 1.1, 0);
    const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5c402c, roughness: 0.9, metalness: 0.02 });
    const trunkMesh = new THREE.InstancedMesh(trunkGeo, trunkMat, count);
    trunkMesh.castShadow = true;
    trunkMesh.receiveShadow = true;

    const coneLowGeo = new THREE.ConeGeometry(1.55, 2.9, 8);
    coneLowGeo.translate(0, 3.1, 0);
    const coneTopGeo = new THREE.ConeGeometry(1.12, 2.5, 8);
    coneTopGeo.translate(0, 4.7, 0);
    const foliageMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.86, metalness: 0.02 });
    const coneLowMesh = new THREE.InstancedMesh(coneLowGeo, foliageMat, count);
    const coneTopMesh = new THREE.InstancedMesh(coneTopGeo, foliageMat, count);
    coneLowMesh.castShadow = true;
    coneLowMesh.receiveShadow = true;
    coneTopMesh.castShadow = true;

    const colorTmp = new THREE.Color();
    treePlacements.forEach((tp, idx) => {
      _v1.set(tp.x, tp.y - 0.1, tp.z);
      _euler.set(0, rand() * Math.PI * 2, 0);
      _quat.setFromEuler(_euler);
      _scale.setScalar(tp.scale);
      _mat4.compose(_v1, _quat, _scale);

      trunkMesh.setMatrixAt(idx, _mat4);
      coneLowMesh.setMatrixAt(idx, _mat4);
      coneTopMesh.setMatrixAt(idx, _mat4);

      const isGrove = tp.x < -18;
      colorTmp.setRGB(
        (isGrove ? 0.11 : 0.14) * tp.tint,
        (isGrove ? 0.29 : 0.36) * tp.tint,
        (isGrove ? 0.17 : 0.15) * tp.tint,
      );
      coneLowMesh.setColorAt(idx, colorTmp);
      colorTmp.multiplyScalar(1.16);
      coneTopMesh.setColorAt(idx, colorTmp);

      if (Math.hypot(tp.x, tp.z) < WORLD_RADIUS) {
        this.colliders.push({ x: tp.x, z: tp.z, radius: 0.48 * tp.scale, kind: 'tree' });
      }
    });

    trunkMesh.instanceMatrix.needsUpdate = true;
    coneLowMesh.instanceMatrix.needsUpdate = true;
    coneTopMesh.instanceMatrix.needsUpdate = true;
    if (coneLowMesh.instanceColor) coneLowMesh.instanceColor.needsUpdate = true;
    if (coneTopMesh.instanceColor) coneTopMesh.instanceColor.needsUpdate = true;
    trunkMesh.computeBoundingSphere();
    coneLowMesh.computeBoundingSphere();
    coneTopMesh.computeBoundingSphere();
    this.scene.add(trunkMesh, coneLowMesh, coneTopMesh);

    // 6. Instanced Rocks & Boulders (micro-vignettes across valley)
    const rockCount = 95;
    const rockGeo = new THREE.DodecahedronGeometry(1, 0);
    const rockMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.88,
      metalness: 0.06,
    });
    const rockMesh = new THREE.InstancedMesh(rockGeo, rockMat, rockCount);
    rockMesh.castShadow = true;
    rockMesh.receiveShadow = true;

    let placedRocks = 0;
    for (let i = 0; i < 300 && placedRocks < rockCount; i++) {
      const ang = rand() * Math.PI * 2;
      const rad = 10 + rand() * (WORLD_RADIUS - 4);
      const rx = Math.cos(ang) * rad;
      const rz = Math.sin(ang) * rad;
      if (getTrailFactor(rx, rz) > 0.2) continue;
      if (Math.hypot(rx - SPAWN_POS.x, rz - SPAWN_POS.z) < 9) continue;
      if (SHRINE_DEFS.some((s) => Math.hypot(rx - s.x, rz - s.z) < 6.5)) continue;
      if (Math.hypot(rx - CITADEL_PLATEAU.x, rz - CITADEL_PLATEAU.z) < 19) continue;

      const ry = groundHeightAt(rx, rz);
      if (ry < WATER_LEVEL - 0.5) continue;

      const sx = 0.65 + rand() * 1.1;
      const sy = 0.48 + rand() * 0.85;
      const sz = 0.65 + rand() * 1.1;
      _v1.set(rx, ry + sy * 0.28, rz);
      _euler.set(rand() * 0.5, rand() * Math.PI * 2, rand() * 0.5);
      _quat.setFromEuler(_euler);
      _scale.set(sx, sy, sz);
      _mat4.compose(_v1, _quat, _scale);
      rockMesh.setMatrixAt(placedRocks, _mat4);

      const shade = rx < -14 && rz < -28 ? 0.56 : 0.45;
      const tint = 0.82 + rand() * 0.34;
      colorTmp.setRGB(shade * tint, (shade - 0.03) * tint, (shade - 0.06) * tint);
      rockMesh.setColorAt(placedRocks, colorTmp);

      const cr = Math.max(sx, sz) * 0.72;
      if (cr > 0.7) {
        this.colliders.push({ x: rx, z: rz, radius: cr, kind: 'rock' });
      }
      placedRocks++;
    }
    rockMesh.count = placedRocks;
    rockMesh.instanceMatrix.needsUpdate = true;
    if (rockMesh.instanceColor) rockMesh.instanceColor.needsUpdate = true;
    rockMesh.computeBoundingSphere();
    this.scene.add(rockMesh);
  }

  private buildInteractiveEntities(): void {
    // 5 Ancient Sun Shrines
    this.shrines = SHRINE_DEFS.map((def) => {
      const rig = createShrineAltar(this.textures);
      const y = def.id === 'citadel' ? CITADEL_PLATEAU.height : groundHeightAt(def.x, def.z);
      rig.root.position.set(def.x, y, def.z);
      this.scene.add(rig.root);
      return {
        ...def,
        y,
        restored: false,
        rig,
      };
    });

    // 15 Lumina Relic Orbs
    const orbGeo = new THREE.OctahedronGeometry(0.42, 0);
    const orbMat = new THREE.MeshStandardMaterial({
      color: 0xffe484,
      emissive: 0xf59e0b,
      emissiveIntensity: 1.1,
      roughness: 0.15,
      metalness: 0.35,
    });
    this.orbs = ORB_DEFS.map((def) => {
      const baseY = getWalkableHeightAt(def.x, def.z) + def.heightOffset;
      const mesh = new THREE.Mesh(orbGeo, orbMat);
      mesh.position.set(def.x, baseY, def.z);
      mesh.castShadow = true;
      this.scene.add(mesh);
      return {
        id: def.id,
        x: def.x,
        baseY,
        z: def.z,
        collected: false,
        mesh,
      };
    });

    // Pooled Projectiles (24)
    const projGeo = new THREE.SphereGeometry(0.26, 10, 8);
    const projMat = new THREE.MeshStandardMaterial({
      color: 0x7dd3fc,
      emissive: 0x0ea5e9,
      emissiveIntensity: 1.8,
      roughness: 0.1,
    });
    for (let i = 0; i < 24; i++) {
      const mesh = new THREE.Mesh(projGeo, projMat);
      mesh.visible = false;
      this.scene.add(mesh);
      this.projectiles.push({
        active: false,
        x: 0,
        y: 0,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        mesh,
      });
    }

    // Spawn Enemies guarding shrines & crossroads (3 distinct archetypes)
    const enemySpecs: Array<{ kind: EnemyKind; x: number; z: number }> = [
      { kind: 'stalker', x: 18, z: 12 }, // Meadow Shrine
      { kind: 'stalker', x: -39, z: -3 }, // Pine Grove
      { kind: 'stalker', x: -46, z: -12 }, // Pine Grove
      { kind: 'sentry', x: -36, z: -11 }, // Pine Grove
      { kind: 'sentry', x: 38, z: -6 }, // Lagoon shore
      { kind: 'sentry', x: 47, z: -19 }, // Lagoon isle
      { kind: 'stalker', x: -32, z: -48 }, // Amber Canyon
      { kind: 'warden', x: -42, z: -56 }, // Amber Canyon Guardian
      { kind: 'sentry', x: -5, z: -52 }, // Citadel Terrace
      { kind: 'warden', x: 4, z: -50 }, // Sunspire Citadel Warden
    ];

    this.enemies = enemySpecs.map((spec, idx) => {
      const rig = createEnemyMesh(spec.kind, this.textures);
      const y = getWalkableHeightAt(spec.x, spec.z);
      rig.root.position.set(spec.x, y, spec.z);
      this.scene.add(rig.root);

      const maxHp = spec.kind === 'warden' ? 5 : spec.kind === 'sentry' ? 2 : 3;
      const radius = spec.kind === 'warden' ? 1.25 : 0.72;
      return {
        id: idx,
        kind: spec.kind,
        homeX: spec.x,
        homeZ: spec.z,
        x: spec.x,
        y,
        z: spec.z,
        vx: 0,
        vz: 0,
        yaw: 0,
        radius,
        hp: maxHp,
        maxHp,
        state: 'patrol',
        stateTimer: 0,
        hitFlashTimer: 0,
        koTimer: 0,
        patrolPhase: idx * 1.1,
        hasToken: false,
        rig,
      };
    });
  }

  private buildParticlePool(): void {
    const cap = 160;
    const pGeo = new THREE.BoxGeometry(0.16, 0.16, 0.16);
    const pMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.particleMesh = new THREE.InstancedMesh(pGeo, pMat, cap);
    this.particleMesh.frustumCulled = false;

    for (let i = 0; i < cap; i++) {
      this.particles.push({
        active: false,
        x: 0,
        y: -50,
        z: 0,
        vx: 0,
        vy: 0,
        vz: 0,
        life: 0,
        maxLife: 0.4,
        size: 1,
        color: new THREE.Color(0xffd166),
      });
      _v1.set(0, -100, 0);
      _quat.identity();
      _scale.setScalar(0.001);
      _mat4.compose(_v1, _quat, _scale);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, this.particles[i].color);
    }
    this.particleMesh.instanceMatrix.needsUpdate = true;
    if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    this.scene.add(this.particleMesh);
  }

  private spawnParticles(
    x: number,
    y: number,
    z: number,
    hexColor: number,
    count: number,
    speed: number,
  ): void {
    for (let i = 0; i < count; i++) {
      const slot = this.particles[this.particleCursor];
      this.particleCursor = (this.particleCursor + 1) % this.particles.length;

      const ang = Math.random() * Math.PI * 2;
      const spd = speed * (0.45 + Math.random() * 0.75);
      slot.active = true;
      slot.x = x;
      slot.y = y;
      slot.z = z;
      slot.vx = Math.cos(ang) * spd;
      slot.vy = speed * (0.4 + Math.random() * 0.8);
      slot.vz = Math.sin(ang) * spd;
      slot.maxLife = 0.28 + Math.random() * 0.28;
      slot.life = slot.maxLife;
      slot.size = 0.7 + Math.random() * 0.75;
      slot.color.setHex(hexColor);
    }
  }

  public resetWorldState(targetMode: GameStateMode): void {
    this.mode = targetMode;
    this.outcome = 'none';
    this.elapsedSeconds = 0;
    this.hitstopTimer = 0;
    this.cameraTrauma = 0;
    this.bannerText = targetMode === 'playing' ? 'Restore the 5 Sun Shrines of Aethermoor' : null;
    this.bannerTimer = targetMode === 'playing' ? 3.5 : 0;

    this.playerX = SPAWN_POS.x;
    this.playerZ = SPAWN_POS.z;
    this.playerVx = 0;
    this.playerVz = 0;
    this.playerYaw = SPAWN_POS.yaw;
    this.vertical = {
      y: getWalkableHeightAt(SPAWN_POS.x, SPAWN_POS.z),
      vy: 0,
      grounded: true,
      gliding: false,
      coyoteTimer: 0,
      jumpBufferTimer: 0,
    };
    this.hp = PLAYER_MAX_HP;
    this.stamina = PLAYER_MAX_STAMINA;
    this.score = 0;
    this.orbsCollected = 0;
    this.shrinesRestored = 0;
    this.enemiesDefeated = 0;
    this.invulnTimer = 0;
    this.dashTimer = 0;
    this.dashCooldown = 0;
    this.attackTimer = 0;
    this.attackCooldown = 0;
    this.attackHitApplied = false;
    this.squashX = 1;
    this.squashY = 1;

    this.cameraYaw = 0;
    this.cameraPitch = 0.34;
    this.camCurrentPos.set(0, this.vertical.y + 4.4, SPAWN_POS.z + 8.5);
    this.camCurrentLook.set(0, this.vertical.y + 1.5, SPAWN_POS.z - 6);

    this.keysHeld.clear();
    this.justPressed.clear();

    this.playerRig.root.position.set(this.playerX, this.vertical.y, this.playerZ);
    this.playerRig.root.rotation.y = this.playerYaw;
    this.playerRig.gliderGroup.visible = false;
    this.playerRig.swordSlashMesh.visible = false;

    for (const s of this.shrines) {
      s.restored = false;
      s.rig.crystalMat.color.setHex(0x38bdf8);
      s.rig.crystalMat.emissive.setHex(0x0284c7);
      s.rig.beamMat.color.setHex(0x38bdf8);
      s.rig.beamMat.opacity = 0.16;
    }

    for (const o of this.orbs) {
      o.collected = false;
      o.mesh.visible = true;
    }

    for (const p of this.projectiles) {
      p.active = false;
      p.mesh.visible = false;
    }

    for (const e of this.enemies) {
      e.x = e.homeX;
      e.z = e.homeZ;
      e.y = getWalkableHeightAt(e.homeX, e.homeZ);
      e.vx = 0;
      e.vz = 0;
      e.hp = e.maxHp;
      e.state = 'patrol';
      e.stateTimer = 0;
      e.hitFlashTimer = 0;
      e.koTimer = 0;
      e.hasToken = false;
      e.rig.root.visible = true;
      e.rig.root.position.set(e.x, e.y, e.z);
      e.rig.bodyGroup.rotation.set(0, 0, 0);
      e.rig.bodyGroup.scale.setScalar(1);
      e.rig.telegraphRing.visible = false;
    }

    this.onModeChange(targetMode);
    this.emitHudSnapshot(true);
  }

  public startGame(): void {
    this.sound.unlock();
    if (this.mode === 'gameover' || this.mode === 'title') {
      this.resetWorldState('playing');
    } else {
      this.setMode('playing');
    }
    this.renderer.domElement.focus?.();
  }

  public setMode(nextMode: GameStateMode): void {
    if (this.mode === nextMode) return;
    this.mode = nextMode;
    this.keysHeld.clear();
    this.justPressed.clear();
    if (nextMode !== 'playing' && document.pointerLockElement === this.renderer.domElement) {
      document.exitPointerLock?.();
    }
    this.onModeChange(nextMode);
    this.emitHudSnapshot(true);
  }

  public toggleMute(): boolean {
    const muted = this.sound.toggleMute();
    this.emitHudSnapshot(true);
    return muted;
  }

  public getMode(): GameStateMode {
    return this.mode;
  }

  private bindEvents(): void {
    const onKeyDown = (ev: KeyboardEvent) => {
      if (this.mode === 'playing') {
        if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(ev.code)) {
          ev.preventDefault();
        }
        if (!this.keysHeld.has(ev.code)) {
          this.justPressed.add(ev.code);
        }
        this.keysHeld.add(ev.code);
      }
    };

    const onKeyUp = (ev: KeyboardEvent) => {
      this.keysHeld.delete(ev.code);
    };

    const onBlur = () => {
      this.keysHeld.clear();
      this.justPressed.clear();
      this.pointerDragging = false;
    };

    const onVisibilityChange = () => {
      if (document.hidden) onBlur();
    };

    const canvas = this.renderer.domElement;
    const onPointerDown = (ev: PointerEvent) => {
      if (this.mode !== 'playing') return;
      this.sound.unlock();
      if (ev.button === 0) {
        this.pointerDragging = true;
        this.lastPointerX = ev.clientX;
        this.lastPointerY = ev.clientY;
        this.justPressed.add('MouseAttack');
      } else if (ev.button === 2) {
        this.justPressed.add('MouseDash');
      }
    };

    const onPointerMove = (ev: PointerEvent) => {
      if (this.mode !== 'playing') return;
      if (document.pointerLockElement === canvas) {
        this.cameraYaw -= ev.movementX * 0.0032;
        this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch + ev.movementY * 0.0024, 0.08, 0.88);
      } else if (this.pointerDragging) {
        const dx = ev.clientX - this.lastPointerX;
        const dy = ev.clientY - this.lastPointerY;
        this.lastPointerX = ev.clientX;
        this.lastPointerY = ev.clientY;
        this.cameraYaw -= dx * 0.0055;
        this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch + dy * 0.004, 0.08, 0.88);
      }
    };

    const onPointerUp = () => {
      this.pointerDragging = false;
    };

    const onContextMenu = (ev: MouseEvent) => {
      if (this.mode === 'playing') ev.preventDefault();
    };

    const onResize = () => {
      if (this.disposed) return;
      const w = Math.max(1, this.container.clientWidth || window.innerWidth);
      const h = Math.max(1, this.container.clientHeight || window.innerHeight);
      this.camera.aspect = w / h;
      this.camera.updateProjectionMatrix();
      this.renderer.setSize(w, h);
    };

    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    document.addEventListener('visibilitychange', onVisibilityChange);
    canvas.addEventListener('pointerdown', onPointerDown);
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    canvas.addEventListener('contextmenu', onContextMenu);
    window.addEventListener('resize', onResize);

    if (typeof ResizeObserver !== 'undefined') {
      this.resizeObserver = new ResizeObserver(onResize);
      this.resizeObserver.observe(this.container);
    }

    // Store cleanup on instance
    this.cleanupListeners = () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
      document.removeEventListener('visibilitychange', onVisibilityChange);
      canvas.removeEventListener('pointerdown', onPointerDown);
      window.removeEventListener('pointermove', onPointerMove);
      window.removeEventListener('pointerup', onPointerUp);
      canvas.removeEventListener('contextmenu', onContextMenu);
      window.removeEventListener('resize', onResize);
      this.resizeObserver?.disconnect();
    };
  }

  private cleanupListeners: () => void = () => {};

  private scheduleNextFrame(): void {
    if (this.disposed) return;
    if (this.isSoftwareGl) {
      this.afterDraw(() => this.tick());
    } else {
      this.frameId = requestAnimationFrame(() => this.tick());
    }
  }

  private afterDraw(cb: () => void): void {
    const gl = this.renderer.getContext() as WebGL2RenderingContext;
    if (gl && typeof gl.fenceSync === 'function') {
      const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
      gl.flush();
      const poll = () => {
        if (this.disposed) {
          if (sync) gl.deleteSync(sync);
          return;
        }
        const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
        if (state === gl.UNSIGNALED) {
          this.frameId = window.setTimeout(poll, 5);
        } else {
          if (sync) gl.deleteSync(sync);
          this.frameId = window.setTimeout(cb, 80);
        }
      };
      this.frameId = window.setTimeout(poll, 5);
    } else {
      this.frameId = window.setTimeout(cb, 80);
    }
  }

  private tick(): void {
    if (this.disposed) return;
    const now = performance.now();
    const rawDt = (now - this.lastTimestamp) / 1000;
    this.lastTimestamp = now;
    const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

    this.sound.tick(dt);
    this.updateAmbientWorld(dt);

    if (this.mode === 'title') {
      this.updateTitleTour(dt);
    } else if (this.mode === 'playing') {
      this.updatePlaying(dt);
    }

    this.updateParticles(dt);
    this.renderer.render(this.scene, this.camera);
    this.scheduleNextFrame();
  }

  private updateAmbientWorld(dt: number): void {
    this.windmillRig.bladesHub.rotation.z += dt * 0.65;
    const waterShader = (this.waterMesh.material as THREE.MeshStandardMaterial).userData.shader;
    if (waterShader) {
      waterShader.uniforms.uTime.value += dt;
    }

    const t = performance.now() * 0.001;
    for (const s of this.shrines) {
      s.rig.crystal.rotation.y += dt * (s.restored ? 2.2 : 0.9);
      s.rig.crystal.position.y = 2.55 + Math.sin(t * 2.1 + s.x) * 0.16;
      s.rig.haloRing.rotation.z += dt * (s.restored ? 1.5 : 0.45);
    }

    for (const o of this.orbs) {
      if (o.collected) continue;
      o.mesh.rotation.y += dt * 2.1;
      o.mesh.position.y = o.baseY + Math.sin(t * 2.6 + o.x * 0.5) * 0.18;
    }
  }

  private updateTitleTour(dt: number): void {
    this.titleTourTime += dt * 0.14;
    const radius = 56;
    const camX = Math.sin(this.titleTourTime) * radius * 0.85;
    const camZ = Math.cos(this.titleTourTime) * radius * 0.72 - 12;
    const groundY = groundHeightAt(camX, camZ);
    this.camera.position.set(camX, Math.max(18, groundY + 15), camZ);
    this.camera.lookAt(0, 7.5, -24);
  }

  private updatePlaying(dt: number): void {
    this.elapsedSeconds += dt;
    if (this.bannerTimer > 0) {
      this.bannerTimer -= dt;
      if (this.bannerTimer <= 0) this.bannerText = null;
    }

    // Sim-level hitstop freeze on heavy hits while camera shake & flashes keep ticking
    if (this.hitstopTimer > 0) {
      this.hitstopTimer -= dt;
      this.updateCameraRig(dt);
      this.justPressed.clear();
      return;
    }

    this.updatePlayer(dt);
    this.updateShrinesAndOrbs(dt);
    this.updateEnemies(dt);
    this.updateProjectiles(dt);
    this.updateCameraRig(dt);

    // Check Win / Defeat condition
    const nextOutcome = evaluateGameOutcome(this.hp, this.shrinesRestored, this.shrines.length);
    if (nextOutcome !== 'none') {
      this.outcome = nextOutcome;
      this.score += nextOutcome === 'victory' ? 500 + this.hp * 50 : 0;
      if (this.score > this.bestScore) {
        this.bestScore = this.score;
        try {
          localStorage.setItem(BEST_SCORE_STORAGE_KEY, String(this.bestScore));
        } catch {
          // ignore
        }
      }
      if (nextOutcome === 'victory') this.sound.playVictory();
      else this.sound.playDefeat();

      this.setMode('gameover');
      return;
    }

    this.justPressed.clear();

    this.hudEmitAccum += dt;
    if (this.hudEmitAccum >= 0.1) {
      this.hudEmitAccum = 0;
      this.emitHudSnapshot(false);
    }
  }

  private updatePlayer(dt: number): void {
    if (this.invulnTimer > 0) this.invulnTimer -= dt;
    if (this.dashCooldown > 0) this.dashCooldown -= dt;
    if (this.attackCooldown > 0) this.attackCooldown -= dt;

    // Camera yaw keyboard controls (Q / E) alongside mouse drag
    if (this.keysHeld.has('KeyQ')) this.cameraYaw += 1.9 * dt;
    if (this.keysHeld.has('KeyE')) this.cameraYaw -= 1.9 * dt;

    // Directional movement input (WASD + Arrow keys)
    let moveForward = 0;
    let moveRight = 0;
    if (this.keysHeld.has('KeyW') || this.keysHeld.has('ArrowUp')) moveForward += 1;
    if (this.keysHeld.has('KeyS') || this.keysHeld.has('ArrowDown')) moveForward -= 1;
    if (this.keysHeld.has('KeyD') || this.keysHeld.has('ArrowRight')) moveRight += 1;
    if (this.keysHeld.has('KeyA') || this.keysHeld.has('ArrowLeft')) moveRight -= 1;

    const inputLen = Math.hypot(moveForward, moveRight);
    if (inputLen > 1e-4) {
      moveForward /= inputLen;
      moveRight /= inputLen;
    }

    // Camera-relative world movement direction (-Z is yaw=0)
    const sinY = Math.sin(this.cameraYaw);
    const cosY = Math.cos(this.cameraYaw);
    const wishX = -sinY * moveForward + cosY * moveRight;
    const wishZ = -cosY * moveForward - sinY * moveRight;

    // Dash roll trigger (ShiftLeft/Right tap or KeyC or MouseDash)
    const dashRequested =
      this.justPressed.has('ShiftLeft') ||
      this.justPressed.has('ShiftRight') ||
      this.justPressed.has('KeyC') ||
      this.justPressed.has('MouseDash');

    if (dashRequested && this.dashCooldown <= 0 && this.stamina >= 22) {
      this.dashTimer = 0.22;
      this.dashCooldown = 0.65;
      this.invulnTimer = Math.max(this.invulnTimer, 0.28);
      this.stamina = Math.max(0, this.stamina - 22);
      const dirX = inputLen > 0.1 ? wishX : -Math.sin(this.playerYaw);
      const dirZ = inputLen > 0.1 ? wishZ : -Math.cos(this.playerYaw);
      this.playerVx = dirX * 19.5;
      this.playerVz = dirZ * 19.5;
      this.sound.playDash();
      this.spawnParticles(this.playerX, this.vertical.y + 0.5, this.playerZ, 0xffe49e, 8, 4.2);
    }

    // Horizontal acceleration & sprint
    const sprinting =
      (this.keysHeld.has('ShiftLeft') || this.keysHeld.has('ShiftRight')) &&
      inputLen > 0.1 &&
      this.vertical.grounded &&
      this.stamina > 2;
    const targetSpeed = this.vertical.gliding ? 10.6 : sprinting ? 12.2 : 8.2;

    if (this.dashTimer > 0) {
      this.dashTimer -= dt;
    } else {
      const accel = this.vertical.grounded ? 14 : 6.5;
      const targetVx = wishX * targetSpeed;
      const targetVz = wishZ * targetSpeed;
      const alpha = 1 - Math.exp(-accel * dt);
      this.playerVx += (targetVx - this.playerVx) * alpha;
      this.playerVz += (targetVz - this.playerVz) * alpha;

      if (sprinting) {
        this.stamina = Math.max(0, this.stamina - 16 * dt);
      } else if (!this.vertical.gliding && this.vertical.grounded) {
        this.stamina = Math.min(PLAYER_MAX_STAMINA, this.stamina + 26 * dt);
      }
    }

    // Face movement heading smoothly
    const hSpeed = Math.hypot(this.playerVx, this.playerVz);
    if (inputLen > 0.1) {
      const targetYaw = Math.atan2(-wishX, -wishZ);
      let diff = targetYaw - this.playerYaw;
      while (diff > Math.PI) diff -= Math.PI * 2;
      while (diff < -Math.PI) diff += Math.PI * 2;
      this.playerYaw += diff * (1 - Math.exp(-13 * dt));
    }

    // Integrate horizontal & resolve colliders
    const nextX = this.playerX + this.playerVx * dt;
    const nextZ = this.playerZ + this.playerVz * dt;
    const resolved = resolveCircleCollisions(nextX, nextZ, PLAYER_RADIUS, this.colliders, WORLD_RADIUS);
    this.playerX = resolved.x;
    this.playerZ = resolved.z;

    // Vertical physics (Jump, Coyote Time, Buffer, Sky-Glider)
    const groundY = getWalkableHeightAt(this.playerX, this.playerZ);
    const wasGliding = this.vertical.gliding;
    const jumpJustPressed = this.justPressed.has('Space');
    const jumpHeld = this.keysHeld.has('Space');

    const vRes = stepPlayerVertical(this.vertical, {
      dt,
      groundY,
      jumpJustPressed,
      jumpHeld,
      stamina: this.stamina,
    });
    this.stamina = Math.max(0, this.stamina - vRes.staminaDrain);

    if (vRes.jumped) {
      this.squashX = 0.84;
      this.squashY = 1.2;
      this.sound.playJump();
      this.spawnParticles(this.playerX, groundY + 0.1, this.playerZ, 0xe2d5b8, 5, 2.5);
    }
    if (vRes.landed) {
      this.squashX = 1.22;
      this.squashY = 0.78;
      this.sound.playLand();
      this.spawnParticles(this.playerX, groundY + 0.1, this.playerZ, 0xd4c3a1, 7, 3.2);
    }
    if (!wasGliding && this.vertical.gliding) {
      this.sound.playGlideOpen();
    }

    // Footstep sound & gait sync
    if (this.vertical.grounded && hSpeed > 1.5) {
      this.walkDistance += hSpeed * dt;
      const onStone = getTrailFactor(this.playerX, this.playerZ) > 0.35 || this.vertical.y > 2.2;
      this.sound.playFootstep(onStone);
    }

    // Solar Blade Melee Attack (J, F, or Left-Click)
    const attackReq =
      this.justPressed.has('KeyJ') ||
      this.justPressed.has('KeyF') ||
      this.justPressed.has('MouseAttack');
    if (attackReq && this.attackCooldown <= 0 && !this.vertical.gliding) {
      this.attackTimer = 0.28;
      this.attackCooldown = 0.36;
      this.attackHitApplied = false;
      this.comboStep = (this.comboStep + 1) % 2;
      this.sound.playSwing();
      // Slight forward lunge
      this.playerVx += -Math.sin(this.playerYaw) * 4.5;
      this.playerVz += -Math.cos(this.playerYaw) * 4.5;
    }

    if (this.attackTimer > 0) {
      this.attackTimer -= dt;
      const phase = 1 - this.attackTimer / 0.28; // 0..1
      const active = phase >= 0.22 && phase <= 0.72;
      this.playerRig.swordSlashMesh.visible = active;
      this.playerRig.swordSlashMesh.rotation.z = this.comboStep === 0 ? 0.12 : -0.12;

      if (active && !this.attackHitApplied) {
        this.attackHitApplied = true;
        this.applyPlayerSwordHit();
      }
    } else {
      this.playerRig.swordSlashMesh.visible = false;
    }

    // Update Hero Visual Rig + Squash & Stretch + Gait
    this.squashX = THREE.MathUtils.damp(this.squashX, 1, 14, dt);
    this.squashY = THREE.MathUtils.damp(this.squashY, 1, 14, dt);

    this.playerRig.root.position.set(this.playerX, this.vertical.y, this.playerZ);
    this.playerRig.root.rotation.y = this.playerYaw;
    this.playerRig.bodyPivot.scale.set(this.squashX, this.squashY, this.squashX);
    this.playerRig.gliderGroup.visible = this.vertical.gliding;

    const swingPhase = Math.sin(this.walkDistance * 2.1) * Math.min(1, hSpeed / 6);
    this.playerRig.leftLeg.rotation.x = swingPhase * 0.65;
    this.playerRig.rightLeg.rotation.x = -swingPhase * 0.65;
    this.playerRig.leftArm.rotation.x = -swingPhase * 0.55;

    if (this.attackTimer > 0) {
      const p = 1 - this.attackTimer / 0.28;
      const slashAng = this.comboStep === 0 ? -1.2 + p * 2.6 : 1.2 - p * 2.6;
      this.playerRig.rightArm.rotation.set(-1.15, slashAng, 0.35);
    } else if (this.vertical.gliding) {
      this.playerRig.rightArm.rotation.set(-2.5, 0, 0.25);
      this.playerRig.leftArm.rotation.set(-2.5, 0, -0.25);
    } else {
      this.playerRig.rightArm.rotation.set(swingPhase * 0.55, 0, 0);
      this.playerRig.leftArm.rotation.z = 0;
    }

    // Ground contact shadow stays anchored directly on walkable ground below player
    const heightAboveGround = Math.max(0, this.vertical.y - groundY);
    this.playerRig.shadowDisc.position.y = -heightAboveGround + 0.025;
    const shadowScale = Math.max(0.45, 1 - heightAboveGround * 0.08);
    this.playerRig.shadowDisc.scale.setScalar(shadowScale);
    (this.playerRig.shadowDisc.material as THREE.MeshBasicMaterial).opacity =
      0.55 * Math.max(0.25, 1 - heightAboveGround * 0.12);

    // Subtle invulnerability blink
    this.playerRig.bodyPivot.visible =
      this.invulnTimer <= 0 || Math.floor(this.invulnTimer * 18) % 2 === 0;
  }

  private applyPlayerSwordHit(): void {
    const fwdX = -Math.sin(this.playerYaw);
    const fwdZ = -Math.cos(this.playerYaw);
    let hitAny = false;

    for (const e of this.enemies) {
      if (e.state === 'dying' || e.state === 'dead') continue;
      if (Math.abs(e.y - this.vertical.y) > 2.4) continue;
      if (checkMeleeArcHit(this.playerX, this.playerZ, fwdX, fwdZ, e.x, e.z, e.radius, 2.95, 0.1)) {
        hitAny = true;
        e.hp -= 1;
        e.hitFlashTimer = 0.07;
        e.stateTimer = 0;
        e.hasToken = false;
        e.rig.telegraphRing.visible = false;

        // Knockback away from player
        const dx = e.x - this.playerX;
        const dz = e.z - this.playerZ;
        const len = Math.max(0.01, Math.hypot(dx, dz));
        const kb = e.kind === 'warden' ? 4.5 : 8.5;
        e.vx = (dx / len) * kb;
        e.vz = (dz / len) * kb;

        this.spawnParticles(e.x, e.y + 1.1, e.z, 0xffb703, 14, 5.5);

        if (e.hp <= 0) {
          e.state = 'dying';
          e.koTimer = 0.42;
          this.enemiesDefeated += 1;
          this.score += e.kind === 'warden' ? 250 : 100;
          this.hp = Math.min(PLAYER_MAX_HP, this.hp + (e.kind === 'warden' ? 1 : 0));
          this.hitstopTimer = 0.055;
          this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.42);
          this.sound.playHit(true);
          this.spawnParticles(e.x, e.y + 1.2, e.z, 0xf43f5e, 22, 6.8);
        } else {
          this.hitstopTimer = 0.035;
          this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.22);
          this.sound.playHit(false);
        }
      }
    }

    if (hitAny) {
      this.emitHudSnapshot(true);
    }
  }

  private updateShrinesAndOrbs(_dt: number): void {
    // Collect Lumina Orbs
    for (const o of this.orbs) {
      if (o.collected) continue;
      const dist = Math.hypot(this.playerX - o.x, this.playerZ - o.z);
      if (dist < 1.75 && Math.abs(this.vertical.y + 0.9 - o.baseY) < 1.8) {
        o.collected = true;
        o.mesh.visible = false;
        this.orbsCollected += 1;
        this.score += 50;
        this.stamina = Math.min(PLAYER_MAX_STAMINA, this.stamina + 35);
        this.sound.playOrbPickup();
        this.spawnParticles(o.x, o.baseY, o.z, 0xffe484, 14, 4.4);
        this.emitHudSnapshot(true);
      }
    }

    // Restore Shrines (step within 2.5m or press E within 3.6m)
    const interactPressed = this.justPressed.has('KeyE');
    for (const s of this.shrines) {
      if (s.restored) continue;
      const dist = Math.hypot(this.playerX - s.x, this.playerZ - s.z);
      const dy = Math.abs(this.vertical.y - s.y);
      if (dy < 2.2 && (dist < 2.35 || (interactPressed && dist < 3.8))) {
        s.restored = true;
        this.shrinesRestored += 1;
        this.score += 300;
        this.hp = Math.min(PLAYER_MAX_HP, this.hp + 1);
        this.stamina = PLAYER_MAX_STAMINA;

        s.rig.crystalMat.color.setHex(0xffe082);
        s.rig.crystalMat.emissive.setHex(0xf59e0b);
        s.rig.beamMat.color.setHex(0xffd166);
        s.rig.beamMat.opacity = 0.42;

        this.sound.playShrineRestore();
        this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.3);
        this.spawnParticles(s.x, s.y + 2.4, s.z, 0xffd166, 26, 7.2);
        this.bannerText = `${s.name} Restored (${this.shrinesRestored}/${this.shrines.length})`;
        this.bannerTimer = 3.4;
        this.emitHudSnapshot(true);
      }
    }
  }

  private updateEnemies(dt: number): void {
    // Attack token pool: max 3 concurrent attacking/winding-up enemies for fair crowd readability
    let activeTokens = 0;
    for (const e of this.enemies) {
      if (e.hasToken && (e.state === 'windup' || e.state === 'attack')) activeTokens++;
      else e.hasToken = false;
    }

    for (const e of this.enemies) {
      if (e.state === 'dead') continue;

      if (e.hitFlashTimer > 0) {
        e.hitFlashTimer -= dt;
        e.rig.shellMat.emissive.setHex(e.hitFlashTimer > 0 ? 0xffffff : 0x000000);
        e.rig.shellMat.emissiveIntensity = e.hitFlashTimer > 0 ? 0.9 : 0;
      }

      if (e.state === 'dying') {
        e.koTimer -= dt;
        const p = 1 - Math.max(0, e.koTimer) / 0.42;
        e.rig.bodyGroup.rotation.z = p * 1.45;
        e.rig.bodyGroup.scale.setScalar(Math.max(0.01, 1 - p * 0.85));
        e.x += e.vx * dt;
        e.z += e.vz * dt;
        e.vx *= Math.exp(-8 * dt);
        e.vz *= Math.exp(-8 * dt);
        e.rig.root.position.set(e.x, getWalkableHeightAt(e.x, e.z), e.z);
        if (e.koTimer <= 0) {
          e.state = 'dead';
          e.rig.root.visible = false;
        }
        continue;
      }

      if (e.rig.orbitalRing) {
        e.rig.orbitalRing.rotation.y += dt * 2.4;
      }

      const dx = this.playerX - e.x;
      const dz = this.playerZ - e.z;
      const dist = Math.hypot(dx, dz);
      const dy = Math.abs(this.vertical.y - e.y);

      const aggroRange = e.kind === 'sentry' ? 20 : e.kind === 'warden' ? 16 : 14;
      const targetYaw = Math.atan2(-dx, -dz);

      if (e.state === 'patrol') {
        e.patrolPhase += dt * 0.9;
        const targetX = e.homeX + Math.cos(e.patrolPhase) * 3.2;
        const targetZ = e.homeZ + Math.sin(e.patrolPhase) * 3.2;
        e.vx = (targetX - e.x) * 1.4;
        e.vz = (targetZ - e.z) * 1.4;
        if (Math.hypot(e.vx, e.vz) > 0.2) {
          e.yaw = Math.atan2(-e.vx, -e.vz);
        }
        if (dist < aggroRange && dy < 4.5) {
          e.state = 'chase';
        }
      } else if (e.state === 'chase') {
        e.yaw = targetYaw;
        const nx = dx / Math.max(0.01, dist);
        const nz = dz / Math.max(0.01, dist);

        if (e.kind === 'stalker') {
          // Agile flanker/chaser: weaves slightly while closing to 2.2m lunge range
          const strafe = Math.sin(this.elapsedSeconds * 2.4 + e.id) * 0.45;
          const speed = 5.4;
          e.vx = THREE.MathUtils.damp(e.vx, (nx - nz * strafe) * speed, 7, dt);
          e.vz = THREE.MathUtils.damp(e.vz, (nz + nx * strafe) * speed, 7, dt);
          if (dist < 3.4 && activeTokens < 3) {
            e.state = 'windup';
            e.stateTimer = 0.45;
            e.hasToken = true;
            activeTokens++;
            this.sound.playTelegraph();
          }
        } else if (e.kind === 'sentry') {
          // Kiter / Ranged turret: maintains 8..13m distance and fires telegraphed energy orbs
          const desiredDist = 10.0;
          const radialSpd = dist < desiredDist - 1.5 ? -3.4 : dist > desiredDist + 2.0 ? 3.2 : 0;
          const orbitDir = e.id % 2 === 0 ? 1 : -1;
          e.vx = THREE.MathUtils.damp(e.vx, nx * radialSpd - nz * orbitDir * 2.8, 6, dt);
          e.vz = THREE.MathUtils.damp(e.vz, nz * radialSpd + nx * orbitDir * 2.8, 6, dt);
          if (dist < 18 && activeTokens < 3) {
            e.state = 'windup';
            e.stateTimer = 0.58;
            e.hasToken = true;
            activeTokens++;
            this.sound.playTelegraph();
          }
        } else {
          // Bastion Warden: steady armored march + shockwave slam / charge
          const speed = 3.2;
          e.vx = THREE.MathUtils.damp(e.vx, nx * speed, 5, dt);
          e.vz = THREE.MathUtils.damp(e.vz, nz * speed, 5, dt);
          if (dist < 4.2 && activeTokens < 3) {
            e.state = 'windup';
            e.stateTimer = 0.65;
            e.hasToken = true;
            activeTokens++;
            this.sound.playTelegraph();
          }
        }

        if (dist > aggroRange + 10) {
          e.state = 'patrol';
        }
      } else if (e.state === 'windup') {
        e.vx *= Math.exp(-10 * dt);
        e.vz *= Math.exp(-10 * dt);
        e.yaw = targetYaw;
        e.stateTimer -= dt;

        e.rig.telegraphRing.visible = true;
        e.rig.telegraphMat.opacity = 0.45 + Math.sin(this.elapsedSeconds * 26) * 0.25;
        const pulse = 0.8 + (1 - Math.max(0, e.stateTimer) / 0.65) * 0.35;
        e.rig.telegraphRing.scale.setScalar(pulse);

        if (e.stateTimer <= 0) {
          e.rig.telegraphRing.visible = false;
          e.state = 'attack';
          if (e.kind === 'stalker') {
            e.stateTimer = 0.24;
            const nx = dx / Math.max(0.01, dist);
            const nz = dz / Math.max(0.01, dist);
            e.vx = nx * 13.5;
            e.vz = nz * 13.5;
          } else if (e.kind === 'sentry') {
            e.stateTimer = 0.15;
            this.fireSentryBolt(e);
          } else {
            e.stateTimer = 0.3;
            // Warden ground shockwave burst
            this.spawnParticles(e.x, e.y + 0.4, e.z, 0xf43f5e, 18, 6.2);
            if (dist < 3.6 && Math.abs(this.vertical.y - e.y) < 1.8) {
              this.damagePlayer(1, e.x, e.z);
            }
          }
        }
      } else if (e.state === 'attack') {
        e.stateTimer -= dt;
        if (e.kind === 'stalker' && dist < e.radius + PLAYER_RADIUS + 0.55 && Math.abs(this.vertical.y - e.y) < 1.6) {
          this.damagePlayer(1, e.x, e.z);
        }
        if (e.stateTimer <= 0) {
          e.hasToken = false;
          e.state = 'recover';
          e.stateTimer = e.kind === 'warden' ? 1.15 : e.kind === 'sentry' ? 1.4 : 0.85;
        }
      } else if (e.state === 'recover') {
        e.vx *= Math.exp(-8 * dt);
        e.vz *= Math.exp(-8 * dt);
        e.stateTimer -= dt;
        if (e.stateTimer <= 0) {
          e.state = 'chase';
        }
      }

      // Integrate enemy movement & clamp to terrain + colliders
      const nextEx = e.x + e.vx * dt;
      const nextEz = e.z + e.vz * dt;
      const res = resolveCircleCollisions(nextEx, nextEz, e.radius, this.colliders, WORLD_RADIUS);
      e.x = res.x;
      e.z = res.z;
      e.y = getWalkableHeightAt(e.x, e.z);
      e.rig.root.position.set(e.x, e.y, e.z);
      e.rig.root.rotation.y = e.yaw;
    }
  }

  private fireSentryBolt(e: EnemyEntity): void {
    const slot = this.projectiles.find((p) => !p.active);
    if (!slot) return;
    const startY = e.y + 1.55;
    const targetY = this.vertical.y + 0.95;
    const dx = this.playerX - e.x;
    const dy = targetY - startY;
    const dz = this.playerZ - e.z;
    const len = Math.max(0.01, Math.hypot(dx, dy, dz));
    const speed = 13.5;
    slot.active = true;
    slot.x = e.x;
    slot.y = startY;
    slot.z = e.z;
    slot.vx = (dx / len) * speed;
    slot.vy = (dy / len) * speed;
    slot.vz = (dz / len) * speed;
    slot.life = 2.6;
    slot.mesh.position.set(slot.x, slot.y, slot.z);
    slot.mesh.visible = true;
  }

  private updateProjectiles(dt: number): void {
    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.life -= dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;
      p.mesh.position.set(p.x, p.y, p.z);

      const distToPlayer = Math.hypot(p.x - this.playerX, p.z - this.playerZ);
      if (distToPlayer < PLAYER_RADIUS + 0.4 && Math.abs(p.y - (this.vertical.y + 0.9)) < 1.1) {
        p.active = false;
        p.mesh.visible = false;
        this.damagePlayer(1, p.x, p.z);
        continue;
      }

      if (p.life <= 0 || p.y <= getWalkableHeightAt(p.x, p.z)) {
        p.active = false;
        p.mesh.visible = false;
        this.spawnParticles(p.x, p.y, p.z, 0x38bdf8, 5, 2.8);
      }
    }
  }

  private damagePlayer(amount: number, srcX: number, srcZ: number): void {
    if (this.invulnTimer > 0 || this.mode !== 'playing') return;
    this.hp = Math.max(0, this.hp - amount);
    this.invulnTimer = 0.85;
    this.hitstopTimer = 0.045;
    this.cameraTrauma = Math.min(1, this.cameraTrauma + 0.55);
    this.sound.playHurt();

    const dx = this.playerX - srcX;
    const dz = this.playerZ - srcZ;
    const len = Math.max(0.01, Math.hypot(dx, dz));
    this.playerVx = (dx / len) * 9.5;
    this.playerVz = (dz / len) * 9.5;
    this.spawnParticles(this.playerX, this.vertical.y + 1.0, this.playerZ, 0xf43f5e, 14, 5.2);
    this.emitHudSnapshot(true);
  }

  private updateCameraRig(dt: number): void {
    const anchorX = this.playerX;
    const anchorY = this.vertical.y + 1.65;
    const anchorZ = this.playerZ;

    const horizDist = Math.cos(this.cameraPitch) * this.cameraDistance;
    const vertOffset = Math.sin(this.cameraPitch) * this.cameraDistance + 0.9;

    let desiredX = anchorX + Math.sin(this.cameraYaw) * horizDist;
    let desiredZ = anchorZ + Math.cos(this.cameraYaw) * horizDist;
    let desiredY = anchorY + vertOffset;

    // Terrain pull-in so camera never clips below hills or canyon walls
    const camGround = groundHeightAt(desiredX, desiredZ);
    if (desiredY < camGround + 1.15) {
      desiredY = camGround + 1.15;
    }

    const posAlpha = 1 - Math.exp(-10 * dt);
    this.camCurrentPos.x += (desiredX - this.camCurrentPos.x) * posAlpha;
    this.camCurrentPos.y += (desiredY - this.camCurrentPos.y) * posAlpha;
    this.camCurrentPos.z += (desiredZ - this.camCurrentPos.z) * posAlpha;

    const lookTargetX = anchorX - Math.sin(this.cameraYaw) * 2.2;
    const lookTargetY = anchorY + 0.35;
    const lookTargetZ = anchorZ - Math.cos(this.cameraYaw) * 2.2;
    const lookAlpha = 1 - Math.exp(-14 * dt);
    this.camCurrentLook.x += (lookTargetX - this.camCurrentLook.x) * lookAlpha;
    this.camCurrentLook.y += (lookTargetY - this.camCurrentLook.y) * lookAlpha;
    this.camCurrentLook.z += (lookTargetZ - this.camCurrentLook.z) * lookAlpha;

    // Decaying trauma^2 camera shake
    this.cameraTrauma = Math.max(0, this.cameraTrauma - dt * 1.9);
    const shake = this.cameraTrauma * this.cameraTrauma;
    const shakeX = (Math.random() * 2 - 1) * 0.35 * shake;
    const shakeY = (Math.random() * 2 - 1) * 0.25 * shake;

    this.camera.position.set(
      this.camCurrentPos.x + shakeX,
      this.camCurrentPos.y + shakeY,
      this.camCurrentPos.z,
    );
    this.camera.lookAt(this.camCurrentLook);

    // Subtle FOV widening while gliding or dashing
    const targetFov = this.vertical.gliding || this.dashTimer > 0 ? 64 : 58;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.damp(this.camera.fov, targetFov, 7, dt);
      this.camera.updateProjectionMatrix();
    }

    // Keep shadow frustum centered near player
    this.sunLight.target.position.set(this.playerX, this.vertical.y, this.playerZ);
    this.sunLight.position.set(this.playerX + 42, this.vertical.y + 62, this.playerZ + 38);
  }

  private updateParticles(dt: number): void {
    let anyActive = false;
    for (let i = 0; i < this.particles.length; i++) {
      const p = this.particles[i];
      if (!p.active) continue;
      anyActive = true;
      p.life -= dt;
      if (p.life <= 0) {
        p.active = false;
        _v1.set(0, -100, 0);
        _quat.identity();
        _scale.setScalar(0.001);
        _mat4.compose(_v1, _quat, _scale);
        this.particleMesh.setMatrixAt(i, _mat4);
        continue;
      }

      p.vy -= 14 * dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.z += p.vz * dt;

      const s = p.size * (p.life / p.maxLife);
      _v1.set(p.x, p.y, p.z);
      _quat.identity();
      _scale.setScalar(Math.max(0.01, s));
      _mat4.compose(_v1, _quat, _scale);
      this.particleMesh.setMatrixAt(i, _mat4);
      this.particleMesh.setColorAt(i, p.color);
    }

    if (anyActive) {
      this.particleMesh.instanceMatrix.needsUpdate = true;
      if (this.particleMesh.instanceColor) this.particleMesh.instanceColor.needsUpdate = true;
    }
  }

  private computeNearPrompt(): string | null {
    for (const s of this.shrines) {
      if (s.restored) continue;
      const dist = Math.hypot(this.playerX - s.x, this.playerZ - s.z);
      if (dist < 4.5 && Math.abs(this.vertical.y - s.y) < 2.5) {
        return `Press E or step onto ${s.name} to Restore`;
      }
    }
    return null;
  }

  private emitHudSnapshot(_force: boolean): void {
    const blips: MinimapBlip[] = [];
    for (const s of this.shrines) {
      blips.push({
        x: s.x,
        z: s.z,
        kind: s.restored ? 'shrine-lit' : 'shrine-unlit',
      });
    }
    for (const e of this.enemies) {
      if (e.state !== 'dead' && e.state !== 'dying') {
        blips.push({ x: e.x, z: e.z, kind: 'enemy' });
      }
    }
    for (const o of this.orbs) {
      if (!o.collected) {
        blips.push({ x: o.x, z: o.z, kind: 'orb' });
      }
    }

    this.onHudUpdate({
      mode: this.mode,
      outcome: this.outcome,
      hp: this.hp,
      maxHp: PLAYER_MAX_HP,
      stamina: Math.round(this.stamina),
      maxStamina: PLAYER_MAX_STAMINA,
      score: Math.round(this.score),
      bestScore: Math.round(this.bestScore),
      orbsCollected: this.orbsCollected,
      totalOrbs: this.orbs.length,
      shrinesRestored: this.shrinesRestored,
      totalShrines: this.shrines.length,
      enemiesDefeated: this.enemiesDefeated,
      elapsedSeconds: Math.round(this.elapsedSeconds),
      regionName: getRegionLabelAt(this.playerX, this.playerZ),
      playerX: this.playerX,
      playerZ: this.playerZ,
      playerYaw: this.playerYaw,
      cameraYaw: this.cameraYaw,
      gliding: this.vertical.gliding,
      muted: this.sound.isMuted(),
      nearPrompt: this.computeNearPrompt(),
      bannerText: this.bannerText,
      blips,
    });
  }

  public dispose(): void {
    this.disposed = true;
    cancelAnimationFrame(this.frameId);
    clearTimeout(this.frameId);
    this.cleanupListeners();
    this.sound.dispose();
    this.textures.dispose();

    this.scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      if (mesh.material) {
        if (Array.isArray(mesh.material)) mesh.material.forEach((m) => m.dispose());
        else mesh.material.dispose();
      }
    });

    this.renderer.dispose();
    if (this.renderer.domElement.parentElement === this.container) {
      this.container.removeChild(this.renderer.domElement);
    }
  }
}
