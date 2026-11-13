import * as THREE from 'three';
import type { ProceduralTextureSet } from './textures';
import type { EnemyKind } from './worldMath';

export interface PlayerRig {
  root: THREE.Group;
  bodyPivot: THREE.Group;
  leftArm: THREE.Group;
  rightArm: THREE.Group;
  leftLeg: THREE.Group;
  rightLeg: THREE.Group;
  gliderGroup: THREE.Group;
  swordSlashMesh: THREE.Mesh;
  shadowDisc: THREE.Mesh;
}

export interface WindmillRig {
  root: THREE.Group;
  bladesHub: THREE.Group;
}

export interface ShrineRig {
  root: THREE.Group;
  crystal: THREE.Mesh;
  haloRing: THREE.Mesh;
  beaconBeam: THREE.Mesh;
  crystalMat: THREE.MeshStandardMaterial;
  beamMat: THREE.MeshBasicMaterial;
}

export interface EnemyRig {
  root: THREE.Group;
  bodyGroup: THREE.Group;
  telegraphRing: THREE.Mesh;
  telegraphMat: THREE.MeshBasicMaterial;
  accentMat: THREE.MeshStandardMaterial;
  shellMat: THREE.MeshStandardMaterial;
  shadowDisc: THREE.Mesh;
  orbitalRing?: THREE.Group;
}

function makeContactShadow(textures: ProceduralTextureSet, radius: number): THREE.Mesh {
  const geo = new THREE.CircleGeometry(radius, 20);
  geo.rotateX(-Math.PI / 2);
  const mat = new THREE.MeshBasicMaterial({
    map: textures.contactShadowMap,
    transparent: true,
    opacity: 0.55,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.position.y = 0.02;
  return mesh;
}

/**
 * Composite 10-part Wanderer Hero Rig with articulated limbs, Solar Blade,
 * deployable Sun-Glider wing frame, and grounded bottom-center pivot (y = 0).
 */
export function createPlayerRig(textures: ProceduralTextureSet): PlayerRig {
  const root = new THREE.Group();
  const bodyPivot = new THREE.Group();
  root.add(bodyPivot);

  const shadowDisc = makeContactShadow(textures, 0.72);
  root.add(shadowDisc);

  const cloakMat = new THREE.MeshStandardMaterial({
    color: 0x1e5c6b,
    roughness: 0.85,
    metalness: 0.05,
  });
  const tunicMat = new THREE.MeshStandardMaterial({
    color: 0xded3be,
    roughness: 0.75,
    metalness: 0.06,
  });
  const bronzeMat = new THREE.MeshStandardMaterial({
    color: 0xd49b42,
    roughness: 0.28,
    metalness: 0.82,
  });
  const darkLeatherMat = new THREE.MeshStandardMaterial({
    color: 0x3b2c23,
    roughness: 0.78,
    metalness: 0.1,
  });
  const visorMat = new THREE.MeshStandardMaterial({
    color: 0xffe49e,
    emissive: 0xffb347,
    emissiveIntensity: 1.1,
    roughness: 0.2,
    metalness: 0.2,
  });
  const bladeMat = new THREE.MeshStandardMaterial({
    color: 0xfff3d1,
    emissive: 0xf59e0b,
    emissiveIntensity: 0.85,
    roughness: 0.15,
    metalness: 0.85,
  });

  // Boots / Legs
  const leftLeg = new THREE.Group();
  leftLeg.position.set(-0.16, 0.62, 0);
  const legGeo = new THREE.BoxGeometry(0.18, 0.56, 0.22);
  const lLegMesh = new THREE.Mesh(legGeo, darkLeatherMat);
  lLegMesh.position.y = -0.3;
  lLegMesh.castShadow = true;
  leftLeg.add(lLegMesh);

  const rightLeg = new THREE.Group();
  rightLeg.position.set(0.16, 0.62, 0);
  const rLegMesh = new THREE.Mesh(legGeo, darkLeatherMat);
  rLegMesh.position.y = -0.3;
  rLegMesh.castShadow = true;
  rightLeg.add(rLegMesh);
  bodyPivot.add(leftLeg, rightLeg);

  // Tunic Torso + Bronze Chestplate
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.34, 0.74, 10), tunicMat);
  torso.position.y = 0.96;
  torso.castShadow = true;
  bodyPivot.add(torso);

  const belt = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.12, 10), bronzeMat);
  belt.position.y = 0.72;
  bodyPivot.add(belt);

  // Cape / Cloak
  const capeShape = new THREE.Shape();
  capeShape.moveTo(-0.34, 0);
  capeShape.lineTo(0.34, 0);
  capeShape.lineTo(0.46, -0.82);
  capeShape.lineTo(-0.46, -0.82);
  capeShape.closePath();
  const capeGeo = new THREE.ExtrudeGeometry(capeShape, {
    depth: 0.05,
    bevelEnabled: true,
    bevelThickness: 0.015,
    bevelSize: 0.015,
    bevelSegments: 2,
  });
  const cape = new THREE.Mesh(capeGeo, cloakMat);
  cape.position.set(0, 1.34, 0.28);
  cape.rotation.x = -0.22;
  cape.castShadow = true;
  bodyPivot.add(cape);

  // Hooded Head & Glowing Nomad Visor
  const hood = new THREE.Mesh(new THREE.ConeGeometry(0.29, 0.44, 10), cloakMat);
  hood.position.set(0, 1.56, 0.02);
  hood.rotation.x = -0.15;
  hood.castShadow = true;
  bodyPivot.add(hood);

  const headMask = new THREE.Mesh(new THREE.SphereGeometry(0.19, 12, 10), darkLeatherMat);
  headMask.position.set(0, 1.48, -0.04);
  bodyPivot.add(headMask);

  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.06, 0.14), visorMat);
  visor.position.set(0, 1.49, -0.16);
  bodyPivot.add(visor);

  // Pauldrons
  const pauldronGeo = new THREE.SphereGeometry(0.15, 10, 8, 0, Math.PI * 2, 0, Math.PI * 0.55);
  const leftPauldron = new THREE.Mesh(pauldronGeo, bronzeMat);
  leftPauldron.position.set(-0.34, 1.31, 0);
  const rightPauldron = new THREE.Mesh(pauldronGeo, bronzeMat);
  rightPauldron.position.set(0.34, 1.31, 0);
  bodyPivot.add(leftPauldron, rightPauldron);

  // Arms + Solar Blade
  const leftArm = new THREE.Group();
  leftArm.position.set(-0.36, 1.26, 0);
  const armGeo = new THREE.BoxGeometry(0.14, 0.5, 0.15);
  const lArmMesh = new THREE.Mesh(armGeo, tunicMat);
  lArmMesh.position.y = -0.22;
  lArmMesh.castShadow = true;
  leftArm.add(lArmMesh);

  const rightArm = new THREE.Group();
  rightArm.position.set(0.36, 1.26, 0);
  const rArmMesh = new THREE.Mesh(armGeo, tunicMat);
  rArmMesh.position.y = -0.22;
  rArmMesh.castShadow = true;
  rightArm.add(rArmMesh);

  // Solar Blade attached to right hand
  const hilt = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.24, 8), bronzeMat);
  hilt.rotation.x = Math.PI / 2;
  hilt.position.set(0, -0.45, -0.1);
  const guard = new THREE.Mesh(new THREE.BoxGeometry(0.24, 0.05, 0.07), bronzeMat);
  guard.position.set(0, -0.45, -0.22);
  const blade = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.12, 1.05), bladeMat);
  blade.position.set(0, -0.45, -0.76);
  rightArm.add(hilt, guard, blade);
  bodyPivot.add(leftArm, rightArm);

  // Sword Slash Arc VFX (hidden until attack active)
  const slashGeo = new THREE.RingGeometry(1.1, 2.35, 22, 1, -Math.PI * 0.48, Math.PI * 0.96);
  slashGeo.rotateX(-Math.PI / 2);
  const slashMat = new THREE.MeshBasicMaterial({
    color: 0xffd166,
    transparent: true,
    opacity: 0.78,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const swordSlashMesh = new THREE.Mesh(slashGeo, slashMat);
  swordSlashMesh.position.set(0, 1.05, -0.2);
  swordSlashMesh.rotation.y = Math.PI / 2;
  swordSlashMesh.visible = false;
  root.add(swordSlashMesh);

  // Deployable Sun-Glider Wing Rig
  const gliderGroup = new THREE.Group();
  gliderGroup.position.set(0, 1.72, 0.08);
  const spar = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 2.6, 8), bronzeMat);
  spar.rotation.z = Math.PI / 2;
  gliderGroup.add(spar);

  const wingShape = new THREE.Shape();
  wingShape.moveTo(0, 0.25);
  wingShape.lineTo(1.38, -0.2);
  wingShape.lineTo(0.95, -0.78);
  wingShape.lineTo(0, -0.5);
  wingShape.lineTo(-0.95, -0.78);
  wingShape.lineTo(-1.38, -0.2);
  wingShape.closePath();
  const wingGeo = new THREE.ExtrudeGeometry(wingShape, {
    depth: 0.025,
    bevelEnabled: false,
  });
  wingGeo.rotateX(Math.PI / 2);
  const wingMat = new THREE.MeshStandardMaterial({
    map: textures.sailMap,
    color: 0xfff5dc,
    roughness: 0.65,
    metalness: 0.05,
    side: THREE.DoubleSide,
  });
  const wings = new THREE.Mesh(wingGeo, wingMat);
  wings.castShadow = true;
  gliderGroup.add(wings);
  gliderGroup.visible = false;
  bodyPivot.add(gliderGroup);

  return {
    root,
    bodyPivot,
    leftArm,
    rightArm,
    leftLeg,
    rightLeg,
    gliderGroup,
    swordSlashMesh,
    shadowDisc,
  };
}

/**
 * 8-part Windmill Outpost Tower with rotating canvas sails and framed doorway.
 */
export function createWindmillOutpost(textures: ProceduralTextureSet): WindmillRig {
  const root = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({
    map: textures.stoneMap,
    bumpMap: textures.stoneBump,
    bumpScale: 0.07,
    color: 0xbcb09b,
    roughness: 0.88,
    metalness: 0.05,
  });
  const plasterMat = new THREE.MeshStandardMaterial({
    color: 0xe0d2b8,
    roughness: 0.84,
    metalness: 0.03,
  });
  const woodMat = new THREE.MeshStandardMaterial({
    map: textures.woodMap,
    color: 0xd9c2a3,
    roughness: 0.78,
    metalness: 0.06,
  });
  const roofMat = new THREE.MeshStandardMaterial({
    color: 0x244c59,
    roughness: 0.65,
    metalness: 0.15,
  });
  const sailMat = new THREE.MeshStandardMaterial({
    map: textures.sailMap,
    color: 0xffffff,
    roughness: 0.72,
    metalness: 0.02,
    side: THREE.DoubleSide,
  });

  // Stone foundation plinth
  const base = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.6, 2.1, 10), stoneMat);
  base.position.y = 1.05;
  base.castShadow = true;
  base.receiveShadow = true;
  root.add(base);

  // Tapered plaster tower shaft
  const tower = new THREE.Mesh(new THREE.CylinderGeometry(2.3, 3.05, 6.4, 10), plasterMat);
  tower.position.y = 5.3;
  tower.castShadow = true;
  tower.receiveShadow = true;
  root.add(tower);

  // Roof cone + brass finial
  const roof = new THREE.Mesh(new THREE.ConeGeometry(2.75, 2.7, 10), roofMat);
  roof.position.y = 9.75;
  roof.castShadow = true;
  root.add(roof);

  // Framed doorway porch jambs & lintel pushed clear of circular plinth
  const porchStone = new THREE.Mesh(new THREE.BoxGeometry(2.3, 2.35, 1.05), stoneMat);
  porchStone.position.set(0, 1.18, 3.25);
  porchStone.castShadow = true;
  porchStone.receiveShadow = true;
  const doorLeft = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.1, 0.45), woodMat);
  doorLeft.position.set(-0.76, 1.05, 3.72);
  const doorRight = new THREE.Mesh(new THREE.BoxGeometry(0.32, 2.1, 0.45), woodMat);
  doorRight.position.set(0.76, 1.05, 3.72);
  const doorLintel = new THREE.Mesh(new THREE.BoxGeometry(2.05, 0.35, 0.55), woodMat);
  doorLintel.position.set(0, 2.15, 3.72);
  const doorInner = new THREE.Mesh(
    new THREE.BoxGeometry(1.22, 1.9, 0.16),
    new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.92 }),
  );
  doorInner.position.set(0, 0.96, 3.74);
  root.add(porchStone, doorLeft, doorRight, doorLintel, doorInner);

  // Warm lantern beside doorway
  const lanternGlow = new THREE.Mesh(
    new THREE.SphereGeometry(0.22, 10, 8),
    new THREE.MeshStandardMaterial({
      color: 0xffd275,
      emissive: 0xff9f1c,
      emissiveIntensity: 1.5,
      roughness: 0.25,
    }),
  );
  lanternGlow.position.set(1.28, 1.95, 3.85);
  root.add(lanternGlow);

  // Rotating 4-blade Windmill Hub
  const bladesHub = new THREE.Group();
  bladesHub.position.set(0, 7.65, 2.55);

  const hubCap = new THREE.Mesh(new THREE.CylinderGeometry(0.38, 0.45, 0.8, 10), woodMat);
  hubCap.rotation.x = Math.PI / 2;
  bladesHub.add(hubCap);

  for (let i = 0; i < 4; i++) {
    const armGroup = new THREE.Group();
    armGroup.rotation.z = (i * Math.PI) / 2;

    const spar = new THREE.Mesh(new THREE.BoxGeometry(0.16, 4.4, 0.16), woodMat);
    spar.position.y = 2.2;
    spar.castShadow = true;

    const sail = new THREE.Mesh(new THREE.PlaneGeometry(1.05, 3.4), sailMat);
    sail.position.set(0.58, 2.55, 0.04);
    sail.rotation.y = 0.14;
    sail.castShadow = true;

    armGroup.add(spar, sail);
    bladesHub.add(armGroup);
  }
  root.add(bladesHub);

  return { root, bladesHub };
}

/**
 * 6-part Ancient Sun Shrine with stepped dais, twin pillars, floating crystal, and sky beacon.
 */
export function createShrineAltar(textures: ProceduralTextureSet): ShrineRig {
  const root = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({
    map: textures.stoneMap,
    bumpMap: textures.stoneBump,
    bumpScale: 0.05,
    color: 0xffffff,
    roughness: 0.82,
    metalness: 0.08,
  });
  const bronzeMat = new THREE.MeshStandardMaterial({
    color: 0xc98f36,
    roughness: 0.3,
    metalness: 0.85,
  });

  // Stepped dais
  const step1 = new THREE.Mesh(new THREE.CylinderGeometry(3.2, 3.55, 0.42, 8), stoneMat);
  step1.position.y = 0.21;
  step1.receiveShadow = true;
  step1.castShadow = true;

  const step2 = new THREE.Mesh(new THREE.CylinderGeometry(2.15, 2.45, 0.36, 8), stoneMat);
  step2.position.y = 0.6;
  step2.receiveShadow = true;
  step2.castShadow = true;

  const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.58, 0.72, 1.05, 8), stoneMat);
  pedestal.position.y = 1.28;
  pedestal.castShadow = true;

  const haloRing = new THREE.Mesh(new THREE.TorusGeometry(1.45, 0.08, 10, 28), bronzeMat);
  haloRing.position.y = 2.45;
  haloRing.rotation.x = Math.PI / 2;

  // Twin archway pillars framing the altar
  for (const side of [-1, 1]) {
    const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.52, 3.6, 0.52), stoneMat);
    pillar.position.set(side * 2.15, 1.8, -0.4);
    pillar.castShadow = true;
    pillar.receiveShadow = true;
    const cap = new THREE.Mesh(new THREE.BoxGeometry(0.72, 0.28, 0.72), bronzeMat);
    cap.position.set(side * 2.15, 3.72, -0.4);
    root.add(pillar, cap);
  }

  // Floating Octahedron Sun Crystal
  const crystalMat = new THREE.MeshStandardMaterial({
    color: 0x38bdf8,
    emissive: 0x0284c7,
    emissiveIntensity: 0.85,
    roughness: 0.15,
    metalness: 0.35,
  });
  const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.58, 0), crystalMat);
  crystal.position.y = 2.55;
  crystal.castShadow = true;

  // Vertical Skyward Beacon Beam (brightens on restoration)
  const beamMat = new THREE.MeshBasicMaterial({
    color: 0x38bdf8,
    transparent: true,
    opacity: 0.16,
    depthWrite: false,
    side: THREE.DoubleSide,
  });
  const beaconBeam = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.85, 42, 12, 1, true), beamMat);
  beaconBeam.position.y = 22.5;

  root.add(step1, step2, pedestal, haloRing, crystal, beaconBeam);

  return { root, crystal, haloRing, beaconBeam, crystalMat, beamMat };
}

/**
 * Monumental Sunspire Citadel Vista Landmark: terraced retaining wall, ramp, twin pillars, and 22m spire.
 */
export function createCitadelMonument(textures: ProceduralTextureSet): THREE.Group {
  const root = new THREE.Group();

  const stoneMat = new THREE.MeshStandardMaterial({
    map: textures.stoneMap,
    bumpMap: textures.stoneBump,
    bumpScale: 0.07,
    color: 0xbeb19c,
    roughness: 0.85,
    metalness: 0.08,
  });
  const goldMat = new THREE.MeshStandardMaterial({
    color: 0xdca13a,
    roughness: 0.25,
    metalness: 0.88,
  });
  const darkStoneMat = new THREE.MeshStandardMaterial({
    color: 0x3d444f,
    roughness: 0.8,
    metalness: 0.18,
  });

  // Grand terraced retaining drum
  const terraceDrum = new THREE.Mesh(new THREE.CylinderGeometry(14.5, 16.5, 6.4, 16), stoneMat);
  terraceDrum.position.set(0, 3.2, 0);
  terraceDrum.receiveShadow = true;
  terraceDrum.castShadow = true;
  root.add(terraceDrum);

  // Walkable sloped stone ramp connecting meadow (z = +30 local => -26 world) to plateau (z = +12 local => -44 world)
  const rampGeo = new THREE.BoxGeometry(8.6, 1.4, 20.5);
  const rampMesh = new THREE.Mesh(rampGeo, stoneMat);
  rampMesh.position.set(0, 2.8, 21.0);
  rampMesh.rotation.x = 0.315;
  rampMesh.receiveShadow = true;
  rampMesh.castShadow = true;
  root.add(rampMesh);

  // Ramp side balustrades
  for (const sx of [-4.1, 4.1]) {
    const rail = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.9, 20.5), darkStoneMat);
    rail.position.set(sx, 3.85, 21.0);
    rail.rotation.x = 0.315;
    rail.castShadow = true;
    root.add(rail);
  }

  // Towering Sun-Arch Gate behind the Citadel Shrine
  for (const sx of [-5.2, 5.2]) {
    const tower = new THREE.Mesh(new THREE.BoxGeometry(2.2, 16.5, 2.2), stoneMat);
    tower.position.set(sx, 14.4, -7.5);
    tower.castShadow = true;
    tower.receiveShadow = true;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(1.75, 3.2, 4), goldMat);
    crown.rotation.y = Math.PI / 4;
    crown.position.set(sx, 24.2, -7.5);
    root.add(tower, crown);
  }

  const lintel = new THREE.Mesh(new THREE.BoxGeometry(13.2, 1.8, 2.4), stoneMat);
  lintel.position.set(0, 21.8, -7.5);
  lintel.castShadow = true;
  root.add(lintel);

  // Central Sunspire Obelisk & Halo Rings
  const spire = new THREE.Mesh(new THREE.ConeGeometry(1.65, 11.5, 6), darkStoneMat);
  spire.position.set(0, 28.4, -7.5);
  spire.castShadow = true;
  root.add(spire);

  const sunRing = new THREE.Mesh(new THREE.TorusGeometry(3.1, 0.22, 12, 36), goldMat);
  sunRing.position.set(0, 17.5, -7.5);
  root.add(sunRing);

  return root;
}

/**
 * Arched masonry bridge spanning Amber Canyon gorge.
 */
export function createStoneBridge(textures: ProceduralTextureSet): THREE.Group {
  const root = new THREE.Group();
  const stoneMat = new THREE.MeshStandardMaterial({
    map: textures.stoneMap,
    bumpMap: textures.stoneBump,
    bumpScale: 0.06,
    color: 0xffffff,
    roughness: 0.86,
    metalness: 0.06,
  });
  const trimMat = new THREE.MeshStandardMaterial({
    color: 0xb68d52,
    roughness: 0.55,
    metalness: 0.35,
  });

  // Segmented slightly-arched deck slabs matching CANYON_BRIDGE math
  const segments = 7;
  const totalLen = 16.5;
  const segLen = totalLen / segments;
  for (let i = 0; i < segments; i++) {
    const t = (i + 0.5) / segments - 0.5; // -0.5..0.5
    const norm = Math.abs(t) * 2;
    const archY = 2.35 + (1 - norm * norm) * 0.9;
    const slab = new THREE.Mesh(new THREE.BoxGeometry(segLen + 0.15, 0.75, 6.2), stoneMat);
    slab.position.set(t * totalLen, archY - 0.37, 0);
    slab.castShadow = true;
    slab.receiveShadow = true;
    root.add(slab);

    // Side parapet blocks
    for (const sz of [-2.85, 2.85]) {
      const parapet = new THREE.Mesh(new THREE.BoxGeometry(segLen * 0.9, 0.72, 0.38), trimMat);
      parapet.position.set(t * totalLen, archY + 0.36, sz);
      parapet.castShadow = true;
      root.add(parapet);
    }
  }

  // Deep masonry support piers anchored into the gorge floor
  for (const sx of [-7.5, 7.5]) {
    const pier = new THREE.Mesh(new THREE.BoxGeometry(2.2, 7.2, 6.4), stoneMat);
    pier.position.set(sx, -1.2, 0);
    pier.castShadow = true;
    pier.receiveShadow = true;
    root.add(pier);
  }

  return root;
}

/**
 * Builds composite 5-8 part Enemy Rigs for the 3 distinct AI archetypes.
 */
export function createEnemyMesh(kind: EnemyKind, textures: ProceduralTextureSet): EnemyRig {
  const root = new THREE.Group();
  const bodyGroup = new THREE.Group();
  root.add(bodyGroup);

  const shellMat = new THREE.MeshStandardMaterial({
    color: kind === 'warden' ? 0x2c303a : kind === 'sentry' ? 0x3b4859 : 0x352c31,
    roughness: 0.45,
    metalness: 0.65,
  });
  const accentMat = new THREE.MeshStandardMaterial({
    color: kind === 'sentry' ? 0x38bdf8 : 0xf43f5e,
    emissive: kind === 'sentry' ? 0x0284c7 : 0xe11d48,
    emissiveIntensity: 1.0,
    roughness: 0.2,
    metalness: 0.3,
  });

  const telegraphMat = new THREE.MeshBasicMaterial({
    color: 0xff4d6d,
    transparent: true,
    opacity: 0.0,
    side: THREE.DoubleSide,
    depthWrite: false,
  });
  const ringRadius = kind === 'warden' ? 3.2 : kind === 'sentry' ? 1.5 : 1.75;
  const telegraphGeo = new THREE.RingGeometry(ringRadius * 0.72, ringRadius, 28);
  telegraphGeo.rotateX(-Math.PI / 2);
  const telegraphRing = new THREE.Mesh(telegraphGeo, telegraphMat);
  telegraphRing.position.y = 0.06;
  telegraphRing.visible = false;
  root.add(telegraphRing);

  const shadowDisc = makeContactShadow(textures, kind === 'warden' ? 1.4 : 0.78);
  root.add(shadowDisc);

  let orbitalRing: THREE.Group | undefined;

  if (kind === 'stalker') {
    // Agile quadrupedal/crouched Crimson Construct (6 parts)
    const hull = new THREE.Mesh(new THREE.BoxGeometry(0.95, 0.55, 1.15), shellMat);
    hull.position.y = 0.72;
    hull.castShadow = true;
    const head = new THREE.Mesh(new THREE.ConeGeometry(0.36, 0.65, 6), shellMat);
    head.rotation.x = -Math.PI / 2;
    head.position.set(0, 0.85, -0.78);
    const eye = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.14, 0.16), accentMat);
    eye.position.set(0, 0.88, -0.82);

    bodyGroup.add(hull, head, eye);
    for (const [lx, lz] of [
      [-0.45, -0.35],
      [0.45, -0.35],
      [-0.45, 0.4],
      [0.45, 0.4],
    ]) {
      const leg = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.65, 0.18), shellMat);
      leg.position.set(lx, 0.34, lz);
      leg.castShadow = true;
      bodyGroup.add(leg);
    }
  } else if (kind === 'sentry') {
    // Hovering Crystalline Prism Sentry with 3 orbiting ring blades (5 parts)
    const core = new THREE.Mesh(new THREE.OctahedronGeometry(0.55, 0), accentMat);
    core.position.y = 1.65;
    core.castShadow = true;
    const crown = new THREE.Mesh(new THREE.ConeGeometry(0.42, 0.5, 6), shellMat);
    crown.position.y = 2.35;
    bodyGroup.add(core, crown);

    orbitalRing = new THREE.Group();
    orbitalRing.position.y = 1.65;
    for (let i = 0; i < 3; i++) {
      const ang = (i * Math.PI * 2) / 3;
      const fin = new THREE.Mesh(new THREE.BoxGeometry(0.18, 0.72, 0.28), shellMat);
      fin.position.set(Math.cos(ang) * 0.92, 0, Math.sin(ang) * 0.92);
      fin.lookAt(0, 0, 0);
      fin.castShadow = true;
      orbitalRing.add(fin);
    }
    bodyGroup.add(orbitalRing);
  } else {
    // Heavy Armored Bastion Warden (7 parts)
    const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.95, 0.75, 1.85, 8), shellMat);
    torso.position.y = 1.45;
    torso.castShadow = true;
    const coreEye = new THREE.Mesh(new THREE.OctahedronGeometry(0.38, 0), accentMat);
    coreEye.position.set(0, 1.65, -0.78);
    const helm = new THREE.Mesh(new THREE.BoxGeometry(0.9, 0.55, 0.85), shellMat);
    helm.position.y = 2.6;
    helm.castShadow = true;

    for (const side of [-1, 1]) {
      const pauldron = new THREE.Mesh(new THREE.BoxGeometry(0.68, 0.75, 0.82), shellMat);
      pauldron.position.set(side * 1.15, 2.05, 0);
      pauldron.castShadow = true;
      const arm = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.25, 0.45), shellMat);
      arm.position.set(side * 1.22, 1.15, -0.15);
      arm.castShadow = true;
      const rune = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.4, 0.48), accentMat);
      rune.position.set(side * 1.42, 2.05, 0);
      bodyGroup.add(pauldron, arm, rune);
    }
    bodyGroup.add(torso, coreEye, helm);
  }

  return {
    root,
    bodyGroup,
    telegraphRing,
    telegraphMat,
    accentMat,
    shellMat,
    shadowDisc,
    orbitalRing,
  };
}
