import Svg, { Circle, Path } from "react-native-svg";

type Props = {
  values: number[];
  width: number;
  height: number;
  color: string;
  showPoints?: boolean;
};

export function SimpleSeriesChart(props: Props) {
  if (!props.values.length) return null;

  const min = Math.min(...props.values);
  const max = Math.max(...props.values);
  const range = Math.max(max - min, 1e-9);
  const stepX = props.values.length <= 1 ? 0 : props.width / (props.values.length - 1);

  const points = props.values.map((value, i) => {
    const x = i * stepX;
    const y = props.height - ((value - min) / range) * props.height;
    return { x, y };
  });

  const d = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(2)} ${p.y.toFixed(2)}`).join(" ");

  return (
    <Svg width={props.width} height={props.height}>
      <Path d={d} stroke={props.color} strokeWidth={2.2} fill="none" />
      {!!props.showPoints &&
        points.map((p, idx) => <Circle key={idx} cx={p.x} cy={p.y} r={2} fill={props.color} />)}
    </Svg>
  );
}
