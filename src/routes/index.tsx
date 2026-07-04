import { createFileRoute } from "@tanstack/react-router";
import { MoleculeCanvas } from "@/components/MoleculeCanvas";
import { DnaHelix } from "@/components/DnaHelix";

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
    <main className="relative h-screen w-full overflow-hidden bg-background text-foreground">
      {/* Ghost molecule layer */}
      <div className="pointer-events-none absolute inset-0 opacity-40">
        <MoleculeCanvas />
      </div>

      {/* Ghost watermark text */}
      <div
        className="pointer-events-none absolute inset-0 flex items-center justify-start overflow-hidden animate-ghost-in"
        aria-hidden
      >
        <span
          className="font-display italic leading-none select-none whitespace-nowrap -ml-24 md:-ml-32 lg:-ml-40"
          style={{
            color: "#f0ede9",
            fontSize: "clamp(180px, 28vw, 360px)",
            fontWeight: 500,
            transform: "translateY(2%)",
            opacity: 0.7,
          }}
        >
          ClinTrail
        </span>
      </div>

      {/* Content */}
      <div className="relative z-10 flex h-full flex-col">
        <section className="grid flex-1 grid-cols-1 gap-8 px-6 py-10 sm:px-10 lg:grid-cols-[52%_48%] lg:gap-10 lg:px-14 lg:py-12">
          {/* LEFT — all content */}
          <div className="flex min-h-0 flex-col justify-center gap-5">
            <div
              className="animate-fade-up flex items-center gap-2 label-eyebrow"
              style={{ animationDelay: "180ms" }}
            >
              <GreenDot /> RAISE 2026 // HEALTHCARE
            </div>

            <h1
              className="font-display leading-[0.95] tracking-[-0.03em]"
              style={{ fontSize: "clamp(40px, 6.2vw, 76px)" }}
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

            <p
              className="animate-fade-up max-w-lg text-[14px] leading-[1.65] text-muted-foreground"
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
              className="animate-fade-up flex flex-col items-start gap-2"
              style={{ animationDelay: "740ms" }}
            >
              <a
                href="#"
                className="inline-flex w-fit items-center gap-2 rounded-full bg-primary px-5 py-2.5 text-[13px] font-medium text-primary-foreground transition-transform hover:-translate-y-px"
                style={{ boxShadow: "0 1px 2px rgba(0,0,0,0.08)" }}
              >
                Try ClinTrail <span aria-hidden>↗</span>
              </a>
              <p className="text-[11px] text-muted-foreground">
                Built at RAISE 2026, Paris · Powered by Vultr Serverless Inference
              </p>
            </div>
          </div>

          {/* RIGHT — DNA Helix with drifting aurora light-shades */}
          <div
            className="animate-fade-up relative min-h-0 w-full overflow-hidden"
            style={{ animationDelay: "860ms" }}
          >
            {/* Helix sits underneath */}
            <div className="absolute inset-0">
              <DnaHelix />
            </div>

            {/* Aurora gradient shades — soft, drifting, clinical */}
            <div className="pointer-events-none absolute inset-0" aria-hidden>
              <div
                className="aurora-layer"
                style={{
                  background:
                    "radial-gradient(closest-side, rgba(45,79,63,0.55), rgba(45,79,63,0) 70%)",
                  animation: "aurora-a 14s ease-in-out infinite",
                }}
              />
              <div
                className="aurora-layer"
                style={{
                  background:
                    "radial-gradient(closest-side, rgba(255,244,214,0.7), rgba(255,244,214,0) 70%)",
                  animation: "aurora-b 18s ease-in-out infinite",
                  animationDelay: "-4s",
                }}
              />
              <div
                className="aurora-layer"
                style={{
                  background:
                    "radial-gradient(closest-side, rgba(184,204,196,0.55), rgba(184,204,196,0) 70%)",
                  animation: "aurora-c 22s ease-in-out infinite",
                  animationDelay: "-9s",
                }}
              />

              {/* Slow vertical light sheen sweep */}
              <div
                className="absolute -inset-x-10 top-0 h-[140%]"
                style={{
                  background:
                    "linear-gradient(180deg, transparent 0%, rgba(255,255,255,0.55) 45%, rgba(255,255,255,0.9) 50%, rgba(255,255,255,0.55) 55%, transparent 100%)",
                  mixBlendMode: "overlay",
                  filter: "blur(24px)",
                  animation: "sheen-sweep 9s cubic-bezier(0.65,0,0.35,1) infinite",
                  animationDelay: "2s",
                }}
                aria-hidden
              />

              {/* Subtle inner vignette to keep it editorial */}
              <div
                className="absolute inset-0"
                style={{
                  background:
                    "radial-gradient(120% 90% at 50% 50%, transparent 55%, rgba(249,247,244,0.55) 100%)",
                }}
              />
            </div>
          </div>
        </section>
      </div>

    </main>
  );
}
