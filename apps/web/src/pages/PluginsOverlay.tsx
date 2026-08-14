import type { ConnectionCatalogItem } from "@meshbot/contracts";
import { Button } from "@meshbot/ui-web";
import { useEffect, useRef, useState } from "react";
import { rpc } from "../lib/rpc";

let cachedCatalog: ConnectionCatalogItem[] = [];

function markConnected(items: ConnectionCatalogItem[], slug: string, connected: boolean) {
  return items.map((entry) => (entry.slug === slug ? { ...entry, connected } : entry));
}

export function PluginsOverlay({ onClose }: { onClose: () => void }) {
  const [catalog, setCatalog] = useState<ConnectionCatalogItem[]>(cachedCatalog);
  const [pending, setPending] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(cachedCatalog.length === 0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  async function refresh() {
    const items = await rpc.connections.catalog({});
    cachedCatalog = items;
    setCatalog(items);
    return items;
  }

  useEffect(() => {
    void refresh()
      .catch((err: unknown) =>
        setError(err instanceof Error ? err.message : "Could not load catalog"),
      )
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  function setItemConnected(slug: string, connected: boolean) {
    cachedCatalog = markConnected(cachedCatalog, slug, connected);
    setCatalog((prev) => markConnected(prev, slug, connected));
  }

  async function connect(item: ConnectionCatalogItem) {
    setError(null);
    setPending(item.slug);
    const popup = window.open("about:blank", "meshbot-composio", "popup,width=720,height=800");
    if (!popup) {
      setError("Allow popups for Mesh Bot, then try Connect again.");
      setPending(null);
      return;
    }
    popup.opener = null;
    try {
      const started = await rpc.connections.begin({ provider: item.slug, displayName: item.name });
      if (!started.authorizationUrl) {
        throw new Error("Composio did not return a sign-in URL.");
      }
      popup.location.replace(started.authorizationUrl);
      for (let i = 0; i < 45; i += 1) {
        const row = await rpc.connections
          .complete({ connectionId: started.connectionId })
          .catch(() => undefined);
        if (row?.status === "connected") {
          setItemConnected(item.slug, true);
          popup.close();
          return;
        }
        if (row?.status === "error") {
          throw new Error("Composio sign-in failed.");
        }
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
      throw new Error("Composio sign-in is still waiting. Finish it, then try Connect again.");
    } catch (err) {
      popup.close();
      setError(err instanceof Error ? err.message : "Could not connect");
    } finally {
      setPending(null);
    }
  }

  async function revoke(item: ConnectionCatalogItem) {
    setError(null);
    setPending(item.slug);
    try {
      const rows = await rpc.connections.list();
      const row = rows.find(
        (entry) => entry.provider === item.slug && entry.status === "connected",
      );
      if (!row) {
        setError(`No connection record found for ${item.name}.`);
        return;
      }
      await rpc.connections.revoke({ connectionId: row.id });
      setItemConnected(item.slug, false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not revoke connection");
    } finally {
      setPending(null);
    }
  }

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(4,4,5,.62)] p-4 sm:p-10">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="plugins-title"
        className="flex w-[680px] max-w-full flex-col overflow-hidden rounded-[26px] border border-[#232326] bg-[#141416] shadow-[0_40px_90px_rgba(0,0,0,.55)]"
      >
        <div className="flex items-start justify-between px-6 pt-6">
          <div>
            <div id="plugins-title" className="text-2xl font-medium text-[#F1F1F2]">
              Plugins
            </div>
            <p className="mt-1 text-[13.5px] text-[#7A7A80]">
              {loading ? "Loading Composio…" : "Connect apps once, then use them in bot chats."}
            </p>
          </div>
          <button
            type="button"
            ref={closeButtonRef}
            aria-label="Close plugins"
            onClick={onClose}
            className="text-[#85858A]"
          >
            ✕
          </button>
        </div>
        <div className="rk-scroll overflow-y-auto px-6 py-5">
          {error ? <p className="mb-4 text-sm text-[#C94244]">{error}</p> : null}
          {!loading && catalog.length === 0 ? (
            <p className="text-[#6C6C70]">Composio is unavailable on this deployment.</p>
          ) : null}
          {catalog.map((item) => (
            <div
              key={item.slug}
              className="flex items-center gap-4 rounded-[13px] border border-[#232326] bg-[#101012] px-4 py-4"
            >
              {item.logo ? (
                <img
                  src={item.logo}
                  alt=""
                  className="h-[42px] w-[42px] rounded-xl bg-[#2C2C30] object-contain"
                />
              ) : (
                <div className="grid h-[42px] w-[42px] place-items-center rounded-xl bg-[#2C2C30] font-semibold">
                  {item.name[0]}
                </div>
              )}
              <div className="min-w-0 flex-1">
                <div className="text-[15.5px] font-medium text-[#ECECEE]">{item.name}</div>
                <div className="text-[13.5px] text-[#7A7A80]">
                  Gmail, Slack, GitHub, calendars, files, and more
                </div>
              </div>
              {item.connected ? (
                <Button
                  type="button"
                  variant="pill"
                  size="sm"
                  disabled={pending === item.slug}
                  onClick={() => void revoke(item)}
                >
                  {pending === item.slug ? "Disconnecting…" : "Disconnect"}
                </Button>
              ) : (
                <Button
                  type="button"
                  variant="pill"
                  size="sm"
                  disabled={pending === item.slug}
                  onClick={() => void connect(item)}
                >
                  {pending === item.slug ? "Connecting…" : "Connect"}
                </Button>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
