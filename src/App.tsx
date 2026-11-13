import { useCallback, useEffect, useRef, useState } from 'react';
import { GameHud } from './components/GameHud';
import { StatusModal } from './components/StatusModal';
import { TitleScreen } from './components/TitleScreen';
import { OpenWorldEngine, type HudSnapshot } from './game/engine';
import { PLAYER_MAX_HP, PLAYER_MAX_STAMINA, type GameStateMode } from './game/worldMath';

const INITIAL_HUD: HudSnapshot = {
  mode: 'title',
  outcome: 'none',
  hp: PLAYER_MAX_HP,
  maxHp: PLAYER_MAX_HP,
  stamina: PLAYER_MAX_STAMINA,
  maxStamina: PLAYER_MAX_STAMINA,
  score: 0,
  bestScore: 0,
  orbsCollected: 0,
  totalOrbs: 15,
  shrinesRestored: 0,
  totalShrines: 5,
  enemiesDefeated: 0,
  elapsedSeconds: 0,
  regionName: 'Sunlit Meadow',
  playerX: 0,
  playerZ: 30,
  playerYaw: 0,
  cameraYaw: 0,
  gliding: false,
  muted: false,
  nearPrompt: null,
  bannerText: null,
  blips: [],
};

export default function App() {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<OpenWorldEngine | null>(null);
  const [hud, setHud] = useState<HudSnapshot>(INITIAL_HUD);
  const [webglError, setWebglError] = useState<string | null>(null);

  const handleHudUpdate = useCallback((snapshot: HudSnapshot) => {
    setHud(snapshot);
  }, []);

  const handleModeChange = useCallback((mode: GameStateMode) => {
    document.body.dataset.state = mode;
  }, []);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    let engine: OpenWorldEngine | null = null;
    try {
      engine = new OpenWorldEngine(container, handleHudUpdate, handleModeChange);
      engineRef.current = engine;

      const params = new URLSearchParams(window.location.search);
      if (params.get('autostart') === '1') {
        engine.startGame();
      } else {
        document.body.dataset.state = 'title';
      }
    } catch (err) {
      setWebglError(err instanceof Error ? err.message : 'Unable to initialize 3D WebGL viewport.');
    }

    return () => {
      engineRef.current = null;
      engine?.dispose();
    };
  }, [handleHudUpdate, handleModeChange]);

  const startAdventure = useCallback(() => {
    engineRef.current?.startGame();
  }, []);

  const pauseAdventure = useCallback(() => {
    const eng = engineRef.current;
    if (!eng) return;
    if (eng.getMode() === 'playing') eng.setMode('paused');
    else if (eng.getMode() === 'paused') eng.setMode('playing');
  }, []);

  const restartAdventure = useCallback(() => {
    engineRef.current?.resetWorldState('playing');
  }, []);

  const returnToTitle = useCallback(() => {
    engineRef.current?.resetWorldState('title');
  }, []);

  const toggleMute = useCallback(() => {
    engineRef.current?.toggleMute();
  }, []);

  useEffect(() => {
    const onGlobalKey = (ev: KeyboardEvent) => {
      const eng = engineRef.current;
      if (!eng) return;
      const mode = eng.getMode();

      if (mode === 'title' && (ev.code === 'Enter' || ev.code === 'Space')) {
        ev.preventDefault();
        eng.startGame();
        return;
      }

      if (ev.code === 'Escape' || ev.code === 'KeyP') {
        if (mode === 'playing') {
          ev.preventDefault();
          eng.setMode('paused');
        } else if (mode === 'paused') {
          ev.preventDefault();
          eng.setMode('playing');
        }
        return;
      }

      if (ev.code === 'KeyM' && mode !== 'title') {
        eng.toggleMute();
        return;
      }

      if (ev.code === 'KeyR' && mode === 'playing') {
        eng.resetWorldState('playing');
      }
    };

    window.addEventListener('keydown', onGlobalKey);
    return () => window.removeEventListener('keydown', onGlobalKey);
  }, []);

  return (
    <main className="relative w-full h-full overflow-hidden bg-[#0d131a]">
      {/* Isolated WebGL Canvas Mount */}
      <div
        ref={mountRef}
        data-testid="game-canvas-mount"
        className="fixed inset-0 w-full h-full"
      />

      {webglError && (
        <div className="fixed inset-0 z-40 flex items-center justify-center p-6 bg-[#0d131a]">
          <div className="max-w-md rounded-lg border border-[#d49b42]/40 bg-[#141d27] p-6 text-center">
            <h1 className="font-display text-2xl font-bold text-[#fbf6ea] mb-2">
              3D Renderer Unavailable
            </h1>
            <p className="text-sm text-[#cfc3aa]">{webglError}</p>
          </div>
        </div>
      )}

      {!webglError && hud.mode === 'title' && (
        <TitleScreen bestScore={hud.bestScore} onStart={startAdventure} />
      )}

      {!webglError && hud.mode === 'playing' && (
        <GameHud
          hud={hud}
          onToggleMute={toggleMute}
          onPause={pauseAdventure}
          onRestart={restartAdventure}
        />
      )}

      {!webglError && (hud.mode === 'paused' || hud.mode === 'gameover') && (
        <StatusModal
          hud={hud}
          onResume={() => engineRef.current?.setMode('playing')}
          onRestart={restartAdventure}
          onReturnToTitle={returnToTitle}
        />
      )}
    </main>
  );
}
