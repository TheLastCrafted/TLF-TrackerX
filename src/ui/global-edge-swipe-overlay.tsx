import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import MaterialIcons from "@expo/vector-icons/MaterialIcons";
import { useGlobalSearchParams, usePathname, useRouter } from "expo-router";
import { Animated, Easing, PanResponder, View, useWindowDimensions } from "react-native";

import { useHapticPress } from "./use-haptic-press";
import { useAppColors } from "./use-app-colors";

const EDGE_WIDTH = 22;
const SWIPE_THRESHOLD = 72;
const SWIPE_PROGRESS_DISTANCE = 92;

function normalizeRoute(pathname: string, params: Record<string, string | string[] | undefined>) {
  const entries = Object.entries(params)
    .filter(([key, value]) => key !== "id" && value != null && value !== "")
    .sort(([a], [b]) => a.localeCompare(b));
  if (!entries.length) return pathname;

  const query = new URLSearchParams();
  for (const [key, value] of entries) {
    if (Array.isArray(value)) {
      for (const v of value) query.append(key, String(v));
    } else {
      query.append(key, String(value));
    }
  }

  const q = query.toString();
  return q ? `${pathname}?${q}` : pathname;
}

export function GlobalEdgeSwipeOverlay() {
  const router = useRouter();
  const pathname = usePathname();
  const globalParams = useGlobalSearchParams();
  const { width: screenWidth, height: screenHeight } = useWindowDimensions();
  const colors = useAppColors();
  const haptic = useHapticPress();

  const [historyTick, setHistoryTick] = useState(0);
  const [leftEdgeY, setLeftEdgeY] = useState(0);
  const [rightEdgeY, setRightEdgeY] = useState(0);

  const leftProgress = useRef(new Animated.Value(0)).current;
  const rightProgress = useRef(new Animated.Value(0)).current;
  const leftDxRef = useRef(0);
  const rightDxRef = useRef(0);
  const leftLockedYRef = useRef<number | null>(null);
  const rightLockedYRef = useRef<number | null>(null);
  const skipHistoryRecordRef = useRef(false);
  const historyRef = useRef<string[]>([]);
  const historyIndexRef = useRef(-1);

  const currentRoute = useMemo(
    () =>
      normalizeRoute(
        pathname || "/",
        globalParams as Record<string, string | string[] | undefined>
      ),
    [globalParams, pathname]
  );

  useEffect(() => {
    if (!currentRoute) return;
    const history = historyRef.current;
    const currentIndex = historyIndexRef.current;

    if (skipHistoryRecordRef.current) {
      skipHistoryRecordRef.current = false;
      if (history[currentIndex] !== currentRoute) {
        historyRef.current = [...history.slice(0, Math.max(0, currentIndex + 1)), currentRoute];
        historyIndexRef.current = historyRef.current.length - 1;
      }
      setHistoryTick((v) => v + 1);
      return;
    }

    if (!history.length) {
      historyRef.current = [currentRoute];
      historyIndexRef.current = 0;
      setHistoryTick((v) => v + 1);
      return;
    }

    if (history[currentIndex] === currentRoute) return;
    if (currentIndex > 0 && history[currentIndex - 1] === currentRoute) {
      historyIndexRef.current = currentIndex - 1;
      setHistoryTick((v) => v + 1);
      return;
    }
    if (currentIndex < history.length - 1 && history[currentIndex + 1] === currentRoute) {
      historyIndexRef.current = currentIndex + 1;
      setHistoryTick((v) => v + 1);
      return;
    }

    const nextHistory = [...history.slice(0, Math.max(0, currentIndex + 1)), currentRoute];
    historyRef.current = nextHistory;
    historyIndexRef.current = nextHistory.length - 1;
    setHistoryTick((v) => v + 1);
  }, [currentRoute]);

  const canGoBack = historyTick >= 0 && historyIndexRef.current > 0;
  const canGoForward =
    historyTick >= 0 && historyIndexRef.current >= 0 && historyIndexRef.current < historyRef.current.length - 1;

  const animateTo = useCallback((progress: Animated.Value, toValue: number, duration = 140, onDone?: () => void) => {
    Animated.timing(progress, {
      toValue,
      duration,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished && onDone) onDone();
    });
  }, []);

  const goHistory = useCallback((direction: -1 | 1) => {
    const history = historyRef.current;
    const nextIndex = historyIndexRef.current + direction;
    const target = history[nextIndex];
    if (!target) return;
    skipHistoryRecordRef.current = true;
    historyIndexRef.current = nextIndex;
    setHistoryTick((v) => v + 1);
    router.replace(target as never);
  }, [router]);

  const leftPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => canGoBack && evt.nativeEvent.pageX <= EDGE_WIDTH,
        onMoveShouldSetPanResponder: (_evt, g) => canGoBack && g.dx > 10 && Math.abs(g.dy) < 24,
        onPanResponderGrant: (evt) => {
          const y = Math.max(24, Math.min(screenHeight - 24, evt.nativeEvent.pageY));
          leftLockedYRef.current = y;
          setLeftEdgeY(y);
        },
        onPanResponderMove: (evt, g) => {
          const dx = Math.max(0, g.dx);
          leftDxRef.current = dx;
          const y = Math.max(24, Math.min(screenHeight - 24, evt.nativeEvent.pageY));
          setLeftEdgeY(y);
          leftProgress.setValue(Math.max(0, Math.min(1, dx / SWIPE_PROGRESS_DISTANCE)));
        },
        onPanResponderRelease: () => {
          const shouldNavigate = leftDxRef.current > SWIPE_THRESHOLD && canGoBack;
          leftDxRef.current = 0;
          leftLockedYRef.current = null;
          if (shouldNavigate) {
            haptic("light");
            animateTo(leftProgress, 1, 110, () => {
              goHistory(-1);
              leftProgress.setValue(0);
            });
            return;
          }
          animateTo(leftProgress, 0, 130);
        },
        onPanResponderTerminate: () => {
          leftDxRef.current = 0;
          leftLockedYRef.current = null;
          animateTo(leftProgress, 0, 130);
        },
      }),
    [animateTo, canGoBack, goHistory, haptic, leftProgress, screenHeight]
  );

  const rightPan = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: (evt) => canGoForward && evt.nativeEvent.pageX >= screenWidth - EDGE_WIDTH,
        onMoveShouldSetPanResponder: (_evt, g) => canGoForward && g.dx < -10 && Math.abs(g.dy) < 24,
        onPanResponderGrant: (evt) => {
          const y = Math.max(24, Math.min(screenHeight - 24, evt.nativeEvent.pageY));
          rightLockedYRef.current = y;
          setRightEdgeY(y);
        },
        onPanResponderMove: (evt, g) => {
          const dx = Math.max(0, -g.dx);
          rightDxRef.current = dx;
          const y = Math.max(24, Math.min(screenHeight - 24, evt.nativeEvent.pageY));
          setRightEdgeY(y);
          rightProgress.setValue(Math.max(0, Math.min(1, dx / SWIPE_PROGRESS_DISTANCE)));
        },
        onPanResponderRelease: () => {
          const shouldNavigate = rightDxRef.current > SWIPE_THRESHOLD && canGoForward;
          rightDxRef.current = 0;
          rightLockedYRef.current = null;
          if (shouldNavigate) {
            haptic("light");
            animateTo(rightProgress, 1, 110, () => {
              goHistory(1);
              rightProgress.setValue(0);
            });
            return;
          }
          animateTo(rightProgress, 0, 130);
        },
        onPanResponderTerminate: () => {
          rightDxRef.current = 0;
          rightLockedYRef.current = null;
          animateTo(rightProgress, 0, 130);
        },
      }),
    [animateTo, canGoForward, goHistory, haptic, rightProgress, screenHeight, screenWidth]
  );

  const leftOpacity = leftProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.95] });
  const leftX = leftProgress.interpolate({ inputRange: [0, 1], outputRange: [-22, 8] });
  const leftScaleX = leftProgress.interpolate({ inputRange: [0, 1], outputRange: [0.58, 1.16] });
  const leftScaleY = leftProgress.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] });

  const rightOpacity = rightProgress.interpolate({ inputRange: [0, 1], outputRange: [0, 0.95] });
  const rightX = rightProgress.interpolate({ inputRange: [0, 1], outputRange: [22, -8] });
  const rightScaleX = rightProgress.interpolate({ inputRange: [0, 1], outputRange: [0.58, 1.16] });
  const rightScaleY = rightProgress.interpolate({ inputRange: [0, 1], outputRange: [0.72, 1] });

  const bubbleBg = colors.dark ? "#8E63F0" : "#7A58D6";
  const bubbleBorder = colors.dark ? "#A98BFF" : "#6E4BC4";
  const bubbleIcon = colors.dark ? "#EEE4FF" : "#5A3AAA";

  return (
    <View pointerEvents="box-none" style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}>
      <View
        {...leftPan.panHandlers}
        pointerEvents={canGoBack ? "box-only" : "none"}
        style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: EDGE_WIDTH, zIndex: 92 }}
      />
      <View
        {...rightPan.panHandlers}
        pointerEvents={canGoForward ? "box-only" : "none"}
        style={{ position: "absolute", right: 0, top: 0, bottom: 0, width: EDGE_WIDTH, zIndex: 92 }}
      />

      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          left: 0,
          top: Math.max(14, Math.min(screenHeight - 70, leftEdgeY - 28)),
          width: 56,
          height: 56,
          opacity: leftOpacity,
          backgroundColor: bubbleBg,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: bubbleBorder,
          transform: [{ translateX: leftX }, { scaleX: leftScaleX }, { scaleY: leftScaleY }],
          alignItems: "center",
          justifyContent: "center",
          zIndex: 91,
        }}
      >
        <MaterialIcons name="arrow-back-ios-new" size={14} color={bubbleIcon} />
      </Animated.View>

      <Animated.View
        pointerEvents="none"
        style={{
          position: "absolute",
          right: 0,
          top: Math.max(14, Math.min(screenHeight - 70, rightEdgeY - 28)),
          width: 56,
          height: 56,
          opacity: rightOpacity,
          backgroundColor: bubbleBg,
          borderRadius: 999,
          borderWidth: 1,
          borderColor: bubbleBorder,
          transform: [{ translateX: rightX }, { scaleX: rightScaleX }, { scaleY: rightScaleY }],
          alignItems: "center",
          justifyContent: "center",
          zIndex: 91,
        }}
      >
        <MaterialIcons name="arrow-forward-ios" size={14} color={bubbleIcon} />
      </Animated.View>
    </View>
  );
}
