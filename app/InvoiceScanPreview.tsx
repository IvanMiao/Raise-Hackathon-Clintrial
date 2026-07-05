"use client";

import {
  Activity,
  AlertCircle,
  CheckCircle2,
  FileText,
} from 'lucide-react';
import { motion, useReducedMotion } from 'motion/react';

export type InvoiceScanPhase =
  | 'ready'
  | 'upload'
  | 'extraction'
  | 'complete'
  | 'failed';

type InvoiceScanPreviewProps = {
  canRunReview: boolean;
  fileName: string;
  fileType: string;
  lineCount: number;
  message: string;
  onRunReview: () => void;
  phase: InvoiceScanPhase;
  previewUrl: string | null;
};

const phaseCopy: Record<
  InvoiceScanPhase,
  { title: string; eyebrow: string; tone: string }
> = {
  ready: {
    title: 'Invoice ready for review',
    eyebrow: 'Ready',
    tone: 'text-slate-600 bg-slate-100 border-slate-200',
  },
  upload: {
    title: 'Uploading invoice to read-only workflow',
    eyebrow: 'Uploading',
    tone: 'text-blue-700 bg-blue-50 border-blue-200',
  },
  extraction: {
    title: 'Scanning invoice lines',
    eyebrow: 'OCR extraction',
    tone: 'text-blue-700 bg-blue-50 border-blue-200',
  },
  complete: {
    title: 'Line items extracted',
    eyebrow: 'Mapped',
    tone: 'text-teal-700 bg-teal-50 border-teal-200',
  },
  failed: {
    title: 'Invoice review stopped',
    eyebrow: 'Needs attention',
    tone: 'text-rose-600 bg-rose-50 border-rose-200',
  },
};

function scanStepState(
  phase: InvoiceScanPhase,
  index: number,
): 'done' | 'active' | 'pending' | 'failed' {
  if (phase === 'failed') {
    return index === 0 ? 'failed' : 'pending';
  }

  const activeIndex: Record<Exclude<InvoiceScanPhase, 'failed'>, number> = {
    ready: 0,
    upload: 1,
    extraction: 2,
    complete: 3,
  };
  const currentIndex = activeIndex[phase];

  if (index < currentIndex || phase === 'complete') {
    return 'done';
  }

  if (index === currentIndex) {
    return 'active';
  }

  return 'pending';
}

function ScanStep({
  index,
  label,
  phase,
}: {
  index: number;
  label: string;
  phase: InvoiceScanPhase;
}) {
  const state = scanStepState(phase, index);
  const isActive = state === 'active';
  const isDone = state === 'done';
  const isFailed = state === 'failed';

  return (
    <li className="flex items-center gap-2.5">
      <span
        className={`flex h-5 w-5 flex-none items-center justify-center rounded-full border text-[10px] ${
          isDone
            ? 'border-teal-200 bg-teal-50 text-teal-700'
            : isActive
              ? 'border-blue-200 bg-blue-50 text-blue-700'
              : isFailed
                ? 'border-rose-200 bg-rose-50 text-rose-600'
                : 'border-slate-200 bg-white text-slate-400'
        }`}
      >
        {isDone ? (
          <CheckCircle2 className="h-3 w-3" />
        ) : isFailed ? (
          <AlertCircle className="h-3 w-3" />
        ) : isActive ? (
          <Activity className="h-3 w-3 animate-pulse" />
        ) : (
          index + 1
        )}
      </span>
      <span
        className={`text-[12px] font-semibold ${
          isDone
            ? 'text-teal-700'
            : isActive
              ? 'text-blue-700'
              : isFailed
                ? 'text-rose-600'
                : 'text-slate-400'
        }`}
      >
        {label}
      </span>
    </li>
  );
}

export function InvoiceScanPreview({
  canRunReview,
  fileName,
  fileType,
  lineCount,
  message,
  onRunReview,
  phase,
  previewUrl,
}: InvoiceScanPreviewProps) {
  const copy = phaseCopy[phase];
  const isScanning = phase === 'upload' || phase === 'extraction';
  const isComplete = phase === 'complete';
  const isFailed = phase === 'failed';
  const isImagePreview = previewUrl !== null;
  const fileKind = fileType === 'application/pdf' ? 'PDF' : 'Image';
  const shouldReduceMotion = useReducedMotion() ?? false;
  const motionProps = shouldReduceMotion
    ? {
        initial: { opacity: 0 },
        animate: { opacity: 1 },
        exit: { opacity: 0 },
        transition: { duration: 0.12 },
      }
    : {
        initial: { opacity: 0, y: 10, scale: 0.985 },
        animate: { opacity: 1, y: 0, scale: 1 },
        exit: { opacity: 0, y: -8, scale: 0.985 },
        transition: { duration: isComplete ? 0.18 : 0.24 },
      };

  return (
    <motion.div
      aria-live="polite"
      className="mx-auto flex h-full min-h-[420px] w-full max-w-4xl items-center justify-center"
      {...motionProps}
    >
      <div className="grid w-full gap-5 rounded border border-slate-200 bg-white p-5 shadow-sm lg:grid-cols-[minmax(260px,0.9fr)_minmax(280px,1fr)]">
        <div className="relative mx-auto w-full max-w-[340px]">
          <div className="relative aspect-[3/4] overflow-hidden rounded border border-slate-200 bg-slate-100 shadow-sm">
            {isImagePreview ? (
              <img
                alt="Uploaded invoice preview"
                className="h-full w-full object-contain"
                src={previewUrl}
              />
            ) : (
              <div className="flex h-full flex-col bg-white p-6">
                <div className="mb-5 flex items-center justify-between border-b border-slate-200 pb-3">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">
                    Uploaded invoice
                  </span>
                  <FileText className="h-5 w-5 text-slate-400" />
                </div>
                <div className="space-y-3">
                  <div className="h-3 w-4/5 rounded bg-slate-200" />
                  <div className="h-3 w-3/5 rounded bg-slate-200" />
                  <div className="h-3 w-5/6 rounded bg-slate-200" />
                </div>
                <div className="mt-8 space-y-2">
                  {[0, 1, 2, 3, 4].map((row) => (
                    <div
                      className="grid grid-cols-[1fr_56px] gap-3"
                      key={row}
                    >
                      <div className="h-2.5 rounded bg-slate-100" />
                      <div className="h-2.5 rounded bg-slate-100" />
                    </div>
                  ))}
                </div>
                <div className="mt-auto rounded bg-slate-50 px-3 py-2 font-mono text-[10px] font-semibold text-slate-500">
                  {fileKind} preview
                </div>
              </div>
            )}

            {isScanning && (
              <div className="pointer-events-none absolute inset-x-0 top-0 h-16 invoice-scan-line">
                <div className="mx-4 h-px bg-blue-500 shadow-[0_0_16px_rgba(59,130,246,0.9)]" />
                <div className="mx-4 h-16 bg-gradient-to-b from-blue-400/20 to-transparent" />
              </div>
            )}
          </div>
        </div>

        <div className="flex min-w-0 flex-col justify-center">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span
              className={`rounded border px-2 py-0.5 font-mono text-[10px] font-bold uppercase tracking-wider ${copy.tone}`}
            >
              {copy.eyebrow}
            </span>
            <span className="font-mono text-[10px] font-semibold uppercase tracking-wider text-slate-400">
              {fileKind}
            </span>
          </div>

          <h2 className="text-xl font-bold tracking-tight text-slate-900">
            {copy.title}
          </h2>
          <p className="mt-2 max-w-xl text-[13px] leading-relaxed text-slate-500">
            {message}
          </p>

          <div className="mt-4 rounded border border-slate-200 bg-slate-50 px-3 py-2">
            <div className="font-mono text-[10px] font-bold uppercase tracking-wider text-slate-400">
              Invoice artifact
            </div>
            <div className="mt-1 truncate text-[13px] font-bold text-slate-800">
              {fileName}
            </div>
          </div>

          <ol className="mt-5 grid gap-3">
            <ScanStep index={0} label="File staged" phase={phase} />
            <ScanStep index={1} label="Read-only upload" phase={phase} />
            <ScanStep index={2} label="OCR line extraction" phase={phase} />
            <ScanStep
              index={3}
              label={
                lineCount > 0
                  ? `${lineCount} line items mapped`
                  : 'Workspace handoff'
              }
              phase={phase}
            />
          </ol>

          {(phase === 'ready' || isFailed) && (
            <button
              className={`mt-6 min-h-11 w-fit rounded px-4 text-[12px] font-bold transition-all duration-150 active:scale-95 ${
                canRunReview
                  ? 'cursor-pointer bg-[#0f766e] text-white hover:bg-teal-800'
                  : 'cursor-not-allowed bg-slate-200 text-slate-500'
              }`}
              disabled={!canRunReview}
              onClick={onRunReview}
              type="button"
            >
              {isFailed ? 'Retry review' : 'Run review'}
            </button>
          )}

          {isComplete && (
            <div className="mt-6 inline-flex w-fit items-center gap-2 rounded border border-teal-200 bg-teal-50 px-3 py-2 text-[12px] font-bold text-teal-700">
              <CheckCircle2 className="h-4 w-4" />
              Waiting for the first evidence packet
            </div>
          )}
        </div>
      </div>
    </motion.div>
  );
}
