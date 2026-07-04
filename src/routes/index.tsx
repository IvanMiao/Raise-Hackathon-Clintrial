import { createFileRoute } from "@tanstack/react-router";
import { MoleculeCanvas } from "@/components/MoleculeCanvas";
import { ArrowRight } from "lucide-react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function Landing() {
  return (
    <main className="relative min-h-screen w-full overflow-hidden bg-background text-foreground">
      {/* background grid + radial glows */}
      <div className="absolute inset-0 bg-grid opacity-60" />
      <div
        className="pointer-events-none absolute -top-40 -left-40 h-[520px] w-[520px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, oklch(0.78 0.15 180 / 0.18), transparent 60%)" }}
      />
      <div
        className="pointer-events-none absolute -bottom-40 right-0 h-[520px] w-[520px] rounded-full blur-3xl"
        style={{ background: "radial-gradient(circle, oklch(0.65 0.14 240 / 0.15), transparent 60%)" }}
      />

      <div className="relative z-10 mx-auto flex min-h-screen w-full max-w-[1400px] flex-col lg:flex-row">
        {/* LEFT */}
        <section className="flex w-full flex-col justify-center gap-7 px-6 py-14 sm:px-10 lg:w-[55%] lg:px-16 lg:py-20">
          <div className="animate-fade-up" style={{ animationDelay: "0ms" }}>
            <span className="inline-flex items-center gap-2 rounded-full border border-teal/25 bg-teal/5 px-3 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-teal">
              <span className="h-1.5 w-1.5 rounded-full bg-teal shadow-[0_0_10px_var(--teal)]" />
              RAISE 2026 · Vultr Track · Healthcare
            </span>
          </div>

          <div className="animate-fade-up" style={{ animationDelay: "80ms" }}>
            <p className="text-xs font-semibold uppercase tracking-[0.28em] text-muted-foreground">
              ClinTrial Intelligence
            </p>
          </div>

          <h1
            className="animate-fade-up text-balance text-4xl font-bold leading-[1.05] tracking-tight text-foreground text-glow-teal sm:text-5xl lg:text-[56px]"
            style={{ animationDelay: "160ms" }}
          >
            Clinical trials should not{" "}
            <span className="italic font-light">run from PDFs.</span>
          </h1>

          <p
            className="animate-fade-up max-w-xl text-lg font-medium leading-snug text-teal sm:text-xl lg:text-2xl"
            style={{ animationDelay: "260ms" }}
          >
            ClinTrail turns trial protocols into a live operations agent for hospital research teams.
          </p>

          <p
            className="animate-fade-up max-w-xl text-base leading-relaxed text-muted-foreground"
            style={{ animationDelay: "340ms" }}
          >
            It closes the gap between complex protocol documents and real-world site execution — helping
            teams catch missing actions, review risks, and create cited compliance evidence before
            deviations happen.
          </p>

          {/* stats */}
          <div
            className="animate-fade-up grid max-w-xl grid-cols-1 gap-4 border-y border-border/60 py-6 sm:grid-cols-2"
            style={{ animationDelay: "420ms" }}
          >
            <div>
              <div className="font-mono text-2xl font-semibold tracking-tight text-foreground">
                80% <span className="text-muted-foreground text-lg">of sites</span>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                have &lt; 6 months operating cash
              </div>
            </div>
            <div>
              <div className="font-mono text-2xl font-semibold tracking-tight text-foreground">
                90–180 <span className="text-muted-foreground text-lg">days</span>
              </div>
              <div className="mt-1 text-sm text-muted-foreground">
                average payment delay to trial sites
              </div>
            </div>
          </div>

          <div className="animate-fade-up flex flex-col gap-4" style={{ animationDelay: "500ms" }}>
            <a
              href="#"
              className="group inline-flex w-fit items-center gap-2 rounded-lg bg-teal px-6 py-3.5 text-sm font-semibold text-primary-foreground transition-all hover:brightness-110 hover:-translate-y-0.5"
              style={{
                boxShadow:
                  "0 10px 30px -8px oklch(0.78 0.15 180 / 0.55), 0 0 0 1px oklch(0.85 0.17 180 / 0.4) inset",
              }}
            >
              Try ClinTrail
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </a>
            <p className="text-xs text-muted-foreground">
              Built at RAISE 2026, Paris · Powered by Vultr Serverless Inference
            </p>
          </div>
        </section>

        {/* RIGHT */}
        <section className="relative h-[420px] w-full lg:h-auto lg:w-[45%]">
          <div className="absolute inset-0">
            <MoleculeCanvas />
          </div>
          <div
            className="pointer-events-none absolute inset-0 lg:bg-gradient-to-r lg:from-background lg:via-transparent lg:to-transparent"
            aria-hidden
          />
        </section>
      </div>
    </main>
  );
}
