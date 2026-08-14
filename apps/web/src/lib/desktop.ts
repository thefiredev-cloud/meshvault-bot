export interface MeshBotDesktop {
  platform: string;
  window: {
    close: () => Promise<void>;
    minimize: () => Promise<void>;
    toggleMaximize: () => Promise<void>;
    state: () => Promise<{ minimized: boolean; maximized: boolean; fullScreen: boolean }>;
  };
}

declare global {
  interface Window {
    meshbotDesktop?: MeshBotDesktop;
  }
}

export function desktopBridge(): MeshBotDesktop | undefined {
  return typeof window === "undefined" ? undefined : window.meshbotDesktop;
}

export function windowChromeKind(desktop?: MeshBotDesktop): "spacer" | "darwin" | "controls" {
  if (!desktop) return "spacer";
  if (desktop.platform === "darwin") return "darwin";
  return "controls";
}
