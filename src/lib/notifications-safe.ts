import { Platform } from "react-native";

export type NotificationPermissionState = "unknown" | "granted" | "denied" | "unavailable";

type NotificationPayload = {
  title: string;
  body: string;
  data?: Record<string, unknown>;
};

let handlerConfigured = false;

function loadNotificationsModule(): any | null {
  try {
    // Lazy load to keep app compiling in offline/dev environments where
    // expo-notifications may not be installed yet.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require("expo-notifications");
  } catch {
    return null;
  }
}

function ensureHandlerConfigured() {
  const Notifications = loadNotificationsModule();
  if (!Notifications) return false;
  if (handlerConfigured) return;
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: false,
    }),
  });
  handlerConfigured = true;
  return true;
}

function mapPermission(status: string): NotificationPermissionState {
  if (status === "granted") return "granted";
  if (status === "denied") return "denied";
  if (status === "undetermined") return "unknown";
  return "unavailable";
}

async function ensureAndroidChannel() {
  const Notifications = loadNotificationsModule();
  if (!Notifications) return;
  if (Platform.OS !== "android") return;
  await Notifications.setNotificationChannelAsync("price-alerts", {
    name: "Price Alerts",
    importance: Notifications.AndroidImportance.HIGH,
    sound: "default",
    vibrationPattern: [0, 200, 120, 200],
    lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
  });
}

export async function getNotificationPermissionState(): Promise<NotificationPermissionState> {
  if (Platform.OS === "web") return "unavailable";
  try {
    const Notifications = loadNotificationsModule();
    if (!Notifications) return "unavailable";
    ensureHandlerConfigured();
    const perms = await Notifications.getPermissionsAsync();
    return mapPermission(perms.status);
  } catch {
    return "unavailable";
  }
}

export async function requestNotificationPermission(): Promise<NotificationPermissionState> {
  if (Platform.OS === "web") return "unavailable";
  try {
    const Notifications = loadNotificationsModule();
    if (!Notifications) return "unavailable";
    ensureHandlerConfigured();
    await ensureAndroidChannel();
    const current = await Notifications.getPermissionsAsync();
    if (current.status === "granted") return "granted";
    const next = await Notifications.requestPermissionsAsync({
      ios: {
        allowAlert: true,
        allowBadge: true,
        allowSound: true,
      },
    });
    return mapPermission(next.status);
  } catch {
    return "unavailable";
  }
}

export async function sendLocalNotification(payload: NotificationPayload): Promise<boolean> {
  if (Platform.OS === "web") return false;
  try {
    const Notifications = loadNotificationsModule();
    if (!Notifications) return false;
    ensureHandlerConfigured();
    await ensureAndroidChannel();
    const perms = await Notifications.getPermissionsAsync();
    if (perms.status !== "granted") return false;
    await Notifications.scheduleNotificationAsync({
      content: {
        title: payload.title,
        body: payload.body,
        data: payload.data ?? {},
        sound: "default",
      },
      trigger: null,
    });
    return true;
  } catch {
    return false;
  }
}
