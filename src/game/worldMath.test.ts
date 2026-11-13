import test from 'node:test';
import assert from 'node:assert/strict';
import {
  CANYON_BRIDGE,
  CITADEL_PLATEAU,
  CITADEL_RAMP,
  SHRINE_DEFS,
  SPAWN_POS,
  WATER_LEVEL,
  checkMeleeArcHit,
  evaluateGameOutcome,
  getRegionLabelAt,
  getWalkableHeightAt,
  groundHeightAt,
  resolveCircleCollisions,
  stepPlayerVertical,
  type VerticalPhysicsState,
} from './worldMath';

test('spawn area is flat, dry, and open', () => {
  const spawnY = getWalkableHeightAt(SPAWN_POS.x, SPAWN_POS.z);
  assert.ok(spawnY > WATER_LEVEL + 1.0, 'Spawn must be well above water level');
  // Forward vista path from spawn (z=30 toward z=16) stays gentle and walkable
  for (let z = 30; z >= 16; z -= 2) {
    const y = getWalkableHeightAt(0, z);
    assert.ok(Math.abs(y - spawnY) < 1.2, `Spawn trail at z=${z} should be gently graded`);
  }
});

test('citadel ramp smoothly bridges meadow to Sunspire Citadel plateau', () => {
  const startY = getWalkableHeightAt(0, CITADEL_RAMP.startZ);
  const midY = getWalkableHeightAt(0, (CITADEL_RAMP.startZ + CITADEL_RAMP.endZ) * 0.5);
  const topY = getWalkableHeightAt(0, CITADEL_PLATEAU.z);
  assert.ok(midY > startY + 1.5);
  assert.ok(topY >= CITADEL_PLATEAU.height - 0.15);
  assert.equal(getRegionLabelAt(0, CITADEL_PLATEAU.z), 'Sunspire Citadel');
});

test('Amber Canyon bridge provides dry crossing above gorge', () => {
  const midX = (CANYON_BRIDGE.minX + CANYON_BRIDGE.maxX) * 0.5;
  const midZ = (CANYON_BRIDGE.minZ + CANYON_BRIDGE.maxZ) * 0.5;
  const bridgeY = getWalkableHeightAt(midX, midZ);
  const gorgeFloorY = groundHeightAt(midX, midZ);
  assert.ok(bridgeY > gorgeFloorY + 3.0, 'Bridge deck must sit well above gorge floor');
  assert.ok(bridgeY > WATER_LEVEL + 2.0);
});

test('Crystal Lagoon shrine sits on a dry island above water level', () => {
  const lagoonShrine = SHRINE_DEFS.find((s) => s.id === 'lagoon');
  assert.ok(lagoonShrine);
  const islandY = groundHeightAt(lagoonShrine.x, lagoonShrine.z);
  assert.ok(islandY > WATER_LEVEL + 0.5, 'Lagoon shrine island must rise above water');
});

test('resolveCircleCollisions pushes actor outside solid obstacle and clamps world boundary', () => {
  const colliders = [{ x: 10, z: 10, radius: 1.5 }];
  const pushed = resolveCircleCollisions(10.5, 10, 0.55, colliders, 92);
  const dist = Math.hypot(pushed.x - 10, pushed.z - 10);
  assert.ok(dist >= 2.04, `Expected pushed dist >= 2.05, got ${dist}`);

  const bounded = resolveCircleCollisions(150, 0, 0.55, colliders, 92);
  assert.ok(Math.hypot(bounded.x, bounded.z) <= 92.001);
});

test('stepPlayerVertical supports coyote jump, jump buffer, glider cap, and landing', () => {
  const state: VerticalPhysicsState = {
    y: 1.0,
    vy: 0,
    grounded: false,
    gliding: false,
    coyoteTimer: 0.08, // just walked off ledge
    jumpBufferTimer: 0,
  };

  const jumpResult = stepPlayerVertical(state, {
    dt: 0.016,
    groundY: 0,
    jumpJustPressed: true,
    jumpHeld: true,
    stamina: 100,
  });
  assert.equal(jumpResult.jumped, true);
  assert.ok(state.vy > 9);

  // Simulate falling while holding Space -> glider engages and caps fall speed
  state.vy = -12;
  state.y = 5;
  const glideResult = stepPlayerVertical(state, {
    dt: 0.05,
    groundY: 0,
    jumpJustPressed: false,
    jumpHeld: true,
    stamina: 80,
  });
  assert.equal(state.gliding, true);
  assert.equal(state.vy, -2.8);
  assert.ok(glideResult.staminaDrain > 0);
});

test('checkMeleeArcHit validates range and forward cone', () => {
  assert.equal(checkMeleeArcHit(0, 0, 0, -1, 0, -2.4, 0.7, 2.8), true);
  assert.equal(checkMeleeArcHit(0, 0, 0, -1, 0, 3.0, 0.7, 2.8), false);
  assert.equal(checkMeleeArcHit(0, 0, 0, -1, 0, -5.0, 0.7, 2.8), false);
});

test('evaluateGameOutcome transitions cleanly to victory or defeat', () => {
  assert.equal(evaluateGameOutcome(5, 3, 5), 'none');
  assert.equal(evaluateGameOutcome(0, 4, 5), 'defeat');
  assert.equal(evaluateGameOutcome(4, 5, 5), 'victory');
});
