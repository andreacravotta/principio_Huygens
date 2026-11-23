import React, { useEffect, useRef, useState, useCallback } from 'react';
import {
  BezierHandleKey,
  LOGICAL_HEIGHT,
  LOGICAL_WIDTH,
  PX_PER_CM,
  Point2D,
  SlitConfig,
  WavefrontConfig,
  WavefrontSample,
  computeDiffractedWavefront,
  computeSecondarySources,
  computeSlitArrivalProfile,
  computeSlitSecondarySources,
  computeWavefrontAtDistance,
  computeWaveletTangentPoints,
  getSlitBounds,
  hitTestBezierHandle,
  sampleInitialWavefront,
} from '../engine/huygensGeometry';

interface SimulationCanvasProps {
  config: WavefrontConfig;
  slit: SlitConfig;
  lambda: number;
  distanceTraveled: number;
  isIdle: boolean;
  showRays: boolean;
  showDimensions: boolean;
  showLegend: boolean;
  onUpdateBezierPoint: (key: BezierHandleKey, nextPoint: Point2D) => void;
}

interface ViewportTransform {
  scale: number;
  offsetX: number;
  offsetY: number;
}

function drawArrowhead(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  angle: number,
  size: number
) {
  ctx.save();
  ctx.translate(x, y);
  ctx.rotate(angle);
  ctx.beginPath();
  ctx.moveTo(0, 0);
  ctx.lineTo(-size, -size * 0.45);
  ctx.lineTo(-size * 0.78, 0);
  ctx.lineTo(-size, size * 0.45);
  ctx.closePath();
  ctx.fill();
  ctx.restore();
}

function drawCurvePolyline(
  ctx: CanvasRenderingContext2D,
  points: WavefrontSample[]
) {
  if (points.length < 2) return;
  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);
  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }
  ctx.stroke();
}

export const SimulationCanvas: React.FC<SimulationCanvasProps> = ({
  config,
  slit,
  lambda,
  distanceTraveled,
  isIdle,
  showRays,
  showDimensions,
  showLegend,
  onUpdateBezierPoint,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const transformRef = useRef<ViewportTransform>({ scale: 1, offsetX: 0, offsetY: 0 });

  const [canvasSize, setCanvasSize] = useState({ width: 960, height: 600 });
  const [hoveredHandle, setHoveredHandle] = useState<BezierHandleKey | null>(null);
  const [draggingHandle, setDraggingHandle] = useState<BezierHandleKey | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    const updateSize = () => {
      const rect = container.getBoundingClientRect();
      if (rect.width > 0 && rect.height > 0) {
        setCanvasSize({
          width: Math.floor(rect.width),
          height: Math.floor(rect.height),
        });
      }
    };

    updateSize();
    const observer = new ResizeObserver(updateSize);
    observer.observe(container);
    return () => observer.disconnect();
  }, []);

  const clientToLogical = useCallback((clientX: number, clientY: number): Point2D => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const { scale, offsetX, offsetY } = transformRef.current;
    return {
      x: (clientX - rect.left - offsetX) / scale,
      y: (clientY - rect.top - offsetY) / scale,
    };
  }, []);

  const canEditBezier = config.type === 'bezier' && isIdle;

  const handlePointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canEditBezier) return;
    const pt = clientToLogical(e.clientX, e.clientY);
    const hit = hitTestBezierHandle(config.bezier, pt, 20);
    if (hit) {
      e.currentTarget.setPointerCapture(e.pointerId);
      setDraggingHandle(hit);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!canEditBezier) {
      if (hoveredHandle !== null) setHoveredHandle(null);
      return;
    }

    const pt = clientToLogical(e.clientX, e.clientY);
    if (draggingHandle) {
      const maxX = slit.enabled ? Math.min(480, slit.x - 24) : 480;
      const clamped: Point2D = {
        x: Math.max(40, Math.min(maxX, pt.x)),
        y: Math.max(40, Math.min(LOGICAL_HEIGHT - 40, pt.y)),
      };
      onUpdateBezierPoint(draggingHandle, clamped);
      return;
    }

    const hit = hitTestBezierHandle(config.bezier, pt, 18);
    if (hit !== hoveredHandle) {
      setHoveredHandle(hit);
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (draggingHandle) {
      if (e.currentTarget.hasPointerCapture(e.pointerId)) {
        e.currentTarget.releasePointerCapture(e.pointerId);
      }
      setDraggingHandle(null);
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const dpr = window.devicePixelRatio || 1;
    const { width, height } = canvasSize;
    canvas.width = width * dpr;
    canvas.height = height * dpr;

    ctx.save();
    ctx.scale(dpr, dpr);

    const padding = 12;
    const availW = Math.max(100, width - padding * 2);
    const availH = Math.max(100, height - padding * 2);
    const scale = Math.min(availW / LOGICAL_WIDTH, availH / LOGICAL_HEIGHT);
    const offsetX = (width - LOGICAL_WIDTH * scale) / 2;
    const offsetY = (height - LOGICAL_HEIGHT * scale) / 2;
    transformRef.current = { scale, offsetX, offsetY };

    // 1. Background paper fill
    ctx.fillStyle = '#F8FAFC';
    ctx.fillRect(0, 0, width, height);

    ctx.translate(offsetX, offsetY);
    ctx.scale(scale, scale);

    // 2. Calibrated laboratory grid
    const minGridX = Math.floor(-offsetX / scale / PX_PER_CM) * PX_PER_CM;
    const maxGridX = Math.ceil((width - offsetX) / scale / PX_PER_CM) * PX_PER_CM;
    const minGridY = Math.floor(-offsetY / scale / PX_PER_CM) * PX_PER_CM;
    const maxGridY = Math.ceil((height - offsetY) / scale / PX_PER_CM) * PX_PER_CM;

    ctx.lineWidth = 1 / scale;
    ctx.strokeStyle = '#EEF2F6';
    ctx.beginPath();
    for (let x = minGridX; x <= maxGridX; x += PX_PER_CM) {
      ctx.moveTo(x, minGridY);
      ctx.lineTo(x, maxGridY);
    }
    for (let y = minGridY; y <= maxGridY; y += PX_PER_CM) {
      ctx.moveTo(minGridX, y);
      ctx.lineTo(maxGridX, y);
    }
    ctx.stroke();

    ctx.strokeStyle = '#DDE5EE';
    ctx.beginPath();
    for (
      let x = Math.floor(minGridX / (5 * PX_PER_CM)) * 5 * PX_PER_CM;
      x <= maxGridX;
      x += 5 * PX_PER_CM
    ) {
      ctx.moveTo(x, minGridY);
      ctx.lineTo(x, maxGridY);
    }
    for (
      let y = Math.floor(minGridY / (5 * PX_PER_CM)) * 5 * PX_PER_CM;
      y <= maxGridY;
      y += 5 * PX_PER_CM
    ) {
      ctx.moveTo(minGridX, y);
      ctx.lineTo(maxGridX, y);
    }
    ctx.stroke();

    const baseSamples = sampleInitialWavefront(config, 360);
    const baseEnvelope = computeWavefrontAtDistance(baseSamples, config, 0);
    const epsilon = 1e-4;

    if (!slit.enabled) {
      // ================================================================
      // UNOBSTRUCTED 2D MEDIUM PROPAGATION
      // ================================================================
      const rawIter = Math.floor((distanceTraveled + epsilon) / lambda);
      const isExactBoundary =
        distanceTraveled > epsilon && Math.abs(distanceTraveled - rawIter * lambda) < 0.35;
      const completedCount = isExactBoundary ? rawIter : Math.floor(distanceTraveled / lambda);
      const phaseDist = distanceTraveled - Math.floor(distanceTraveled / lambda) * lambda;
      const phaseRatio = phaseDist / lambda;
      const inDetailedPhase = distanceTraveled < 2 * lambda - 0.35;

      // Optional normal rays
      if (showRays) {
        const raySources = computeSecondarySources(baseEnvelope, Math.max(lambda, 75));
        const rayLength = Math.max(distanceTraveled + 44, 65);
        ctx.save();
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.36)';
        ctx.fillStyle = 'rgba(100, 116, 139, 0.55)';
        ctx.lineWidth = 1.25;
        ctx.setLineDash([4, 4]);

        for (const src of raySources) {
          const endX = src.x + rayLength * src.nx;
          const endY = src.y + rayLength * src.ny;
          ctx.beginPath();
          ctx.moveTo(src.x, src.y);
          ctx.lineTo(endX, endY);
          ctx.stroke();

          ctx.setLineDash([]);
          drawArrowhead(ctx, endX, endY, Math.atan2(src.ny, src.nx), 7);
          ctx.setLineDash([4, 4]);
        }
        ctx.restore();
      }

      // Deposited permanent wavefronts at k·λ
      for (let k = 0; k <= completedCount; k++) {
        const dist = k * lambda;
        const wf = k === 0 ? baseEnvelope : computeWavefrontAtDistance(baseSamples, config, dist);
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = k === 0 ? '#0F172A' : '#0284C7';
        ctx.lineWidth = k === 0 ? 3 : 2.6;
        drawCurvePolyline(ctx, wf.points);

        if (showDimensions && wf.points.length > 0) {
          const topPt = wf.points[0];
          ctx.font = '500 11px "IBM Plex Mono", monospace';
          ctx.fillStyle = k === 0 ? '#334155' : '#0369A1';
          ctx.textAlign = 'center';
          const label = k === 0 ? 'Γ₀' : k === 1 ? 'λ' : `${k}λ`;
          ctx.fillText(label, topPt.x, topPt.y - 11);
        }
        ctx.restore();
      }

      // First 2 iterations: secondary sources + circular wavelets + emerging envelope
      if (inDetailedPhase) {
        const sourceIter = Math.floor(distanceTraveled / lambda);
        const sourceBaseDist = sourceIter * lambda;
        const sourceWf =
          sourceIter === 0
            ? baseEnvelope
            : computeWavefrontAtDistance(baseSamples, config, sourceBaseDist);
        const sources = computeSecondarySources(sourceWf, lambda);

        if (showDimensions && sources.length >= 2) {
          const s0 = sources[0];
          const s1 = sources[1];
          const ax = s0.x - s0.nx * 14;
          const ay = s0.y - s0.ny * 14;
          const bx = s1.x - s0.nx * 14;
          const by = s1.y - s0.ny * 14;
          ctx.save();
          ctx.strokeStyle = '#B45309';
          ctx.lineWidth = 1.25;
          ctx.beginPath();
          ctx.moveTo(s0.x, s0.y);
          ctx.lineTo(ax, ay);
          ctx.moveTo(s1.x, s1.y);
          ctx.lineTo(bx, by);
          ctx.moveTo(ax, ay);
          ctx.lineTo(bx, by);
          ctx.stroke();

          ctx.font = '600 11px "IBM Plex Mono", monospace';
          ctx.fillStyle = '#B45309';
          ctx.textAlign = 'right';
          ctx.textBaseline = 'middle';
          ctx.fillText('λ/2', (ax + bx) / 2 - 5, (ay + by) / 2);
          ctx.restore();
        }

        if (phaseDist > 0.5) {
          const waveletRadius = phaseDist;
          for (const src of sources) {
            const normalAngle = Math.atan2(src.ny, src.nx);
            ctx.save();
            ctx.beginPath();
            ctx.arc(src.x, src.y, waveletRadius, 0, Math.PI * 2);
            ctx.strokeStyle = 'rgba(217, 119, 6, 0.16)';
            ctx.lineWidth = 1;
            ctx.stroke();

            ctx.beginPath();
            ctx.arc(
              src.x,
              src.y,
              waveletRadius,
              normalAngle - Math.PI * 0.56,
              normalAngle + Math.PI * 0.56
            );
            ctx.strokeStyle = 'rgba(217, 119, 6, 0.82)';
            ctx.lineWidth = 1.75;
            ctx.stroke();
            ctx.restore();
          }

          if (phaseRatio >= 0.22) {
            const fadeProgress = Math.min(1, (phaseRatio - 0.22) / 0.2);
            const advancingEnv = computeWavefrontAtDistance(baseSamples, config, distanceTraveled);

            ctx.save();
            ctx.globalAlpha = fadeProgress;
            ctx.strokeStyle = '#059669';
            ctx.lineWidth = 3.2;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            drawCurvePolyline(ctx, advancingEnv.points);

            const tangentPts = computeWaveletTangentPoints(
              sources,
              baseSamples,
              sourceBaseDist,
              waveletRadius
            );
            for (const tp of tangentPts) {
              ctx.fillStyle = '#059669';
              ctx.beginPath();
              ctx.arc(tp.x, tp.y, 3.3, 0, Math.PI * 2);
              ctx.fill();
              ctx.fillStyle = '#FFFFFF';
              ctx.beginPath();
              ctx.arc(tp.x, tp.y, 1.4, 0, Math.PI * 2);
              ctx.fill();
            }
            ctx.restore();
          }
        }

        for (const src of sources) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(src.x, src.y, 4.6, 0, Math.PI * 2);
          ctx.fillStyle = '#D97706';
          ctx.fill();
          ctx.lineWidth = 1.6;
          ctx.strokeStyle = '#FFFFFF';
          ctx.stroke();
          ctx.restore();
        }
      } else if (!isExactBoundary && phaseDist > 0.5) {
        const leadingEnv = computeWavefrontAtDistance(baseSamples, config, distanceTraveled);
        ctx.save();
        ctx.strokeStyle = '#0EA5E9';
        ctx.lineWidth = 2.6;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        drawCurvePolyline(ctx, leadingEnv.points);
        ctx.restore();
      }

      // λ dimension arrow
      if (showDimensions && completedCount >= 1) {
        const wf0 = baseEnvelope;
        const wf1 = computeWavefrontAtDistance(baseSamples, config, lambda);
        if (wf0.points.length > 0 && wf1.points.length > 0) {
          const idx = Math.floor(wf0.points.length * 0.85);
          const p0 = wf0.points[idx];
          const p1 = wf1.points[Math.min(idx, wf1.points.length - 1)];
          const midX = (p0.x + p1.x) / 2;
          const midY = (p0.y + p1.y) / 2;
          const angle = Math.atan2(p1.y - p0.y, p1.x - p0.x);

          ctx.save();
          ctx.strokeStyle = '#0369A1';
          ctx.fillStyle = '#0369A1';
          ctx.lineWidth = 1.4;
          ctx.beginPath();
          ctx.moveTo(p0.x, p0.y);
          ctx.lineTo(p1.x, p1.y);
          ctx.stroke();
          drawArrowhead(ctx, p1.x, p1.y, angle, 6.5);
          drawArrowhead(ctx, p0.x, p0.y, angle + Math.PI, 6.5);

          ctx.font = '600 12px "IBM Plex Mono", monospace';
          const textW = ctx.measureText('λ').width + 8;
          ctx.fillStyle = 'rgba(248, 250, 252, 0.92)';
          ctx.fillRect(midX - textW / 2, midY - 19, textW, 15);
          ctx.fillStyle = '#0369A1';
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.fillText('λ', midX, midY - 11.5);
          ctx.restore();
        }
      }
    } else {
      // ================================================================
      // SLIT DIFFRACTION MODE (OSTACOLO CON FENDITURA)
      // ================================================================
      const { x: slitX, yTop, yBottom } = getSlitBounds(slit);
      const { samples: apertureProfile, minArrival } = computeSlitArrivalProfile(
        baseSamples,
        slit
      );
      const dPast = Math.max(0, distanceTraveled - minArrival);
      const hasReachedSlit = distanceTraveled > minArrival + 0.5;

      // A. Left Half-Plane (Incident region x <= slitX)
      ctx.save();
      ctx.beginPath();
      ctx.rect(-500, -500, slitX + 500, LOGICAL_HEIGHT + 1000);
      ctx.clip();

      if (showRays) {
        const raySources = computeSecondarySources(baseEnvelope, Math.max(lambda, 75));
        const rayLength = Math.max(distanceTraveled + 40, 60);
        ctx.save();
        ctx.strokeStyle = 'rgba(100, 116, 139, 0.34)';
        ctx.fillStyle = 'rgba(100, 116, 139, 0.52)';
        ctx.lineWidth = 1.25;
        ctx.setLineDash([4, 4]);
        for (const src of raySources) {
          const endX = src.x + rayLength * src.nx;
          const endY = src.y + rayLength * src.ny;
          ctx.beginPath();
          ctx.moveTo(src.x, src.y);
          ctx.lineTo(endX, endY);
          ctx.stroke();
        }
        ctx.restore();
      }

      // Incident deposited wavefronts up to distanceTraveled
      const incidentCount = Math.floor((distanceTraveled + epsilon) / lambda);
      for (let k = 0; k <= incidentCount; k++) {
        const wf = k === 0 ? baseEnvelope : computeWavefrontAtDistance(baseSamples, config, k * lambda);
        ctx.save();
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.strokeStyle = k === 0 ? '#0F172A' : '#0284C7';
        ctx.lineWidth = k === 0 ? 3 : 2.5;
        drawCurvePolyline(ctx, wf.points);
        ctx.restore();
      }

      // Incident advancing wavefront & wavelets before reaching the slit
      if (!hasReachedSlit) {
        const incIter = Math.floor(distanceTraveled / lambda);
        const incPhaseDist = distanceTraveled - incIter * lambda;
        const incPhaseRatio = incPhaseDist / lambda;

        if (incIter < 2) {
          const incSourceWf =
            incIter === 0
              ? baseEnvelope
              : computeWavefrontAtDistance(baseSamples, config, incIter * lambda);
          const incSources = computeSecondarySources(incSourceWf, lambda);

          if (incPhaseDist > 0.5) {
            for (const src of incSources) {
              const normalAngle = Math.atan2(src.ny, src.nx);
              ctx.save();
              ctx.beginPath();
              ctx.arc(
                src.x,
                src.y,
                incPhaseDist,
                normalAngle - Math.PI * 0.56,
                normalAngle + Math.PI * 0.56
              );
              ctx.strokeStyle = 'rgba(217, 119, 6, 0.78)';
              ctx.lineWidth = 1.7;
              ctx.stroke();
              ctx.restore();
            }

            if (incPhaseRatio >= 0.22) {
              const fade = Math.min(1, (incPhaseRatio - 0.22) / 0.2);
              const adv = computeWavefrontAtDistance(baseSamples, config, distanceTraveled);
              ctx.save();
              ctx.globalAlpha = fade;
              ctx.strokeStyle = '#059669';
              ctx.lineWidth = 3;
              drawCurvePolyline(ctx, adv.points);
              ctx.restore();
            }
          }

          for (const src of incSources) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(src.x, src.y, 4.4, 0, Math.PI * 2);
            ctx.fillStyle = '#D97706';
            ctx.fill();
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#FFFFFF';
            ctx.stroke();
            ctx.restore();
          }
        } else if (incPhaseDist > 0.5) {
          const adv = computeWavefrontAtDistance(baseSamples, config, distanceTraveled);
          ctx.save();
          ctx.strokeStyle = '#0EA5E9';
          ctx.lineWidth = 2.5;
          drawCurvePolyline(ctx, adv.points);
          ctx.restore();
        }
      }
      ctx.restore(); // End left clip

      // B. Right Half-Plane (Diffracted region x >= slitX)
      if (hasReachedSlit) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(slitX, -500, LOGICAL_WIDTH + 500, LOGICAL_HEIGHT + 1000);
        ctx.clip();

        // Optional diffraction rays fanning from aperture & edges
        if (showRays) {
          ctx.save();
          ctx.strokeStyle = 'rgba(100, 116, 139, 0.32)';
          ctx.fillStyle = 'rgba(100, 116, 139, 0.55)';
          ctx.lineWidth = 1.2;
          ctx.setLineDash([4, 4]);
          const rayLen = Math.max(dPast + 36, 60);
          const edgeAnglesTop = [-0.85, -0.42, 0];
          const edgeAnglesBot = [0, 0.42, 0.85];
          for (const ang of edgeAnglesTop) {
            const ex = slitX + rayLen * Math.cos(ang);
            const ey = yTop + rayLen * Math.sin(ang);
            ctx.beginPath();
            ctx.moveTo(slitX, yTop);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.setLineDash([]);
            drawArrowhead(ctx, ex, ey, ang, 6.5);
            ctx.setLineDash([4, 4]);
          }
          for (const ang of edgeAnglesBot) {
            const ex = slitX + rayLen * Math.cos(ang);
            const ey = yBottom + rayLen * Math.sin(ang);
            ctx.beginPath();
            ctx.moveTo(slitX, yBottom);
            ctx.lineTo(ex, ey);
            ctx.stroke();
            ctx.setLineDash([]);
            drawArrowhead(ctx, ex, ey, ang, 6.5);
            ctx.setLineDash([4, 4]);
          }
          ctx.restore();
        }

        const pastRawIter = Math.floor((dPast + epsilon) / lambda);
        const pastExact =
          dPast > epsilon && Math.abs(dPast - pastRawIter * lambda) < 0.35;
        const pastCompleted = pastExact ? pastRawIter : Math.floor(dPast / lambda);
        const pastPhaseDist = dPast - Math.floor(dPast / lambda) * lambda;
        const pastPhaseRatio = pastPhaseDist / lambda;
        const inSlitDetailedPhase = dPast < 2 * lambda - 0.35;

        // Deposited permanent diffracted wavefronts at minArrival + m·λ (m >= 1)
        for (let m = 1; m <= pastCompleted; m++) {
          const wf = computeDiffractedWavefront(slit, apertureProfile, minArrival + m * lambda);
          if (wf.points.length >= 2) {
            ctx.save();
            ctx.strokeStyle = '#0284C7';
            ctx.lineWidth = 2.6;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            drawCurvePolyline(ctx, wf.points);

            if (showDimensions) {
              const midPt = wf.points[Math.floor(wf.points.length * 0.14)];
              ctx.font = '500 11px "IBM Plex Mono", monospace';
              ctx.fillStyle = '#0369A1';
              ctx.textAlign = 'left';
              ctx.fillText(m === 1 ? 'λ' : `${m}λ`, midPt.x + 6, midPt.y - 6);
            }
            ctx.restore();
          }
        }

        if (inSlitDetailedPhase) {
          const pastIter = Math.floor(dPast / lambda); // 0 or 1
          const pastSources =
            pastIter === 0
              ? computeSlitSecondarySources(slit, lambda)
              : computeSecondarySources(
                  computeDiffractedWavefront(slit, apertureProfile, minArrival + lambda),
                  lambda,
                  3
                );

          if (pastPhaseDist > 0.5) {
            for (const src of pastSources) {
              const normalAngle = Math.atan2(src.ny, src.nx);
              ctx.save();
              ctx.beginPath();
              ctx.arc(
                src.x,
                src.y,
                pastPhaseDist,
                normalAngle - Math.PI * 0.54,
                normalAngle + Math.PI * 0.54
              );
              ctx.strokeStyle = 'rgba(217, 119, 6, 0.8)';
              ctx.lineWidth = 1.7;
              ctx.stroke();
              ctx.restore();
            }

            if (pastPhaseRatio >= 0.2) {
              const fade = Math.min(1, (pastPhaseRatio - 0.2) / 0.2);
              const advDiff = computeDiffractedWavefront(slit, apertureProfile, distanceTraveled);
              if (advDiff.points.length >= 2) {
                ctx.save();
                ctx.globalAlpha = fade;
                ctx.strokeStyle = '#059669';
                ctx.lineWidth = 3.2;
                ctx.lineCap = 'round';
                ctx.lineJoin = 'round';
                drawCurvePolyline(ctx, advDiff.points);
                ctx.restore();
              }
            }
          }

          for (const src of pastSources) {
            ctx.save();
            ctx.beginPath();
            ctx.arc(src.x, src.y, 4.6, 0, Math.PI * 2);
            ctx.fillStyle = '#D97706';
            ctx.fill();
            ctx.lineWidth = 1.6;
            ctx.strokeStyle = '#FFFFFF';
            ctx.stroke();
            ctx.restore();
          }
        } else if (!pastExact && pastPhaseDist > 0.5) {
          const leadingDiff = computeDiffractedWavefront(slit, apertureProfile, distanceTraveled);
          if (leadingDiff.points.length >= 2) {
            ctx.save();
            ctx.strokeStyle = '#0EA5E9';
            ctx.lineWidth = 2.6;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            drawCurvePolyline(ctx, leadingDiff.points);
            ctx.restore();
          }
        }

        ctx.restore(); // End right clip
      }

      // C. Draw Opaque Barrier Wall & Slit Aperture Indicator
      ctx.save();
      const wallW = 8;
      const wallLeft = slitX - wallW / 2;

      ctx.fillStyle = '#1E293B';
      ctx.fillRect(wallLeft, 16, wallW, Math.max(0, yTop - 16));
      ctx.fillRect(wallLeft, yBottom, wallW, Math.max(0, LOGICAL_HEIGHT - 16 - yBottom));

      // Crisp edge caps at the slit lips
      ctx.fillStyle = '#0F172A';
      ctx.fillRect(wallLeft - 1, yTop - 3, wallW + 2, 3);
      ctx.fillRect(wallLeft - 1, yBottom, wallW + 2, 3);

      // Slit width callout "a"
      if (showDimensions) {
        const calloutX = slitX - 18;
        ctx.strokeStyle = '#475569';
        ctx.fillStyle = '#475569';
        ctx.lineWidth = 1.25;
        ctx.beginPath();
        ctx.moveTo(calloutX - 4, yTop);
        ctx.lineTo(calloutX + 4, yTop);
        ctx.moveTo(calloutX - 4, yBottom);
        ctx.lineTo(calloutX + 4, yBottom);
        ctx.moveTo(calloutX, yTop);
        ctx.lineTo(calloutX, yBottom);
        ctx.stroke();

        ctx.font = '600 11px "IBM Plex Mono", monospace';
        ctx.textAlign = 'right';
        ctx.textBaseline = 'middle';
        ctx.fillText('a', calloutX - 6, (yTop + yBottom) / 2);
      }
      ctx.restore();
    }

    // 8. Direction arrows on Γ₀ when idle
    if (isIdle && baseEnvelope.points.length > 10) {
      const indices = [
        Math.floor(baseEnvelope.points.length * 0.2),
        Math.floor(baseEnvelope.points.length * 0.5),
        Math.floor(baseEnvelope.points.length * 0.8),
      ];
      ctx.save();
      ctx.strokeStyle = '#0284C7';
      ctx.fillStyle = '#0284C7';
      ctx.lineWidth = 1.6;
      for (const idx of indices) {
        const pt = baseEnvelope.points[idx];
        const tipX = pt.x + 28 * pt.nx;
        const tipY = pt.y + 28 * pt.ny;
        ctx.beginPath();
        ctx.moveTo(pt.x + 5 * pt.nx, pt.y + 5 * pt.ny);
        ctx.lineTo(tipX, tipY);
        ctx.stroke();
        drawArrowhead(ctx, tipX, tipY, Math.atan2(pt.ny, pt.nx), 7);
      }
      ctx.restore();
    }

    // 9. Interactive Cubic Bézier Control Handles
    if (canEditBezier) {
      const { p0, p1, p2, p3 } = config.bezier;

      ctx.save();
      ctx.strokeStyle = '#64748B';
      ctx.lineWidth = 1.3;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      ctx.lineTo(p1.x, p1.y);
      ctx.moveTo(p3.x, p3.y);
      ctx.lineTo(p2.x, p2.y);
      ctx.stroke();
      ctx.setLineDash([]);

      const handles: { key: BezierHandleKey; pt: Point2D; label: string; isAnchor: boolean }[] = [
        { key: 'p0', pt: p0, label: 'P₀', isAnchor: true },
        { key: 'p1', pt: p1, label: 'P₁', isAnchor: false },
        { key: 'p2', pt: p2, label: 'P₂', isAnchor: false },
        { key: 'p3', pt: p3, label: 'P₃', isAnchor: true },
      ];

      for (const h of handles) {
        const isActive = draggingHandle === h.key || hoveredHandle === h.key;
        const radius = isActive ? 8.5 : 6.5;

        ctx.beginPath();
        ctx.arc(h.pt.x, h.pt.y, radius, 0, Math.PI * 2);
        ctx.fillStyle = h.isAnchor ? '#0F172A' : '#FFFFFF';
        ctx.fill();
        ctx.lineWidth = 2.4;
        ctx.strokeStyle = isActive ? '#0284C7' : h.isAnchor ? '#FFFFFF' : '#0284C7';
        ctx.stroke();

        if (isActive) {
          ctx.beginPath();
          ctx.arc(h.pt.x, h.pt.y, radius + 4, 0, Math.PI * 2);
          ctx.strokeStyle = 'rgba(2, 132, 199, 0.3)';
          ctx.lineWidth = 2;
          ctx.stroke();
        }

        ctx.font = '600 11px "IBM Plex Mono", monospace';
        ctx.fillStyle = '#0F172A';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'middle';
        ctx.fillText(h.label, h.pt.x + 12, h.pt.y - 10);
      }
      ctx.restore();
    }

    // 10. Calibrated 5 cm Scale Bar
    ctx.save();
    const scaleBarX = LOGICAL_WIDTH - 132;
    const scaleBarY = LOGICAL_HEIGHT - 22;
    const barLen = 5 * PX_PER_CM;
    ctx.strokeStyle = '#64748B';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo(scaleBarX, scaleBarY - 4);
    ctx.lineTo(scaleBarX, scaleBarY);
    ctx.lineTo(scaleBarX + barLen, scaleBarY);
    ctx.lineTo(scaleBarX + barLen, scaleBarY - 4);
    ctx.stroke();

    ctx.font = '500 11px "IBM Plex Mono", monospace';
    ctx.fillStyle = '#475569';
    ctx.textAlign = 'center';
    ctx.fillText('5,0 cm (scala 2D)', scaleBarX + barLen / 2, scaleBarY - 9);
    ctx.restore();

    ctx.restore();
  }, [
    canvasSize,
    config,
    slit,
    lambda,
    distanceTraveled,
    isIdle,
    canEditBezier,
    showRays,
    showDimensions,
    hoveredHandle,
    draggingHandle,
  ]);

  const cursorClass = canEditBezier
    ? draggingHandle
      ? 'cursor-grabbing'
      : hoveredHandle
        ? 'cursor-grab'
        : 'cursor-default'
    : 'cursor-default';

  return (
    <div
      ref={containerRef}
      className="relative w-full h-full min-h-[420px] lg:min-h-[540px] bg-slate-50 rounded-xl border border-slate-200 overflow-hidden select-none"
    >
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
        className={`w-full h-full block touch-none ${cursorClass}`}
      />

      {canEditBezier && (
        <div className="pointer-events-none absolute top-3.5 left-3.5 bg-white/92 backdrop-blur-xs border border-slate-200 rounded-lg px-3 py-1.5 text-xs text-slate-700">
          Trascina i punti <span className="font-mono font-medium text-slate-900">P₀–P₃</span> per modellare il fronte d&apos;onda iniziale
        </div>
      )}

      {showLegend && (
        <div className="pointer-events-none absolute bottom-3.5 left-3.5 bg-white/94 backdrop-blur-xs border border-slate-200 rounded-lg px-3.5 py-2.5 text-xs text-slate-700 flex flex-wrap items-center gap-x-4 gap-y-1.5 max-w-[92%]">
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="inline-block w-4 h-0.5 bg-slate-900" />
            <span>Fronte iniziale Γ₀</span>
          </div>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="inline-block w-2.5 h-2.5 rounded-full bg-amber-600 border border-white ring-1 ring-amber-600/40" />
            <span>Sorgenti secondarie</span>
          </div>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="inline-block w-4 h-0.5 bg-emerald-600" />
            <span>Inviluppo emergente</span>
          </div>
          <div className="flex items-center gap-2 whitespace-nowrap">
            <span className="inline-block w-4 h-0.5 bg-sky-600" />
            <span>Fronti permanenti (passo λ)</span>
          </div>
        </div>
      )}
    </div>
  );
};
