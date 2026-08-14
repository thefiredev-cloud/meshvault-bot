export interface MeshVaultDesktop {
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
    meshvaultDesktop?: MeshVaultDesktop;
  }
}

export function desktopBridge(): MeshVaultDesktop | undefined {
  return typeof window === "undefined" ? undefined : window.meshvaultDesktop;
}

export function windowChromeKind(desktop?: MeshVaultDesktop): "spacer" | "darwin" | "controls" {
  if (!desktop) return "spacer";
  if (desktop.platform === "darwin") return "darwin";
  return "controls";
}
