import React from 'react';
import type { HudSnapshot } from '../game/engine';
import { WORLD_RADIUS } from '../game/worldMath';

interface GameHudProps {
  hud: HudSnapshot;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
}

function formatClock(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const GameHud: React.FC<GameHudProps> = ({
  hud,
  onToggleMute,
  onPause,
  onRestart,
}) => {
  const staminaPct = Math.max(0, Math.min(100, (hud.stamina / hud.maxStamina) * 100));
  const lowHp = hud.hp <= 1;

  // Minimap coordinate helper (projects world X/Z into 128x128 compass disc)
  const mapRadius = 56;
  const worldScale = mapRadius / WORLD_RADIUS;

  return (
    <div className="fixed inset-0 z-10 pointer-events-none select-none">
      {/* Subtle Low-HP Peripheral Vignette */}
      {lowHp && (
        <div
          className="fixed inset-0 pointer-events-none"
          style={{
            background:
              'radial-gradient(circle at center, transparent 58%, rgba(190, 28, 48, 0.38) 100%)',
          }}
        />
      )}

      {/* Top Perimeter Row: Vitality/Region (Left) · Shrine Progress (Center) · Utilities (Right) */}
      <div className="flex flex-wrap md:flex-nowrap items-start justify-between p-3 sm:p-4 md:p-6 gap-2 sm:gap-4">
        {/* Top-Left Cluster: Vitality Sockets, Stamina Bar & Current Region */}
        <div
          className="px-3 sm:px-4 py-2 sm:py-3 rounded-md border"
          style={{
            backgroundColor: 'rgba(13, 19, 26, 0.80)',
            borderColor: 'rgba(212, 155, 66, 0.34)',
          }}
        >
          <div className="flex items-center gap-2 mb-2" aria-label={`Health ${hud.hp} of ${hud.maxHp}`}>
            <span className="text-[11px] uppercase tracking-[0.14em] text-[#cbbba0] font-semibold mr-1">
              HP
            </span>
            {Array.from({ length: hud.maxHp }).map((_, idx) => {
              const full = idx < hud.hp;
              return (
                <svg
                  key={idx}
                  width="20"
                  height="20"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M12 21.2L10.55 19.88C5.4 15.22 2 12.14 2 8.35C2 5.26 4.42 2.85 7.5 2.85C9.24 2.85 10.91 3.66 12 4.94C13.09 3.66 14.76 2.85 16.5 2.85C19.58 2.85 22 5.26 22 8.35C22 12.14 18.6 15.22 13.45 19.89L12 21.2Z"
                    fill={full ? '#E14B5A' : 'rgba(255,255,255,0.08)'}
                    stroke={full ? '#FFD2D7' : 'rgba(212, 155, 66, 0.45)'}
                    strokeWidth="1.6"
                  />
                  {full && (
                    <path
                      d="M7 6.5C8 5.6 9.3 5.6 10.2 6.4"
                      stroke="#FFF0F2"
                      strokeWidth="1.4"
                      strokeLinecap="round"
                    />
                  )}
                </svg>
              );
            })}
          </div>

          {/* Stamina / Glider Meter */}
          <div className="flex items-center gap-2.5 mb-2">
            <span className="text-[11px] uppercase tracking-[0.14em] text-[#cbbba0] font-semibold">
              STM
            </span>
            <div className="w-28 h-2 rounded-sm bg-[#1f2935] overflow-hidden border border-[#d49b42]/25">
              <div
                className="h-full transition-[width] duration-75"
                style={{
                  width: `${staminaPct}%`,
                  backgroundColor: hud.gliding ? '#38bdf8' : '#e0a94f',
                }}
              />
            </div>
            <span className="font-mono-num text-xs text-[#efe5cf] w-7 text-right">
              {hud.stamina}
            </span>
          </div>

          <div className="text-xs text-[#e6c88a] font-medium tracking-wide">
            {hud.regionName}
          </div>
        </div>

        {/* Top-Center Cluster: Shrines Restored · Orbs · Score */}
        <div
          className="px-3 md:px-5 py-2 md:py-2.5 rounded-md border flex items-center gap-3 md:gap-6 shrink-0"
          style={{
            backgroundColor: 'rgba(13, 19, 26, 0.80)',
            borderColor: 'rgba(212, 155, 66, 0.34)',
          }}
        >
          <div className="flex items-center gap-2">
            <span className="text-[11px] uppercase tracking-[0.14em] text-[#cbbba0] font-semibold">
              Shrines
            </span>
            <div className="hidden md:flex items-center gap-1.5" aria-label={`Shrines restored ${hud.shrinesRestored} of ${hud.totalShrines}`}>
              {Array.from({ length: hud.totalShrines }).map((_, idx) => {
                const lit = idx < hud.shrinesRestored;
                return (
                  <svg
                    key={idx}
                    width="16"
                    height="18"
                    viewBox="0 0 16 18"
                    fill="none"
                    aria-hidden="true"
                  >
                    <path
                      d="M8 1L14 9L8 17L2 9L8 1Z"
                      fill={lit ? '#F5B041' : 'rgba(56, 189, 248, 0.16)'}
                      stroke={lit ? '#FFF2C9' : 'rgba(125, 211, 252, 0.55)'}
                      strokeWidth="1.4"
                    />
                  </svg>
                );
              })}
            </div>
            <span className="font-mono-num text-sm font-semibold text-[#fbf6ea]">
              {hud.shrinesRestored}/{hud.totalShrines}
            </span>
          </div>

          <div className="h-5 w-px bg-[#d49b42]/25 hidden sm:block" aria-hidden="true" />

          <div className="hidden sm:flex items-baseline gap-2">
            <span className="text-[11px] uppercase tracking-[0.14em] text-[#cbbba0] font-semibold">
              Relics
            </span>
            <span className="font-mono-num text-sm font-semibold text-[#ffe3a3]">
              {hud.orbsCollected}/{hud.totalOrbs}
            </span>
          </div>

          <div className="h-5 w-px bg-[#d49b42]/25 hidden sm:block" aria-hidden="true" />

          <div className="hidden sm:flex items-baseline gap-2">
            <span className="text-[11px] uppercase tracking-[0.14em] text-[#cbbba0] font-semibold">
              Score
            </span>
            <span className="font-mono-num text-base font-bold text-[#fbf6ea]" data-testid="hud-score">
              {hud.score}
            </span>
          </div>

          <div className="hidden md:flex items-baseline gap-2">
            <span className="text-[11px] uppercase tracking-[0.14em] text-[#cbbba0] font-semibold">
              Time
            </span>
            <span className="font-mono-num text-sm text-[#e5dac4]">
              {formatClock(hud.elapsedSeconds)}
            </span>
          </div>
        </div>

        {/* Top-Right Compact Square Utility Controls */}
        <div className="flex items-center gap-1.5 sm:gap-2 pointer-events-auto">
          <button
            type="button"
            tabIndex={-1}
            aria-label={hud.muted ? 'Unmute audio (M)' : 'Mute audio (M)'}
            title="Mute / Unmute (M)"
            onClick={(e) => {
              e.currentTarget.blur();
              onToggleMute();
            }}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-md border flex items-center justify-center text-[#f5efe2] hover:text-[#ffd166] transition-colors cursor-pointer"
            style={{
              backgroundColor: 'rgba(13, 19, 26, 0.80)',
              borderColor: 'rgba(212, 155, 66, 0.34)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M11 5L6 9H3V15H6L11 19V5Z"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinejoin="round"
              />
              {hud.muted ? (
                <path
                  d="M22 9L16 15M16 9L22 15"
                  stroke="#f43f5e"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              ) : (
                <path
                  d="M15.5 8.5C16.8 9.8 16.8 14.2 15.5 15.5M18.5 6C21 8.8 21 15.2 18.5 18"
                  stroke="currentColor"
                  strokeWidth="1.8"
                  strokeLinecap="round"
                />
              )}
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Restart adventure (R)"
            title="Restart (R)"
            onClick={(e) => {
              e.currentTarget.blur();
              onRestart();
            }}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-md border flex items-center justify-center text-[#f5efe2] hover:text-[#ffd166] transition-colors cursor-pointer"
            style={{
              backgroundColor: 'rgba(13, 19, 26, 0.80)',
              borderColor: 'rgba(212, 155, 66, 0.34)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <path
                d="M3 12C3 7.03 7.03 3 12 3C15.5 3 18.54 5 20.03 7.93M21 3V8.5H15.5"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
              <path
                d="M21 12C21 16.97 16.97 21 12 21C8.5 21 5.46 19 3.97 16.07"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>

          <button
            type="button"
            tabIndex={-1}
            aria-label="Pause game (Esc)"
            title="Pause (Esc / P)"
            onClick={(e) => {
              e.currentTarget.blur();
              onPause();
            }}
            className="w-9 h-9 sm:w-10 sm:h-10 rounded-md border flex items-center justify-center text-[#f5efe2] hover:text-[#ffd166] transition-colors cursor-pointer"
            style={{
              backgroundColor: 'rgba(13, 19, 26, 0.80)',
              borderColor: 'rgba(212, 155, 66, 0.34)',
            }}
          >
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
              <rect x="6" y="5" width="4" height="14" rx="1" fill="currentColor" />
              <rect x="14" y="5" width="4" height="14" rx="1" fill="currentColor" />
            </svg>
          </button>
        </div>
      </div>

      {/* Ephemeral Banner Notification (Top-Center below HUD strip) */}
      {hud.bannerText && (
        <div className="flex justify-center mt-1">
          <div
            className="px-5 py-2 rounded-md border text-sm font-display tracking-wider text-[#ffe8ad]"
            style={{
              backgroundColor: 'rgba(13, 19, 26, 0.85)',
              borderColor: 'rgba(212, 155, 66, 0.45)',
            }}
          >
            {hud.bannerText}
          </div>
        </div>
      )}

      {/* Bottom-Center Interaction Prompt & Compact Control Reminder */}
      <div className="fixed bottom-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 max-w-[92vw]">
        {hud.nearPrompt && (
          <div
            className="px-4 py-2 rounded-md border text-xs font-semibold tracking-wide text-[#fff3d1]"
            style={{
              backgroundColor: 'rgba(13, 19, 26, 0.88)',
              borderColor: 'rgba(212, 155, 66, 0.6)',
            }}
          >
            {hud.nearPrompt}
          </div>
        )}
        <div
          className="px-3.5 py-1.5 rounded-md text-[11px] text-[#efe5cf] tracking-wide truncate max-w-full"
          style={{ backgroundColor: 'rgba(13, 19, 26, 0.72)' }}
        >
          WASD Move · Space Jump / Hold Glide · Click / J Strike · Shift Dash · Drag / Q E Camera
        </div>
      </div>

      {/* Bottom-Right Live World Compass Minimap */}
      <div
        className="fixed bottom-5 right-5 rounded-full border p-1.5 hidden sm:block"
        style={{
          backgroundColor: 'rgba(13, 19, 26, 0.82)',
          borderColor: 'rgba(212, 155, 66, 0.42)',
        }}
        aria-label="World compass minimap"
      >
        <svg width="128" height="128" viewBox="-64 -64 128 128">
          <circle cx="0" cy="0" r="58" fill="#131c26" stroke="rgba(212, 155, 66, 0.25)" strokeWidth="1" />
          <circle cx="0" cy="0" r="34" fill="none" stroke="rgba(212, 155, 66, 0.14)" strokeWidth="1" />
          {/* Cardinal N indicator */}
          <text
            x="0"
            y="-49"
            textAnchor="middle"
            fill="#d49b42"
            fontSize="8"
            fontWeight="700"
          >
            N
          </text>

          {/* World blips */}
          {hud.blips.map((b, i) => {
            const bx = b.x * worldScale;
            const bz = b.z * worldScale;
            if (b.kind === 'shrine-lit') {
              return <circle key={i} cx={bx} cy={bz} r="3.4" fill="#fbbf24" stroke="#fff7d6" strokeWidth="1" />;
            }
            if (b.kind === 'shrine-unlit') {
              return <circle key={i} cx={bx} cy={bz} r="3.4" fill="#38bdf8" stroke="#e0f2fe" strokeWidth="1" />;
            }
            if (b.kind === 'enemy') {
              return <circle key={i} cx={bx} cy={bz} r="2.1" fill="#f43f5e" />;
            }
            return <circle key={i} cx={bx} cy={bz} r="1.4" fill="#fde68a" opacity="0.75" />;
          })}

          {/* Player marker & heading */}
          <g
            transform={`translate(${hud.playerX * worldScale}, ${hud.playerZ * worldScale}) rotate(${
              (-hud.playerYaw * 180) / Math.PI
            })`}
          >
            <path d="M0 -5.5L4 4.5L0 2.2L-4 4.5Z" fill="#ffffff" stroke="#0d131a" strokeWidth="0.9" />
          </g>
        </svg>
      </div>
    </div>
  );
};
