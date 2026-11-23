export type WavefrontType = 'plane' | 'spherical' | 'bezier';

export interface Point2D {
  x: number;
  y: number;
}

export interface WavefrontSample {
  x: number;
  y: number;
  nx: number;
  ny: number;
  s: number; // Cumulative arc length along the wavefront
}

export interface BezierControlPoints {
  p0: Point2D;
  p1: Point2D;
  p2: Point2D;
  p3: Point2D;
}

export interface SlitConfig {
  enabled: boolean;
  x: number; // Logical x position of the opaque barrier
  width: number; // Aperture height in logical px
}

export interface WavefrontConfig {
  type: WavefrontType;
  sphericalRadius: number; // Logical px
  bezier: BezierControlPoints;
  flipNormal: boolean;
}

export interface SecondarySource {
  x: number;
  y: number;
  nx: number;
  ny: number;
  s: number;
}

export interface EnvelopeResult {
  points: WavefrontSample[];
  totalLength: number;
}

export interface SlitApertureSample {
  y: number;
  arrivalDistance: number;
}

export const LOGICAL_WIDTH = 960;
export const LOGICAL_HEIGHT = 600;
export const PX_PER_CM = 20; // 1 cm = 20 logical px -> 48 cm x 30 cm lab sheet

export const DEFAULT_SLIT_CONFIG: SlitConfig = {
  enabled: false,
  x: 245,
  width: 60, // 3.00 cm default
};

export const DEFAULT_BEZIER_PRESETS: Record<
  's_wave' | 'converging' | 'diverging',
  { label: string; points: BezierControlPoints }
> = {
  s_wave: {
    label: 'Onda a S',
    points: {
      p0: { x: 145, y: 100 },
      p1: { x: 255, y: 205 },
      p2: { x: 65, y: 395 },
      p3: { x: 165, y: 500 },
    },
  },
  diverging: {
    label: 'Convessa',
    points: {
      p0: { x: 115, y: 105 },
      p1: { x: 245, y: 215 },
      p2: { x: 245, y: 385 },
      p3: { x: 115, y: 495 },
    },
  },
  converging: {
    label: 'Concava',
    points: {
      p0: { x: 215, y: 105 },
      p1: { x: 95, y: 225 },
      p2: { x: 95, y: 375 },
      p3: { x: 215, y: 495 },
    },
  },
};

function evaluateCubicBezier(b: BezierControlPoints, t: number): Point2D {
  const u = 1 - t;
  const tt = t * t;
  const uu = u * u;
  const uuu = uu * u;
  const ttt = tt * t;

  return {
    x:
      uuu * b.p0.x +
      3 * uu * t * b.p1.x +
      3 * u * tt * b.p2.x +
      ttt * b.p3.x,
    y:
      uuu * b.p0.y +
      3 * uu * t * b.p1.y +
      3 * u * tt * b.p2.y +
      ttt * b.p3.y,
  };
}

function evaluateCubicBezierTangent(b: BezierControlPoints, t: number): Point2D {
  const u = 1 - t;
  return {
    x:
      3 * u * u * (b.p1.x - b.p0.x) +
      6 * u * t * (b.p2.x - b.p1.x) +
      3 * t * t * (b.p3.x - b.p2.x),
    y:
      3 * u * u * (b.p1.y - b.p0.y) +
      6 * u * t * (b.p2.y - b.p1.y) +
      3 * t * t * (b.p3.y - b.p2.y),
  };
}

/**
 * Generates densely sampled points along the initial wavefront Γ₀ with
 * continuous unit normals and cumulative arc length.
 */
export function sampleInitialWavefront(
  config: WavefrontConfig,
  numSamples = 360
): WavefrontSample[] {
  const samples: WavefrontSample[] = [];
  const sign = config.flipNormal ? -1 : 1;

  if (config.type === 'plane') {
    const x0 = 120;
    const yStart = 85;
    const yEnd = 515;
    const length = yEnd - yStart;
    for (let i = 0; i <= numSamples; i++) {
      const frac = i / numSamples;
      const y = yStart + frac * length;
      samples.push({
        x: x0,
        y,
        nx: 1 * sign,
        ny: 0,
        s: frac * length,
      });
    }
    return samples;
  }

  if (config.type === 'spherical') {
    const R0 = Math.max(80, config.sphericalRadius);
    const apexX = 165;
    const centerX = apexX - R0;
    const centerY = LOGICAL_HEIGHT / 2;
    const maxVerticalHalfSpan = 215;
    const maxAngleByHeight = Math.asin(Math.min(0.95, maxVerticalHalfSpan / R0));
    const halfAngle = Math.min((60 * Math.PI) / 180, maxAngleByHeight);

    let cumulativeS = 0;
    let prevX = 0;
    let prevY = 0;

    for (let i = 0; i <= numSamples; i++) {
      const frac = i / numSamples;
      const theta = -halfAngle + frac * (2 * halfAngle);
      const cosT = Math.cos(theta);
      const sinT = Math.sin(theta);
      const x = centerX + R0 * cosT;
      const y = centerY + R0 * sinT;

      if (i > 0) {
        cumulativeS += Math.hypot(x - prevX, y - prevY);
      }
      prevX = x;
      prevY = y;

      samples.push({
        x,
        y,
        nx: cosT * sign,
        ny: sinT * sign,
        s: cumulativeS,
      });
    }
    return samples;
  }

  // Cubic Bézier mode
  const b = config.bezier;
  const chordDx = b.p3.x - b.p0.x;
  const chordDy = b.p3.y - b.p0.y;
  const chordNormalX = chordDy;
  const baseOrientation =
    chordNormalX >= 0 || (Math.abs(chordNormalX) < 1e-3 && chordDx <= 0) ? 1 : -1;

  let cumulativeS = 0;
  let prevPt: Point2D | null = null;
  let prevNormal: Point2D = { x: 1, y: 0 };

  for (let i = 0; i <= numSamples; i++) {
    const t = i / numSamples;
    const pt = evaluateCubicBezier(b, t);
    let tan = evaluateCubicBezierTangent(b, t);
    let tanLen = Math.hypot(tan.x, tan.y);

    if (tanLen < 1e-4) {
      const eps = 1e-3;
      const tFallback = Math.min(1, Math.max(0, t + (t < 0.5 ? eps : -eps)));
      tan = evaluateCubicBezierTangent(b, tFallback);
      tanLen = Math.hypot(tan.x, tan.y) || 1;
    }

    const tx = tan.x / tanLen;
    const ty = tan.y / tanLen;
    let nx = ty * baseOrientation * sign;
    let ny = -tx * baseOrientation * sign;

    if (i > 0 && nx * prevNormal.x + ny * prevNormal.y < -0.5) {
      nx = -nx;
      ny = -ny;
    }
    prevNormal = { x: nx, y: ny };

    if (prevPt) {
      cumulativeS += Math.hypot(pt.x - prevPt.x, pt.y - prevPt.y);
    }
    prevPt = pt;

    samples.push({
      x: pt.x,
      y: pt.y,
      nx,
      ny,
      s: cumulativeS,
    });
  }

  return samples;
}

/**
 * Computes the propagated wavefront (true Huygens outer envelope) at distance `d`
 * from the initial wavefront Γ₀ in an unobstructed medium.
 */
export function computeWavefrontAtDistance(
  baseSamples: WavefrontSample[],
  config: WavefrontConfig,
  d: number
): EnvelopeResult {
  if (d <= 1e-4) {
    const totalLength = baseSamples.length > 0 ? baseSamples[baseSamples.length - 1].s : 0;
    return { points: baseSamples, totalLength };
  }

  if (config.type === 'plane' || config.type === 'spherical') {
    const pts: WavefrontSample[] = [];
    let cumulativeS = 0;
    for (let i = 0; i < baseSamples.length; i++) {
      const src = baseSamples[i];
      const x = src.x + d * src.nx;
      const y = src.y + d * src.ny;
      if (i > 0) {
        cumulativeS += Math.hypot(x - pts[i - 1].x, y - pts[i - 1].y);
      }
      pts.push({
        x,
        y,
        nx: src.nx,
        ny: src.ny,
        s: cumulativeS,
      });
    }
    return { points: pts, totalLength: cumulativeS };
  }

  // General Huygens envelope with minimum-distance caustic pruning for Bézier curves
  const tolerance = 1.1;
  const minAllowedDistSq = Math.max(0, d - tolerance) * Math.max(0, d - tolerance);
  const candidates: WavefrontSample[] = [];

  for (let i = 0; i < baseSamples.length; i++) {
    const src = baseSamples[i];
    const px = src.x + d * src.nx;
    const py = src.y + d * src.ny;

    let isOuterEnvelope = true;
    for (let j = 0; j < baseSamples.length; j += 2) {
      const dx = px - baseSamples[j].x;
      const dy = py - baseSamples[j].y;
      if (dx * dx + dy * dy < minAllowedDistSq) {
        isOuterEnvelope = false;
        break;
      }
    }

    if (isOuterEnvelope) {
      candidates.push({
        x: px,
        y: py,
        nx: src.nx,
        ny: src.ny,
        s: 0,
      });
    }
  }

  const rawPoints =
    candidates.length >= 4
      ? candidates
      : baseSamples.map((src) => ({
          x: src.x + d * src.nx,
          y: src.y + d * src.ny,
          nx: src.nx,
          ny: src.ny,
          s: 0,
        }));

  let cumulativeS = 0;
  const finalPoints: WavefrontSample[] = [];
  for (let i = 0; i < rawPoints.length; i++) {
    const p = rawPoints[i];
    if (i > 0) {
      cumulativeS += Math.hypot(p.x - finalPoints[i - 1].x, p.y - finalPoints[i - 1].y);
    }
    finalPoints.push({
      ...p,
      s: cumulativeS,
    });
  }

  return { points: finalPoints, totalLength: cumulativeS };
}

export function getSlitBounds(slit: SlitConfig): {
  x: number;
  yTop: number;
  yBottom: number;
} {
  const half = slit.width / 2;
  const cy = LOGICAL_HEIGHT / 2;
  return {
    x: slit.x,
    yTop: cy - half,
    yBottom: cy + half,
  };
}

/**
 * Computes arrival distance d_hit(y) along the slit aperture [yTop, yBottom].
 */
export function computeSlitArrivalProfile(
  baseSamples: WavefrontSample[],
  slit: SlitConfig,
  numApertureSamples = 72
): { samples: SlitApertureSample[]; minArrival: number } {
  const { x: slitX, yTop, yBottom } = getSlitBounds(slit);
  const samples: SlitApertureSample[] = [];
  let minArrival = Infinity;

  for (let i = 0; i <= numApertureSamples; i++) {
    const y = yTop + (i / numApertureSamples) * (yBottom - yTop);
    let bestDist = Infinity;

    for (let j = 0; j < baseSamples.length; j += 2) {
      const p = baseSamples[j];
      const dx = slitX - p.x;
      const dy = y - p.y;
      // Only consider wavefront points that propagate toward the slit
      if (dx * p.nx + dy * p.ny >= -2) {
        const dist = Math.hypot(dx, dy);
        if (dist < bestDist) {
          bestDist = dist;
        }
      }
    }

    if (!Number.isFinite(bestDist)) {
      bestDist = Math.max(0, slitX - 120);
    }
    if (bestDist < minArrival) {
      minArrival = bestDist;
    }
    samples.push({ y, arrivalDistance: bestDist });
  }

  return { samples, minArrival };
}

/**
 * Returns the Huygens-Fresnel diffracted wavefront envelope in the half-space x >= slit.x
 * at total propagation distance `d`.
 */
export function computeDiffractedWavefront(
  slit: SlitConfig,
  apertureProfile: SlitApertureSample[],
  d: number
): EnvelopeResult {
  const { x: slitX, yTop, yBottom } = getSlitBounds(slit);

  // Collect active radii inside the aperture
  const active: { y: number; r: number }[] = [];
  let maxR = 0;
  for (const s of apertureProfile) {
    const r = d - s.arrivalDistance;
    if (r > 0.25) {
      active.push({ y: s.y, r });
      if (r > maxR) maxR = r;
    }
  }

  if (active.length === 0 || maxR <= 0.5) {
    return { points: [], totalLength: 0 };
  }

  const rTop = Math.max(0, d - apertureProfile[0].arrivalDistance);
  const rBottom = Math.max(
    0,
    d - apertureProfile[apertureProfile.length - 1].arrivalDistance
  );

  const maxXAtY = (y: number): number => {
    let bestX = -Infinity;
    for (const src of active) {
      const dy = y - src.y;
      if (Math.abs(dy) <= src.r) {
        const x = slitX + Math.sqrt(Math.max(0, src.r * src.r - dy * dy));
        if (x > bestX) bestX = x;
      }
    }
    return bestX;
  };

  const rawPts: Point2D[] = [];

  // 1. Top circular diffraction wing centered at (slitX, yTop)
  if (rTop > 0.5) {
    const arcSteps = 36;
    for (let i = 0; i <= arcSteps; i++) {
      const theta = -Math.PI / 2 + (i / arcSteps) * (Math.PI / 2);
      const px = slitX + rTop * Math.cos(theta);
      const py = yTop + rTop * Math.sin(theta);
      if (py >= 8 && py <= LOGICAL_HEIGHT - 8) {
        const envX = maxXAtY(py);
        if (px >= envX - 0.8) {
          rawPts.push({ x: px, y: py });
        }
      }
    }
  }

  // 2. Interior aperture envelope across [yTop, yBottom]
  const interiorSteps = 44;
  for (let i = 1; i < interiorSteps; i++) {
    const py = yTop + (i / interiorSteps) * (yBottom - yTop);
    const px = maxXAtY(py);
    if (Number.isFinite(px) && px >= slitX) {
      rawPts.push({ x: px, y: py });
    }
  }

  // 3. Bottom circular diffraction wing centered at (slitX, yBottom)
  if (rBottom > 0.5) {
    const arcSteps = 36;
    for (let i = 0; i <= arcSteps; i++) {
      const theta = (i / arcSteps) * (Math.PI / 2);
      const px = slitX + rBottom * Math.cos(theta);
      const py = yBottom + rBottom * Math.sin(theta);
      if (py >= 8 && py <= LOGICAL_HEIGHT - 8) {
        const envX = maxXAtY(py);
        if (px >= envX - 0.8) {
          rawPts.push({ x: px, y: py });
        }
      }
    }
  }

  if (rawPts.length < 2) {
    return { points: [], totalLength: 0 };
  }

  // Deduplicate very close points and compute smooth normals & arc length
  const cleaned: Point2D[] = [rawPts[0]];
  for (let i = 1; i < rawPts.length; i++) {
    const prev = cleaned[cleaned.length - 1];
    if (Math.hypot(rawPts[i].x - prev.x, rawPts[i].y - prev.y) > 0.75) {
      cleaned.push(rawPts[i]);
    }
  }

  if (cleaned.length < 2) {
    return { points: [], totalLength: 0 };
  }

  const samples: WavefrontSample[] = [];
  let cumulativeS = 0;
  for (let i = 0; i < cleaned.length; i++) {
    const p = cleaned[i];
    if (i > 0) {
      cumulativeS += Math.hypot(p.x - cleaned[i - 1].x, p.y - cleaned[i - 1].y);
    }
    const pPrev = cleaned[Math.max(0, i - 1)];
    const pNext = cleaned[Math.min(cleaned.length - 1, i + 1)];
    const tx = pNext.x - pPrev.x;
    const ty = pNext.y - pPrev.y;
    const tLen = Math.hypot(tx, ty) || 1;
    // As curve goes from top to bottom (ty > 0), rightward normal is (ty, -tx)
    let nx = ty / tLen;
    let ny = -tx / tLen;
    if (nx < -0.2) {
      nx = -nx;
      ny = -ny;
    }
    samples.push({ x: p.x, y: p.y, nx, ny, s: cumulativeS });
  }

  return { points: samples, totalLength: cumulativeS };
}

/**
 * Places representative secondary point sources equispaced at Δs ≈ λ / 2
 * symmetrically along the given wavefront.
 */
export function computeSecondarySources(
  envelope: EnvelopeResult,
  lambda: number,
  minCount = 2
): SecondarySource[] {
  const { points, totalLength } = envelope;
  if (points.length < 2 || totalLength < 6) return [];

  const spacing = Math.max(16, lambda / 2);
  const edgePadding = Math.min(12, totalLength * 0.14);
  const usableLength = Math.max(0, totalLength - 2 * edgePadding);
  const count = Math.max(minCount, Math.floor(usableLength / spacing) + 1);
  const actualSpacing =
    count > 1 && usableLength < (count - 1) * spacing
      ? usableLength / (count - 1)
      : spacing;
  const span = (count - 1) * actualSpacing;
  const startS = Math.max(0, (totalLength - span) / 2);

  const sources: SecondarySource[] = [];
  for (let i = 0; i < count; i++) {
    const s = Math.min(totalLength, startS + i * actualSpacing);
    sources.push(sampleAtArcLength(points, s));
  }
  return sources;
}

/**
 * Places secondary sources directly inside the slit aperture at spacing <= λ/2
 * (guaranteeing at least 3 sources across the aperture when narrow so edge
 * diffraction wavelets are always visible).
 */
export function computeSlitSecondarySources(
  slit: SlitConfig,
  lambda: number
): SecondarySource[] {
  const { x: slitX, yTop, yBottom } = getSlitBounds(slit);
  const height = yBottom - yTop;
  const targetStep = Math.max(14, lambda / 2);
  const intervals = Math.max(2, Math.ceil(height / targetStep));
  const sources: SecondarySource[] = [];

  for (let i = 0; i <= intervals; i++) {
    const frac = i / intervals;
    const y = yTop + frac * height;
    sources.push({
      x: slitX,
      y,
      nx: 1,
      ny: 0,
      s: frac * height,
    });
  }
  return sources;
}

/**
 * Interpolates a point and unit normal along a sampled wavefront at arc length `targetS`.
 */
function sampleAtArcLength(
  points: WavefrontSample[],
  targetS: number
): SecondarySource {
  if (points.length === 0) {
    return { x: 0, y: 0, nx: 1, ny: 0, s: 0 };
  }
  if (targetS <= 0) {
    const p = points[0];
    return { x: p.x, y: p.y, nx: p.nx, ny: p.ny, s: 0 };
  }
  const last = points[points.length - 1];
  if (targetS >= last.s) {
    return { x: last.x, y: last.y, nx: last.nx, ny: last.ny, s: last.s };
  }

  let lo = 0;
  let hi = points.length - 1;
  while (lo < hi - 1) {
    const mid = (lo + hi) >> 1;
    if (points[mid].s <= targetS) {
      lo = mid;
    } else {
      hi = mid;
    }
  }

  const p0 = points[lo];
  const p1 = points[hi];
  const segLen = p1.s - p0.s;
  const alpha = segLen > 1e-6 ? (targetS - p0.s) / segLen : 0;
  const nx = p0.nx + alpha * (p1.nx - p0.nx);
  const ny = p0.ny + alpha * (p1.ny - p0.ny);
  const nLen = Math.hypot(nx, ny) || 1;

  return {
    x: p0.x + alpha * (p1.x - p0.x),
    y: p0.y + alpha * (p1.y - p0.y),
    nx: nx / nLen,
    ny: ny / nLen,
    s: targetS,
  };
}

/**
 * Computes the forward tangent points where active circular wavelets of radius `r`
 * meet the advancing envelope (filtering out points swallowed in concave caustics).
 */
export function computeWaveletTangentPoints(
  sources: SecondarySource[],
  baseWavefront: WavefrontSample[],
  baseDistance: number,
  waveletRadius: number
): Point2D[] {
  if (waveletRadius <= 1) return [];
  const totalDist = baseDistance + waveletRadius;
  const tolSq = Math.max(0, totalDist - 1.5) * Math.max(0, totalDist - 1.5);

  const tangentPoints: Point2D[] = [];
  for (const src of sources) {
    const tx = src.x + waveletRadius * src.nx;
    const ty = src.y + waveletRadius * src.ny;

    let valid = true;
    for (let j = 0; j < baseWavefront.length; j += 3) {
      const dx = tx - baseWavefront[j].x;
      const dy = ty - baseWavefront[j].y;
      if (dx * dx + dy * dy < tolSq) {
        valid = false;
        break;
      }
    }
    if (valid) {
      tangentPoints.push({ x: tx, y: ty });
    }
  }
  return tangentPoints;
}

/**
 * Calculates maximum propagation distance before the wavefront leaves the visible medium.
 */
export function computeMaxPropagationDistance(
  baseSamples: WavefrontSample[],
  lambda: number
): number {
  if (baseSamples.length === 0) return 750;
  let minX = Infinity;
  for (const p of baseSamples) {
    if (p.x < minX) minX = p.x;
  }
  const spanRight = LOGICAL_WIDTH - 45 - minX;
  const rawMax = Math.max(lambda * 5, spanRight);
  return Math.min(820, Math.max(360, rawMax));
}

export type BezierHandleKey = keyof BezierControlPoints;

export function hitTestBezierHandle(
  bezier: BezierControlPoints,
  pt: Point2D,
  hitRadius = 18
): BezierHandleKey | null {
  const keys: BezierHandleKey[] = ['p0', 'p3', 'p1', 'p2'];
  let bestKey: BezierHandleKey | null = null;
  let bestDistSq = hitRadius * hitRadius;

  for (const key of keys) {
    const handle = bezier[key];
    const dSq = (pt.x - handle.x) ** 2 + (pt.y - handle.y) ** 2;
    if (dSq <= bestDistSq) {
      bestDistSq = dSq;
      bestKey = key;
    }
  }
  return bestKey;
}
