import React from 'react';

interface TitleScreenProps {
  bestScore: number;
  onStart: () => void;
}

export const TitleScreen: React.FC<TitleScreenProps> = ({ bestScore, onStart }) => {
  return (
    <div
      className="fixed inset-0 z-20 pointer-events-none flex flex-col justify-between p-8 md:p-14"
      style={{
        background:
          'linear-gradient(105deg, rgba(10, 15, 22, 0.78) 0%, rgba(10, 15, 22, 0.36) 44%, rgba(10, 15, 22, 0.08) 100%), linear-gradient(to top, rgba(10, 15, 22, 0.72) 0%, rgba(10, 15, 22, 0) 18%)',
      }}
    >
      {/* Upper-Left Negative Space Title Lockup & Primary Start CTA */}
      <div className="max-w-lg pt-4 md:pt-8 pointer-events-auto">
        <div className="flex items-center gap-3.5 mb-5">
          {/* Bespoke Sun-Compass Crest Emblem */}
          <svg
            width="46"
            height="46"
            viewBox="0 0 48 48"
            fill="none"
            aria-hidden="true"
            className="shrink-0"
          >
            <circle cx="24" cy="24" r="20" stroke="#D49B42" strokeWidth="1.75" />
            <circle cx="24" cy="24" r="14" stroke="#F5EFE2" strokeOpacity="0.35" strokeWidth="1" />
            <path
              d="M24 4L28.5 19.5L44 24L28.5 28.5L24 44L19.5 28.5L4 24L19.5 19.5L24 4Z"
              fill="#D49B42"
              stroke="#121922"
              strokeWidth="1.5"
            />
            <circle cx="24" cy="24" r="3.5" fill="#FFF4D2" />
          </svg>
          <span className="text-xs tracking-[0.22em] uppercase text-[#e6c88a] font-semibold hud-text-shadow">
            Skyward Ruins
          </span>
        </div>

        <h1 className="font-display text-5xl md:text-6xl font-bold tracking-wide text-[#fbf6ea] leading-[1.04] hud-text-shadow mb-4">
          AETHERMOOR
        </h1>

        <p className="text-sm md:text-base text-[#ddd3be] leading-relaxed max-w-md mb-8 hud-text-shadow">
          Cross sunlit meadows, glide over crystal lagoons, and rekindle the five ancient Sun
          Shrines crowned by the Sunspire Citadel.
        </p>

        <div className="flex flex-wrap items-center gap-5">
          <button
            type="button"
            data-start="true"
            onClick={(e) => {
              e.currentTarget.blur();
              onStart();
            }}
            className="px-7 py-3.5 rounded-md bg-[#d49b42] hover:bg-[#e3ab52] active:translate-y-px text-[#111720] font-semibold text-sm tracking-wide transition-colors shadow-lg cursor-pointer whitespace-nowrap focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#fff4d2]"
          >
            Start Adventure
          </button>

          {bestScore > 0 && (
            <div className="text-xs text-[#d6cbb4] hud-text-shadow">
              Best Score{' '}
              <span className="font-mono-num text-[#ffe3a3] font-semibold ml-1">{bestScore}</span>
            </div>
          )}
        </div>
      </div>

      {/* Bottom Safe-Margin Single-Line Control Hint */}
      <div className="text-xs text-[#dfd5c0]/90 tracking-wide hud-text-shadow">
        WASD / Arrows Move <span aria-hidden="true">·</span> Space Jump &amp; Glide{' '}
        <span aria-hidden="true">·</span> Click / J Strike <span aria-hidden="true">·</span> Shift
        Dash <span aria-hidden="true">·</span> Drag / Q E Look <span aria-hidden="true">·</span> Esc
        Pause
      </div>
    </div>
  );
};
