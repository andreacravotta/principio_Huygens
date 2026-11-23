import React from 'react';
import { ArrowLeftRight } from 'lucide-react';
import {
  DEFAULT_BEZIER_PRESETS,
  PX_PER_CM,
  SlitConfig,
  WavefrontConfig,
  WavefrontType,
} from '../engine/huygensGeometry';

export type SimulationStatus = 'idle' | 'playing' | 'paused' | 'completed';

interface ControlDeckProps {
  config: WavefrontConfig;
  slit: SlitConfig;
  lambda: number;
  speedMultiplier: number;
  status: SimulationStatus;
  distanceTraveled: number;
  slitMinArrival: number;
  showRays: boolean;
  showDimensions: boolean;
  showLegend: boolean;
  onSelectType: (type: WavefrontType) => void;
  onChangeSphericalRadius: (radiusPx: number) => void;
  onSelectBezierPreset: (presetKey: keyof typeof DEFAULT_BEZIER_PRESETS) => void;
  onToggleFlipNormal: () => void;
  onToggleSlit: () => void;
  onChangeSlitWidth: (widthPx: number) => void;
  onChangeLambda: (lambdaPx: number) => void;
  onChangeSpeed: (speed: number) => void;
  onToggleRays: () => void;
  onToggleDimensions: () => void;
  onToggleLegend: () => void;
}

interface DidacticStageInfo {
  stageLabel: string;
  title: string;
  description: string;
}

function getDidacticStageInfo(
  status: SimulationStatus,
  distanceTraveled: number,
  lambda: number,
  slit: SlitConfig,
  slitMinArrival: number
): DidacticStageInfo {
  if (status === 'completed') {
    return {
      stageLabel: 'Propagazione completata',
      title: slit.enabled
        ? 'Onda diffratta oltre la fenditura'
        : 'Treno di fronti d’onda equispaziati',
      description: slit.enabled
        ? 'Oltre l’apertura, i fronti d’onda si incurvano nella zona d’ombra geometrica con un’apertura angolare legata al rapporto λ/a.'
        : 'L’onda ha attraversato il mezzo lasciando tracciati i fronti successivi a distanza costante λ, ciascuno formato dall’inviluppo del precedente.',
    };
  }

  if (distanceTraveled <= 0.5) {
    return {
      stageLabel: 'Stato iniziale · t = 0',
      title: 'Sorgenti secondarie sul fronte iniziale',
      description: slit.enabled
        ? 'Sul fronte iniziale sono disposte sorgenti a passo λ/2. Al contatto con la fenditura di larghezza a, solo i punti dell’apertura irradieranno oltre la barriera.'
        : 'Sul fronte d’onda Γ₀ sono individuati punti equispaziati a distanza λ/2. Ciascun punto si comporta come sorgente puntiforme di un’onda circolare elementare.',
    };
  }

  if (slit.enabled) {
    if (distanceTraveled <= slitMinArrival + 0.5) {
      return {
        stageLabel: 'Incidenza sull’ostacolo',
        title: 'Avvicinamento del fronte alla fenditura',
        description:
          'L’onda si propaga verso la barriera opaca. I tratti bloccati dal muro verranno assorbiti mentre l’apertura lascerà passare le sorgenti interne.',
      };
    }

    const dPast = distanceTraveled - slitMinArrival;
    const pastIter = Math.floor(dPast / lambda);
    const pastPhase = (dPast - pastIter * lambda) / lambda;

    if (pastIter === 0) {
      return {
        stageLabel: 'Diffrazione · Iterazione 1 oltre la fenditura',
        title: pastPhase < 0.2 ? 'Onde elementari dall’apertura' : 'Inviluppo diffratto circolare ai bordi',
        description:
          pastPhase < 0.2
            ? 'Le sorgenti secondarie presenti dentro la fenditura emettono onde circolari verso la regione a destra dell’ostacolo.'
            : 'Ai margini della fenditura mancano sorgenti laterali adiacenti: le onde circolari dei bordi si curvano nell’ombra formando il fronte diffratto.',
      };
    }

    if (pastIter === 1) {
      return {
        stageLabel: 'Diffrazione · Iterazione 2 oltre la fenditura',
        title: 'Secondo fronte d’onda diffratto',
        description:
          'Dal primo fronte diffratto a distanza λ partono nuove onde elementari che consolidano la curvatura circolare dell’onda oltre l’ostacolo.',
      };
    }

    return {
      stageLabel: 'Diffrazione · Fase continua oltre 2λ',
      title: 'Propagazione dei fronti diffratti a passo λ',
      description:
        'I fronti d’onda diffratti proseguono equispaziati a distanza λ. Riduci la larghezza a rispetto a λ per accentuare l’effetto circolare.',
    };
  }

  const iter = Math.floor(distanceTraveled / lambda);
  const phase = (distanceTraveled - iter * lambda) / lambda;

  if (iter === 0) {
    if (phase < 0.22) {
      return {
        stageLabel: 'Iterazione 1 di 2 · Espansione onde elementari',
        title: 'Emissione delle onde circolari secondarie',
        description:
          'Ogni sorgente sul fronte iniziale emette un’onda circolare bidimensionale che avanza nel mezzo isotropo con velocità uniforme v.',
      };
    }
    return {
      stageLabel: 'Iterazione 1 di 2 · Formazione dell’inviluppo',
      title: 'Comparsa del nuovo fronte d’onda',
      description:
        'L’inviluppo tangente a tutte le onde circolari (linea verde) ricostruisce la geometria del fronte d’onda originario che avanza nel mezzo.',
    };
  }

  if (iter === 1) {
    if (phase < 0.04) {
      return {
        stageLabel: 'Iterazione 2 di 2 · Fronte a distanza λ',
        title: 'Deposito del primo fronte d’onda',
        description:
          'Percorsa una lunghezza d’onda λ, le onde elementari del primo passo si arrestano e il fronte rimane fissato. I suoi punti diventano nuove sorgenti.',
      };
    }
    if (phase < 0.22) {
      return {
        stageLabel: 'Iterazione 2 di 2 · Nuove onde secondarie',
        title: 'Seconda costruzione di Huygens',
        description:
          'Le sorgenti equispaziate lungo il fronte a distanza λ emettono un secondo ciclo di onde circolari elementari verso destra.',
      };
    }
    return {
      stageLabel: 'Iterazione 2 di 2 · Secondo inviluppo',
      title: 'Avanzamento verso la distanza 2λ',
      description:
        'Anche in questo ciclo l’inviluppo comune delle onde elementari individua il fronte successivo, confermando la legge di propagazione.',
    };
  }

  return {
    stageLabel: 'Fase continua · Oltre 2λ',
    title: 'Propagazione dei soli fronti a passo λ',
    description:
      'Dopo le prime due iterazioni costruttive, la visualizzazione delle onde elementari si interrompe: restano visibili i soli fronti d’onda equispaziati a distanza λ.',
  };
}

function formatCm(px: number): string {
  return (px / PX_PER_CM).toFixed(2).replace('.', ',');
}

export const ControlDeck: React.FC<ControlDeckProps> = ({
  config,
  slit,
  lambda,
  speedMultiplier,
  status,
  distanceTraveled,
  slitMinArrival,
  showRays,
  showDimensions,
  showLegend,
  onSelectType,
  onChangeSphericalRadius,
  onSelectBezierPreset,
  onToggleFlipNormal,
  onToggleSlit,
  onChangeSlitWidth,
  onChangeLambda,
  onChangeSpeed,
  onToggleRays,
  onToggleDimensions,
  onToggleLegend,
}) => {
  const stageInfo = getDidacticStageInfo(
    status,
    distanceTraveled,
    lambda,
    slit,
    slitMinArrival
  );

  const wavefrontModes: { id: WavefrontType; label: string }[] = [
    { id: 'plane', label: 'Onda piana' },
    { id: 'spherical', label: 'Onda sferica' },
    { id: 'bezier', label: 'Curva di Bézier' },
  ];

  const ratioALambda = slit.width / lambda;

  return (
    <aside className="bg-white border border-slate-200 rounded-xl flex flex-col divide-y divide-slate-200">
      {/* 1. Initial Wavefront Geometry Selector */}
      <section className="p-5 space-y-4">
        <div className="flex items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold text-slate-900">
            Geometria del fronte iniziale
          </h2>
          <span className="text-xs text-slate-500">Mezzo 2D isotropo</span>
        </div>

        <div
          role="tablist"
          aria-label="Tipo di fronte d'onda iniziale"
          className="grid grid-cols-3 gap-1 p-1 bg-slate-100 rounded-lg"
        >
          {wavefrontModes.map((mode) => {
            const active = config.type === mode.id;
            return (
              <button
                key={mode.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => onSelectType(mode.id)}
                className={`px-2.5 py-2 text-xs font-medium rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  active
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {mode.label}
              </button>
            );
          })}
        </div>

        {config.type === 'plane' && (
          <p className="text-xs text-slate-600 leading-relaxed">
            Retta verticale sul lato sinistro con sorgenti secondarie allineate e normali parallele verso destra.
          </p>
        )}

        {config.type === 'spherical' && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="spherical-radius" className="font-medium text-slate-700">
                Raggio iniziale dell&apos;arco (R₀)
              </label>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {formatCm(config.sphericalRadius)} cm
              </span>
            </div>
            <input
              id="spherical-radius"
              type="range"
              min={90}
              max={320}
              step={10}
              value={config.sphericalRadius}
              onChange={(e) => onChangeSphericalRadius(Number(e.target.value))}
              className="lab-slider"
            />
            <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-500">
              <span>4,50 cm</span>
              <span>16,00 cm</span>
            </div>
          </div>
        )}

        {config.type === 'bezier' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-medium text-slate-700">Profili rapidi</span>
              <button
                type="button"
                onClick={onToggleFlipNormal}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Inverti il verso di propagazione delle normali"
              >
                <ArrowLeftRight className="w-3.5 h-3.5" />
                <span>Inverti verso</span>
              </button>
            </div>
            <div className="grid grid-cols-3 gap-2">
              {(Object.keys(DEFAULT_BEZIER_PRESETS) as (keyof typeof DEFAULT_BEZIER_PRESETS)[]).map(
                (key) => (
                  <button
                    key={key}
                    type="button"
                    onClick={() => onSelectBezierPreset(key)}
                    className="px-2.5 py-2 text-xs font-medium text-slate-700 bg-slate-50 hover:bg-slate-100 border border-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    {DEFAULT_BEZIER_PRESETS[key].label}
                  </button>
                )
              )}
            </div>
          </div>
        )}
      </section>

      {/* 2. Slit Obstacle (Fenditura per Diffrazione) */}
      <section className="p-5 space-y-3.5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-900">
              Ostacolo con fenditura
            </h2>
            <p className="text-xs text-slate-500">
              Mostra la diffrazione oltre un&apos;apertura
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={slit.enabled}
            onClick={onToggleSlit}
            className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600 ${
              slit.enabled ? 'bg-sky-600' : 'bg-slate-300'
            }`}
          >
            <span className="sr-only">Attiva ostacolo con fenditura</span>
            <span
              aria-hidden="true"
              className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow-xs transition duration-150 ${
                slit.enabled ? 'translate-x-5' : 'translate-x-0'
              }`}
            />
          </button>
        </div>

        {slit.enabled && (
          <div className="space-y-2 pt-1">
            <div className="flex items-center justify-between text-xs">
              <label htmlFor="slit-width-slider" className="font-medium text-slate-700">
                Larghezza apertura (a)
              </label>
              <span className="font-mono tabular-nums font-semibold text-slate-900">
                {formatCm(slit.width)} cm · a/λ = {ratioALambda.toFixed(2).replace('.', ',')}
              </span>
            </div>
            <input
              id="slit-width-slider"
              type="range"
              min={20}
              max={200}
              step={5}
              value={slit.width}
              onChange={(e) => onChangeSlitWidth(Number(e.target.value))}
              className="lab-slider"
            />
            <div className="flex justify-between text-[11px] font-mono tabular-nums text-slate-500">
              <span>1,00 cm (stretta)</span>
              <span>10,00 cm (ampia)</span>
            </div>
          </div>
        )}
      </section>

      {/* 3. Wave Parameters (λ and Speed) */}
      <section className="p-5 space-y-4">
        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="wavelength-slider" className="font-semibold text-slate-900">
              Lunghezza d&apos;onda (λ)
            </label>
            <span className="font-mono tabular-nums font-semibold text-sky-700">
              {formatCm(lambda)} cm
            </span>
          </div>
          <input
            id="wavelength-slider"
            type="range"
            min={50}
            max={150}
            step={5}
            value={lambda}
            onChange={(e) => onChangeLambda(Number(e.target.value))}
            className="lab-slider"
          />
          <div className="flex items-center justify-between text-[11px] font-mono tabular-nums text-slate-500">
            <span>2,50 cm</span>
            <span>Passo sorgenti λ/2 = {formatCm(lambda / 2)} cm</span>
            <span>7,50 cm</span>
          </div>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs">
            <label htmlFor="speed-slider" className="font-medium text-slate-700">
              Velocità di propagazione
            </label>
            <span className="font-mono tabular-nums font-semibold text-slate-900">
              {speedMultiplier.toFixed(1).replace('.', ',')}×
            </span>
          </div>
          <input
            id="speed-slider"
            type="range"
            min={0.4}
            max={2.0}
            step={0.2}
            value={speedMultiplier}
            onChange={(e) => onChangeSpeed(Number(e.target.value))}
            className="lab-slider"
          />
        </div>
      </section>

      {/* 4. Layer Visibility Options */}
      <section className="px-5 py-3.5 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs text-slate-700">
        <label className="inline-flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            checked={showRays}
            onChange={onToggleRays}
            className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
          />
          <span>Raggi normali</span>
        </label>
        <label className="inline-flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            checked={showDimensions}
            onChange={onToggleDimensions}
            className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
          />
          <span>Quote λ, λ/2 e a</span>
        </label>
        <label className="inline-flex items-center gap-2 cursor-pointer select-none whitespace-nowrap">
          <input
            type="checkbox"
            checked={showLegend}
            onChange={onToggleLegend}
            className="w-4 h-4 rounded border-slate-300 text-sky-600 focus:ring-sky-500 cursor-pointer"
          />
          <span>Legenda</span>
        </label>
      </section>

      {/* 5. Contextual Didactic Explanation */}
      <section className="p-5 bg-slate-50/60 rounded-b-xl space-y-1.5 mt-auto">
        <div className="text-xs font-medium text-sky-700">
          {stageInfo.stageLabel}
        </div>
        <h3 className="text-sm font-semibold text-slate-900">
          {stageInfo.title}
        </h3>
        <p className="text-xs text-slate-600 leading-relaxed">
          {stageInfo.description}
        </p>
      </section>
    </aside>
  );
};
