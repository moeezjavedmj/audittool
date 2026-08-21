"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import {
  UserCheck,
  UserX,
  UploadCloud,
  FileSpreadsheet,
  Download,
  Loader2,
  ShieldAlert,
  ShieldCheck,
  X,
  ScanLine
} from "lucide-react";

type Mode = "active" | "resigned";

type ProcessResult = {
  ok: boolean;
  mode: Mode;
  flagged: number;
  flagLabel: string;
  matched?: number;
  hrRows?: number;
  hrActiveRows?: number;
  resignedRows?: number;
  deptRows: number;
  statusColumn?: string | null;
  activeFilterApplied?: boolean;
  columns: string[];
  preview: Record<string, string>[];
  reportBase64: string;
  reportFileName: string;
  engine?: "python" | "node";
};

const MODE_COPY: Record<
  Mode,
  { label: string; eyebrow: string; file1Label: string; file1Hint: string; icon: JSX.Element }
> = {
  active: {
    label: "Active User Check",
    eyebrow: "Finds department accounts missing from HR's active list",
    file1Label: "HR Active Users File",
    file1Hint: ".xlsx or .csv - any column named like Employee ID / Emp No, plus an optional Status column",
    icon: <UserCheck className="h-5 w-5" />
  },
  resigned: {
    label: "Resignation Check",
    eyebrow: "Finds resigned employees still listed in the department",
    file1Label: "HR Resigned Employees File",
    file1Hint: ".xlsx or .csv - any column named like Employee ID / Emp No",
    icon: <UserX className="h-5 w-5" />
  }
};

function downloadReport(base64: string, filename: string) {
  const byteChars = atob(base64);
  const byteNumbers = new Array(byteChars.length);
  for (let i = 0; i < byteChars.length; i++) byteNumbers[i] = byteChars.charCodeAt(i);
  const blob = new Blob([new Uint8Array(byteNumbers)], {
    type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function useCountUp(target: number, durationMs = 700) {
  const [value, setValue] = useState(0);
  useEffect(() => {
    let raf = 0;
    const start = performance.now();
    const from = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / durationMs);
      const eased = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * eased));
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [target, durationMs]);
  return value;
}

function Stat({ label, value, tone }: { label: string; value: number; tone: "cyan" | "amber" | "red" | "green" }) {
  const n = useCountUp(value);
  const toneClass = {
    cyan: "text-signal-cyan",
    amber: "text-signal-amber",
    red: "text-signal-red",
    green: "text-signal-green"
  }[tone];
  return (
    <div className="panel px-5 py-4">
      <div className={`font-mono text-3xl font-semibold tabular-nums ${toneClass}`}>{n.toLocaleString()}</div>
      <div className="mt-1 text-xs uppercase tracking-wider text-slate-400">{label}</div>
    </div>
  );
}

function DropZone({
  label,
  hint,
  file,
  onFile,
  accent
}: {
  label: string;
  hint: string;
  file: File | null;
  onFile: (f: File | null) => void;
  accent: "cyan" | "amber";
}) {
  const [dragging, setDragging] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const accentClass = accent === "cyan" ? "border-signal-cyan/60 shadow-signal-cyan/10" : "border-signal-amber/60 shadow-signal-amber/10";

  const handleFiles = (files: FileList | null) => {
    if (files && files[0]) onFile(files[0]);
  };

  return (
    <div
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        handleFiles(e.dataTransfer.files);
      }}
      onClick={() => inputRef.current?.click()}
      className={`panel group relative cursor-pointer overflow-hidden px-5 py-6 transition-colors ${
        dragging ? accentClass : "hover:border-ink-600"
      }`}
    >
      <input
        ref={inputRef}
        type="file"
        accept=".xlsx,.xlsm,.csv"
        className="hidden"
        onChange={(e) => handleFiles(e.target.files)}
      />
      {dragging && (
        <div className="pointer-events-none absolute inset-x-0 top-0 h-10 animate-scan bg-gradient-to-b from-signal-cyan/25 to-transparent" />
      )}
      <div className="flex items-center gap-4">
        <div
          className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl border ${
            file ? "border-signal-green/50 bg-signal-green/10 text-signal-green" : "border-ink-600 bg-ink-800 text-slate-400"
          }`}
        >
          {file ? <FileSpreadsheet className="h-5 w-5" /> : <UploadCloud className="h-5 w-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-medium text-slate-200">{label}</p>
            {file && (
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  onFile(null);
                  if (inputRef.current) inputRef.current.value = "";
                }}
                className="rounded-md p-1 text-slate-500 hover:bg-ink-700 hover:text-slate-200"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>
          <p className="truncate text-xs text-slate-500">{file ? file.name : hint}</p>
        </div>
      </div>
    </div>
  );
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1] || "");
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Tries the real Python backend first (native on Vercel). If that route
// simply doesn't exist on this deployment (e.g. Netlify, which can't run
// Python as a function runtime) or the network call itself fails, falls
// back to the Node engine - same logic, same results, works everywhere.
async function runReconciliation(mode: Mode, file1: File, file2: File) {
  try {
    const [b1, b2] = await Promise.all([fileToBase64(file1), fileToBase64(file2)]);
    const res = await fetch("/api/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode,
        file1: { name: file1.name, dataBase64: b1 },
        file2: { name: file2.name, dataBase64: b2 }
      })
    });
    if (res.status !== 404) {
      const data = await res.json();
      return { res, data };
    }
    // 404 = this route doesn't exist on this deployment; fall through to Node.
  } catch {
    // Network-level failure reaching the Python route; fall through to Node.
  }

  const fd = new FormData();
  fd.set("mode", mode);
  fd.set("file1", file1);
  fd.set("file2", file2);
  const res = await fetch("/api/process", { method: "POST", body: fd });
  const data = await res.json();
  return { res, data: { ...data, engine: data.engine || "node" } };
}

export default function Page() {
  const [mode, setMode] = useState<Mode>("active");
  const [file1, setFile1] = useState<File | null>(null);
  const [file2, setFile2] = useState<File | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<string | null>(null);
  const [result, setResult] = useState<ProcessResult | null>(null);

  const copy = MODE_COPY[mode];
  const canSubmit = Boolean(file1 && file2) && !loading;

  const switchMode = (m: Mode) => {
    setMode(m);
    setResult(null);
    setError(null);
  };

  const handleSubmit = useCallback(async () => {
    if (!file1 || !file2) return;
    setLoading(true);
    setError(null);
    setErrorDetails(null);
    setResult(null);
    try {
      const { res, data } = await runReconciliation(mode, file1, file2);
      if (!res.ok || !data.ok) {
        setErrorDetails(data.details || null);
        throw new Error(data.error || "Something went wrong while reconciling the files.");
      }
      setResult(data);
    } catch (e: any) {
      setError(e.message || "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }, [file1, file2, mode]);

  return (
    <main className="relative min-h-screen overflow-hidden">
      <div className="grid-backdrop pointer-events-none absolute inset-0 h-[560px]" />

      <div className="relative mx-auto max-w-4xl px-6 pb-24 pt-16">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: -10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>
          <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.2em] text-signal-cyan">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-pulse-ring rounded-full bg-signal-cyan" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-signal-cyan" />
            </span>
            HR ⇄ IT Access Reconciliation
          </div>
          <h1 className="mt-3 font-display text-4xl font-semibold tracking-tight text-white sm:text-5xl">
            Access Ledger
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-relaxed text-slate-400">
            Cross-check department rosters against HR records. Point it at any export — column
            names and status labels are detected automatically.
          </p>
        </motion.div>

        {/* Mode toggle */}
        <div className="mt-10 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {(Object.keys(MODE_COPY) as Mode[]).map((m) => {
            const active = mode === m;
            return (
              <button
                key={m}
                onClick={() => switchMode(m)}
                className={`relative overflow-hidden rounded-2xl border px-5 py-4 text-left transition-colors ${
                  active ? "border-transparent" : "border-ink-600 bg-ink-900/50 hover:border-ink-600/80"
                }`}
              >
                {active && (
                  <motion.div
                    layoutId="mode-highlight"
                    className="absolute inset-0 bg-gradient-to-br from-signal-cyan/15 via-ink-800 to-ink-800"
                    transition={{ type: "spring", stiffness: 300, damping: 30 }}
                  />
                )}
                <div className="relative flex items-center gap-3">
                  <div
                    className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg ${
                      active ? "bg-signal-cyan/15 text-signal-cyan" : "bg-ink-800 text-slate-400"
                    }`}
                  >
                    {MODE_COPY[m].icon}
                  </div>
                  <div>
                    <p className={`text-sm font-semibold ${active ? "text-white" : "text-slate-300"}`}>
                      {MODE_COPY[m].label}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{MODE_COPY[m].eyebrow}</p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>

        {/* Upload zones */}
        <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
          <AnimatePresence mode="wait">
            <motion.div
              key={mode + "-file1"}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.25 }}
            >
              <DropZone label={copy.file1Label} hint={copy.file1Hint} file={file1} onFile={setFile1} accent="cyan" />
            </motion.div>
          </AnimatePresence>
          <DropZone
            label="Department Roster File"
            hint=".xlsx or .csv - the department/IT export to audit against HR"
            file={file2}
            onFile={setFile2}
            accent="amber"
          />
        </div>

        {/* Submit */}
        <div className="mt-6 flex items-center gap-4">
          <button
            onClick={handleSubmit}
            disabled={!canSubmit}
            className="group relative inline-flex items-center gap-2 overflow-hidden rounded-xl bg-signal-cyan px-5 py-2.5 text-sm font-semibold text-ink-950 transition-all disabled:cursor-not-allowed disabled:bg-ink-700 disabled:text-slate-500"
          >
            {loading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" /> Scanning records…
              </>
            ) : (
              <>
                <ScanLine className="h-4 w-4" /> Run Reconciliation
              </>
            )}
          </button>
        </div>

        {error && (
          <motion.div
            initial={{ opacity: 0, y: -6 }}
            animate={{ opacity: 1, y: 0 }}
            className="mt-4 rounded-xl border border-signal-red/30 bg-signal-red/5 px-4 py-3"
          >
            <p className="text-sm font-medium text-signal-red">{error}</p>
            {errorDetails && (
              <pre className="mt-2 max-h-40 overflow-auto whitespace-pre-wrap font-mono text-[11px] leading-relaxed text-slate-400">
                {errorDetails}
              </pre>
            )}
          </motion.div>
        )}

        {/* Results */}
        <AnimatePresence>
          {result && (
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.45 }}
              className="mt-10"
            >
              <div className="mb-4 flex items-center gap-2">
                {result.flagged > 0 ? (
                  <ShieldAlert className="h-5 w-5 text-signal-amber" />
                ) : (
                  <ShieldCheck className="h-5 w-5 text-signal-green" />
                )}
                <h2 className="font-display text-lg font-semibold text-white">
                  {result.flagged > 0 ? "Discrepancies found" : "Everything reconciles"}
                </h2>
                {result.engine && (
                  <span className="ml-1 rounded-full border border-ink-600 bg-ink-800 px-2 py-0.5 font-mono text-[10px] uppercase tracking-wide text-slate-500">
                    {result.engine === "python" ? "Python engine" : "Node engine"}
                  </span>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
                <Stat
                  label={mode === "active" ? "HR Active Rows" : "Resigned Rows"}
                  value={(mode === "active" ? result.hrActiveRows : result.resignedRows) ?? 0}
                  tone="cyan"
                />
                <Stat label="Dept Rows" value={result.deptRows} tone="amber" />
                {mode === "active" && <Stat label="Matched" value={result.matched ?? 0} tone="green" />}
                <Stat label={result.flagLabel} value={result.flagged} tone={result.flagged > 0 ? "red" : "green"} />
              </div>

              {mode === "active" && result.statusColumn && (
                <p className="mt-3 text-xs text-slate-500">
                  Detected status column <span className="font-mono text-slate-400">“{result.statusColumn}”</span> —{" "}
                  {result.activeFilterApplied
                    ? "filtered HR rows to only those marked active before comparing."
                    : "values weren't clearly active/inactive, so every HR row was treated as active."}
                </p>
              )}

              {result.flagged > 0 && (
                <div className="panel mt-6 overflow-hidden">
                  <div className="flex items-center justify-between border-b border-ink-600/70 px-5 py-3">
                    <p className="text-sm font-medium text-slate-300">
                      Preview — first {result.preview.length} of {result.flagged}
                    </p>
                    <button
                      onClick={() => downloadReport(result.reportBase64, result.reportFileName)}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-signal-amber/40 bg-signal-amber/10 px-3 py-1.5 text-xs font-semibold text-signal-amber transition-colors hover:bg-signal-amber/20"
                    >
                      <Download className="h-3.5 w-3.5" /> Download full report
                    </button>
                  </div>
                  <div className="max-h-80">
                    <table className="w-full text-left text-xs">
                      <thead className="sticky top-0 bg-ink-800/95 font-mono uppercase tracking-wide text-slate-400">
                        <tr>
                          {result.columns.map((c) => (
                            <th key={c} className="whitespace-nowrap px-4 py-2 font-medium">
                              {c}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="font-mono text-slate-300">
                        {result.preview.map((row, i) => (
                          <tr key={i} className="border-t border-ink-700/60 hover:bg-ink-800/50">
                            {result.columns.map((c) => (
                              <td key={c} className="whitespace-nowrap px-4 py-2">
                                {row[c] ?? ""}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>

        <footer className="mt-16 border-t border-ink-700/60 pt-6 text-xs text-slate-500">
          Runs entirely inside this app's own server on submit — no separate backend process,
          works the same on localhost and when deployed.
        </footer>
      </div>
    </main>
  );
}
