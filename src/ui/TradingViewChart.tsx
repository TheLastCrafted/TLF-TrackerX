import { useMemo } from "react";
import { Platform, View } from "react-native";

type Props = {
  symbol: string;
  interval: "5" | "15" | "60" | "240" | "D";
  locale: "en" | "de";
  theme: "dark" | "light";
  showVolume: boolean;
  showIndicators: boolean;
};

function escapeJs(input: string): string {
  return input.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}

export function TradingViewChart(props: Props) {
  const html = useMemo(() => {
    const studies = props.showIndicators
      ? "['RSI@tv-basicstudies','MACD@tv-basicstudies','MASimple@tv-basicstudies']"
      : "[]";

    return `<!doctype html>
<html>
  <head>
    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />
    <style>
      html, body, #tv { margin:0; padding:0; width:100%; height:100%; background:${props.theme === "dark" ? "#0F0F16" : "#FFFFFF"}; }
    </style>
  </head>
  <body>
    <div id=\"tv\"></div>
    <script src=\"https://s3.tradingview.com/tv.js\"></script>
    <script>
      new TradingView.widget({
        container_id: 'tv',
        autosize: true,
        symbol: '${escapeJs(props.symbol)}',
        interval: '${escapeJs(props.interval)}',
        timezone: 'Etc/UTC',
        theme: '${escapeJs(props.theme)}',
        style: '1',
        locale: '${escapeJs(props.locale)}',
        toolbar_bg: '${props.theme === "dark" ? "#0F0F16" : "#F3F3F7"}',
        hide_top_toolbar: false,
        hide_side_toolbar: false,
        allow_symbol_change: true,
        withdateranges: true,
        save_image: true,
        studies: ${studies},
        disabled_features: ${props.showVolume ? "[]" : "['volume_force_overlay']"}
      });
    </script>
  </body>
</html>`;
  }, [props.interval, props.locale, props.showIndicators, props.showVolume, props.symbol, props.theme]);

  if (Platform.OS === "web") {
    const IFrame: any = "iframe";
    return (
      <View
        style={{
          height: 520,
          borderRadius: 16,
          overflow: "hidden",
          borderWidth: 1,
          borderColor: props.theme === "dark" ? "#1A1A24" : "#D7E0F0",
          backgroundColor: props.theme === "dark" ? "#0F0F16" : "#FFFFFF",
        }}
      >
        <IFrame
          title={`tv-${props.symbol}`}
          srcDoc={html}
          sandbox="allow-scripts allow-same-origin allow-popups allow-forms"
          style={{ width: "100%", height: "100%", border: "none" }}
        />
      </View>
    );
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const NativeWebView = require("react-native-webview").WebView as any;
  return (
    <View style={{ height: 520, borderRadius: 16, overflow: "hidden", borderWidth: 1, borderColor: props.theme === "dark" ? "#1A1A24" : "#D7E0F0" }}>
      <NativeWebView
        key={`tv-${props.symbol}-${props.interval}-${props.locale}-${props.theme}-${props.showIndicators ? "i1" : "i0"}-${props.showVolume ? "v1" : "v0"}`}
        originWhitelist={["*"]}
        source={{ html }}
        javaScriptEnabled
        domStorageEnabled
        setSupportMultipleWindows={false}
      />
    </View>
  );
}
