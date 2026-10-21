"use client";

import { geoDistance, geoGraticule10, geoOrthographic, geoPath } from "d3-geo";
import type { FeatureCollection, Geometry } from "geojson";
import { useEffect, useRef } from "react";
import { feature } from "topojson-client";
import type { Topology } from "topojson-specification";
import atlas from "world-atlas/countries-110m.json";

export type GlobePoint = { lat: number; lng: number; kind: "visitor" | "order"; label: string; at: number };

const topo = atlas as unknown as Topology;
const land = feature(topo, topo.objects.countries) as unknown as FeatureCollection<Geometry>;
const graticule = geoGraticule10();

/**
 * Globe de la Vue en direct (comme celui de Shopify) : la Terre tourne doucement, chaque visiteur présent est un point
 * qui pulse, chaque commande récente un point doré. On peut le faire tourner à la souris ou au doigt.
 */
export function LiveGlobe({ points, size = 420 }: { points: GlobePoint[]; size?: number }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const pts = useRef(points);
  pts.current = points;
  const rot = useRef<[number, number]>([-10, -35]); // [lambda, phi] : Europe de face au départ
  const drag = useRef<{ x: number; y: number; r: [number, number] } | null>(null);
  const idleSince = useRef(0);

  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    el.width = size * dpr; el.height = size * dpr;
    const ctx = el.getContext("2d")!;
    ctx.scale(dpr, dpr);
    const projection = geoOrthographic().scale(size / 2 - 6).translate([size / 2, size / 2]).clipAngle(90);
    const path = geoPath(projection, ctx);
    let raf = 0, last = performance.now();
    const draw = (now: number) => {
      const dt = now - last; last = now;
      if (!drag.current && now - idleSince.current > 2500) rot.current = [rot.current[0] + dt * 0.006, rot.current[1]];
      projection.rotate(rot.current);
      ctx.clearRect(0, 0, size, size);
      // Océan
      ctx.beginPath(); path({ type: "Sphere" }); ctx.fillStyle = "#0b1a33"; ctx.fill();
      // Méridiens
      ctx.beginPath(); path(graticule); ctx.strokeStyle = "rgba(255,255,255,.07)"; ctx.lineWidth = 0.5; ctx.stroke();
      // Terres
      ctx.beginPath(); path(land); ctx.fillStyle = "#34466a"; ctx.fill(); ctx.strokeStyle = "#182540"; ctx.lineWidth = 0.6; ctx.stroke();
      // Contour
      ctx.beginPath(); path({ type: "Sphere" }); ctx.strokeStyle = "rgba(255,255,255,.25)"; ctx.lineWidth = 1; ctx.stroke();
      // Points : seulement la face visible
      const center: [number, number] = [-rot.current[0], -rot.current[1]];
      for (const p of pts.current) {
        if (geoDistance([p.lng, p.lat], center) > Math.PI / 2 - 0.02) continue;
        const xy = projection([p.lng, p.lat]);
        if (!xy) continue;
        const pulse = (Math.sin(now / 350 + p.lng) + 1) / 2; // 0..1
        const color = p.kind === "order" ? "#fbbf24" : "#4cc9ff";
        ctx.beginPath(); ctx.arc(xy[0], xy[1], 4 + pulse * 10, 0, Math.PI * 2); ctx.fillStyle = color + "40"; ctx.fill();
        ctx.beginPath(); ctx.arc(xy[0], xy[1], 4, 0, Math.PI * 2); ctx.fillStyle = color; ctx.fill(); ctx.strokeStyle = "#fff"; ctx.lineWidth = 1.5; ctx.stroke();
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    const down = (e: PointerEvent) => { drag.current = { x: e.clientX, y: e.clientY, r: rot.current }; el.setPointerCapture(e.pointerId); };
    const move = (e: PointerEvent) => {
      if (!drag.current) return;
      const k = 90 / (size / 2);
      rot.current = [drag.current.r[0] + (e.clientX - drag.current.x) * k, Math.max(-80, Math.min(80, drag.current.r[1] - (e.clientY - drag.current.y) * k))];
    };
    const up = () => { drag.current = null; idleSince.current = performance.now(); };
    el.addEventListener("pointerdown", down); el.addEventListener("pointermove", move); el.addEventListener("pointerup", up); el.addEventListener("pointercancel", up);
    return () => { cancelAnimationFrame(raf); el.removeEventListener("pointerdown", down); el.removeEventListener("pointermove", move); el.removeEventListener("pointerup", up); el.removeEventListener("pointercancel", up); };
  }, [size]);

  return <canvas ref={canvas} style={{ width: size, height: size, maxWidth: "100%", touchAction: "none", cursor: "grab" }} aria-label="Globe des visiteurs en direct" role="img" />;
}
