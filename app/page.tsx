import {
  LandingBackgroundCanvas,
  LandingHeroMotion,
} from "./LandingMotionScene";

function GreenDot() {
  return <span aria-hidden="true" className="landing-green-dot" />;
}

function WorkspaceButton() {
  return (
    <a className="landing-cta group" href="/workspace">
      <span className="relative z-10 tracking-wide">Try ClinTrial</span>
      <span
        aria-hidden="true"
        className="relative z-10 inline-block transition-transform duration-300 group-hover:-translate-y-1 group-hover:translate-x-1"
      >
        -&gt;
      </span>
    </a>
  );
}

export default function HomePage() {
  return (
    <main className="landing-page landing-noise relative min-h-screen w-full overflow-x-hidden text-slate-950">
      <LandingBackgroundCanvas />

      <div className="relative z-10 flex min-h-screen flex-col">
        <section className="grid flex-1 grid-cols-1 gap-6 px-4 py-6 sm:px-10 lg:grid-cols-[minmax(0,55%)_minmax(0,45%)] lg:gap-10 lg:px-12 lg:py-8">
          <div className="z-20 flex min-h-0 min-w-0 flex-col justify-center">
            <div className="animate-fade-up label-eyebrow flex items-center gap-2">
              <GreenDot />
              RAISE 2026 // Healthcare
            </div>

            <h1 className="font-display mt-4 text-balance text-[clamp(36px,4.6vw,58px)] font-normal leading-[1.02]">
              <span className="animate-fade-up block text-slate-950 [animation-delay:280ms]">
                Unlock proof-locked
              </span>
              <span className="animate-fade-up block font-normal italic text-[var(--landing-forest)] [animation-delay:420ms]">
                clinical trial payments
              </span>
              <span className="animate-fade-up block text-slate-500 [animation-delay:560ms]">
                pending for months.
              </span>
            </h1>

            <p className="animate-fade-up mt-6 max-w-xl text-[14px] leading-[1.75] text-slate-600 [animation-delay:700ms] lg:text-[15px]">
              A clinical trial invoice is never just an invoice. Each line must
              match the <span className="font-medium text-slate-950">protocol</span>,{" "}
              <span className="font-medium text-slate-950">contract</span>,{" "}
              <span className="font-medium text-slate-950">budget</span>,{" "}
              <span className="font-medium text-slate-950">visit record</span>,{" "}
              <span className="font-medium text-slate-950">billing policy</span>, and{" "}
              <span className="font-medium text-slate-950">payment history</span>{" "}
              before finance can trust it. ClinTrial is a Vultr-powered
              enterprise agent that turns that evidence maze into an automated
              decision workflow — fast-tracking clean invoice lines in seconds,
              collapsing days of manual review into minutes, catching payment
              risks, exposing policy gaps before they become audit problems,
              and improving payment operations across complex clinical trial
              workflows.
            </p>

            <div className="animate-fade-up mt-10 [animation-delay:840ms]">
              <WorkspaceButton />

              <p className="mt-8 max-w-[95%] text-[10px] font-medium uppercase leading-[1.6] tracking-[0.08em] text-slate-500 opacity-[0.55]">
                Built at RAISE 2026: Battle of Boulevard, Paris
                <span className="mx-1.5 opacity-50">|</span>
                Powered by Vultr Serverless Inference
              </p>
            </div>
          </div>

          <div className="animate-helix-entrance relative z-10 min-h-[460px] w-full overflow-visible lg:min-h-[calc(100vh-64px)]">
            <LandingHeroMotion />
          </div>
        </section>
      </div>
    </main>
  );
}
