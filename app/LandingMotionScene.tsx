"use client";

import { DnaHelix } from "./DnaHelix";
import { MoleculeCanvas } from "./MoleculeCanvas";
import { ParticleOverlay } from "./ParticleOverlay";

export function LandingBackgroundCanvas() {
  return (
    <div className="pointer-events-none absolute inset-0 z-0 opacity-50">
      <MoleculeCanvas />
    </div>
  );
}

export function LandingHeroMotion() {
  return (
    <div className="absolute inset-0 lg:-bottom-16 lg:-left-12 lg:-right-12 lg:-top-16">
      <DnaHelix />
      <ParticleOverlay />
    </div>
  );
}
