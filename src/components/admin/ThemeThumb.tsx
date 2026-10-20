/** Vignette vivante d'un thème : la vitrine rendue dans un cadre réduit (non cliquable). */
export function ThemeThumb({ src, width, height, className = "" }: { src: string; width: number; height: number; className?: string }) {
  const frameWidth = 1280;
  const scale = width / frameWidth;
  return (
    <div className={`relative overflow-hidden bg-[#f1f1f1] ${className}`} style={{ width, height }} aria-hidden>
      <iframe src={src} title="" tabIndex={-1} loading="lazy" sandbox="allow-same-origin allow-scripts" className="pointer-events-none absolute left-0 top-0 origin-top-left border-0" style={{ width: frameWidth, height: Math.ceil(height / scale), transform: `scale(${scale})` }} />
    </div>
  );
}
