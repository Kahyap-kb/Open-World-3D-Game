import * as THREE from 'three';

export interface ProceduralTextureSet {
  stoneMap: THREE.CanvasTexture;
  stoneBump: THREE.CanvasTexture;
  woodMap: THREE.CanvasTexture;
  terrainBump: THREE.CanvasTexture;
  sailMap: THREE.CanvasTexture;
  contactShadowMap: THREE.CanvasTexture;
  dispose: () => void;
}

function makeCanvas(size: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  return [canvas, ctx];
}

export function createProceduralTextures(maxAnisotropy: number): ProceduralTextureSet {
  const anisotropy = Math.min(8, Math.max(1, maxAnisotropy));

  // 1. Carved Ashlar Stone Albedo + Bump
  const [stoneCanvas, sCtx] = makeCanvas(256);
  const [stoneBumpCanvas, sbCtx] = makeCanvas(256);

  sCtx.fillStyle = '#c9bfae';
  sCtx.fillRect(0, 0, 256, 256);
  sbCtx.fillStyle = '#b0b0b0';
  sbCtx.fillRect(0, 0, 256, 256);

  const rows = 4;
  const rowH = 256 / rows;
  for (let r = 0; r < rows; r++) {
    const cols = 3;
    const colW = 256 / cols;
    const offset = (r % 2) * (colW * 0.5);
    for (let c = -1; c <= cols; c++) {
      const bx = c * colW + offset;
      const by = r * rowH;
      const shade = 186 + ((r * 13 + c * 29) % 26);
      sCtx.fillStyle = `rgb(${shade}, ${shade - 8}, ${shade - 22})`;
      sCtx.fillRect(bx + 3, by + 3, colW - 6, rowH - 6);

      // Subtle bevel highlight & mortar recess in bump map
      sbCtx.fillStyle = '#555555';
      sbCtx.fillRect(bx, by, colW, 3);
      sbCtx.fillRect(bx, by, 3, rowH);
      const bShade = 165 + ((r * 17 + c * 23) % 40);
      sbCtx.fillStyle = `rgb(${bShade}, ${bShade}, ${bShade})`;
      sbCtx.fillRect(bx + 4, by + 4, colW - 7, rowH - 7);
    }
  }
  // Fine mineral grain speckles
  for (let i = 0; i < 1400; i++) {
    const x = (i * 73) % 256;
    const y = (i * 137) % 256;
    const dark = i % 3 === 0;
    sCtx.fillStyle = dark ? 'rgba(60, 52, 42, 0.09)' : 'rgba(255, 248, 232, 0.08)';
    sCtx.fillRect(x, y, 2, 2);
    sbCtx.fillStyle = dark ? 'rgba(40,40,40,0.16)' : 'rgba(235,235,235,0.12)';
    sbCtx.fillRect(x, y, 2, 2);
  }

  const stoneMap = new THREE.CanvasTexture(stoneCanvas);
  stoneMap.colorSpace = THREE.SRGBColorSpace;
  stoneMap.wrapS = stoneMap.wrapT = THREE.RepeatWrapping;
  stoneMap.anisotropy = anisotropy;

  const stoneBump = new THREE.CanvasTexture(stoneBumpCanvas);
  stoneBump.colorSpace = THREE.NoColorSpace;
  stoneBump.wrapS = stoneBump.wrapT = THREE.RepeatWrapping;
  stoneBump.anisotropy = anisotropy;

  // 2. Warm Timber Plank Texture
  const [woodCanvas, wCtx] = makeCanvas(256);
  wCtx.fillStyle = '#7d5636';
  wCtx.fillRect(0, 0, 256, 256);
  for (let p = 0; p < 6; p++) {
    const py = p * (256 / 6);
    const tone = 110 + ((p * 19) % 24);
    wCtx.fillStyle = `rgb(${tone}, ${Math.round(tone * 0.68)}, ${Math.round(tone * 0.42)})`;
    wCtx.fillRect(0, py + 2, 256, 256 / 6 - 3);
    wCtx.fillStyle = 'rgba(42, 24, 12, 0.45)';
    wCtx.fillRect(0, py, 256, 2);
    for (let g = 0; g < 18; g++) {
      wCtx.fillStyle = g % 2 === 0 ? 'rgba(55, 32, 16, 0.14)' : 'rgba(180, 130, 84, 0.09)';
      wCtx.fillRect(0, py + 4 + ((g * 7) % 34), 256, 1.5);
    }
  }
  const woodMap = new THREE.CanvasTexture(woodCanvas);
  woodMap.colorSpace = THREE.SRGBColorSpace;
  woodMap.wrapS = woodMap.wrapT = THREE.RepeatWrapping;
  woodMap.anisotropy = anisotropy;

  // 3. Terrain Organic Turf / Soil Micro-Relief Bump
  const [terrainCanvas, tCtx] = makeCanvas(256);
  tCtx.fillStyle = '#808080';
  tCtx.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 2400; i++) {
    const x = (i * 97 + (i % 13) * 7) % 256;
    const y = (i * 53 + (i % 17) * 11) % 256;
    const v = 96 + ((i * 31) % 72);
    tCtx.fillStyle = `rgb(${v},${v},${v})`;
    tCtx.fillRect(x, y, 3, 2);
  }
  const terrainBump = new THREE.CanvasTexture(terrainCanvas);
  terrainBump.colorSpace = THREE.NoColorSpace;
  terrainBump.wrapS = terrainBump.wrapT = THREE.RepeatWrapping;
  terrainBump.repeat.set(28, 28);
  terrainBump.anisotropy = anisotropy;

  // 4. Woven Canvas Sail Texture
  const [sailCanvas, saCtx] = makeCanvas(128);
  saCtx.fillStyle = '#efe5cf';
  saCtx.fillRect(0, 0, 128, 128);
  saCtx.strokeStyle = 'rgba(130, 98, 62, 0.28)';
  saCtx.lineWidth = 2;
  for (let i = 16; i < 128; i += 32) {
    saCtx.beginPath();
    saCtx.moveTo(0, i);
    saCtx.lineTo(128, i);
    saCtx.stroke();
    saCtx.beginPath();
    saCtx.moveTo(i, 0);
    saCtx.lineTo(i, 128);
    saCtx.stroke();
  }
  const sailMap = new THREE.CanvasTexture(sailCanvas);
  sailMap.colorSpace = THREE.SRGBColorSpace;
  sailMap.wrapS = sailMap.wrapT = THREE.RepeatWrapping;
  sailMap.anisotropy = anisotropy;

  // 5. Soft Radial Contact Shadow Disc
  const [shadowCanvas, shCtx] = makeCanvas(128);
  const grad = shCtx.createRadialGradient(64, 64, 6, 64, 64, 62);
  grad.addColorStop(0, 'rgba(8, 12, 16, 0.72)');
  grad.addColorStop(0.55, 'rgba(8, 12, 16, 0.34)');
  grad.addColorStop(1, 'rgba(8, 12, 16, 0.0)');
  shCtx.fillStyle = grad;
  shCtx.fillRect(0, 0, 128, 128);
  const contactShadowMap = new THREE.CanvasTexture(shadowCanvas);
  contactShadowMap.colorSpace = THREE.SRGBColorSpace;

  return {
    stoneMap,
    stoneBump,
    woodMap,
    terrainBump,
    sailMap,
    contactShadowMap,
    dispose: () => {
      stoneMap.dispose();
      stoneBump.dispose();
      woodMap.dispose();
      terrainBump.dispose();
      sailMap.dispose();
      contactShadowMap.dispose();
    },
  };
}
