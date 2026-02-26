import { usePathname } from "expo-router";
import { useEffect } from "react";
import { DeviceEventEmitter } from "react-native";

const LOGO_SCROLL_EVENT = "tlf.logo.scrollToTop";

export function emitLogoScrollToTop(pathname: string) {
  DeviceEventEmitter.emit(LOGO_SCROLL_EVENT, { pathname });
}

export function useLogoScrollToTop(onScrollTop: () => void) {
  const pathname = usePathname();

  useEffect(() => {
    const sub = DeviceEventEmitter.addListener(LOGO_SCROLL_EVENT, (payload?: { pathname?: string }) => {
      if (!payload?.pathname || payload.pathname !== pathname) return;
      onScrollTop();
    });
    return () => sub.remove();
  }, [onScrollTop, pathname]);
}
