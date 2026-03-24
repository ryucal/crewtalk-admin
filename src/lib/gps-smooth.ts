import * as turf from "@turf/turf";

export interface GpsPoint {
  lat: number;
  lng: number;
}

export interface GpsTrackPoint extends GpsPoint {
  ts?: number;
  speed?: number;
  heading?: number;
  accuracy?: number;
}

export interface RenderSegment {
  style: "solid" | "dashed";
  points: GpsPoint[];
}

/**
 * Haversine 거리 (미터)
 */
function haversineDistance(p1: GpsPoint, p2: GpsPoint): number {
  return turf.distance(turf.point([p1.lng, p1.lat]), turf.point([p2.lng, p2.lat]), { units: "meters" });
}

/**
 * GPS 경로 정제
 *
 * - 곡선 도로에서 수직 거리(perpDist)로 점을 지우면 **정상적인 코너 점**까지 사라져
 *   직선으로 잘리는 문제가 생김 → 사용하지 않음.
 * - **스파이크만** 제거: 이전·다음 모두에서 비정상적으로 먼 점, 또는 한 구간만 극단적으로 튄 점.
 * - Douglas-Peucker는 **매우 작은 tolerance**만 적용 (도 단위, ~1–2m 수준)해 튐만 살짝 줄임.
 */
export function smoothGpsPath(points: GpsPoint[], options?: {
  /** 양쪽 인접 점 모두 이 거리(m) 초과면 스파이크로 간주해 제거 */
  spikeBothMeters?: number;
  /** 한 구간만 이 거리(m) 초과면 비정상 점프로 제거 */
  spikeSingleMeters?: number;
  /** simplify tolerance (도). 작을수록 원본에 가깝게 유지. 0이면 단순화 생략 */
  simplifyTolerance?: number;
}): GpsPoint[] {
  if (points.length < 3) return points;

  const both = options?.spikeBothMeters ?? 380;
  const single = options?.spikeSingleMeters ?? 650;
  const tolerance = options?.simplifyTolerance ?? 0.000018; // ~2m, 곡선 유지

  const filtered: GpsPoint[] = [points[0]];
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1];
    const curr = points[i];
    const next = points[i + 1];

    const distToPrev = haversineDistance(prev, curr);
    const distToNext = haversineDistance(curr, next);

    // 양쪽 모두 매우 멂 → 중간에 튄 이상치
    if (distToPrev > both && distToNext > both) continue;
    // 한쪽만 극단적으로 멂 → 순간 점프
    if (distToPrev > single || distToNext > single) continue;

    filtered.push(curr);
  }
  filtered.push(points[points.length - 1]);

  if (filtered.length < 2) return filtered;
  if (tolerance <= 0) return filtered;

  const line = turf.lineString(filtered.map((p) => [p.lng, p.lat]));
  const simplified = turf.simplify(line, { tolerance, highQuality: true });
  const coords = simplified.geometry.coordinates;
  return coords.map(([lng, lat]) => ({ lat, lng }));
}

/** 시각(ts, ms) 기반으로 선분 분리 + 보조 점선 구간 생성 */
export function buildRenderSegments(points: GpsTrackPoint[], options?: {
  splitTimeSec?: number;
  splitDistanceMeters?: number;
  splitSpeedKmh?: number;
  hardSpeedKmh?: number;
  reliableAccuracyMeters?: number;
}): RenderSegment[] {
  if (points.length < 2) return points.length === 1 ? [{ style: "solid", points: [points[0]] }] : [];

  const splitTimeSec = options?.splitTimeSec ?? 90;
  const splitDistanceMeters = options?.splitDistanceMeters ?? 900;
  const splitSpeedKmh = options?.splitSpeedKmh ?? 95;
  const hardSpeedKmh = options?.hardSpeedKmh ?? 130;
  const reliableAccuracyMeters = options?.reliableAccuracyMeters ?? 70;

  const ordered = [...points].sort((a, b) => (a.ts ?? 0) - (b.ts ?? 0));
  const segments: RenderSegment[] = [];
  let current: GpsTrackPoint[] = [ordered[0]];

  const finalizeCurrent = () => {
    if (current.length < 2) return;
    const smoothed = smoothGpsPath(current, {
      spikeBothMeters: 380,
      spikeSingleMeters: 650,
      simplifyTolerance: 0.000018,
    });
    if (smoothed.length >= 2) segments.push({ style: "solid", points: smoothed });
  };

  for (let i = 1; i < ordered.length; i++) {
    const prev = ordered[i - 1];
    const curr = ordered[i];
    const distMeters = haversineDistance(prev, curr);

    const dtSec = prev.ts && curr.ts && curr.ts > prev.ts ? (curr.ts - prev.ts) / 1000 : null;
    const inferredKmh = dtSec && dtSec > 0 ? (distMeters / dtSec) * 3.6 : null;
    const poorAccuracy = (prev.accuracy ?? 0) > reliableAccuracyMeters || (curr.accuracy ?? 0) > reliableAccuracyMeters;
    const byTimeGap = dtSec !== null && dtSec > splitTimeSec;
    const byLargeJump = distMeters > splitDistanceMeters && inferredKmh !== null && inferredKmh > splitSpeedKmh && !poorAccuracy;
    const byImpossibleSpeed = inferredKmh !== null && inferredKmh > hardSpeedKmh;
    const shouldSplit = byTimeGap || byLargeJump || byImpossibleSpeed;

    if (shouldSplit) {
      finalizeCurrent();
      if (distMeters > 80) {
        segments.push({ style: "dashed", points: [prev, curr] });
      }
      current = [curr];
      continue;
    }

    current.push(curr);
  }

  finalizeCurrent();
  return segments;
}
