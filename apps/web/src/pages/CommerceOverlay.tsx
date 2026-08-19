import {
  CommerceError,
  foundingInstallMailto,
  MESHVAULT_CONTACT_EMAIL,
  MESHVAULT_SELL,
  SKILL_PACK_PRICE_USD,
  startSkillPackCheckout,
  submitFoundingInstallLead,
} from "@meshbot/contracts";
import { useEffect, useRef, useState } from "react";

function openExternal(url: string) {
  window.open(url, "_blank", "noopener,noreferrer");
}

export function CommercePanel({
  title = "Optional extras",
  compact = false,
}: {
  title?: string;
  compact?: boolean;
}) {
  const [checkoutPending, setCheckoutPending] = useState(false);
  const [leadPending, setLeadPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [leadStatus, setLeadStatus] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [notes, setNotes] = useState("");

  async function buyPack() {
    setError(null);
    setCheckoutPending(true);
    try {
      await startSkillPackCheckout(openExternal, fetch);
    } catch (err) {
      setError(
        err instanceof CommerceError
          ? err.message
          : "Could not start checkout. No charge was attempted.",
      );
    } finally {
      setCheckoutPending(false);
    }
  }

  async function submitLead() {
    setError(null);
    setLeadStatus(null);
    setLeadPending(true);
    try {
      const result = await submitFoundingInstallLead({ name, email, company, notes }, fetch);
      if (result.status === "submitted") {
        setLeadStatus(`Sent to ${result.inbox}. Someone will reply.`);
        return;
      }
      setLeadStatus(result.message);
      openExternal(foundingInstallMailto({ name, email, company, notes }));
    } catch (err) {
      setError(err instanceof CommerceError ? err.message : "Could not submit the lead.");
    } finally {
      setLeadPending(false);
    }
  }

  return (
    <div className={compact ? "space-y-5" : "space-y-6"}>
      <div>
        <h2 className="text-[22px] font-medium text-[#F1F1F2]">{title}</h2>
        <p className="mt-2 text-[14px] leading-relaxed text-[#85858A]">{MESHVAULT_SELL}</p>
        <p className="mt-2 text-[14px] leading-relaxed text-[#85858A]">
          The application stays Apache-2.0 and self-hosted. These are optional purchases — not
          seats, not a subscription, and not required to run the repo. Native Mac and iPhone clients
          are in development and are not released.
        </p>
      </div>

      <div className="rounded-[16px] border border-[#26262A] bg-[#141416] px-4 py-4">
        <div className="text-[15.5px] font-medium text-[#ECECEE]">
          Agent Skills Starter Pack · ${SKILL_PACK_PRICE_USD}
        </div>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#7A7A80]">
          One-time Markdown skills, runbooks, and examples. Checkout opens Stripe; you complete
          payment yourself. Delivery is a signed download link by email.
        </p>
        <button
          type="button"
          disabled={checkoutPending}
          onClick={() => void buyPack()}
          className="mt-3 rounded-[11px] bg-[#F1F1EF] px-4 py-2 text-[14px] text-[#17171A] disabled:opacity-40"
        >
          {checkoutPending ? "Starting checkout…" : `Buy the $${SKILL_PACK_PRICE_USD} pack`}
        </button>
      </div>

      <form
        className="rounded-[16px] border border-[#26262A] bg-[#141416] px-4 py-4"
        onSubmit={(event) => {
          event.preventDefault();
          void submitLead();
        }}
      >
        <div className="text-[15.5px] font-medium text-[#ECECEE]">Founding install</div>
        <p className="mt-1.5 text-[13.5px] leading-relaxed text-[#7A7A80]">
          Managed install on hardware you own, quoted after a short audit. The runtime stays yours.
          If the form cannot send, it falls back to {MESHVAULT_CONTACT_EMAIL}.
        </p>
        <label className="mt-3 block text-[13px] text-[#85858A]">
          Name
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            required
            autoComplete="name"
            className="mt-1.5 w-full rounded-[11px] border border-[#26262A] bg-transparent px-3 py-2.5 text-[#ECECEE]"
          />
        </label>
        <label className="mt-3 block text-[13px] text-[#85858A]">
          Email
          <input
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            type="email"
            required
            autoComplete="email"
            className="mt-1.5 w-full rounded-[11px] border border-[#26262A] bg-transparent px-3 py-2.5 text-[#ECECEE]"
          />
        </label>
        <label className="mt-3 block text-[13px] text-[#85858A]">
          Company
          <input
            value={company}
            onChange={(event) => setCompany(event.target.value)}
            autoComplete="organization"
            className="mt-1.5 w-full rounded-[11px] border border-[#26262A] bg-transparent px-3 py-2.5 text-[#ECECEE]"
          />
        </label>
        <label className="mt-3 block text-[13px] text-[#85858A]">
          Notes
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            className="mt-1.5 w-full rounded-[11px] border border-[#26262A] bg-transparent px-3 py-2.5 text-[#ECECEE]"
          />
        </label>
        <button
          type="submit"
          disabled={leadPending}
          className="mt-3 rounded-[11px] border border-[#26262A] px-4 py-2 text-[14px] text-[#ECECEE] disabled:opacity-40"
        >
          {leadPending ? "Sending…" : "Request a founding install"}
        </button>
      </form>

      {error ? <p className="text-sm text-[#E65707]">{error}</p> : null}
      {leadStatus ? <p className="text-sm text-[#9A9AA0]">{leadStatus}</p> : null}
    </div>
  );
}

export function CommerceOverlay({ onClose }: { onClose: () => void }) {
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", closeOnEscape);
    return () => window.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="absolute inset-0 z-30 flex items-center justify-center bg-[rgba(4,4,5,.62)] p-4 sm:p-10">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="commerce-title"
        className="flex w-[560px] max-w-full flex-col overflow-hidden rounded-[26px] border border-[#232326] bg-[#101012] shadow-[0_40px_90px_rgba(0,0,0,.55)]"
      >
        <div className="flex items-start justify-between px-6 pt-6">
          <div id="commerce-title" className="sr-only">
            Optional extras
          </div>
          <button
            type="button"
            ref={closeButtonRef}
            aria-label="Close"
            onClick={onClose}
            className="ml-auto text-[#85858A]"
          >
            ✕
          </button>
        </div>
        <div className="rk-scroll overflow-y-auto px-6 pb-6">
          <CommercePanel />
        </div>
      </div>
    </div>
  );
}
