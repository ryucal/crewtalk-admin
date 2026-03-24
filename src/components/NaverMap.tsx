"use client";

import { useEffect, useRef, useState } from "react";
import { buildRenderSegments } from "@/lib/gps-smooth";
import type { TrackPoint } from "@/lib/types";

declare global {
  interface Window {
    naver?: {
      maps: {
        Map: new (el: HTMLElement, options: object) => { fitBounds: (bounds: object, padding?: number) => void };
        LatLng: new (lat: number, lng: number) => object;
        LatLngBounds: new (sw: object, ne: object) => object;
        Point: new (x: number, y: number) => object;
        Polyline: new (options: {
          path: object[];
          strokeColor?: string;
          strokeWeight?: number;
          strokeOpacity?: number;
          strokeStyle?: string;
          map: object;
        }) => void;
        Marker: new (options: {
          position: object;
          map: object;
          title?: string;
          zIndex?: number;
          icon?: { content: string; anchor: object };
        }) => void;
        Event: { addListener: (target: object, event: string, handler: () => void) => void };
      };
    };
  }
}

interface NaverMapProps {
  points: TrackPoint[];
  className?: string;
}

const CLIENT_ID = process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID;
const AUTH_ERROR_MSG =
  "네이버 맵 인증에 실패했습니다. Client ID와 Web 서비스 URL(현재 접속 주소) 등록을 확인하세요.";

function loadNaverMapScript(): Promise<void> {
  if (typeof window === "undefined") return Promise.reject(new Error("window undefined"));
  if (window.naver?.maps) return Promise.resolve();

  return new Promise((resolve, reject) => {
    const TIMEOUT_MS = 10000;
    const startTime = Date.now();

    const existing = document.querySelector('script[src*="openapi.map.naver.com"]');
    if (existing) {
      const check = () => {
        if (window.naver?.maps) {
          resolve();
          return;
        }
        if (Date.now() - startTime > TIMEOUT_MS) {
          reject(new Error(AUTH_ERROR_MSG));
          return;
        }
        setTimeout(check, 100);
      };
      check();
      return;
    }

    const script = document.createElement("script");
    script.src = `https://openapi.map.naver.com/openapi/v3/maps.js?ncpKeyId=${CLIENT_ID}`;
    script.async = true;
    script.onload = () => {
      const waitForNaver = () => {
        if (window.naver?.maps) {
          resolve();
          return;
        }
        if (Date.now() - startTime > TIMEOUT_MS) {
          reject(new Error(AUTH_ERROR_MSG));
          return;
        }
        setTimeout(waitForNaver, 50);
      };
      waitForNaver();
    };
    script.onerror = () => reject(new Error("네이버 맵 스크립트를 불러오는데 실패했습니다."));
    document.head.appendChild(script);
  });
}

export default function NaverMap({ points, className = "" }: NaverMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!mapRef.current || !CLIENT_ID) {
      setError(CLIENT_ID ? null : "네이버 맵 Client ID가 설정되지 않았습니다. .env.local에 NEXT_PUBLIC_NAVER_MAP_CLIENT_ID를 추가하세요.");
      setLoading(false);
      return;
    }

    setLoading(true);
    setError(null);

    loadNaverMapScript()
      .then(() => {
        if (!mapRef.current || !window.naver?.maps) {
          setError(AUTH_ERROR_MSG);
          setLoading(false);
          return;
        }

        try {
          const naver = window.naver;
          const center = points.length > 0
            ? new naver.maps.LatLng(points[0].lat, points[0].lng)
            : new naver.maps.LatLng(37.5665, 126.978);

          const map = new naver.maps.Map(mapRef.current, {
            center,
            zoom: 15,
            zoomControl: true,
          });

          if (points.length > 0) {
            const segments = buildRenderSegments(points, {
              splitTimeSec: 90,
              splitDistanceMeters: 900,
              splitSpeedKmh: 95,
              hardSpeedKmh: 130,
              reliableAccuracyMeters: 70,
            });
            const allSegmentPoints = segments.flatMap((s) => s.points);

            // 세그먼트 분리·임계값은 유지, 표시는 갭 구간 포함 모두 동일 실선
            segments.forEach((segment) => {
              if (segment.points.length < 2) return;
              const path = segment.points.map((p) => new naver.maps.LatLng(p.lat, p.lng));
              new naver.maps.Polyline({
                path,
                strokeColor: "#3388ff",
                strokeWeight: 5,
                strokeOpacity: 0.9,
                strokeStyle: "solid",
                map,
              });
            });

            const start = allSegmentPoints[0];
            const end = allSegmentPoints[allSegmentPoints.length - 1];
            if (!start || !end) {
              setLoading(false);
              return;
            }
            const mk = (lat: number, lng: number, color: string, label: string) =>
              new naver.maps.Marker({
                position: new naver.maps.LatLng(lat, lng),
                map,
                title: label,
                zIndex: 200,
                icon: {
                  content: `<div style="width:22px;height:22px;border-radius:50%;background:${color};border:3px solid #fff;box-shadow:0 2px 6px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:10px;font-weight:700;color:#fff;font-family:system-ui,sans-serif">${label === "출발" ? "S" : "E"}</div>`,
                  anchor: new naver.maps.Point(11, 11),
                },
              });
            mk(start.lat, start.lng, "#16a34a", "출발");
            mk(end.lat, end.lng, "#dc2626", "도착");

            const lats = allSegmentPoints.map((p) => p.lat);
            const lngs = allSegmentPoints.map((p) => p.lng);
            const sw = new naver.maps.LatLng(Math.min(...lats), Math.min(...lngs));
            const ne = new naver.maps.LatLng(Math.max(...lats), Math.max(...lngs));
            const bounds = new naver.maps.LatLngBounds(sw, ne);
            map.fitBounds(bounds, 50);
          }
        } catch (e) {
          setError(AUTH_ERROR_MSG);
        }
        setLoading(false);
      })
      .catch((err) => {
        setError(err?.message || "지도를 불러오는데 실패했습니다.");
        setLoading(false);
      });
  }, [points]);

  if (error) {
    return (
      <div className={`flex items-center justify-center bg-bg border border-border rounded-lg ${className}`} style={{ minHeight: 400 }}>
        <p className="text-sm text-text-tertiary">{error}</p>
      </div>
    );
  }

  return (
    <div className={`relative ${className}`}>
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-bg/80 z-10 rounded-lg">
          <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin" />
        </div>
      )}
      <div ref={mapRef} className="w-full h-full min-h-[300px] rounded-lg border border-border overflow-hidden" />
    </div>
  );
}
