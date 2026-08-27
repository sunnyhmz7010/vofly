import { useEffect, useRef } from "react";
import * as echarts from "echarts";

// Thin React wrapper around an echarts instance (init once, setOption on change).
export function EChart({ option, className }: { option: unknown; className?: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const chartRef = useRef<echarts.ECharts | null>(null);

  useEffect(() => {
    if (!ref.current) return;
    const chart = echarts.init(ref.current);
    chartRef.current = chart;
    const ro = new ResizeObserver(() => chart.resize());
    ro.observe(ref.current);
    return () => {
      ro.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (chartRef.current && option) chartRef.current.setOption(option as echarts.EChartsOption, true);
  }, [option]);

  return <div ref={ref} className={className} />;
}
