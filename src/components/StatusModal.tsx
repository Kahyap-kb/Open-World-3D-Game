import React from 'react';
import type { HudSnapshot } from '../game/engine';

interface StatusModalProps {
  hud: HudSnapshot;
  onResume: () => void;
  onRestart: () => void;
  onReturnToTitle: () => void;
}

function formatClock(totalSeconds: number): string {
  const mins = Math.floor(totalSeconds / 60);
  const secs = totalSeconds % 60;
  return `${mins}:${secs.toString().padStart(2, '0')}`;
}

export const StatusModal: React.FC<StatusModalProps> = ({
  hud,
  onResume,
  onRestart,
  onReturnToTitle,
}) => {
  const isPaused = hud.mode === 'paused';
  const isVictory = hud.mode === 'gameover' && hud.outcome === 'victory';

  const heading = isPaused
    ? 'Journey Paused'
    : isVictory
      ? 'Aethermoor Restored'
      : 'Fallen in the Ruins';

  const subtitle = isPaused
    ? 'Take a breath beneath the open sky. Your shrine progress is preserved.'
    : isVictory
      ? 'All five Sun Shrines burn bright across the valley and the Sunspire awakens.'
      : 'The guardians overwhelmed you before the final beacon was lit.';

  return (
    <div
      className="fixed inset-0 z-30 flex items-center justify-center p-6"
      style={{ backgroundColor: 'rgba(8, 12, 18, 0.72)' }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="status-modal-title"
    >
      <div
        className="w-full max-w-md rounded-lg border p-7 shadow-2xl"
        style={{
          backgroundColor: 'rgba(15, 22, 30, 0.96)',
          borderColor: 'rgba(212, 155, 66, 0.45)',
        }}
      >
        <h2
          id="status-modal-title"
          className="font-display text-2xl md:text-3xl font-bold text-[#fbf6ea] tracking-wide mb-2"
        >
          {heading}
        </h2>
        <p className="text-sm text-[#cfc3aa] leading-relaxed mb-6">{subtitle}</p>

        {/* Tabular-Nums Run Metrics */}
        <div className="grid grid-cols-2 gap-3 mb-7">
          <div className="p-3 rounded-md bg-[#16202b] border border-[#d49b42]/20">
            <div className="text-[11px] uppercase tracking-[0.12em] text-[#bba98a] mb-1">
              Shrines
            </div>
            <div className="font-mono-num text-xl font-bold text-[#ffe3a3]">
              {hud.shrinesRestored} / {hud.totalShrines}
            </div>
          </div>
          <div className="p-3 rounded-md bg-[#16202b] border border-[#d49b42]/20">
            <div className="text-[11px] uppercase tracking-[0.12em] text-[#bba98a] mb-1">
              Score
            </div>
            <div className="font-mono-num text-xl font-bold text-[#fbf6ea]">{hud.score}</div>
          </div>
          <div className="p-3 rounded-md bg-[#16202b] border border-[#d49b42]/20">
            <div className="text-[11px] uppercase tracking-[0.12em] text-[#bba98a] mb-1">
              Relics
            </div>
            <div className="font-mono-num text-lg font-semibold text-[#fbf6ea]">
              {hud.orbsCollected} / {hud.totalOrbs}
            </div>
          </div>
          <div className="p-3 rounded-md bg-[#16202b] border border-[#d49b42]/20">
            <div className="text-[11px] uppercase tracking-[0.12em] text-[#bba98a] mb-1">
              {isPaused ? 'Time' : 'Best Score'}
            </div>
            <div className="font-mono-num text-lg font-semibold text-[#fbf6ea]">
              {isPaused ? formatClock(hud.elapsedSeconds) : Math.max(hud.bestScore, hud.score)}
            </div>
          </div>
        </div>

        <div className="flex flex-col gap-2.5">
          {isPaused ? (
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onResume();
              }}
              className="w-full py-3 px-4 rounded-md bg-[#d49b42] hover:bg-[#e3ab52] text-[#111720] font-semibold text-sm transition-colors cursor-pointer"
            >
              Resume Adventure
            </button>
          ) : (
            <button
              type="button"
              data-start="true"
              onClick={(e) => {
                e.currentTarget.blur();
                onRestart();
              }}
              className="w-full py-3 px-4 rounded-md bg-[#d49b42] hover:bg-[#e3ab52] text-[#111720] font-semibold text-sm transition-colors cursor-pointer"
            >
              {isVictory ? 'Play Again' : 'Try Again'}
            </button>
          )}

          <div className="grid grid-cols-2 gap-2.5">
            {isPaused && (
              <button
                type="button"
                onClick={(e) => {
                  e.currentTarget.blur();
                  onRestart();
                }}
                className="py-2.5 px-4 rounded-md bg-[#1c2836] hover:bg-[#243446] text-[#f5efe2] font-medium text-sm border border-[#d49b42]/30 transition-colors cursor-pointer"
              >
                Restart
              </button>
            )}
            <button
              type="button"
              onClick={(e) => {
                e.currentTarget.blur();
                onReturnToTitle();
              }}
              className={`py-2.5 px-4 rounded-md bg-[#1c2836] hover:bg-[#243446] text-[#d6cbb4] font-medium text-sm border border-[#d49b42]/20 transition-colors cursor-pointer ${
                isPaused ? '' : 'col-span-2'
              }`}
            >
              Return to Title
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
