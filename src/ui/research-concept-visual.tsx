import { View, Text } from "react-native";
import Svg, { Circle, Line, Path, Rect } from "react-native-svg";

type Props = {
  title: string;
  topic: "indicators" | "macro" | "crypto" | "risk" | "playbooks";
  dark: boolean;
};

type Variant =
  | "macd"
  | "oscillator"
  | "bands"
  | "yield_curve"
  | "macro_dual"
  | "crypto_metric"
  | "risk_dist"
  | "timeline";

function hashString(input: string): number {
  let h = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return Math.abs(h >>> 0);
}

function mulberry32(seed: number) {
  return function rand() {
    let t = (seed += 0x6d2b79f5);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function series(seed: number, len: number, base = 0, amp = 1, drift = 0): number[] {
  const r = mulberry32(seed);
  const out: number[] = [];
  for (let i = 0; i < len; i += 1) {
    const wave = Math.sin(i / 3.2) * 0.55 + Math.cos(i / 5.6) * 0.35;
    const noise = (r() - 0.5) * 0.35;
    out.push(base + amp * (wave + noise + i * drift));
  }
  return out;
}

function toPath(values: number[], width: number, height: number, padY = 8): string {
  if (!values.length) return "";
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(max - min, 1e-9);
  const stepX = values.length <= 1 ? 0 : width / (values.length - 1);
  return values
    .map((v, i) => {
      const x = i * stepX;
      const y = height - padY - ((v - min) / span) * (height - padY * 2);
      return `${i === 0 ? "M" : "L"}${x.toFixed(2)} ${y.toFixed(2)}`;
    })
    .join(" ");
}

function pickVariant(title: string, topic: Props["topic"]): Variant {
  const t = title.toLowerCase();
  if (t.includes("macd")) return "macd";
  if (t.includes("rsi") || t.includes("stochastic") || t.includes("oscillator")) return "oscillator";
  if (t.includes("bollinger") || t.includes("keltner") || t.includes("donchian") || t.includes("band") || t.includes("channel")) return "bands";
  if (t.includes("yield curve") || t.includes("curve")) return "yield_curve";
  if (
    t.includes("cpi") ||
    t.includes("pce") ||
    t.includes("inflation") ||
    t.includes("hicp") ||
    t.includes("unemployment") ||
    t.includes("claims") ||
    t.includes("pmi") ||
    t.includes("retail") ||
    t.includes("money supply") ||
    t.includes("balance sheet") ||
    t.includes("rate") ||
    t.includes("liquidity")
  ) {
    return "macro_dual";
  }
  if (
    t.includes("mvrv") ||
    t.includes("sopr") ||
    t.includes("nupl") ||
    t.includes("on-chain") ||
    t.includes("token") ||
    t.includes("supply") ||
    t.includes("stablecoin") ||
    t.includes("funding") ||
    t.includes("basis") ||
    t.includes("miner") ||
    t.includes("hash") ||
    t.includes("tvl")
  ) {
    return "crypto_metric";
  }
  if (
    t.includes("var") ||
    t.includes("drawdown") ||
    t.includes("tail") ||
    t.includes("volatility") ||
    t.includes("correlation") ||
    t.includes("hedg") ||
    t.includes("risk")
  ) {
    return "risk_dist";
  }
  if (topic === "playbooks") return "timeline";
  return topic === "crypto" ? "crypto_metric" : topic === "risk" ? "risk_dist" : topic === "macro" ? "macro_dual" : "timeline";
}

function palette(topic: Props["topic"]) {
  if (topic === "indicators") return { a: "#7DA7FF", b: "#7E5CE6", c: "#4ED8A2", d: "#F2CF57" };
  if (topic === "macro") return { a: "#6CB8FF", b: "#57D5C1", c: "#9E84FF", d: "#F08BA1" };
  if (topic === "crypto") return { a: "#9B80FF", b: "#55D7A4", c: "#7DA7FF", d: "#F2CF57" };
  if (topic === "risk") return { a: "#F08BA1", b: "#F2CF57", c: "#7DA7FF", d: "#58D5B8" };
  return { a: "#8F77FF", b: "#6DBBFF", c: "#69D8C8", d: "#F2CF57" };
}

function legendFor(variant: Variant): string {
  if (variant === "macd") return "MACD line, signal line, histogram";
  if (variant === "oscillator") return "Oscillator with 30/70 regime bands";
  if (variant === "bands") return "Upper/lower envelope around price";
  if (variant === "yield_curve") return "Current vs prior term structure";
  if (variant === "macro_dual") return "Headline vs core/paired macro trend";
  if (variant === "crypto_metric") return "On-chain flow + trend composite";
  if (variant === "risk_dist") return "Risk distribution with stress threshold";
  return "Playbook timeline phases";
}

export function ResearchConceptVisual({ title, topic, dark }: Props) {
  const p = palette(topic);
  const variant = pickVariant(title, topic);
  const seed = hashString(`${topic}_${title}`);
  const w = 330;
  const h = 126;
  const bg = dark ? "#101A32" : "#F2F7FF";
  const border = dark ? "#213255" : "#D4E0FF";
  const grid = dark ? "#223252" : "#D7E4FF";
  const label = dark ? "#D9E4FF" : "#263A66";
  const sub = dark ? "#96A5C9" : "#4D669A";

  const base = series(seed + 3, 28, 0, 1.1, 0.015);
  const alt = series(seed + 5, 28, 0.2, 0.9, -0.006);

  const yFromNorm = (v: number) => {
    const clamped = Math.max(0, Math.min(100, v));
    return h - 8 - (clamped / 100) * (h - 16);
  };

  return (
    <View
      style={{
        width: "100%",
        height: 180,
        borderRadius: 12,
        borderWidth: 1,
        borderColor: border,
        backgroundColor: bg,
        overflow: "hidden",
      }}
    >
      <View style={{ position: "absolute", top: -34, right: -16, width: 140, height: 140, borderRadius: 70, backgroundColor: p.a, opacity: 0.14 }} />
      <View style={{ position: "absolute", bottom: -50, left: -20, width: 170, height: 170, borderRadius: 85, backgroundColor: p.b, opacity: 0.11 }} />
      <View style={{ paddingHorizontal: 12, paddingTop: 10 }}>
        <Text style={{ color: label, fontWeight: "800", fontSize: 13 }} numberOfLines={1}>
          {title}
        </Text>
      </View>
      <View style={{ paddingHorizontal: 10, marginTop: 6 }}>
        <Svg width="100%" height={h} viewBox={`0 0 ${w} ${h}`}>
          <Line x1="0" y1="20" x2={String(w)} y2="20" stroke={grid} strokeWidth="1" />
          <Line x1="0" y1="63" x2={String(w)} y2="63" stroke={grid} strokeWidth="1" />
          <Line x1="0" y1="106" x2={String(w)} y2="106" stroke={grid} strokeWidth="1" />

          {variant === "macd" && (
            <>
              {series(seed + 11, 28, 0, 1.0, 0.01).map((v, i, arr) => {
                const step = w / arr.length;
                const x = i * step + 2;
                const barH = Math.abs(v) * 16;
                const y = 63 + (v >= 0 ? -barH : 0);
                return <Rect key={`h_${i}`} x={x} y={y} width={Math.max(4, step - 3)} height={barH} fill={v >= 0 ? p.b : p.a} opacity={0.75} />;
              })}
              <Path d={toPath(base, w, h)} stroke={p.c} strokeWidth={2.4} fill="none" />
              <Path d={toPath(alt, w, h)} stroke={p.d} strokeWidth={2.2} fill="none" />
            </>
          )}

          {variant === "oscillator" && (
            <>
              <Rect x="0" y={String(yFromNorm(70))} width={String(w)} height={String(yFromNorm(30) - yFromNorm(70))} fill={p.a} opacity={0.1} />
              <Line x1="0" y1={String(yFromNorm(70))} x2={String(w)} y2={String(yFromNorm(70))} stroke={p.a} strokeWidth="1.6" strokeDasharray="4 4" />
              <Line x1="0" y1={String(yFromNorm(30))} x2={String(w)} y2={String(yFromNorm(30))} stroke={p.b} strokeWidth="1.6" strokeDasharray="4 4" />
              <Path d={toPath(series(seed + 17, 28, 50, 28, 0), w, h)} stroke={p.c} strokeWidth={2.5} fill="none" />
            </>
          )}

          {variant === "bands" && (
            <>
              <Path d={toPath(base.map((v) => v + 1.2), w, h)} stroke={p.a} strokeWidth={2} fill="none" />
              <Path d={toPath(base.map((v) => v - 1.2), w, h)} stroke={p.a} strokeWidth={2} fill="none" />
              <Path d={toPath(base, w, h)} stroke={p.c} strokeWidth={2.6} fill="none" />
            </>
          )}

          {variant === "yield_curve" && (
            <>
              <Path d={"M20 98 L70 84 L120 74 L170 66 L220 62 L270 60 L315 59"} stroke={p.a} strokeWidth={2.2} fill="none" />
              <Path d={"M20 60 L70 67 L120 75 L170 82 L220 86 L270 90 L315 95"} stroke={p.b} strokeWidth={2.2} fill="none" />
              {[20, 70, 120, 170, 220, 270, 315].map((x) => (
                <Circle key={`yc_${x}`} cx={x} cy={x < 170 ? 60 + (x / 20) * 1.5 : 84 + (x / 20) * 0.6} r="1.9" fill={p.b} />
              ))}
            </>
          )}

          {variant === "macro_dual" && (
            <>
              <Path d={toPath(base.map((v, i) => v + i * 0.03), w, h)} stroke={p.a} strokeWidth={2.4} fill="none" />
              <Path d={toPath(alt.map((v, i) => v - i * 0.02), w, h)} stroke={p.c} strokeWidth={2.4} fill="none" />
              {series(seed + 23, 14, 0.4, 0.8, 0).map((v, i, arr) => {
                const step = w / arr.length;
                const x = i * step + 1;
                const barH = Math.max(4, Math.abs(v) * 13);
                return <Rect key={`m_${i}`} x={x} y={h - barH - 4} width={Math.max(4, step - 2)} height={barH} fill={p.d} opacity={0.32} />;
              })}
            </>
          )}

          {variant === "crypto_metric" && (
            <>
              {series(seed + 29, 18, 0, 1, 0).map((v, i, arr) => {
                const step = w / arr.length;
                const x = i * step + 2;
                const barH = Math.max(5, (Math.abs(v) + 0.2) * 15);
                return <Rect key={`c_${i}`} x={x} y={h - barH - 5} width={Math.max(4, step - 3)} height={barH} fill={i % 2 ? p.a : p.b} opacity={0.72} />;
              })}
              <Path d={toPath(base.map((v, i) => v + i * 0.015), w, h)} stroke={p.c} strokeWidth={2.4} fill="none" />
            </>
          )}

          {variant === "risk_dist" && (
            <>
              {[0.1, 0.35, 0.62, 0.82, 1, 0.87, 0.58, 0.32, 0.18].map((v, i, arr) => {
                const step = w / arr.length;
                const x = i * step + 4;
                const barH = v * 78;
                return <Rect key={`r_${i}`} x={x} y={h - barH - 6} width={Math.max(6, step - 5)} height={barH} fill={p.c} opacity={0.75} />;
              })}
              <Line x1="240" y1="10" x2="240" y2={String(h - 4)} stroke={p.a} strokeWidth="2" strokeDasharray="5 5" />
            </>
          )}

          {variant === "timeline" && (
            <>
              <Line x1="18" y1="66" x2="312" y2="66" stroke={p.a} strokeWidth="3" />
              {[44, 116, 188, 260].map((x, idx) => (
                <Circle key={`t_${x}`} cx={x} cy="66" r="8" fill={[p.a, p.b, p.c, p.d][idx % 4]} />
              ))}
              <Rect x="24" y="84" width="84" height="20" rx="6" fill={p.a} opacity={0.25} />
              <Rect x="132" y="84" width="84" height="20" rx="6" fill={p.b} opacity={0.25} />
              <Rect x="240" y="84" width="84" height="20" rx="6" fill={p.c} opacity={0.25} />
            </>
          )}
        </Svg>
      </View>
      <Text style={{ color: sub, fontSize: 11, paddingHorizontal: 12, paddingBottom: 8 }}>
        {legendFor(variant)}
      </Text>
    </View>
  );
}

