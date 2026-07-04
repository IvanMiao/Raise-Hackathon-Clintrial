"use client";

import React, { useState, useEffect, useRef, useLayoutEffect } from "react";

// --- TYPES & INTERFACES ---
interface InvoiceLine {
  id: number;
  description: string;
  code: string;
  qty: number;
  unitPrice: number;
  total: number;
  initialStatus: "success" | "warning" | "error" | "excluded";
  currentStatus: "success" | "warning" | "error" | "excluded";
  score: number;
  evidenceTitle: string;
  evidenceDesc: string;
  evidenceQuote: string;
  dbLinks: string[];
}

interface LogEntry {
  time: string;
  level: "INFO" | "SUCCESS" | "WARNING" | "ERROR" | "QUERY" | "JSON";
  text: string;
}

// --- INITIAL DATA CACHE & FALLBACKS ---
const INITIAL_INVOICE_LINES: InvoiceLine[] = [
  {
    id: 1,
    description: "Oncologist Consultation",
    code: "00101",
    qty: 1,
    unitPrice: 325.00,
    total: 325.00,
    initialStatus: "success",
    currentStatus: "success",
    score: 98,
    evidenceTitle: "Validated by Protocol & CTA",
    evidenceDesc: "The oncologist follow-up consult is required for Visit 3 (Day 15) in the clinical trial Schedule of Activities (SoA) for the AstraGen NCT048291 study. The Clinical Trial Agreement (CTA) Annex B specifies that scheduled protocol visits are 100% reimbursable by the sponsor.",
    evidenceQuote: "« CTA Annex B - Research Fees: Line 1.1 - Clinical Oncology Visit: €325.00 reimbursable to site per completed visit. »",
    dbLinks: ["node-soa", "node-cta", "node-consent"]
  },
  {
    id: 2,
    description: "Complete Blood Count (CBC)",
    code: "C17001",
    qty: 1,
    unitPrice: 118.00,
    total: 118.00,
    initialStatus: "success",
    currentStatus: "success",
    score: 95,
    evidenceTitle: "Validated by SoA & Consent",
    evidenceDesc: "CBC lab test (hematology) is required pre-dose at Day 15 for safety monitoring per protocol. Patient consent form signed on 02/05/2023 authorizes study bio-specimen collection. Results are logged in EDC.",
    evidenceQuote: "« Protocol SoA Section 5.3: Exam Schedule - Visit 3: CBC required prior to study drug administration. »",
    dbLinks: ["node-soa", "node-consent", "node-edc"]
  },
  {
    id: 3,
    description: "Electrocardiogram (ECG)",
    code: "L10903",
    qty: 1,
    unitPrice: 80.00,
    total: 80.00,
    initialStatus: "warning",
    currentStatus: "warning",
    score: 72,
    evidenceTitle: "Description mismatch detected (Action Required)",
    evidenceDesc: "The study protocol requires a '12-lead triplicate resting ECG' for Visit 3. The uploaded invoice line only mentions standard 'Electrocardiogram'. The agent cannot auto-verify if the triplicate procedure was performed.",
    evidenceQuote: "« Clintrial Audit Guidelines: If the invoice mentions standard ECG without \"triplicate\", match with investigator notes or request investigator confirmation. »",
    dbLinks: ["node-soa", "node-rules", "node-edc"]
  },
  {
    id: 4,
    description: "Private Room Upgrade (2 Nights)",
    code: "R1003",
    qty: 2,
    unitPrice: 3068.50,
    total: 6137.00,
    initialStatus: "error",
    currentStatus: "error",
    score: 12,
    evidenceTitle: "Comfort charges excluded by CTA",
    evidenceDesc: "Optional private room accommodation (not medically required by the protocol) is explicitly excluded from the Clinical Trial Agreement (CTA). This remains a standard care charge billed to the patient's primary/secondary insurance.",
    evidenceQuote: "« CTA Section 8.1 - Budget Limits: Optional hospital comfort upgrades, including private rooms unless medically indicated for isolation, are excluded from sponsor coverage. »",
    dbLinks: ["node-cta", "node-rules"]
  }
];

export function ClinTrialWorkspace() {
  // --- STATES ---
  const [activeStep, setActiveStep] = useState<"upload" | "scanning" | "results">("upload");
  const [invoiceLines, setInvoiceLines] = useState<InvoiceLine[]>([]);
  const [currentScanningIndex, setCurrentScanningIndex] = useState<number>(-1);
  const [isLocked, setIsLocked] = useState<boolean>(false);
  const [expandedLineId, setExpandedLineId] = useState<number | null>(null);
  const [cameraOpen, setCameraOpen] = useState<boolean>(false);
  const [flashActive, setFlashActive] = useState<boolean>(false);
  const [logs, setLogs] = useState<LogEntry[]>([
    { time: "17:53:07", level: "INFO", text: "Clintrial platform initialized. Ready for invoice ingestion." },
    { time: "17:53:08", level: "INFO", text: "Agent connected to Neon Blanc Hospital EHR. John Doe clinical trial file synchronized." },
    { time: "17:53:09", level: "SUCCESS", text: "clintrial-agent --status: IDLE. Awaiting invoice document..." }
  ]);
  const [scanSteps, setScanSteps] = useState([
    { id: 1, label: "Image Processing & OCR...", status: "pending" as "pending" | "scanning" | "completed" },
    { id: 2, label: "Invoice line segmentation...", status: "pending" },
    { id: 3, label: "EHR & Protocol context retrieval...", status: "pending" },
    { id: 4, label: "Proof quality evaluation...", status: "pending" },
    { id: 5, label: "Payer recommendations generation...", status: "pending" }
  ]);
  const [progressBarFill, setProgressBarFill] = useState<number>(0);
  const [svgPaths, setSvgPaths] = useState<Array<{ d: string; status: string }>>([]);

  // --- REFS ---
  const consoleEndRef = useRef<HTMLDivElement>(null);
  const graphViewportRef = useRef<HTMLDivElement>(null);

  // --- UTILITIES ---
  const formatCurrency = (val: number) => {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "EUR" }).format(val);
  };

  const getLogTime = () => {
    return new Date().toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
  };

  const addLog = (level: LogEntry["level"], text: string) => {
    setLogs((prev) => [...prev, { time: getLogTime(), level, text }]);
  };

  useEffect(() => {
    if (consoleEndRef.current) {
      consoleEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs]);

  // --- SVG CONNECTIONS CALCULATOR ---
  const calculateConnections = () => {
    if (!graphViewportRef.current) return;

    const viewportRect = graphViewportRef.current.getBoundingClientRect();
    const centerNode = document.getElementById("node-active-line");
    if (!centerNode) {
      setSvgPaths([]);
      return;
    }

    const centerRect = centerNode.getBoundingClientRect();
    const x1 = centerRect.left - viewportRect.left + centerRect.width / 2;
    const y1 = centerRect.top - viewportRect.top + centerRect.height / 2;

    let targetIds: string[] = [];
    let statusClass = "active";

    if (activeStep === "scanning" && currentScanningIndex !== -1) {
      const line = invoiceLines[currentScanningIndex];
      if (line) {
        targetIds = line.dbLinks;
        statusClass = line.initialStatus;
      }
    } else if (activeStep === "results" && expandedLineId !== null) {
      const line = invoiceLines.find((l) => l.id === expandedLineId);
      if (line) {
        targetIds = line.dbLinks;
        statusClass = line.currentStatus;
      }
    }

    const paths = targetIds.map((tid) => {
      const node = document.getElementById(tid);
      if (!node) return { d: "", status: "" };
      const nodeRect = node.getBoundingClientRect();
      const x2 = nodeRect.left - viewportRect.left + nodeRect.width / 2;
      const y2 = nodeRect.top - viewportRect.top + nodeRect.height / 2;

      const cx = (x1 + x2) / 2;
      const cy = (y1 + y2) / 2 - 15;

      return {
        d: `M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}`,
        status: statusClass
      };
    }).filter((p) => p.d !== "");

    setSvgPaths(paths);
  };

  useLayoutEffect(() => {
    calculateConnections();
  }, [activeStep, currentScanningIndex, expandedLineId, invoiceLines]);

  useEffect(() => {
    window.addEventListener("resize", calculateConnections);
    return () => window.removeEventListener("resize", calculateConnections);
  }, [activeStep, currentScanningIndex, expandedLineId, invoiceLines]);

  // --- ACTIONS & API AUDITING ---
  const handleReset = () => {
    setActiveStep("upload");
    setInvoiceLines(JSON.parse(JSON.stringify(INITIAL_INVOICE_LINES)));
    setCurrentScanningIndex(-1);
    setIsLocked(false);
    setExpandedLineId(null);
    setSvgPaths([]);
    setProgressBarFill(0);
    setScanSteps(scanSteps.map((s, idx) => ({ ...s, status: idx === 0 ? "scanning" : "pending" })));
    addLog("INFO", "Demo session reset. Ready for new ingestion.");
  };

  const startAnalysis = () => {
    setActiveStep("scanning");
    setInvoiceLines(JSON.parse(JSON.stringify(INITIAL_INVOICE_LINES)));
    addLog("INFO", "[ENGINE] Initiating OCR Ingestion Pipeline...");

    // Step 1 Ingestion OCR Complete
    setTimeout(() => {
      setScanSteps((prev) =>
        prev.map((s) =>
          s.id === 1 ? { ...s, status: "completed" } : s.id === 2 ? { ...s, status: "scanning" } : s
        )
      );
      setProgressBarFill(20);
      addLog("SUCCESS", "[OCR] Extracted hospital billing structure: 4 lines detected.");
    }, 1200);

    // Step 2 Line Segmentation Complete
    setTimeout(() => {
      setScanSteps((prev) =>
        prev.map((s) =>
          s.id === 2 ? { ...s, status: "completed" } : s.id === 3 ? { ...s, status: "scanning" } : s
        )
      );
      setProgressBarFill(40);
      addLog("QUERY", "[DATASTORE] Querying active trial & patient databases for John Doe (ID: P-94812)");
    }, 2400);

    // Step 3 Context sync complete
    setTimeout(() => {
      setScanSteps((prev) =>
        prev.map((s) =>
          s.id === 3 ? { ...s, status: "completed" } : s.id === 4 ? { ...s, status: "scanning" } : s
        )
      );
      setProgressBarFill(60);
      addLog("INFO", "[AUDIT] Launching Vultr Inference verification mapping lines to AstraGen NCT048291...");
      runSequentialLineAudits(0);
    }, 3600);
  };

  const auditLineWithVultrInference = async (line: InvoiceLine): Promise<Partial<InvoiceLine>> => {
    const prompt = `You are Clintrial, an agentic clinical trial billing audit auditor.
We are auditing the following invoice line item from Neon Blanc Hospital for patient John DOE (ID: P-94812) under trial protocol AstraGen NCT048291:
- Item: "${line.description}"
- Code: "${line.code}"
- Qty: ${line.qty}
- Total Price: ${formatCurrency(line.total)}

Here is the context of our trial databases:
1. Protocol Schedule of Activities (SoA): Visit 3 (Day 15) requires: Oncologist Consult, CBC safety hematology lab, and triplicate resting ECG.
2. Clinical Trial Agreement (CTA) & site budget: Oncology Consult (00101) is sponsor-reimbursed at €325.00. CBC (C17001) is sponsor-reimbursed at €118.00. Optional private room / comfort upgrades (R1003) are explicitly excluded from sponsor coverage (CTA Section 8.1).
3. Patient Informed Consent (ICF): Signed by patient on 02/05/2023, authorizes study bio-specimen collection.
4. Patient EHR (EDC): John DOE completed Visit 3 on 15 Aug 2023. Oncology visit and CBC are logged. Standard ECG is logged (but is not labeled triplicate).
5. Billing Rules: Triplicate ECG is required. A standard ECG label cannot be auto-reimbursed without investigator confirmation.

Evaluate this line item. Output a valid raw JSON object matching the following structure:
{
  "status": "success" | "warning" | "error",
  "score": number (0-100),
  "evidenceTitle": "Short title",
  "evidenceDesc": "Detailed compliance analysis matching the line to protocol/CTA evidence.",
  "evidenceQuote": "Direct quote from protocol or CTA supporting the decision."
}

Do NOT wrap the JSON in markdown code blocks like \`\`\`json. Output ONLY the raw JSON.`;

    try {
      const response = await fetch("/api/inference", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ prompt })
      });

      if (!response.ok) {
        throw new Error(`API returned status ${response.status}`);
      }

      const data = await response.json();
      let rawResult = data.result.trim();
      
      if (rawResult.startsWith("```")) {
        rawResult = rawResult.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
      }

      const parsed = JSON.parse(rawResult);
      return {
        currentStatus: parsed.status,
        score: parsed.score || line.score,
        evidenceTitle: parsed.evidenceTitle || line.evidenceTitle,
        evidenceDesc: parsed.evidenceDesc || line.evidenceDesc,
        evidenceQuote: parsed.evidenceQuote || line.evidenceQuote
      };
    } catch (err) {
      console.warn("Inference API call failed or returned malformed JSON. Using local fallback cache. Error details:", err);
      return {
        currentStatus: line.initialStatus,
        score: line.score,
        evidenceTitle: line.evidenceTitle,
        evidenceDesc: line.evidenceDesc,
        evidenceQuote: line.evidenceQuote
      };
    }
  };

  const runSequentialLineAudits = async (index: number) => {
    if (index >= INITIAL_INVOICE_LINES.length) {
      finishAnalysis();
      return;
    }

    setCurrentScanningIndex(index);
    const line = invoiceLines[index] || INITIAL_INVOICE_LINES[index];
    
    addLog("INFO", `[AGENT] Contacting Vultr Inference to audit line ${line.id}: "${line.description}"...`);

    const fillPercent = 60 + ((index + 1) / INITIAL_INVOICE_LINES.length) * 35;
    setProgressBarFill(fillPercent);

    const auditUpdates = await auditLineWithVultrInference(line);

    setInvoiceLines((prev) =>
      prev.map((l) => (l.id === line.id ? { ...l, ...auditUpdates } : l))
    );

    const updatedLine = { ...line, ...auditUpdates };

    if (updatedLine.currentStatus === "success") {
      addLog("SUCCESS", `[AGENT] Match found (Confidence ${updatedLine.score}%): "${updatedLine.description}". Protocol related.`);
      addLog("JSON", JSON.stringify({
        line: updatedLine.description,
        status: "REIMBURSABLE",
        payer: "AstraGen (Sponsor)",
        rule: updatedLine.evidenceTitle,
        evidence: updatedLine.evidenceDesc
      }, null, 2));
    } else if (updatedLine.currentStatus === "warning") {
      addLog("WARNING", `[AGENT] Mismatch flagged (Confidence ${updatedLine.score}%): "${updatedLine.description}". Requires manual review.`);
      addLog("JSON", JSON.stringify({
        line: updatedLine.description,
        status: "REQUIRES_REVIEW",
        reason: updatedLine.evidenceTitle,
        evidence: updatedLine.evidenceDesc
      }, null, 2));
    } else {
      addLog("ERROR", `[AGENT] Coverage denied (Confidence ${updatedLine.score}%): "${updatedLine.description}". Excluded by clinical budget.`);
      addLog("JSON", JSON.stringify({
        line: updatedLine.description,
        status: "STANDARD_CARE_HOSPITAL_CHARGE",
        reason: updatedLine.evidenceTitle,
        evidence: updatedLine.evidenceDesc
      }, null, 2));
    }

    setTimeout(() => {
      runSequentialLineAudits(index + 1);
    }, 1200);
  };

  const finishAnalysis = () => {
    setScanSteps((prev) =>
      prev.map((s) =>
        s.id === 4 ? { ...s, status: "completed" } : s.id === 5 ? { ...s, status: "scanning" } : s
      )
    );
    setProgressBarFill(100);

    setTimeout(() => {
      setScanSteps((prev) => prev.map((s) => (s.id === 5 ? { ...s, status: "completed" } : s)));
      addLog("SUCCESS", "[AUDIT] Compilation complete. Transferring to billing audit summary view.");
      setActiveStep("results");
      setCurrentScanningIndex(-1);
    }, 1000);
  };

  const handleResolveStatus = (lineId: number, status: "success" | "error" | "excluded") => {
    setInvoiceLines((prev) =>
      prev.map((l) => {
        if (l.id === lineId) {
          let logLabel = "";
          if (status === "success") logLabel = "Sponsor AstraGen";
          else if (status === "error") logLabel = "Standard Care";
          else if (status === "excluded") logLabel = "Canceled / Excluded";

          addLog("SUCCESS", `[USER] Manual override on line ${l.id} (${l.description}) -> ${logLabel}`);
          return { ...l, currentStatus: status, score: 100 };
        }
        return l;
      })
    );
  };

  const handleRevertStatus = (lineId: number) => {
    setInvoiceLines((prev) =>
      prev.map((l) => {
        if (l.id === lineId) {
          const original = INITIAL_INVOICE_LINES.find((orig) => orig.id === lineId);
          addLog("INFO", `[USER] Restored original audit suggestion for line ${l.id} (${l.description})`);
          return {
            ...l,
            currentStatus: original?.initialStatus || l.initialStatus,
            score: original?.score || l.score
          };
        }
        return l;
      })
    );
  };

  const handleFinalize = () => {
    setIsLocked(true);
    addLog("SUCCESS", `Comptable audit locked. Transaction of ${formatCurrency(stats.sponsor)} recorded to the AstraGen ledger.`);
    
    const dialog = document.getElementById("finalizeDialog") as HTMLDialogElement;
    if (dialog) {
      dialog.showModal();
    }
  };

  // --- STATS COMPUTATIONS ---
  const stats = (() => {
    let green = 0;
    let orange = 0;
    let red = 0;
    let sponsor = 0;
    let hospital = 0;
    let excluded = 0;
    let total = 0;

    invoiceLines.forEach((l) => {
      total += l.total;
      if (l.currentStatus === "success") {
        green++;
        sponsor += l.total;
      } else if (l.currentStatus === "warning") {
        orange++;
      } else if (l.currentStatus === "error") {
        red++;
        hospital += l.total;
      } else if (l.currentStatus === "excluded") {
        excluded += l.total;
      }
    });

    return { green, orange, red, sponsor, hospital, excluded, total };
  })();

  const activeLine = (() => {
    if (activeStep === "scanning" && currentScanningIndex !== -1) {
      return invoiceLines[currentScanningIndex];
    } else if (activeStep === "results" && expandedLineId !== null) {
      return invoiceLines.find((l) => l.id === expandedLineId);
    }
    return null;
  })();

  return (
    <div className="flex flex-col h-screen p-6 gap-5 bg-cream text-charcoal font-sans">
      
      {/* --- TOP HEADER --- */}
      <header className="flex justify-between items-center px-6 py-4 bg-white border border-ghost rounded-2xl shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-10 h-10 bg-forest/5 border border-forest/10 rounded-xl">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" fill="url(#brandGrad)" />
              <path d="M2 17L12 22L22 17" stroke="url(#brandGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="url(#brandGrad)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <defs>
                <linearGradient id="brandGrad" x1="2" y1="2" x2="22" y2="22" gradientUnits="userSpaceOnUse">
                  <stop stopColor="#2d4f3f"/>
                  <stop offset="1" stopColor="#8a8580"/>
                </linearGradient>
              </defs>
            </svg>
          </div>
          <div className="flex flex-col">
            <h1 className="font-serif italic text-2xl font-normal text-forest leading-none">
              ClinTrail
            </h1>
            <span className="font-sans text-[8px] font-bold text-forest bg-forest/10 px-1.5 py-0.5 rounded-full w-fit mt-1">
              AGENTIC ENGINE v2.4
            </span>
          </div>
        </div>

        {/* Patient & Trial context */}
        <div className="flex items-center bg-cream/60 border border-ghost rounded-xl px-5 py-2 gap-6">
          <div className="flex flex-col">
            <span className="text-[9px] font-bold text-ghost-deep uppercase tracking-widest">Active Patient</span>
            <div className="flex items-center gap-2 text-xs mt-1 text-charcoal">
              <span className="w-5 h-5 bg-forest text-white font-bold text-[9px] flex items-center justify-center rounded-full">
                JD
              </span>
              <strong>John DOE</strong> (ID: P-94812)
            </div>
          </div>
          <div className="w-px h-8 bg-ghost"></div>
          <div className="flex flex-col">
            <span className="text-[9px] font-bold text-ghost-deep uppercase tracking-widest">Clinical Protocol</span>
            <div className="flex items-center gap-2 text-xs mt-1 text-charcoal">
              <span>🔬</span>
              <strong>AstraGen NCT048291</strong>
              <span className="text-[9px] font-bold text-forest bg-forest/10 border border-forest/20 px-2 py-0.5 rounded-full">
                Phase III
              </span>
            </div>
          </div>
        </div>

        <div className="flex gap-2">
          <button className="flex items-center justify-center w-9 h-9 bg-cream/40 border border-ghost rounded-xl text-ghost-deep hover:bg-cream/80 transition-all" title="Settings">
            <svg width="18" height="18" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>
          </button>
          <button className="btn bg-white border border-ghost hover:bg-cream text-charcoal rounded-xl px-4 py-2 text-xs font-semibold transition-all shadow-sm" onClick={handleReset}>
            Reset Demo
          </button>
        </div>
      </header>

      {/* --- MAIN WORKSPACE --- */}
      <main className="grid grid-cols-[55fr_45fr] gap-5 flex-1 h-[calc(100vh-120px)] overflow-hidden">
        
        {/* LEFT PANEL: SYSTEM WORKFLOW */}
        <section className="flex flex-col border border-ghost bg-white rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)] relative">
          
          {/* STEP 1: UPLOAD STATE */}
          {activeStep === "upload" && (
            <div className="flex flex-col h-full animate-fade-up">
              <div className="p-5 border-b border-ghost">
                <span className="text-[9px] font-bold text-forest bg-forest/10 px-2 py-0.5 rounded-full uppercase tracking-wider mb-2 inline-block">
                  Step 1
                </span>
                <h2 className="text-xl font-serif italic text-forest">Invoice Ingestion</h2>
                <p className="text-xs text-ghost-deep mt-1">Upload a billing document or simulate taking a mobile photo.</p>
              </div>
              
              <div className="p-6 flex-1 overflow-y-auto flex flex-col justify-center">
                {/* Dropzone */}
                <div 
                  className="border-2 border-dashed border-ghost hover:border-forest hover:bg-forest/[0.01] rounded-2xl p-10 text-center transition-all cursor-pointer mb-6 flex flex-col items-center justify-center gap-4 group"
                  onClick={() => setCameraOpen(true)}
                >
                  <div className="w-16 h-16 bg-cream flex items-center justify-center rounded-full border border-ghost group-hover:border-forest/30 group-hover:text-forest transition-all">
                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="17 8 12 3 7 8"/><line x1="12" y1="3" x2="12" y2="15"/></svg>
                  </div>
                  <h3 className="text-sm font-semibold text-charcoal">Drag & drop clinical invoice here</h3>
                  <p className="text-xs text-ghost-deep">Supports PDF, PNG, JPG (Max 10MB)</p>
                  <div className="flex gap-3 mt-2">
                    <button className="btn bg-charcoal hover:bg-forest text-cream rounded-full px-5 py-2.5 text-xs font-semibold transition-all shadow-sm">
                      Browse Files
                    </button>
                    <button className="btn bg-white border border-ghost hover:bg-cream text-charcoal rounded-full px-5 py-2.5 text-xs font-semibold flex items-center gap-2 transition-all shadow-sm">
                      <svg width="14" height="14" fill="none" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 015.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 002.25 2.25h15A2.25 2.25 0 0021.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 00-1.134-.175 2.31 2.31 0 01-1.64-1.055l-.822-1.316a2.192 2.192 0 00-1.736-1.039 48.774 48.774 0 00-5.232 0 2.192 2.192 0 00-1.736 1.039l-.821 1.316z"/><path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 11-9 0 4.5 4.5 0 019 0zM18.75 10.5h.008v.008h-.008V10.5z"/></svg>
                      Simulate Capture
                    </button>
                  </div>
                </div>

                {/* Demo Shortcut */}
                <div className="flex justify-between items-center bg-[#fcfbfa] border border-ghost rounded-xl p-4 gap-4">
                  <div className="flex flex-col text-left">
                    <h4 className="text-xs font-bold text-forest">Quick Trial Demo Mode</h4>
                    <p className="text-[11px] text-ghost-deep mt-1 max-w-sm">
                      Ingest the predefined Neon Blanc Hospital oncology invoice for John Doe (CBC, ECG, Oncology Consult, and Private Room Upgrade).
                    </p>
                  </div>
                  <button className="btn bg-charcoal hover:bg-forest text-cream rounded-full px-5 py-2.5 text-xs font-semibold flex items-center gap-2 group transition-all shadow-sm" onClick={startAnalysis}>
                    <span>Load Demo Invoice</span>
                    <span className="group-hover:translate-x-1 transition-transform">→</span>
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* CAMERA SIMULATION OVERLAY */}
          {cameraOpen && (
            <div className="absolute inset-0 bg-black z-50 flex flex-col">
              <div className="h-12 bg-black/80 flex justify-between items-center px-5 font-bold text-xs tracking-wide text-white">
                <span>CLINTRIAL CAPTURE ENGINE</span>
                <button className="text-2xl hover:text-red-400 transition-colors" onClick={() => setCameraOpen(false)}>
                  &times;
                </button>
              </div>

              <div className="flex-1 relative flex items-center justify-center bg-radial from-[#333] to-[#050505] overflow-hidden">
                <div className="absolute w-[70%] h-[75%] border border-white/25 shadow-[0_0_0_1000px_rgba(0,0,0,0.65)] pointer-events-none">
                  {/* Scanner guide corners */}
                  <div className="absolute top-0 left-0 w-6 h-6 border-t-4 border-l-4 border-forest -mt-1 -ml-1"></div>
                  <div className="absolute top-0 right-0 w-6 h-6 border-t-4 border-r-4 border-forest -mt-1 -mr-1"></div>
                  <div className="absolute bottom-0 left-0 w-6 h-6 border-b-4 border-l-4 border-forest -mb-1 -ml-1"></div>
                  <div className="absolute bottom-0 right-0 w-6 h-6 border-b-4 border-r-4 border-forest -mb-1 -mr-1"></div>
                </div>

                <div className="w-[60%] h-[65%] bg-white rounded p-4 shadow-2xl -rotate-2 flex flex-col gap-3 opacity-90 select-none">
                  <div className="flex justify-between text-slate-600 font-extrabold text-[8px] border-b-2 border-slate-200 pb-1">
                    <span>NEON BLANC HOSPITAL</span>
                    <span>Inv #FR-2023-08-15</span>
                  </div>
                  <div className="w-[90%] h-2 bg-slate-200 rounded"></div>
                  <div className="w-[70%] h-2 bg-slate-200 rounded"></div>
                  <div className="w-[85%] h-2 bg-slate-200 rounded"></div>
                  <div className="w-[40%] h-2 bg-slate-200 rounded"></div>
                </div>

                <span className="absolute bottom-5 text-[9px] font-bold tracking-wider text-white bg-black/60 px-3 py-1 rounded-full uppercase">
                  Align Invoice Document and click Shutter
                </span>
              </div>

              <div className="h-24 bg-black/90 flex items-center justify-between px-10">
                <div className="w-11 h-11 bg-slate-800 border-2 border-white rounded cursor-pointer overflow-hidden bg-cover bg-center" style={{ backgroundImage: `url('/assets/invoice_mockup.jpg')` }}></div>
                <button 
                  className="w-16 h-16 rounded-full bg-white border-[4px] border-slate-700 active:scale-90 transition-transform focus:outline-none"
                  onClick={async () => {
                    setFlashActive(true);
                    setTimeout(() => {
                      setFlashActive(false);
                      setCameraOpen(false);
                      addLog("SUCCESS", "Invoice photo captured. Uploading image to OCR pipeline...");
                      startAnalysis();
                    }, 400);
                  }}
                ></button>
                <span className="text-white text-xs font-semibold cursor-pointer hover:text-forest transition-colors">
                  ⚡ Auto
                </span>
              </div>

              {/* Flash effect */}
              {flashActive && <div className="absolute inset-0 bg-white z-50" style={{ animation: "flashAnim 0.3s ease-out" }}></div>}
            </div>
          )}

          {/* STEP 2: SCANNING STATE */}
          {activeStep === "scanning" && (
            <div className="flex flex-col h-full animate-fade-up p-5">
              <div className="mb-4">
                <span className="text-[9px] font-bold text-forest bg-forest/10 px-2 py-0.5 rounded-full uppercase tracking-wider mb-2 inline-block">
                  Step 2
                </span>
                <h2 className="text-xl font-serif italic text-forest">Audit Processing</h2>
                <p className="text-xs text-ghost-deep mt-1">Real-time OCR extraction and compliance alignment.</p>
              </div>

              <div className="flex-1 flex flex-col gap-6 justify-center">
                <div className="flex gap-6 items-center">
                  <div className="w-[180px] h-[240px] relative rounded-xl overflow-hidden border border-ghost bg-[#f5f2ed] shadow-lg">
                    <img src="/assets/invoice_mockup.jpg" alt="Scanning Mockup" className="w-full h-full object-cover opacity-60" />
                    <div className="absolute left-0 w-full h-[3px] bg-gradient-to-r from-transparent via-forest to-transparent shadow-[0_0_8px_#2d4f3f,0_0_15px_#2d4f3f] animate-laser"></div>
                  </div>

                  <div className="flex-1 flex flex-col gap-4 text-left">
                    {scanSteps.map((step) => (
                      <div key={step.id} className={`flex items-center gap-3 text-xs transition-all duration-300 ${step.status === "scanning" ? "opacity-100 scale-[1.02] font-bold text-forest" : step.status === "completed" ? "opacity-80 text-forest" : "opacity-40 text-ghost-deep"}`}>
                        <span className="text-sm">
                          {step.status === "completed" ? "✔️" : step.status === "scanning" ? "⏳" : "⚪"}
                        </span>
                        <span>{step.label}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="w-full h-1.5 bg-ghost rounded-full overflow-hidden">
                  <div className="h-full bg-forest transition-all duration-300 rounded-full" style={{ width: `${progressBarFill}%` }}></div>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: RESULTS SYNTHESIS VIEW */}
          {activeStep === "results" && (
            <div className="flex flex-col h-full animate-fade-up">
              <div className="p-5 border-b border-ghost flex justify-between items-center gap-4">
                <div>
                  <span className="text-[9px] font-bold text-forest bg-forest/10 px-2 py-0.5 rounded-full uppercase tracking-wider mb-2 inline-block">
                    Step 3
                  </span>
                  <h2 className="text-xl font-serif italic text-forest">Audit Synthesis</h2>
                  <p className="text-xs text-ghost-deep mt-1">Review matching outcomes. Approve, reject, or exclude billing entries.</p>
                </div>
                <div className="flex gap-2">
                  <div className="flex flex-col items-center justify-center px-3 py-1.5 bg-forest/10 border border-forest/20 rounded-xl min-w-[70px]">
                    <span className="font-mono text-sm font-extrabold text-forest">{stats.green}</span>
                    <span className="text-[8px] font-bold text-forest uppercase tracking-wider mt-0.5">Approved</span>
                  </div>
                  <div className="flex flex-col items-center justify-center px-3 py-1.5 bg-amber-500/10 border border-amber-500/20 rounded-xl min-w-[70px]">
                    <span className="font-mono text-sm font-extrabold text-amber-700">{stats.orange}</span>
                    <span className="text-[8px] font-bold text-amber-700 uppercase tracking-wider mt-0.5">To Confirm</span>
                  </div>
                  <div className="flex flex-col items-center justify-center px-3 py-1.5 bg-rose-500/10 border border-rose-500/20 rounded-xl min-w-[70px]">
                    <span className="font-mono text-sm font-extrabold text-rose-700">{stats.red}</span>
                    <span className="text-[8px] font-bold text-rose-700 uppercase tracking-wider mt-0.5">Standard</span>
                  </div>
                </div>
              </div>

              <div className="p-5 flex-1 overflow-y-auto flex flex-col gap-4">
                
                {/* LOCKED BANNER */}
                {isLocked && (
                  <div className="flex items-center gap-4 bg-forest/5 border border-forest/20 rounded-xl p-4 animate-fade-up shadow-sm">
                    <div className="w-9 h-9 bg-forest/10 border border-forest/20 rounded-full flex items-center justify-center text-sm text-forest">
                      🔒
                    </div>
                    <div className="flex-1 text-left">
                      <h3 className="text-xs font-bold text-forest">Comptable Audit Locked & Dispatched</h3>
                      <p className="text-[11px] text-ghost-deep mt-0.5">
                        This ledger audit has been sealed. Approved sponsor payouts have been transmitted to AstraGen. Excluded lines were rejected.
                      </p>
                    </div>
                    <button className="btn bg-white border border-ghost hover:bg-cream text-charcoal rounded-full px-4 py-2 text-xs font-semibold shadow-sm" onClick={handleReset}>
                      New Audit
                    </button>
                  </div>
                )}

                {/* SUMMARY BANNER */}
                <div className="flex justify-between items-center bg-cream/40 border border-ghost rounded-xl p-3 text-xs">
                  <div className="flex gap-4 text-ghost-deep">
                    <span>Invoice: <strong>FR-2023-08-15-01</strong></span>
                    <span>Date: <strong>15 Aug 2023</strong></span>
                  </div>
                  <div className="flex gap-4 items-center">
                    <span className="text-[11px]">Sponsor: <strong className="font-mono text-forest">{formatCurrency(stats.sponsor)}</strong></span>
                    <span className="text-[11px]">Standard: <strong className="font-mono text-rose-700">{formatCurrency(stats.hospital)}</strong></span>
                    <span className="text-[11px] text-ghost-deep">Excluded: <strong className="font-mono">{formatCurrency(stats.excluded)}</strong></span>
                    <span className="w-px h-4 bg-ghost"></span>
                    <span className="text-[12px] font-bold">Total: <strong className="font-mono text-charcoal">{formatCurrency(stats.total)}</strong></span>
                  </div>
                </div>

                {/* TABLE OF LINES */}
                <div className="border border-ghost rounded-xl overflow-hidden bg-[#faf9f6]/30 flex-1 overflow-y-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="bg-[#f5f2ed] text-ghost-deep font-bold border-b border-ghost text-[10px] uppercase tracking-wider">
                        <th className="py-2.5 px-4 text-center w-8"></th>
                        <th className="py-2.5 px-4"> soins description</th>
                        <th className="py-2.5 px-4 text-right w-20">Code</th>
                        <th className="py-2.5 px-4 text-center w-12">Qty</th>
                        <th className="py-2.5 px-4 text-right w-24">Total</th>
                        <th className="py-2.5 px-4 w-32">Status</th>
                        <th className="py-2.5 px-4 w-16 text-center">Score</th>
                      </tr>
                    </thead>
                    <tbody>
                      {invoiceLines.map((line) => {
                        const isExpanded = expandedLineId === line.id;
                        
                        let trClass = "border-b border-ghost cursor-pointer hover:bg-[#fcfaf7] transition-colors ";
                        if (line.currentStatus === "success") trClass += "border-l-[3px] border-l-forest bg-forest/[0.01]";
                        else if (line.currentStatus === "warning") trClass += "border-l-[3px] border-l-amber-600 bg-amber-500/[0.01]";
                        else if (line.currentStatus === "error") trClass += "border-l-[3px] border-l-rose-700 bg-rose-500/[0.01]";
                        else if (line.currentStatus === "excluded") trClass += "border-l-[3px] border-l-ghost-deep opacity-45 bg-[#f5f2ed] line-through text-ghost-deep";

                        return (
                          <React.Fragment key={line.id}>
                            {/* Main Row */}
                            <tr 
                              id={`row-invoice-line-${line.id}`}
                              className={trClass}
                              onClick={() => setExpandedLineId(isExpanded ? null : line.id)}
                            >
                              <td className="py-3 px-4 text-center">
                                <span className={`text-ghost-deep inline-block transition-transform duration-200 ${isExpanded ? "rotate-90" : ""}`}>
                                  ▶
                                </span>
                              </td>
                              <td className="py-3 px-4">
                                <strong className={line.currentStatus === "excluded" ? "text-ghost-deep" : "text-charcoal font-semibold"}>
                                  {line.description}
                                </strong>
                              </td>
                              <td className="py-3 px-4 text-right">
                                <code className="font-mono text-[10px] text-ghost-deep">{line.code}</code>
                              </td>
                              <td className="py-3 px-4 text-center">{line.qty}</td>
                              <td className="py-3 px-4 text-right font-bold">{formatCurrency(line.total)}</td>
                              <td className="py-3 px-4">
                                {line.currentStatus === "success" && <span className="inline-flex items-center text-[9px] font-bold text-forest bg-forest/10 border border-forest/20 px-2 py-0.5 rounded-full uppercase tracking-wider">Reimbursable</span>}
                                {line.currentStatus === "warning" && <span className="inline-flex items-center text-[9px] font-bold text-amber-700 bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">To Confirm</span>}
                                {line.currentStatus === "error" && <span className="inline-flex items-center text-[9px] font-bold text-rose-700 bg-rose-500/10 border border-rose-500/20 px-2 py-0.5 rounded-full uppercase tracking-wider">Standard Care</span>}
                                {line.currentStatus === "excluded" && <span className="inline-flex items-center text-[9px] font-bold text-ghost-deep bg-ghost/50 border border-ghost px-2 py-0.5 rounded-full uppercase tracking-wider">Canceled</span>}
                              </td>
                              <td className="py-3 px-4 text-center">
                                {line.currentStatus === "excluded" ? (
                                  <span className="font-mono text-ghost-deep">--</span>
                                ) : (
                                  <span className={`font-mono font-bold ${line.score >= 90 ? "text-forest" : line.score >= 60 ? "text-amber-700" : "text-rose-750"}`}>
                                    {line.score}%
                                  </span>
                                )}
                              </td>
                            </tr>

                            {/* Detail Drawer Row */}
                            {isExpanded && (
                              <tr className="bg-[#faf9f6]">
                                <td colSpan={7} className="p-0">
                                  <div className="p-4 flex flex-col gap-4 border-b border-ghost">
                                    <div className="border-l-4 border-forest bg-forest/[0.02] border border-ghost rounded-r-lg p-3 text-xs text-left">
                                      <h4 className="font-bold text-forest uppercase tracking-wide text-[9px] mb-1 flex items-center gap-1.5">
                                        🔍 Agent Compliance Rationale
                                      </h4>
                                      <p className="text-charcoal mt-1 leading-relaxed">{line.evidenceDesc}</p>
                                      <blockquote className="mt-2 pl-3 border-l border-ghost text-ghost-deep italic text-[11px] leading-relaxed">
                                        {line.evidenceQuote}
                                      </blockquote>
                                    </div>

                                    {/* Action Drawer Buttons */}
                                    <div className="flex justify-end gap-2 text-xs">
                                      {isLocked ? (
                                        <span className="text-[11px] font-bold text-forest flex items-center">
                                          🔒 This line audit is locked and archived.
                                        </span>
                                      ) : (
                                        <>
                                          {line.currentStatus === "success" && (
                                            <>
                                              <button className="btn bg-white border border-ghost hover:bg-cream text-charcoal rounded-full px-4 py-2 text-xs font-semibold shadow-sm" onClick={(e) => { e.stopPropagation(); handleResolveStatus(line.id, "error"); }}>
                                                Mark as Standard Care
                                              </button>
                                              <button className="btn bg-white border border-ghost hover:border-rose-500/40 hover:bg-rose-500/5 text-rose-700 rounded-full px-4 py-2 text-xs font-semibold shadow-sm" onClick={(e) => { e.stopPropagation(); handleResolveStatus(line.id, "excluded"); }}>
                                                Cancel / Exclude Line
                                              </button>
                                            </>
                                          )}
                                          {line.currentStatus === "error" && (
                                            <>
                                              <button className="btn bg-charcoal hover:bg-forest text-cream rounded-full px-4 py-2 text-xs font-semibold shadow-sm" onClick={(e) => { e.stopPropagation(); handleResolveStatus(line.id, "success"); }}>
                                                Approve Sponsor Reimbursement
                                              </button>
                                              <button className="btn bg-white border border-ghost hover:border-rose-500/40 hover:bg-rose-500/5 text-rose-700 rounded-full px-4 py-2 text-xs font-semibold shadow-sm" onClick={(e) => { e.stopPropagation(); handleResolveStatus(line.id, "excluded"); }}>
                                                Cancel / Exclude Line
                                              </button>
                                            </>
                                          )}
                                          {line.currentStatus === "warning" && (
                                            <>
                                              <button className="btn bg-white border border-ghost hover:border-rose-500/40 hover:bg-rose-500/5 text-rose-700 rounded-full px-4 py-2 text-xs font-semibold mr-auto shadow-sm" onClick={(e) => { e.stopPropagation(); handleResolveStatus(line.id, "excluded"); }}>
                                                Cancel / Exclude Line
                                              </button>
                                              <button className="btn bg-white border border-ghost hover:bg-cream text-charcoal rounded-full px-4 py-2 text-xs font-semibold shadow-sm" onClick={(e) => { e.stopPropagation(); handleResolveStatus(line.id, "error"); }}>
                                                Mark as Standard Care
                                              </button>
                                              <button className="btn bg-charcoal hover:bg-forest text-cream rounded-full px-4 py-2 text-xs font-semibold shadow-sm" onClick={(e) => { e.stopPropagation(); handleResolveStatus(line.id, "success"); }}>
                                                Approve Sponsor Coverage
                                              </button>
                                            </>
                                          )}
                                          {line.currentStatus === "excluded" && (
                                            <>
                                              <span className="text-[11px] font-semibold text-ghost-deep flex items-center mr-auto">
                                                🚫 Canceled (Excluded from transmission)
                                              </span>
                                              <button className="btn bg-white border border-ghost hover:bg-cream text-charcoal rounded-full px-4 py-2 text-xs font-semibold shadow-sm" onClick={(e) => { e.stopPropagation(); handleRevertStatus(line.id); }}>
                                                Reintegrate Line
                                              </button>
                                            </>
                                          )}
                                        </>
                                      )}
                                    </div>
                                  </div>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {/* BOTTOM ACTION BAR */}
                <div className="flex items-center justify-between gap-4 border-t border-ghost pt-4">
                  {isLocked ? (
                    <div className="flex-1 bg-forest/5 border border-forest/20 text-forest text-xs px-4 py-2 rounded-xl text-left">
                      <span>✓ <strong>Ledger transaction logged</strong>. Records successfully archived.</span>
                    </div>
                  ) : stats.orange > 0 ? (
                    <div className="flex-1 bg-cream border border-ghost text-ghost-deep text-xs px-4 py-2 rounded-xl text-left">
                      <span>⚠️ Resolve the orange <strong>To Confirm</strong> warnings ({stats.orange} remaining) to finalize audit.</span>
                    </div>
                  ) : (
                    <div className="flex-1 bg-forest/5 border border-forest/20 text-forest text-xs px-4 py-2 rounded-xl text-left">
                      <span>🎉 All lines resolved. Ready to log audit transaction.</span>
                    </div>
                  )}

                  {isLocked ? (
                    <button className="btn bg-forest/10 border border-forest/20 text-forest rounded-full px-5 py-2.5 text-xs font-semibold cursor-not-allowed" disabled>
                      ✓ Audit Logged
                    </button>
                  ) : (
                    <button 
                      className={`btn rounded-full px-6 py-2.5 text-xs font-semibold transition-all shadow-sm ${stats.orange === 0 ? "bg-charcoal hover:bg-forest text-cream" : "bg-ghost text-ghost-deep cursor-not-allowed border border-ghost"}`} 
                      disabled={stats.orange > 0}
                      onClick={handleFinalize}
                    >
                      Finalize Audit & Record
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

        </section>

        {/* RIGHT PANEL: LIVE AGENT GRAPH & LOGS */}
        <section className="flex flex-col border border-ghost bg-white rounded-2xl overflow-hidden shadow-[0_1px_3px_rgba(0,0,0,0.04)]">
          
          {/* Corpus Node Graph */}
          <div className="flex-[1.2] border-b border-ghost flex flex-col min-h-0">
            <div className="px-5 py-4 border-b border-ghost flex items-center gap-2">
              <h3 className="text-xs font-black tracking-wide text-forest uppercase">
                Active Protocol Corpus
              </h3>
              <span className="w-2 h-2 bg-forest rounded-full animate-pulse shadow-[0_0_8px_rgba(45,79,63,0.3)]"></span>
            </div>
            <p className="text-[10px] text-ghost-deep px-5 pt-2 text-left">Real-time database connection query paths visualized.</p>
            
            <div ref={graphViewportRef} className="relative flex-1 bg-[#fbfaf8] overflow-hidden select-none">
              
              {/* Dynamic SVG links */}
              <svg className="absolute inset-0 w-full h-full pointer-events-none z-10">
                {svgPaths.map((path, idx) => {
                  let pathClass = "fill-none stroke-[2.5px] animate-dash ";
                  if (path.status === "success") pathClass += "stroke-forest/60";
                  else if (path.status === "warning") pathClass += "stroke-amber-600/60";
                  else if (path.status === "error") pathClass += "stroke-rose-600/60";
                  else pathClass += "stroke-ghost/30";

                  return (
                    <path 
                      key={idx}
                      d={path.d} 
                      className={pathClass}
                      strokeDasharray="6,4"
                    />
                  );
                })}
              </svg>

              <div className="absolute inset-0 z-20 flex flex-col justify-evenly p-2">
                {/* Top Row of DB nodes */}
                <div className="flex justify-around items-center w-full">
                  <div id="node-soa" className={`bg-white border rounded-xl p-2.5 w-24 text-center flex flex-col items-center gap-1 shadow-sm transition-all duration-300 text-[10px] ${activeLine && activeLine.dbLinks.includes("node-soa") ? activeLine.currentStatus === "success" ? "border-forest shadow-forest/10 scale-[1.02] bg-forest/5" : activeLine.currentStatus === "warning" ? "border-amber-600 shadow-amber-500/10 scale-[1.02] bg-amber-500/5" : "border-rose-600 shadow-rose-500/10 scale-[1.02] bg-rose-500/5" : "border-ghost opacity-80"}`}>
                    <span className="text-sm">📋</span>
                    <span className="font-bold text-charcoal leading-tight">Protocol & SoA</span>
                    <span className="text-[8px] text-ghost-deep">Ready</span>
                  </div>
                  <div id="node-cta" className={`bg-white border rounded-xl p-2.5 w-24 text-center flex flex-col items-center gap-1 shadow-sm transition-all duration-300 text-[10px] ${activeLine && activeLine.dbLinks.includes("node-cta") ? activeLine.currentStatus === "success" ? "border-forest shadow-forest/10 scale-[1.02] bg-forest/5" : activeLine.currentStatus === "warning" ? "border-amber-600 shadow-amber-500/10 scale-[1.02] bg-amber-500/5" : "border-rose-600 shadow-rose-500/10 scale-[1.02] bg-rose-500/5" : "border-ghost opacity-80"}`}>
                    <span className="text-sm">💼</span>
                    <span className="font-bold text-charcoal leading-tight">Budget & CTA</span>
                    <span className="text-[8px] text-ghost-deep">Ready</span>
                  </div>
                  <div id="node-consent" className={`bg-white border rounded-xl p-2.5 w-24 text-center flex flex-col items-center gap-1 shadow-sm transition-all duration-300 text-[10px] ${activeLine && activeLine.dbLinks.includes("node-consent") ? activeLine.currentStatus === "success" ? "border-forest shadow-forest/10 scale-[1.02] bg-forest/5" : activeLine.currentStatus === "warning" ? "border-amber-600 shadow-amber-500/10 scale-[1.02] bg-amber-500/5" : "border-rose-600 shadow-rose-500/10 scale-[1.02] bg-rose-500/5" : "border-ghost opacity-80"}`}>
                    <span className="text-sm">✍️</span>
                    <span className="font-bold text-charcoal leading-tight">Consent (ICF)</span>
                    <span className="text-[8px] text-ghost-deep">Ready</span>
                  </div>
                </div>

                {/* Central active Investigator Card */}
                <div className="flex justify-center w-full">
                  <div 
                    id="node-active-line" 
                    className={`bg-cream border-2 rounded-xl p-3 w-52 shadow-md text-center transition-all duration-300 ${activeLine ? activeLine.currentStatus === "success" ? "border-forest" : activeLine.currentStatus === "warning" ? "border-amber-605" : activeLine.currentStatus === "error" ? "border-rose-600" : "border-ghost-deep opacity-70" : "border-forest/30"}`}
                  >
                    <div className="flex flex-col items-center gap-1">
                      <span className="font-mono text-[8px] font-extrabold tracking-wider bg-forest/10 px-1.5 py-0.5 rounded text-forest">
                        AUDITED ITEM
                      </span>
                      <h4 className="text-[11px] font-bold text-charcoal truncate w-full mt-1">
                        {activeLine ? activeLine.description : activeStep === "scanning" ? "Scanning Invoice..." : "Awaiting Document..."}
                      </h4>
                      <span className="font-mono text-[10px] text-ghost-deep">
                        {activeLine ? formatCurrency(activeLine.total) : "-"}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Bottom Row of DB nodes */}
                <div className="flex justify-around items-center w-full">
                  <div id="node-edc" className={`bg-white border rounded-xl p-2.5 w-24 text-center flex flex-col items-center gap-1 shadow-sm transition-all duration-300 text-[10px] ${activeLine && activeLine.dbLinks.includes("node-edc") ? activeLine.currentStatus === "success" ? "border-forest shadow-forest/10 scale-[1.02] bg-forest/5" : activeLine.currentStatus === "warning" ? "border-amber-600 shadow-amber-500/10 scale-[1.02] bg-amber-500/5" : "border-rose-600 shadow-rose-500/10 scale-[1.02] bg-rose-500/5" : "border-ghost opacity-80"}`}>
                    <span className="text-sm">🩺</span>
                    <span className="font-bold text-charcoal leading-tight">Patient File</span>
                    <span className="text-[8px] text-ghost-deep">Ready</span>
                  </div>
                  <div id="node-rules" className={`bg-white border rounded-xl p-2.5 w-24 text-center flex flex-col items-center gap-1 shadow-sm transition-all duration-300 text-[10px] ${activeLine && activeLine.dbLinks.includes("node-rules") ? activeLine.currentStatus === "success" ? "border-forest shadow-forest/10 scale-[1.02] bg-forest/5" : activeLine.currentStatus === "warning" ? "border-amber-600 shadow-amber-500/10 scale-[1.02] bg-amber-500/5" : "border-rose-600 shadow-rose-500/10 scale-[1.02] bg-rose-500/5" : "border-ghost opacity-80"}`}>
                    <span className="text-sm">⚖️</span>
                    <span className="font-bold text-charcoal leading-tight">Billing Rules</span>
                    <span className="text-[8px] text-ghost-deep">Ready</span>
                  </div>
                  <div id="node-history" className={`bg-white border rounded-xl p-2.5 w-24 text-center flex flex-col items-center gap-1 shadow-sm transition-all duration-300 text-[10px] ${activeLine && activeLine.dbLinks.includes("node-history") ? activeLine.currentStatus === "success" ? "border-forest shadow-forest/10 scale-[1.02] bg-forest/5" : activeLine.currentStatus === "warning" ? "border-amber-600 shadow-amber-500/10 scale-[1.02] bg-amber-500/5" : "border-rose-600 shadow-rose-500/10 scale-[1.02] bg-rose-500/5" : "border-ghost opacity-80"}`}>
                    <span className="text-sm">⏳</span>
                    <span className="font-bold text-charcoal leading-tight">Payment Hist.</span>
                    <span className="text-[8px] text-ghost-deep">Ready</span>
                  </div>
                </div>

              </div>
            </div>
          </div>

          {/* Terminal logger */}
          <div className="flex-[0.8] bg-[#FAF9F6] flex flex-col min-h-0 border-t border-ghost">
            <div className="h-9 bg-[#f0ede9] border-b border-ghost flex justify-between items-center px-4">
              <div className="flex gap-1.5">
                <span className="w-2 h-2 rounded-full bg-ghost-deep/40"></span>
                <span className="w-2 h-2 rounded-full bg-ghost-deep/40"></span>
                <span className="w-2 h-2 rounded-full bg-ghost-deep/40"></span>
              </div>
              <span className="font-mono text-[9px] text-ghost-deep uppercase tracking-wider font-bold">clintrial-agent-trace.log</span>
              <button 
                className="font-semibold text-[10px] text-ghost-deep hover:text-charcoal transition-colors cursor-pointer"
                onClick={() => setLogs([])}
              >
                Clear
              </button>
            </div>

            <div className="flex-1 p-4 font-mono text-[10.5px] overflow-y-auto flex flex-col gap-2 select-text text-left">
              {logs.map((log, idx) => {
                let textClass = "text-charcoal";
                if (log.level === "SUCCESS") textClass = "text-forest font-semibold";
                else if (log.level === "QUERY") textClass = "text-indigo-600";
                else if (log.level === "WARNING") textClass = "text-amber-700 font-bold";
                else if (log.level === "ERROR") textClass = "text-rose-700 font-bold";
                else if (log.level === "JSON") textClass = "text-forest/80";

                return (
                  <div key={idx} className="leading-relaxed">
                    <span className="text-ghost-deep mr-2">[{log.time}]</span>
                    {log.level !== "JSON" && <span className="mr-1">[{log.level}]</span>}
                    <span className={textClass} dangerouslySetInnerHTML={{ __html: log.text.replace(/\n/g, "<br/>") }}></span>
                  </div>
                );
              })}
              <div ref={consoleEndRef}></div>
            </div>
          </div>

        </section>

      </main>

      {/* --- CONFIRMATION DIALOG MODAL --- */}
      <dialog id="finalizeDialog" className="border-none bg-transparent p-0 m-auto focus:outline-none">
        <div className="bg-[#f9f7f4] border border-ghost rounded-3xl p-8 w-[420px] max-w-[90vw] shadow-2xl text-center flex flex-col items-center gap-4 animate-fade-up">
          <div className="w-16 h-16 rounded-full bg-forest/10 border-2 border-forest flex items-center justify-center text-forest text-2xl">
            ✓
          </div>
          <h2 className="text-xl font-serif italic text-forest mt-2">Audit Validated Successfully</h2>
          <p className="text-xs text-ghost-deep leading-relaxed">
            The clinical trial billing audit has been verified and logged. Reimbursable line items have been transmitted to the sponsor's accounts.
          </p>

          <div className="w-full bg-white border border-ghost rounded-2xl p-4 flex flex-col gap-2.5 text-left text-xs leading-none">
            <div className="flex justify-between items-center">
              <span className="text-ghost-deep">Audit ID:</span>
              <strong className="text-charcoal font-semibold">AUD-2023-08-15-8931</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-ghost-deep">Reimbursement:</span>
              <strong className="text-forest">{formatCurrency(stats.sponsor)}</strong>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-ghost-deep">Security Hash:</span>
              <span className="font-mono text-[9px] text-ghost-deep truncate max-w-[180px]">
                SHA-256: e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855
              </span>
            </div>
          </div>

          <button 
            className="btn bg-charcoal hover:bg-forest text-cream rounded-full w-full py-2.5 font-bold mt-2 transition-all focus:outline-none shadow-sm"
            onClick={() => {
              const dialog = document.getElementById("finalizeDialog") as HTMLDialogElement;
              if (dialog) dialog.close();
            }}
          >
            Dismiss & Complete
          </button>
        </div>
      </dialog>

    </div>
  );
}
