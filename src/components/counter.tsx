import { useEffect, useRef, useState } from "react";
import { fmt } from "@/lib/store";

export function Counter({ value, prefix = "", suffix = "", duration = 900, decimals = 0 }: {
  value: number;
  prefix?: string;
  suffix?: string;
  duration?: number;
  decimals?: number;
}) {
  const [v, setV] = useState(0);
  const ref = useRef(0);
  useEffect(() => {
    const start = performance.now();
    const from = ref.current;
    let raf = 0;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const eased = 1 - Math.pow(1 - p, 3);
      const cur = from + (value - from) * eased;
      setV(cur);
      if (p < 1) raf = requestAnimationFrame(step);
      else ref.current = value;
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [value, duration]);
  return <span>{prefix}{fmt(Number(v.toFixed(decimals)))}{suffix}</span>;
}
