import { createFileRoute } from "@tanstack/react-router";
import { MoleculeCanvas } from "@/components/MoleculeCanvas";
import { DnaHelix } from "@/components/DnaHelix";
import { ParticleOverlay } from "@/components/ParticleOverlay";
import { useRef, useState } from "react";

export const Route = createFileRoute("/")({
  component: Landing,
});

function GreenDot() {
  return (
    <span
      className="inline-block h-1.5 w-1.5 rounded-full align-middle animate-dot-pulse mr-2"
      style={{ backgroundColor: "var(--green-dot)" }}
    />
  );
}

// Simple elegant CTA Button matching the reference image
function SimpleButton() {
  return (
    <a
      href="#"
      className="group relative inline-flex items-center gap-3 rounded-full px-8 py-3.5 text-[14px] font-medium text-white transition-all duration-300 ease-out hover:scale-[1.02]"
      style={{
        backgroundColor: "var(--forest)",
        boxShadow: "0 4px 12px rgba(45, 79, 63, 0.15), 0 1px 2px rgba(0,0,0,0.05)",
      }}
    >
      <span className="relative z-10 tracking-wide">Try ClinTrail</span>
      <span
        aria-hidden
        className="relative z-10 inline-block transition-transform duration-300 group-hover:translate-x-1 group-hover:-translate-y-1"
      >
        ↗
      </span>
    </a>
  );
}

function Landing() {
  const containerRef = useRef<HTMLDivElement>(null);


  return (
    <main 
      ref={containerRef}
      className="relative h-screen w-full overflow-hidden bg-background text-foreground bg-noise"
    >
      {/* Ghost molecule layer */}
      <div className="pointer-events-none absolute inset-0 opacity-50 z-0">
        <MoleculeCanvas />
      </div>



      {/* Layer 3: Main Layout */}
      <div className="relative z-10 flex h-full flex-col">
        <section className="grid flex-1 grid-cols-1 gap-6 px-4 py-6 sm:px-10 lg:grid-cols-[minmax(0,55%)_minmax(0,45%)] lg:gap-10 lg:px-12 lg:py-8">
          
          {/* LEFT — Content directly on canvas (No glass panel) */}
          <div className="flex min-h-0 min-w-0 flex-col justify-center z-20">
            {/* Eyebrow */}
            <div
              className="animate-fade-up flex items-center gap-2 label-eyebrow"
              style={{ animationDelay: "140ms", letterSpacing: "0.14em" }}
            >
              <GreenDot /> RAISE 2026 // HEALTHCARE
            </div>

            {/* Heading */}
            <h1
              className="font-display leading-[1.02] tracking-[-0.03em] text-balance mt-4 relative"
              style={{ fontSize: "clamp(36px, 4.6vw, 58px)" }}
            >
              <span
                className="block animate-fade-up font-normal text-foreground"
                style={{ animationDelay: "280ms" }}
              >
                Unlock proof-locked
              </span>
              <span
                className="block animate-fade-up italic font-normal"
                style={{ animationDelay: "420ms", color: "var(--forest)" }}
              >
                clinical trial payments
              </span>
              <span
                className="block animate-fade-up font-normal"
                style={{ animationDelay: "560ms", color: "var(--ghost-deep)" }}
              >
                pending for months.
              </span>
            </h1>

            {/* Paragraph */}
            <p
              className="animate-fade-up max-w-xl text-[14px] lg:text-[15px] leading-[1.75] text-muted-foreground mt-6"
              style={{ animationDelay: "700ms" }}
            >
              A clinical trial invoice is never just an invoice. Each line must match the <span className="font-medium text-foreground">protocol</span>, <span className="font-medium text-foreground">contract</span>, <span className="font-medium text-foreground">budget</span>, <span className="font-medium text-foreground">visit record</span>, <span className="font-medium text-foreground">billing policy</span>, and <span className="font-medium text-foreground">payment history</span> before finance can trust it. ClinTrail is a Vultr-powered enterprise agent that turns that evidence maze into an automated decision workflow — fast-tracking clean invoice lines in seconds, collapsing months of manual review into minutes, catching payment risks, exposing policy gaps before they become audit problems, and continuously improving payment operations across the complex, document-heavy reality of clinical trials.
            </p>

            {/* CTA Button */}
            <div className="animate-fade-up mt-10" style={{ animationDelay: "840ms" }}>
              <SimpleButton />
              
              <p className="text-[10px] leading-[1.6] text-muted-foreground mt-8 font-medium tracking-[0.08em] uppercase max-w-[95%]" style={{ opacity: 0.55 }}>
                Built at RAISE 2026: Battle of Boulevard, Paris <span className="mx-1.5 opacity-50">|</span> Powered by Vultr Serverless Inference — The world's largest privately-held cloud infrastructure company
              </p>
            </div>
          </div>

          {/* RIGHT — Cinematic Spun Silk DNA Helix */}
          <div
            className="animate-helix-entrance relative w-full min-h-[400px] lg:min-h-0 overflow-visible z-10"
          >
            {/* The helix overflows leftward slightly */}
            <div className="absolute inset-0 lg:-left-12 lg:-right-12 lg:-top-16 lg:-bottom-16">
              <DnaHelix />
              <ParticleOverlay />
            </div>
          </div>
          
        </section>
      </div>

    </main>
  );
}
