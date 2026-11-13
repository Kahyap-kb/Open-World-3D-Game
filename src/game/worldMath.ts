export type GameStateMode = 'title' | 'playing' | 'paused' | 'gameover';
export type GameOutcome = 'none' | 'victory' | 'defeat';
export type BiomeId = 'meadow' | 'grove' | 'lagoon' | 'canyon' | 'citadel' | 'trail';
export type EnemyKind = 'stalker' | 'sentry' | 'warden';

export interface Vec2 {
  x: number;
  z: number;
}

export interface CircleCollider {
  x: number;
  z: number;
  radius: number;
  kind?: 'pillar' | 'rock' | 'building' | 'tree';
}

export interface ShrineDef {
  id: string;
  name: string;
  region: string;
  x: number;
  z: number;
  radius: number;
}

export interface OrbDef {
  id: string;
  x: number;
  z: number;
  heightOffset: number;
}

export interface RampSurface {
  minX: number;
  maxX: number;
  startZ: number;
  endZ: number;
  startY: number;
  endY: number;
}

export const WORLD_RADIUS = 92;
export const TERRAIN_EXTENT = 160;
export const WATER_LEVEL = -1.6;
export const PLAYER_RADIUS = 0.55;
export const PLAYER_MAX_HP = 5;
export const PLAYER_MAX_STAMINA = 100;

export const SPAWN_POS = { x: 0, z: 30, yaw: 0 };

export const SHRINE_DEFS: ShrineDef[] = [
  {
    id: 'meadow',
    name: 'Sunmeadow Altar',
    region: 'Sunlit Meadow',
    x: 16,
    z: 8,
    radius: 2.6,
  },
  {
    id: 'grove',
    name: 'Whispering Waystone',
    region: 'Pine Grove',
    x: -44,
    z: -6,
    radius: 2.6,
  },
  {
    id: 'lagoon',
    name: 'Tideglass Beacon',
    region: 'Crystal Lagoon',
    x: 46,
    z: -12,
    radius: 2.6,
  },
  {
    id: 'canyon',
    name: 'Amber Gorge Dais',
    region: 'Amber Canyon',
    x: -38,
    z: -54,
    radius: 2.6,
  },
  {
    id: 'citadel',
    name: 'Sunspire Sanctum',
    region: 'Sunspire Citadel',
    x: 0,
    z: -56,
    radius: 3.1,
  },
];

export const CITADEL_PLATEAU = {
  x: 0,
  z: -56,
  radius: 14,
  height: 6.4,
};

export const CITADEL_RAMP: RampSurface = {
  minX: -4.2,
  maxX: 4.2,
  startZ: -26,
  endZ: -44,
  startY: 0.45,
  endY: 6.4,
};

export const CANYON_BRIDGE = {
  minX: -27,
  maxX: -11,
  minZ: -44.5,
  maxZ: -38.5,
  deckY: 2.35,
};

export const ORB_DEFS: OrbDef[] = [
  { id: 'orb-01', x: 0, z: 18, heightOffset: 1.1 },
  { id: 'orb-02', x: -11, z: 12, heightOffset: 1.1 },
  { id: 'orb-03', x: 14, z: 18, heightOffset: 1.1 },
  { id: 'orb-04', x: -24, z: 4, heightOffset: 1.1 },
  { id: 'orb-05', x: -44, z: 6, heightOffset: 1.2 },
  { id: 'orb-06', x: -52, z: -18, heightOffset: 1.2 },
  { id: 'orb-07', x: 30, z: -2, heightOffset: 1.3 },
  { id: 'orb-08', x: 38, z: -12, heightOffset: 1.4 },
  { id: 'orb-09', x: 54, z: -22, heightOffset: 1.2 },
  { id: 'orb-10', x: 24, z: -28, heightOffset: 1.2 },
  { id: 'orb-11', x: -19, z: -41.5, heightOffset: 1.3 },
  { id: 'orb-12', x: -34, z: -40, heightOffset: 1.2 },
  { id: 'orb-13', x: -46, z: -64, heightOffset: 1.2 },
  { id: 'orb-14', x: 0, z: -35, heightOffset: 1.2 },
  { id: 'orb-15', x: 12, z: -56, heightOffset: 1.3 },
];

export function mulberry32(seed: number): () => number {
  let t = seed >>> 0;
  return () => {
    t += 0x6d2b79f5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

export function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
  return t * t * (3 - 2 * t);
}

export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function flattenToward(
  base: number,
  x: number,
  z: number,
  cx: number,
  cz: number,
  targetY: number,
  innerR: number,
  outerR: number,
): number {
  const dist = Math.hypot(x - cx, z - cz);
  const w = 1 - smoothstep(innerR, outerR, dist);
  return lerp(base, targetY, w);
}

/**
 * Deterministic sculpted terrain heightfield for Aethermoor.
 * Produces rolling hills, flattened shrine/outpost pads, a carved Crystal Lagoon basin
 * with a central shrine island, an Amber Canyon gorge, and perimeter mountain cliffs.
 */
export function groundHeightAt(x: number, z: number): number {
  const r = Math.hypot(x, z);

  // Rolling multi-octave terrain wave
  let h =
    Math.sin(x * 0.048) * Math.cos(z * 0.042) * 2.1 +
    Math.sin(x * 0.11 + 1.2) * Math.sin(z * 0.095 - 0.7) * 0.75 +
    Math.cos((x + z) * 0.032) * 1.35;

  // Gradual rise in the north-west Amber Canyon highlands
  const nwMask = smoothstep(-5, -45, x) * smoothstep(-10, -55, z);
  h += nwMask * 2.8;

  // Gentle meadow flattening near the central spawn corridor
  h = flattenToward(h, x, z, SPAWN_POS.x, SPAWN_POS.z, 0.3, 6, 18);
  h = flattenToward(h, x, z, -12, 16, 0.7, 5.5, 13); // Windmill Outpost pad
  h = flattenToward(h, x, z, 0, -10, 0.45, 7, 19); // Central crossroads

  // Shrines pads
  h = flattenToward(h, x, z, 16, 8, 0.9, 4.5, 11); // Meadow shrine
  h = flattenToward(h, x, z, -44, -6, 1.8, 5, 13); // Grove shrine
  h = flattenToward(h, x, z, -38, -54, 2.35, 5.5, 13); // Canyon shrine

  // Crystal Lagoon basin centered around (46, -12), with central island mound
  const lagoonDist = Math.hypot((x - 46) * 0.95, (z + 12) * 0.85);
  const lagoonBowl = 1 - smoothstep(10, 26, lagoonDist);
  h = lerp(h, -3.5, lagoonBowl);
  // Central shrine island rising above WATER_LEVEL (-1.6)
  h = flattenToward(h, x, z, 46, -12, -0.35, 4.2, 8.8);
  // Stepping stone sandbar from west shore toward island
  h = flattenToward(h, x, z, 34, -12, -1.25, 2.0, 4.8);

  // Amber Canyon gorge running between x = -23..-15, z = -26..-58
  const gorgeDx = Math.abs(x + 19);
  const gorgeMask = (1 - smoothstep(2.5, 7.5, gorgeDx)) * smoothstep(-22, -32, z) * (1 - smoothstep(-56, -66, z));
  h = lerp(h, -3.2, gorgeMask);

  // Sunspire Citadel terrace plateau
  h = flattenToward(h, x, z, CITADEL_PLATEAU.x, CITADEL_PLATEAU.z, CITADEL_PLATEAU.height, 11.5, 20.5);

  // Outer perimeter mountain ridge beyond playable WORLD_RADIUS
  if (r > WORLD_RADIUS - 6) {
    const rim = smoothstep(WORLD_RADIUS - 6, WORLD_RADIUS + 26, r);
    const ridgeNoise = 1 + 0.35 * Math.sin(Math.atan2(z, x) * 7 + r * 0.08);
    h += rim * 19.0 * ridgeNoise;
  }

  return h;
}

/**
 * Computes walkable height including engineered stone ramps and bridges.
 */
export function getWalkableHeightAt(x: number, z: number): number {
  let y = groundHeightAt(x, z);

  // Sunspire Citadel south grand stone ramp
  if (
    x >= CITADEL_RAMP.minX &&
    x <= CITADEL_RAMP.maxX &&
    z <= CITADEL_RAMP.startZ &&
    z >= CITADEL_RAMP.endZ
  ) {
    const t = (CITADEL_RAMP.startZ - z) / (CITADEL_RAMP.startZ - CITADEL_RAMP.endZ);
    const rampY = lerp(CITADEL_RAMP.startY, CITADEL_RAMP.endY, Math.max(0, Math.min(1, t)));
    if (rampY > y) y = rampY;
  }

  // Amber Canyon arched stone bridge
  if (
    x >= CANYON_BRIDGE.minX &&
    x <= CANYON_BRIDGE.maxX &&
    z >= CANYON_BRIDGE.minZ &&
    z <= CANYON_BRIDGE.maxZ
  ) {
    const midX = (CANYON_BRIDGE.minX + CANYON_BRIDGE.maxX) * 0.5;
    const halfSpan = (CANYON_BRIDGE.maxX - CANYON_BRIDGE.minX) * 0.5;
    const norm = Math.abs(x - midX) / halfSpan;
    const archLift = (1 - norm * norm) * 0.9;
    const deckY = CANYON_BRIDGE.deckY + archLift;
    if (deckY > y) y = deckY;
  }

  return y;
}

export function getTerrainSlope(x: number, z: number): number {
  const eps = 0.6;
  const hx = (groundHeightAt(x + eps, z) - groundHeightAt(x - eps, z)) / (2 * eps);
  const hz = (groundHeightAt(x, z + eps) - groundHeightAt(x, z - eps)) / (2 * eps);
  return Math.hypot(hx, hz);
}

/**
 * Returns distance from point (x, z) to the main stone trail network (for coloring & prop clearance).
 */
export function getTrailFactor(x: number, z: number): number {
  // Primary north-south vista path from spawn (0, 32) toward Citadel (0, -28)
  const mainDist = x >= -3.5 && x <= 3.5 && z >= -30 && z <= 34 ? Math.abs(x) : Infinity;

  // Path toward Windmill Outpost (-12, 16)
  const millDist = distanceToSegment(x, z, 0, 22, -11, 16);
  // Path toward Meadow Shrine (16, 8)
  const meadowDist = distanceToSegment(x, z, 0, 12, 16, 8);
  // Path toward Whispering Grove (-44, -6)
  const groveDist = distanceToSegment(x, z, 0, -4, -44, -6);
  // Path toward Amber Canyon Bridge (-11, -41.5) -> (-38, -54)
  const canyonDist = Math.min(
    distanceToSegment(x, z, 0, -20, -11, -41.5),
    distanceToSegment(x, z, -27, -41.5, -38, -54),
  );

  const minDist = Math.min(mainDist, millDist, meadowDist, groveDist, canyonDist);
  return 1 - smoothstep(1.6, 3.8, minDist);
}

export function distanceToSegment(
  px: number,
  pz: number,
  ax: number,
  az: number,
  bx: number,
  bz: number,
): number {
  const dx = bx - ax;
  const dz = bz - az;
  const lenSq = dx * dx + dz * dz;
  if (lenSq === 0) return Math.hypot(px - ax, pz - az);
  const t = Math.max(0, Math.min(1, ((px - ax) * dx + (pz - az) * dz) / lenSq));
  return Math.hypot(px - (ax + t * dx), pz - (az + t * dz));
}

export function getBiomeAt(x: number, z: number): BiomeId {
  if (Math.hypot(x - CITADEL_PLATEAU.x, z - CITADEL_PLATEAU.z) < 18) return 'citadel';
  if (Math.hypot((x - 46) * 0.95, (z + 12) * 0.85) < 23) return 'lagoon';
  if (x < -14 && z < -28) return 'canyon';
  if (x < -22 && z > -28 && z < 16) return 'grove';
  if (getTrailFactor(x, z) > 0.45) return 'trail';
  return 'meadow';
}

export function getRegionLabelAt(x: number, z: number): string {
  const biome = getBiomeAt(x, z);
  switch (biome) {
    case 'citadel':
      return 'Sunspire Citadel';
    case 'lagoon':
      return 'Crystal Lagoon';
    case 'canyon':
      return 'Amber Canyon';
    case 'grove':
      return 'Whispering Pine Grove';
    case 'trail':
      return 'Pilgrim Causeway';
    default:
      return 'Sunlit Meadow';
  }
}

export function resolveCircleCollisions(
  x: number,
  z: number,
  actorRadius: number,
  colliders: readonly CircleCollider[],
  maxWorldRadius = WORLD_RADIUS,
): Vec2 {
  let nx = x;
  let nz = z;

  for (let i = 0; i < colliders.length; i++) {
    const c = colliders[i];
    const minDist = actorRadius + c.radius;
    const dx = nx - c.x;
    const dz = nz - c.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < minDist * minDist) {
      const dist = Math.sqrt(distSq);
      if (dist > 1e-5) {
        const push = (minDist - dist) / dist;
        nx += dx * push;
        nz += dz * push;
      } else {
        nx += minDist;
      }
    }
  }

  const r = Math.hypot(nx, nz);
  if (r > maxWorldRadius) {
    const scale = maxWorldRadius / r;
    nx *= scale;
    nz *= scale;
  }

  return { x: nx, z: nz };
}

export interface VerticalPhysicsState {
  y: number;
  vy: number;
  grounded: boolean;
  gliding: boolean;
  coyoteTimer: number;
  jumpBufferTimer: number;
}

export interface VerticalPhysicsInput {
  dt: number;
  groundY: number;
  jumpJustPressed: boolean;
  jumpHeld: boolean;
  stamina: number;
}

export function stepPlayerVertical(
  state: VerticalPhysicsState,
  input: VerticalPhysicsInput,
): { jumped: boolean; landed: boolean; staminaDrain: number } {
  const { dt, groundY, jumpJustPressed, jumpHeld, stamina } = input;
  const GRAVITY = -26;
  const JUMP_VELOCITY = 11.4;
  const GLIDE_MAX_FALL = -2.8;
  const GLIDE_STAMINA_PER_SEC = 14;

  let jumped = false;
  let landed = false;
  let staminaDrain = 0;

  if (jumpJustPressed) {
    state.jumpBufferTimer = 0.12;
  } else {
    state.jumpBufferTimer = Math.max(0, state.jumpBufferTimer - dt);
  }

  if (state.grounded) {
    state.coyoteTimer = 0.11;
  } else {
    state.coyoteTimer = Math.max(0, state.coyoteTimer - dt);
  }

  // Trigger jump via buffered input + coyote time
  if (state.jumpBufferTimer > 0 && state.coyoteTimer > 0) {
    state.vy = JUMP_VELOCITY;
    state.grounded = false;
    state.gliding = false;
    state.coyoteTimer = 0;
    state.jumpBufferTimer = 0;
    jumped = true;
  } else if (!state.grounded && state.vy < 0 && jumpHeld && stamina > 1 && state.y > groundY + 0.55) {
    // Engage Sky-Glider while descending in midair with Space held
    state.gliding = true;
  } else if (!jumpHeld || stamina <= 1 || state.grounded) {
    state.gliding = false;
  }

  // Variable jump height cut when releasing jump early while ascending
  if (!state.grounded && !jumpHeld && state.vy > 4.2) {
    state.vy *= Math.pow(0.45, dt * 14);
  }

  if (!state.grounded) {
    state.vy += GRAVITY * dt;
    if (state.gliding && state.vy < GLIDE_MAX_FALL) {
      state.vy = GLIDE_MAX_FALL;
      staminaDrain = GLIDE_STAMINA_PER_SEC * dt;
    }
    state.y += state.vy * dt;
  }

  // Ground snap / landing
  if (state.y <= groundY) {
    if (!state.grounded && state.vy < -3.5) {
      landed = true;
    }
    state.y = groundY;
    state.vy = 0;
    state.grounded = true;
    state.gliding = false;
  } else if (state.y > groundY + 0.14 && state.grounded) {
    // Stepped off a ledge
    state.grounded = false;
  }

  return { jumped, landed, staminaDrain };
}

export function checkMeleeArcHit(
  attackerX: number,
  attackerZ: number,
  forwardX: number,
  forwardZ: number,
  targetX: number,
  targetZ: number,
  targetRadius: number,
  range: number,
  minCosHalfAngle = 0.15,
): boolean {
  const dx = targetX - attackerX;
  const dz = targetZ - attackerZ;
  const dist = Math.hypot(dx, dz);
  if (dist > range + targetRadius) return false;
  if (dist < 0.001) return true;
  const nx = dx / dist;
  const nz = dz / dist;
  const dot = nx * forwardX + nz * forwardZ;
  return dot >= minCosHalfAngle || dist < targetRadius + 0.9;
}

export function evaluateGameOutcome(
  hp: number,
  shrinesRestored: number,
  totalShrines: number,
): GameOutcome {
  if (hp <= 0) return 'defeat';
  if (shrinesRestored >= totalShrines && totalShrines > 0) return 'victory';
  return 'none';
}
