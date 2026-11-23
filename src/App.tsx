import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Play, Pause, StepForward, RotateCcw } from 'lucide-react';
import {
  BezierHandleKey,
  DEFAULT_BEZIER_PRESETS,
  DEFAULT_SLIT_CONFIG,
  PX_PER_CM,
  Point2D,
  SlitConfig,
  WavefrontConfig,
  WavefrontType,
  computeMaxPropagationDistance,
  computeSlitArrivalProfile,
  sampleInitialWavefront,
} from './engine/huygensGeometry';
import { SimulationCanvas } from './components/SimulationCanvas';
import { ControlDeck, SimulationStatus } from './components/ControlDeck';

const BASE_SPEED_PX_PER_SEC = 54; // ~2.7 cm/s at 1.0x speed

function formatCm(px: number): string {
  return (px / PX_PER_CM).toFixed(2).replace('.', ',');
}

export default function App() {
  const [config, setConfig] = useState<WavefrontConfig>({
    type: 'plane',
    sphericalRadius: 150,
    bezier: { ...DEFAULT_BEZIER_PRESETS.s_wave.points },
    flipNormal: false,
  });

  const [slit, setSlit] = useState<SlitConfig>({ ...DEFAULT_SLIT_CONFIG });
  const [lambda, setLambda] = useState<number>(90); // 4.50 cm default
  const [speedMultiplier, setSpeedMultiplier] = useState<number>(1.0);
  const [status, setStatus] = useState<SimulationStatus>('idle');
  const [distanceTraveled, setDistanceTraveled] = useState<number>(0);

  const [showRays, setShowRays] = useState<boolean>(true);
  const [showDimensions, setShowDimensions] = useState<boolean>(true);
  const [showLegend, setShowLegend] = useState<boolean>(true);

  const baseSamples = useMemo(
    () => sampleInitialWavefront(config, 180),
    [config]
  );

  const slitMinArrival = useMemo(() => {
    if (!slit.enabled) return 0;
    return computeSlitArrivalProfile(baseSamples, slit, 36).minArrival;
  }, [baseSamples, slit]);

  const maxDistance = useMemo(() => {
    const baseMax = computeMaxPropagationDistance(baseSamples, lambda);
    if (slit.enabled) {
      return Math.min(860, Math.max(baseMax, slitMinArrival + lambda * 5.5));
    }
    return baseMax;
  }, [baseSamples, lambda, slit.enabled, slitMinArrival]);

  const rafRef = useRef<number | null>(null);
  const lastTimeRef = useRef<number | null>(null);

  useEffect(() => {
    if (status !== 'playing') {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTimeRef.current = null;
      return;
    }

    const tick = (now: number) => {
      if (lastTimeRef.current === null) {
        lastTimeRef.current = now;
      }
      const dt = Math.min(0.05, (now - lastTimeRef.current) / 1000);
      lastTimeRef.current = now;

      setDistanceTraveled((prev) => {
        const next = prev + BASE_SPEED_PX_PER_SEC * speedMultiplier * dt;
        if (next >= maxDistance) {
          setStatus('completed');
          return maxDistance;
        }
        return next;
      });

      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      lastTimeRef.current = null;
    };
  }, [status, speedMultiplier, maxDistance]);

  const handleReset = useCallback(() => {
    setStatus('idle');
    setDistanceTraveled(0);
  }, []);

  const handleSelectType = useCallback((type: WavefrontType) => {
    setConfig((prev) => ({
      ...prev,
      type,
      flipNormal: false,
    }));
    setStatus('idle');
    setDistanceTraveled(0);
  }, []);

  const handleChangeSphericalRadius = useCallback((radiusPx: number) => {
    setConfig((prev) => ({ ...prev, sphericalRadius: radiusPx }));
    setStatus('idle');
    setDistanceTraveled(0);
  }, []);

  const handleSelectBezierPreset = useCallback(
    (presetKey: keyof typeof DEFAULT_BEZIER_PRESETS) => {
      const preset = DEFAULT_BEZIER_PRESETS[presetKey];
      setConfig((prev) => ({
        ...prev,
        type: 'bezier',
        flipNormal: false,
        bezier: {
          p0: { ...preset.points.p0 },
          p1: { ...preset.points.p1 },
          p2: { ...preset.points.p2 },
          p3: { ...preset.points.p3 },
        },
      }));
      setStatus('idle');
      setDistanceTraveled(0);
    },
    []
  );

  const handleToggleFlipNormal = useCallback(() => {
    setConfig((prev) => ({ ...prev, flipNormal: !prev.flipNormal }));
    setStatus('idle');
    setDistanceTraveled(0);
  }, []);

  const handleUpdateBezierPoint = useCallback(
    (key: BezierHandleKey, nextPoint: Point2D) => {
      setConfig((prev) => ({
        ...prev,
        bezier: {
          ...prev.bezier,
          [key]: nextPoint,
        },
      }));
    },
    []
  );

  const handleToggleSlit = useCallback(() => {
    setSlit((prev) => ({ ...prev, enabled: !prev.enabled }));
    setStatus('idle');
    setDistanceTraveled(0);
  }, []);

  const handleChangeSlitWidth = useCallback((widthPx: number) => {
    setSlit((prev) => ({ ...prev, width: widthPx }));
    setStatus('idle');
    setDistanceTraveled(0);
  }, []);

  const handleChangeLambda = useCallback((nextLambda: number) => {
    setLambda(nextLambda);
    setStatus('idle');
    setDistanceTraveled(0);
  }, []);

  const handlePlayPause = useCallback(() => {
    if (status === 'playing') {
      setStatus('paused');
    } else if (status === 'completed') {
      setDistanceTraveled(0);
      setStatus('playing');
    } else {
      setStatus('playing');
    }
  }, [status]);

  const handleStepForward = useCallback(() => {
    setStatus((prevStatus) => {
      if (prevStatus === 'completed') return 'completed';
      return 'paused';
    });
    setDistanceTraveled((prev) => {
      const quarterStep = lambda / 4;
      const currentGrid = Math.floor((prev + 0.5) / quarterStep);
      const next = (currentGrid + 1) * quarterStep;
      if (next >= maxDistance) {
        setStatus('completed');
        return maxDistance;
      }
      return next;
    });
  }, [lambda, maxDistance]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'BUTTON')
      ) {
        return;
      }
      if (e.code === 'Space') {
        e.preventDefault();
        handlePlayPause();
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        handleStepForward();
      } else if (e.key === 'r' || e.key === 'R') {
        e.preventDefault();
        handleReset();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handlePlayPause, handleStepForward, handleReset]);

  const progressCycles = distanceTraveled / lambda;
  const progressPct = Math.min(100, Math.round((distanceTraveled / maxDistance) * 100));

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900">
      {/* Three-Zone Top Bar Contract */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-[1400px] mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-8">
          <a
            href="#top"
            className="text-base sm:text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
          >
            Principio di Huygens-Fresnel
          </a>

          <nav
            aria-label="Navigazione rapida"
            className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
          >
            <button
              type="button"
              onClick={() => handleSelectType('plane')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                config.type === 'plane' ? 'text-sky-700 underline underline-offset-4' : ''
              }`}
            >
              Onda piana
            </button>
            <button
              type="button"
              onClick={() => handleSelectType('spherical')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                config.type === 'spherical' ? 'text-sky-700 underline underline-offset-4' : ''
              }`}
            >
              Onda sferica
            </button>
            <button
              type="button"
              onClick={() => handleSelectType('bezier')}
              className={`hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                config.type === 'bezier' ? 'text-sky-700 underline underline-offset-4' : ''
              }`}
            >
              Curva di Bézier
            </button>
            <a
              href="#sintesi-teorica"
              className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
            >
              Sintesi teorica
            </a>
          </nav>

          <div className="flex items-center shrink-0">
            <button
              type="button"
              onClick={handleReset}
              className="px-4 py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Ripristina tavola
            </button>
          </div>
        </div>
      </header>

      {/* Main Two-Zone Interactive Sandbox */}
      <main id="top" className="flex-1 max-w-[1400px] w-full mx-auto px-4 sm:px-6 py-6 space-y-8">
        <div className="space-y-2 max-w-3xl">
          <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-slate-900 text-balance">
            Propagazione di un&apos;onda meccanica in un mezzo bidimensionale
          </h1>
          <p className="text-sm sm:text-base text-slate-600 leading-relaxed">
            Osserva come ogni punto del fronte d&apos;onda generi onde circolari elementari il cui inviluppo forma il nuovo fronte avanzante a distanza <span className="font-mono font-medium text-slate-800">λ</span>.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left Stage + Evolution Control Bar directly below (~67% width on desktop) */}
          <div className="lg:col-span-8 flex flex-col gap-3">
            <SimulationCanvas
              config={config}
              slit={slit}
              lambda={lambda}
              distanceTraveled={distanceTraveled}
              isIdle={status === 'idle' && distanceTraveled === 0}
              showRays={showRays}
              showDimensions={showDimensions}
              showLegend={showLegend}
              onUpdateBezierPoint={handleUpdateBezierPoint}
            />

            {/* Evolution Transport Bar directly beneath the simulation plane */}
            <div className="bg-white border border-slate-200 rounded-xl px-4 py-3 flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handlePlayPause}
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-sky-600 hover:bg-sky-700 active:bg-sky-800 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
                >
                  {status === 'playing' ? (
                    <>
                      <Pause className="w-4 h-4" />
                      <span>Pausa</span>
                    </>
                  ) : status === 'completed' ? (
                    <>
                      <RotateCcw className="w-4 h-4" />
                      <span>Ricomincia</span>
                    </>
                  ) : (
                    <>
                      <Play className="w-4 h-4" />
                      <span>{status === 'paused' ? 'Riprendi' : 'Avvia'}</span>
                    </>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleStepForward}
                  disabled={status === 'completed'}
                  title="Avanza di un quarto di lunghezza d'onda (+λ/4)"
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 text-sm font-medium text-slate-800 bg-slate-100 hover:bg-slate-200 disabled:opacity-45 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <StepForward className="w-4 h-4" />
                  <span>Avanza +λ/4</span>
                </button>

                <button
                  type="button"
                  onClick={handleReset}
                  disabled={distanceTraveled === 0 && status === 'idle'}
                  title="Ripristina allo stato iniziale"
                  className="inline-flex items-center justify-center gap-1.5 px-3.5 py-2.5 text-sm font-medium text-slate-700 bg-white border border-slate-200 hover:bg-slate-50 disabled:opacity-45 disabled:cursor-not-allowed rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  aria-label="Ripristina simulazione"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span className="hidden sm:inline">Ripristina</span>
                </button>
              </div>

              <div className="flex-1 min-w-[190px] max-w-xs space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-slate-600">Avanzamento</span>
                  <span className="font-mono tabular-nums font-medium text-slate-900">
                    {progressCycles.toFixed(2).replace('.', ',')} λ ({formatCm(distanceTraveled)} cm)
                  </span>
                </div>
                <div className="w-full h-1.5 bg-slate-100 rounded-full overflow-hidden">
                  <div
                    className="h-full bg-sky-600 transition-[width] duration-75"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Right Control & Didactic Deck (~33% width on desktop) */}
          <div className="lg:col-span-4 flex flex-col">
            <ControlDeck
              config={config}
              slit={slit}
              lambda={lambda}
              speedMultiplier={speedMultiplier}
              status={status}
              distanceTraveled={distanceTraveled}
              slitMinArrival={slitMinArrival}
              showRays={showRays}
              showDimensions={showDimensions}
              showLegend={showLegend}
              onSelectType={handleSelectType}
              onChangeSphericalRadius={handleChangeSphericalRadius}
              onSelectBezierPreset={handleSelectBezierPreset}
              onToggleFlipNormal={handleToggleFlipNormal}
              onToggleSlit={handleToggleSlit}
              onChangeSlitWidth={handleChangeSlitWidth}
              onChangeLambda={handleChangeLambda}
              onChangeSpeed={setSpeedMultiplier}
              onToggleRays={() => setShowRays((v) => !v)}
              onToggleDimensions={() => setShowDimensions((v) => !v)}
              onToggleLegend={() => setShowLegend((v) => !v)}
            />
          </div>
        </div>

        {/* Concise Three-Stage Reference Below the Fold */}
        <section
          id="sintesi-teorica"
          className="border-t border-slate-200 pt-8 pb-4 grid grid-cols-1 md:grid-cols-3 gap-8"
        >
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900">
              01. Sorgenti secondarie equispaziate
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Ogni punto raggiunto dalla perturbazione lungo il fronte iniziale diventa centro di emissione di onde circolari elementari che si propagano in avanti con velocità <span className="font-mono">v</span> costante.
            </p>
          </div>
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900">
              02. Costruzione dell&apos;inviluppo e diffrazione
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              La curva tangente alle onde secondarie forma il nuovo fronte d&apos;onda a distanza <span className="font-mono">λ = v·T</span>. In presenza di una fenditura di apertura <span className="font-mono">a</span>, le onde ai margini si incurvano nella zona d&apos;ombra generando la diffrazione.
            </p>
          </div>
          <div className="space-y-2">
            <h2 className="text-base font-semibold text-slate-900">
              03. Sequenza dei fronti d&apos;onda
            </h2>
            <p className="text-sm text-slate-600 leading-relaxed">
              Dopo le prime due iterazioni costruttive, la propagazione prosegue mostrando i soli fronti d&apos;onda equispaziati a passo <span className="font-mono">λ</span> attraverso il mezzo.
            </p>
          </div>
        </section>
      </main>
    </div>
  );
}
