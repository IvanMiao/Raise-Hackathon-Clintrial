import { createFileRoute } from "@tanstack/react-router";
import { MoleculeCanvas } from "@/components/MoleculeCanvas";

export const Route = createFileRoute("/")({
  component: Landing,
});

function GreenDot() {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full align-middle"
      style={{ backgroundColor: "var(--green-dot)" }}
    />
  );
}

function Landing() {
  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Ghost canvas layer */}
      <div className="pointer-events-none absolute inset-0 opacity-70">
        <MoleculeCanvas />
      </div>

      {/* Ghost watermark text */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-end overflow-hidden animate-ghost-in"
        aria-hidden
      >
        <span
          className="font-display italic leading-none select-none whitespace-nowrap -mr-16 md:-mr-24 lg:-mr-32"
          style={{
            color: "var(--ghost)",
            fontSize: "clamp(180px, 28vw, 340px)",
            fontWeight: 500,
            transform: "translateY(2%)",
          }}
        >
          ClinTrail
        </span>
      </div>

      {/* Content */}
      <div className="relative z-10 flex min-h-screen flex-col">
        {/* NAV */}
        <nav className="flex items-center justify-between px-6 py-6 sm:px-10 lg:px-14 lg:py-8">
          <div className="animate-fade-up text-[15px]" style={{ animationDelay: "0ms" }}>
            <span className="font-semibold text-foreground">ClinTrial</span>
            <span className="text-muted-foreground"> /.</span>
          </div>
          <div
            className="animate-fade-up flex items-center gap-8"
            style={{ animationDelay: "80ms" }}
          >
            <ul className="hidden items-center gap-8 text-[11px] font-medium uppercase tracking-[0.2em] text-muted-foreground md:flex">
              <li><a href="#" className="transition-colors hover:text-foreground">About</a></li>
              <li><a href="#" className="transition-colors hover:text-foreground">Product</a></li>
              <li><a href="#" className="transition-colors hover:text-foreground">Research</a></li>
            </ul>
            <a
              href="#"
              className="inline-flex items-center gap-1.5 rounded-full bg-primary px-4 py-2 text-[11px] font-medium uppercase tracking-[0.2em] text-primary-foreground transition-transform hover:-translate-y-px"
            >
              Contact <span aria-hidden>↗</span>
            </a>
          </div>
        </nav>

        {/* HERO */}
        <section className="flex flex-1 flex-col gap-14 px-6 pb-32 pt-8 sm:px-10 lg:flex-row lg:gap-10 lg:px-14 lg:pb-28 lg:pt-12">
          {/* LEFT */}
          <div className="flex flex-col justify-center gap-8 lg:w-[58%]">
            <div
              className="animate-fade-up flex items-center gap-2 label-eyebrow"
              style={{ animationDelay: "180ms" }}
            >
              <GreenDot /> RAISE 2026 // FINANCE · HEALTHCARE
            </div>

            <h1
              className="font-display leading-[1.02] tracking-[-0.02em]"
              style={{ fontSize: "clamp(48px, 7.2vw, 84px)" }}
            >
              <span
                className="block animate-fade-up font-normal text-foreground"
                style={{ animationDelay: "260ms" }}
              >
                Every invoice
              </span>
              <span
                className="block animate-fade-up italic font-normal"
                style={{ animationDelay: "380ms", color: "var(--forest)" }}
              >
                deserves proof
              </span>
              <span
                className="block animate-fade-up font-normal text-foreground"
                style={{ animationDelay: "500ms" }}
              >
                before payment.
              </span>
            </h1>
          </div>

          {/* RIGHT */}
          <div className="flex flex-col justify-center gap-8 lg:w-[42%] lg:pt-24">
            <p
              className="animate-fade-up max-w-md text-[17px] leading-[1.7] text-muted-foreground lg:ml-auto lg:text-right"
              style={{ animationDelay: "620ms" }}
            >
              Pharma pays clinical trial sites against{" "}
              <span className="font-semibold text-foreground">protocols</span>,{" "}
              <span className="font-semibold text-foreground">contracts</span>, and{" "}
              <span className="font-semibold text-foreground">visit logs</span> — documents nobody cross-checks until the auditor arrives. ClinTrail reads them all, scores the evidence behind every line item, and tells finance what's{" "}
              <span className="font-semibold text-foreground">safe to pay</span>, what needs a{" "}
              <span className="font-semibold text-foreground">second look</span>, and where the{" "}
              <span className="font-semibold text-foreground">rules don't exist yet</span>.
            </p>

            <div
              className="animate-fade-up flex flex-col gap-3 lg:items-end"
              style={{ animationDelay: "740ms" }}
            >
              <a
                href="#"
                className="inline-flex w-fit items-center gap-2 rounded-full bg-primary px-6 py-3 text-[13px] font-medium text-primary-foreground transition-transform hover:-translate-y-px"
                style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}
              >
                Try ClinTrail <span aria-hidden>↗</span>
              </a>
              <p className="text-[11px] text-muted-foreground lg:text-right">
                Built at RAISE 2026, Paris · Powered by Vultr Serverless Inference
              </p>
            </div>

            {/* scroll indicator */}
            <div
              className="animate-fade-up mt-4 hidden items-center gap-3 lg:ml-auto lg:flex"
              style={{ animationDelay: "860ms" }}
            >
              <span className="label-eyebrow">Scroll</span>
              <span
                className="flex h-6 w-6 items-center justify-center rounded-full border"
                style={{ borderColor: "var(--ghost-deep)" }}
              >
                <span
                  className="h-1 w-1 rounded-full"
                  style={{ backgroundColor: "var(--muted-foreground)" }}
                />
              </span>
            </div>
          </div>
        </section>

        {/* BOTTOM BAR */}
        <div
          className="animate-fade-up absolute inset-x-0 bottom-0 border-t px-6 py-5 sm:px-10 lg:px-14"
          style={{ animationDelay: "900ms", borderColor: "var(--border)" }}
        >
          <div className="flex flex-col items-start justify-between gap-3 md:flex-row md:items-center">
            <div className="flex items-center gap-2 label-eyebrow">
              <GreenDot /> Systems // View
            </div>
            <ul className="flex flex-wrap items-center gap-x-6 gap-y-2 label-eyebrow">
              <li>• EVIDENCE SCORING</li>
              <li>• PAYMENT GOVERNANCE</li>
              <li>• POLICY GAP DETECTION</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
