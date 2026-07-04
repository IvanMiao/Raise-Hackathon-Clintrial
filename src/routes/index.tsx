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
            color: "#f0ede9",
            fontSize: "clamp(200px, 32vw, 400px)",
            fontWeight: 500,
            transform: "translateY(2%)",
          }}
        >
          ClinTrail
        </span>
      </div>

      {/* Content */}
      <div className="relative z-10 flex min-h-screen flex-col">
        {/* HERO */}
        <section className="flex flex-1 flex-col gap-14 px-6 pb-32 pt-16 sm:px-10 lg:flex-row lg:gap-10 lg:px-14 lg:pb-28 lg:pt-24">
          {/* LEFT */}
          <div className="flex flex-col justify-center gap-8 lg:w-[58%]">
            <div
              className="animate-fade-up flex items-center gap-2 label-eyebrow"
              style={{ animationDelay: "180ms" }}
            >
              <GreenDot /> RAISE 2026 // HEALTHCARE
            </div>

            <h1
              className="font-display leading-[0.95] tracking-[-0.03em]"
              style={{ fontSize: "clamp(56px, 9vw, 100px)" }}
            >
              <span
                className="block animate-fade-up font-normal text-foreground"
                style={{ animationDelay: "260ms" }}
              >
                Clinical trial sites can't heal
              </span>
              <span
                className="block animate-fade-up italic font-normal"
                style={{ animationDelay: "380ms", color: "var(--forest)" }}
              >
                while waiting
              </span>
              <span
                className="block animate-fade-up font-normal"
                style={{ animationDelay: "500ms", color: "var(--ghost-deep)" }}
              >
                to get paid.
              </span>
            </h1>
          </div>

          {/* RIGHT */}
          <div className="flex flex-col justify-center gap-8 lg:w-[42%] lg:pt-24">
            <p
              className="animate-fade-up max-w-lg text-[16px] leading-[1.7] text-muted-foreground lg:ml-auto lg:text-right"
              style={{ animationDelay: "620ms" }}
            >
              Clinical trial sites run the studies that bring new treatments to patients. But they wait{" "}
              <span className="font-semibold text-foreground">90 to 180 days</span> to get paid — because every invoice is validated by a human reading a contract. We built the agent that reads the{" "}
              <span className="font-semibold text-foreground">protocol</span>, the{" "}
              <span className="font-semibold text-foreground">contract</span>, the{" "}
              <span className="font-semibold text-foreground">visit log</span>, and the{" "}
              <span className="font-semibold text-foreground">payment history</span> — so finance knows what's safe to pay before the auditor asks.
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
              <li>• PROTOCOL GROUNDED</li>
              <li>• PAYMENT GOVERNANCE</li>
              <li>• AUDIT-READY</li>
            </ul>
          </div>
        </div>
      </div>
    </main>
  );
}
