import { useEffect, useRef, useState } from "react";

// Parallax leve, sem lib externa: desloca o elemento verticalmente conforme
// a posição de rolagem, throttled via requestAnimationFrame. Desativado
// quando o usuário prefere menos movimento.
export function useParallax(speed = 0.12) {
  const ref = useRef<HTMLDivElement>(null);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let frame = 0;
    const update = () => {
      const el = ref.current;
      if (el) {
        const rect = el.getBoundingClientRect();
        const vh = window.innerHeight || document.documentElement.clientHeight;
        const center = rect.top + rect.height / 2 - vh / 2;
        setOffset(center * speed);
      }
      frame = requestAnimationFrame(update);
    };
    frame = requestAnimationFrame(update);
    return () => cancelAnimationFrame(frame);
  }, [speed]);

  return { ref, offset };
}
