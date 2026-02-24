import { useRouter } from "expo-router";
import { Pressable, Text, View } from "react-native";

import { useAppMode } from "../state/app-mode";

export function ModeSwitch() {
  const router = useRouter();
  const { mode, setMode } = useAppMode();

  const setAndNavigate = (next: "informational" | "personal") => {
    if (next === mode) return;
    setMode(next);
    if (next === "personal") {
      router.replace("/tools");
      return;
    }
    router.replace("/(tabs)");
  };

  return (
    <View
      style={{
        borderRadius: 18,
        borderWidth: 1,
        borderColor: "#333852",
        backgroundColor: "#131A2A",
        padding: 4,
        gap: 4,
        shadowColor: "#000000",
        shadowOpacity: 0.22,
        shadowRadius: 8,
        shadowOffset: { width: 0, height: 3 },
        elevation: 2,
      }}
    >
      <Text style={{ color: "#A8ACCA", fontSize: 10, fontWeight: "800", textAlign: "center", letterSpacing: 0.4 }}>
        {mode === "informational" ? "INFORMATION VIEW" : "PERSONAL VIEW"}
      </Text>
      <View style={{ flexDirection: "row", gap: 4 }}>
      {([
        ["informational", "Info"],
        ["personal", "Personal"],
      ] as const).map(([value, label]) => {
        const active = mode === value;
        return (
          <Pressable
            key={value}
            onPress={() => setAndNavigate(value)}
            style={({ pressed }) => ({
              borderRadius: 999,
              paddingHorizontal: 11,
              paddingVertical: 7,
              backgroundColor: pressed ? "#222942" : active ? "#372B63" : "transparent",
            })}
          >
            <Text style={{ color: active ? "#D8CAFF" : "#B8C0DE", fontWeight: "800", fontSize: 11 }}>{label}</Text>
          </Pressable>
        );
      })}
      </View>
    </View>
  );
}
