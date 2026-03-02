import Svg, { Circle, Path } from "react-native-svg";

type Props = {
  values: number[];
  width: number;
  height: number;
  color: string;
  showPoints?: boolean;
  segmentColors?: string[];
  yScale?: "linear" | "log";
};

export function SimpleSeriesChart(props: Props) {
  if (!props.values.length) return null;

  const useLogScale = props.yScale === "log" && props.values.every((value) => Number.isFinite(value) && value > 0);
  const toPlotY = (value: number) => (useLogScale ? Math.log10(value) : value);
  const plottedValues = props.values.map((value) => toPlotY(value));
  const min = Math.min(...plottedValues);
  const max = Math.max(...plottedValues);
  const range = Math.max(max - min, 1e-9);
  const stepX = props.values.length <= 1 ? 0 : props.width / (props.values.length - 1);

  const points = plottedValues.map((value, i) => {
    const x = i * stepX;
    const y = props.height - ((value - min) / range) * props.height;
    return { x, y };
  });

  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");
  const hasSegmentColors = Array.isArray(props.segmentColors) && props.segmentColors.length === points.length;

  return (
    <Svg width={props.width} height={props.height}>
      {hasSegmentColors ? (
        <>
          {points.slice(1).map((point, idx) => {
            const prev = points[idx];
            const segment = `M${prev.x.toFixed(2)} ${prev.y.toFixed(2)} L${point.x.toFixed(2)} ${point.y.toFixed(2)}`;
            const segmentColor = props.segmentColors?.[idx + 1] ?? props.color;
            return (
              <Path
                key={`segment_${idx}`}
                d={segment}
                stroke={segmentColor}
                strokeWidth={2.2}
                strokeLinecap="round"
                fill="none"
              />
            );
          })}
        </>
      ) : (
        <Path d={d} stroke={props.color} strokeWidth={2.2} fill="none" />
      )}
      {!!props.showPoints &&
        points.map((p, idx) => (
          <Circle key={idx} cx={p.x} cy={p.y} r={2} fill={props.segmentColors?.[idx] ?? props.color} />
        ))}
    </Svg>
  );
}
