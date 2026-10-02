import { useParallax } from "./useParallax";

export default function ParallaxPhoto({
  src,
  alt,
  aspect = "4 / 3",
  speed = 0.12,
}: {
  src: string;
  alt: string;
  aspect?: string;
  speed?: number;
}) {
  const { ref, offset } = useParallax(speed);
  return (
    <div className="parallax-frame" style={{ aspectRatio: aspect }}>
      <div ref={ref} style={{ position: "absolute", inset: 0, overflow: "hidden" }}>
        <img src={src} alt={alt} loading="lazy" style={{ transform: `translateY(${offset}px) scale(1.15)` }} />
      </div>
    </div>
  );
}
