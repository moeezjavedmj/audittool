"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  ScanLine,
  Search,
  SlidersHorizontal,
  RotateCcw,
  Copy
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

function useDebouncedValue<T>(value: T, delayMs = 250): T {
  const [debounced, setDebounced] = useState(value);
  useEffect(() => {
    const id = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(id);
  }, [value, delayMs]);
  return debounced;
}

/**
 * ---- ID similarity helpers -------------------------------------------
 * "Similar" IDs are treated as: same characters once you ignore case,
 * punctuation/whitespace (dashes, spaces, underscores, dots) and leading
 * zeros. That way "EMP-0042", "emp 42", "Emp042" and "42" are all
 * recognised as the same underlying ID.
 */
function normalizeIdValue(raw: unknown): string {
  const cleaned = String(raw ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  // strip leading zeros, but keep at least one character (e.g. "000" -> "0")
  const stripped = cleaned.replace(/^0+(?=[a-z0-9])/, "");
  return stripped || cleaned;
}

function isIdColumn(col: string): boolean {
  return /(^|[^a-z])id([^a-z]|$)|emp(loyee)?|staff|personnel|no\.?$|number/i.test(col);
}
/* ------------------------------------------------------------------- */

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
  } catch {
    // fall through to Node engine
  }

  const fd = new FormData();
  fd.set("mode", mode);
  fd.set("file1", file1);
  fd.set("file2", file2);
  const res = await fetch("/api/process", { method: "POST", body: fd });
  const data = await res.json();
  return { res, data: { ...data, engine: data.engine || "node" } };
}

const ROW_HEIGHT = 34;
const OVERSCAN = 10;

function ResultsTable({
  columns: columnsProp,
  data: dataProp
}: {
  columns?: string[] | null;
  data?: Record<string, string>[] | null;
}) {
  const columns = useMemo(() => columnsProp ?? [], [columnsProp]);
  const data = useMemo(() => dataProp ?? [], [dataProp]);

  const [search, setSearch] = useState("");
  const [colFilters, setColFilters] = useState<Record<string, string>>({});
  const [showFilters, setShowFilters] = useState(false);
  // Click-to-isolate: clicking any cell filters the table down to every row
  // that shares that same value in that same column. For ID-like columns
  // ("Employee ID", "Emp No", ...) the match is done on a *normalized*
  // version of the value, so "EMP-0042" / "emp42" / "0042" are all treated
  // as the same ID and shown together.
  const [cellFilter, setCellFilter] = useState<{ column: string; value: string } | null>(null);
  // Checkbox: show only rows whose ID (in the detected ID column) has at
  // least one other similar/duplicate ID elsewhere in the dataset.
  const [showDuplicatesOnly, setShowDuplicatesOnly] = useState(false);

  const debouncedSearch = useDebouncedValue(search, 250);
  const debouncedColFilters = useDebouncedValue(colFilters, 250);

  useEffect(() => {
    setSearch("");
    setColFilters({});
    setCellFilter(null);
    setShowDuplicatesOnly(false);
  }, [data]);

  // Best-guess ID column: first column whose name looks ID-like, else the
  // first column in the table.
  const idColumn = useMemo(() => columns.find(isIdColumn) ?? columns[0] ?? "", [columns]);

  // normalized ID -> how many rows in the FULL dataset share it.
  const idCounts = useMemo(() => {
    const counts = new Map<string, number>();
    if (!idColumn) return counts;
    for (const row of data) {
      const norm = normalizeIdValue(row[idColumn]);
      if (!norm) continue;
      counts.set(norm, (counts.get(norm) ?? 0) + 1);
    }
    return counts;
  }, [data, idColumn]);

  const activeColFilterEntries = useMemo(
    () => Object.entries(debouncedColFilters).filter(([, v]) => v.trim().length > 0),
    [debouncedColFilters]
  );

  const filteredRows = useMemo(() => {
    const q = debouncedSearch.trim().toLowerCase();
    let rows = data;

    if (showDuplicatesOnly && idColumn) {
      rows = rows.filter((row) => (idCounts.get(normalizeIdValue(row[idColumn])) ?? 0) > 1);
      // group matching IDs together so each duplicate cluster reads as a block
      rows = [...rows].sort((a, b) =>
        normalizeIdValue(a[idColumn]).localeCompare(normalizeIdValue(b[idColumn]))
      );
    }

    if (cellFilter) {
      if (isIdColumn(cellFilter.column)) {
        const target = normalizeIdValue(cellFilter.value);
        rows = rows.filter((row) => normalizeIdValue(row[cellFilter.column]) === target);
      } else {
        const target = cellFilter.value.trim().toLowerCase();
        rows = rows.filter((row) => String(row[cellFilter.column] ?? "").trim().toLowerCase() === target);
      }
    }

    if (!q && activeColFilterEntries.length === 0) return rows;

    return rows.filter((row) => {
      if (q) {
        let hit = false;
        for (const c of columns) {
          const v = row[c];
          if (v && String(v).toLowerCase().includes(q)) {
            hit = true;
            break;
          }
        }
        if (!hit) return false;
      }
      for (const [col, val] of activeColFilterEntries) {
        const cell = row[col];
        if (!cell || !String(cell).toLowerCase().includes(val.trim().toLowerCase())) return false;
      }
      return true;
    });
  }, [data, columns, debouncedSearch, activeColFilterEntries, cellFilter, showDuplicatesOnly, idColumn, idCounts]);

  const scrollRef = useRef<HTMLDivElement>(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(520);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const update = () => setViewportHeight(el.clientHeight || 520);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
    setScrollTop(0);
  }, [filteredRows]);

  const totalHeight = filteredRows.length * ROW_HEIGHT;
  const startIndex = Math.max(0, Math.floor(scrollTop / ROW_HEIGHT) - OVERSCAN);
  const visibleCount = Math.ceil(viewportHeight / ROW_HEIGHT) + OVERSCAN * 2;
  const endIndex = Math.min(filteredRows.length, startIndex + visibleCount);
  const visibleRows = filteredRows.slice(startIndex, endIndex);
  const offsetY = startIndex * ROW_HEIGHT;

  const gridTemplate = `repeat(${Math.max(columns.length, 1)}, minmax(140px, 1fr))`;
  const hasActiveFilters =
    search.trim().length > 0 || activeColFilterEntries.length > 0 || cellFilter !== null || showDuplicatesOnly;

  const handleCellClick = (column: string, rawValue: string) => {
    const value = String(rawValue ?? "").trim();
    if (!value) return;
    setCellFilter((current) => {
      if (!current || current.column !== column) return { column, value };
      const same = isIdColumn(column)
        ? normalizeIdValue(current.value) === normalizeIdValue(value)
        : current.value === value;
      return same ? null : { column, value };
    });
  };

  if (columns.length === 0) {
    return (
      <p className="rounded-lg border border-ink-700/60 bg-ink-900/40 px-4 py-6 text-center text-xs text-slate-500">
        No column data was returned to display here.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search all columns (Employee ID, Name, ...)"
            className="w-full rounded-lg border border-ink-600 bg-ink-800/80 py-2 pl-9 pr-3 text-xs text-slate-200 placeholder:text-slate-500 focus:border-signal-cyan/60 focus:outline-none"
          />
        </div>
        <button
          onClick={() => setShowFilters((s) => !s)}
          className={`inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
            showFilters
              ? "border-signal-cyan/50 bg-signal-cyan/10 text-signal-cyan"
              : "border-ink-600 bg-ink-800/80 text-slate-300 hover:border-ink-500"
          }`}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" /> Column filters
        </button>
        {idColumn && (
          <label
            className={`inline-flex cursor-pointer items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-colors ${
              showDuplicatesOnly
                ? "border-signal-amber/50 bg-signal-amber/10 text-signal-amber"
                : "border-ink-600 bg-ink-800/80 text-slate-300 hover:border-ink-500"
            }`}
          >
            <input
              type="checkbox"
              checked={showDuplicatesOnly}
              onChange={(e) => setShowDuplicatesOnly(e.target.checked)}
              className="h-3.5 w-3.5 rounded border-ink-500 bg-ink-800 accent-signal-amber"
            />
            <Copy className="h-3.5 w-3.5" />
            Show similar/duplicate “{idColumn}” only
          </label>
        )}
        {hasActiveFilters && (
          <button
            onClick={() => {
              setSearch("");
              setColFilters({});
              setCellFilter(null);
              setShowDuplicatesOnly(false);
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-ink-600 bg-ink-800/80 px-3 py-2 text-xs font-medium text-slate-400 hover:text-slate-200"
          >
            <RotateCcw className="h-3.5 w-3.5" /> Reset
          </button>
        )}
      </div>

      {showDuplicatesOnly && idColumn && (
        <p className="text-xs text-slate-500">
          Grouping every row whose <span className="font-mono text-slate-300">{idColumn}</span> matches another row
          once case, spacing/punctuation, and leading zeros are ignored.
        </p>
      )}

      {cellFilter && (
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-2 rounded-full border border-signal-cyan/40 bg-signal-cyan/10 px-3 py-1 text-xs font-medium text-signal-cyan">
            {cellFilter.column} ≈ "{cellFilter.value}"
            <button
              onClick={() => setCellFilter(null)}
              className="rounded-full p-0.5 hover:bg-signal-cyan/20"
              aria-label="Clear this filter"
            >
              <X className="h-3 w-3" />
            </button>
          </span>
          <span className="text-xs text-slate-500">
            {filteredRows.length.toLocaleString()} row{filteredRows.length === 1 ? "" : "s"}{" "}
            {isIdColumn(cellFilter.column) ? "match this ID (similarity match)" : "share this value"}
          </span>
        </div>
      )}

      {showFilters && (
        <div className="grid grid-cols-2 gap-2 rounded-lg border border-ink-700/60 bg-ink-900/40 p-3 sm:grid-cols-3 lg:grid-cols-4">
          {columns.map((c) => (
            <div key={c} className="min-w-0">
              <label className="mb-1 block truncate text-[10px] uppercase tracking-wide text-slate-500">{c}</label>
              <input
                value={colFilters[c] ?? ""}
                onChange={(e) => setColFilters((f) => ({ ...f, [c]: e.target.value }))}
                placeholder={`Filter ${c}...`}
                className="w-full rounded-md border border-ink-600 bg-ink-800/80 px-2 py-1.5 text-xs text-slate-200 placeholder:text-slate-600 focus:border-signal-cyan/60 focus:outline-none"
              />
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-500">
        Showing <span className="font-mono text-slate-300">{filteredRows.length.toLocaleString()}</span> of{" "}
        <span className="font-mono text-slate-300">{data.length.toLocaleString()}</span> records received from the server
        {hasActiveFilters ? " (filtered)" : ""}. Click any cell to isolate matching rows — for ID columns this is a
        similarity match (ignores case, punctuation, and leading zeros).
      </p>

      <div className="overflow-x-auto rounded-lg border border-ink-600/70">
        <div style={{ minWidth: columns.length * 140 }}>
          <div
            className="sticky top-0 z-10 grid bg-ink-800/95 font-mono text-[11px] uppercase tracking-wide text-slate-400"
            style={{ gridTemplateColumns: gridTemplate }}
          >
            {columns.map((c) => (
              <div key={c} className="whitespace-nowrap border-b border-ink-600/70 px-4 py-2 font-medium">
                {c}
                {c === idColumn && (
                  <span className="ml-1 rounded-sm border border-ink-600 px-1 py-0.5 text-[9px] font-normal normal-case text-slate-500">
                    ID
                  </span>
                )}
              </div>
            ))}
          </div>

          <div
            ref={scrollRef}
            onScroll={(e) => setScrollTop((e.target as HTMLDivElement).scrollTop)}
            className="max-h-[65vh] overflow-y-auto"
          >
            {filteredRows.length === 0 ? (
              <div className="px-4 py-10 text-center text-xs text-slate-500">No records match the current search/filters.</div>
            ) : (
              <div style={{ height: totalHeight, position: "relative" }}>
                <div style={{ position: "absolute", top: offsetY, left: 0, right: 0 }}>
                  {visibleRows.map((row, i) => {
                    const rowIndex = startIndex + i;
                    // when grouping duplicates, add a subtle divider whenever the
                    // normalized ID changes from the previous visible row
                    const prevRow = visibleRows[i - 1];
                    const isNewGroup =
                      showDuplicatesOnly &&
                      idColumn &&
                      prevRow &&
                      normalizeIdValue(prevRow[idColumn]) !== normalizeIdValue(row[idColumn]);
                    return (
                      <div
                        key={rowIndex}
                        className={`grid font-mono text-xs text-slate-300 hover:bg-ink-800/50 ${
                          isNewGroup ? "border-t-2 border-signal-amber/40" : "border-t border-ink-700/60"
                        }`}
                        style={{ gridTemplateColumns: gridTemplate, height: ROW_HEIGHT }}
                      >
                        {columns.map((c) => {
                          const value = row[c] ?? "";
                          const isActiveCell =
                            cellFilter?.column === c &&
                            (isIdColumn(c)
                              ? normalizeIdValue(value) === normalizeIdValue(cellFilter.value)
                              : String(value).trim() === cellFilter.value);
                          const isDupIdCell = showDuplicatesOnly && c === idColumn;
                          return (
                            <div
                              key={c}
                              onClick={() => handleCellClick(c, value)}
                              title={
                                isIdColumn(c)
                                  ? "Click to show every row with a similar ID (ignores case/punctuation/leading zeros)"
                                  : "Click to show every row with this same value"
                              }
                              className={`flex cursor-pointer items-center truncate whitespace-nowrap px-4 transition-colors ${
                                isActiveCell
                                  ? "bg-signal-cyan/15 text-signal-cyan"
                                  : isDupIdCell
                                  ? "text-signal-amber hover:bg-signal-cyan/5"
                                  : "hover:bg-signal-cyan/5 hover:text-signal-cyan"
                              }`}
                            >
                              {value}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
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

      <div className="relative mx-auto max-w-5xl px-6 pb-24 pt-16">
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
                <div className="panel mt-6 overflow-hidden p-4">
                  <div className="mb-3 flex items-center justify-between gap-3">
                    <p className="text-sm font-medium text-slate-300">
                      {result.flagged.toLocaleString()} flagged total — showing everything the server returned
                    </p>
                    <button
                      onClick={() => downloadReport(result.reportBase64, result.reportFileName)}
                      className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-signal-amber/40 bg-signal-amber/10 px-3 py-1.5 text-xs font-semibold text-signal-amber transition-colors hover:bg-signal-amber/20"
                    >
                      <Download className="h-3.5 w-3.5" /> Download full report
                    </button>
                  </div>

                  {/*
                    `result.preview` is exactly what the API sent back. If the
                    server itself only put 50 rows into `preview`, this will
                    still only show 50 rows — that cap has to be removed on
                    the server (search for something like `.slice(0, 50)`
                    assigned to a `preview` field in your API route).
                  */}
                  <ResultsTable columns={result.columns ?? []} data={result.preview ?? []} />
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