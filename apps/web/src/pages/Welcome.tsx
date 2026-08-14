import { useNavigate } from "react-router-dom";
import { WindowChrome } from "./WindowChrome";

// Modified by FireDev LLC dba MeshVault on 2026-08-13.

export function WelcomePage() {
  const navigate = useNavigate();
  return (
    <div className="flex min-h-full flex-col bg-[#08080A]">
      <div className="app-drag flex gap-2 px-5 py-[18px]">
        <WindowChrome />
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6 pb-16 sm:gap-11 sm:pb-[90px]">
        <div className="flex flex-col items-center gap-4 sm:flex-row sm:gap-[26px]">
          <div className="flex h-[72px] w-[72px] items-center justify-center rounded-[20px] bg-[#F2F2F0] p-2 sm:h-[88px] sm:w-[88px] sm:rounded-[24px]">
            <img src="/favicon.svg" alt="" className="h-full w-full" />
          </div>
          <div className="text-[48px] leading-none tracking-[-0.03em] text-white sm:text-[76px]">
            MeshVault
          </div>
        </div>
        <p className="max-w-[600px] text-center text-[22px] leading-[1.4] text-[#E4E4E6] sm:text-[27px]">
          Private bots on computers you control.
          <br />
          Give them real work and watch it happen.
        </p>
        <button
          type="button"
          onClick={() => navigate("/sign-in")}
          className="app-no-drag rounded-full bg-[#1B1B1F] px-[34px] py-[15px] text-[19px] text-[#F2F2F3] transition hover:scale-[1.04] hover:bg-[#26262B]"
        >
          Sign in&nbsp;&nbsp;→
        </button>
      </div>
    </div>
  );
}
