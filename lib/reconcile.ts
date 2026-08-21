import ExcelJS from "exceljs";

// ---- ID / status normalization (ported 1:1 from the Python version) -------

export function normalizeId(value: unknown): string {
  if (value === null || value === undefined) return "";
  let text = String(value).trim();
  if (text.toLowerCase() === "nan" || text.toLowerCase() === "none") return "";
  text = text.split(/\s+/).join(" ");
  return text.toUpperCase();
}

const ID_COLUMN_CANDIDATES = [
  "employee id", "employeeid", "emp id", "empid",
  "employee number", "employee no", "emp no",
  "staff id", "staff no", "personnel id", "personnel number",
  "user id", "userid", "id"
];

export function guessIdColumn(columns: string[]): string {
  const normMap = new Map(columns.map((c) => [c.trim().toLowerCase().split(/\s+/).join(" "), c]));
  for (const cand of ID_COLUMN_CANDIDATES) {
    if (normMap.has(cand)) return normMap.get(cand)!;
  }
  for (const [norm, orig] of normMap) {
    if (norm.includes("employee") && norm.includes("id")) return orig;
  }
  for (const [norm, orig] of normMap) {
    if (norm.endsWith("id")) return orig;
  }
  return columns[0];
}

const STATUS_COLUMN_CANDIDATES = [
  "status", "employee status", "emp status", "work status",
  "employment status", "active status", "account status", "state"
];

const ACTIVE_VALUES = new Set([
  "A", "ACTIVE", "ACTIVE EMPLOYEE", "ACTIVELY WORKING", "WORKING",
  "CURRENT", "CURRENTLY WORKING", "ENABLED", "ENABLE", "Y", "YES", "1",
  "TRUE", "IN SERVICE", "EMPLOYED", "ON DUTY", "PRESENT"
]);

const INACTIVE_VALUES = new Set([
  "I", "INACTIVE", "RESIGNED", "TERMINATED", "TERMINATE", "LEFT",
  "EXIT", "EXITED", "SEPARATED", "N", "NO", "0", "FALSE", "DISABLED",
  "DISABLE", "SUSPENDED", "OFFBOARDED", "NOT ACTIVE"
]);

export function guessStatusColumn(columns: string[]): string | null {
  const normMap = new Map(columns.map((c) => [c.trim().toLowerCase().split(/\s+/).join(" "), c]));
  for (const cand of STATUS_COLUMN_CANDIDATES) {
    if (normMap.has(cand)) return normMap.get(cand)!;
  }
  for (const [norm, orig] of normMap) {
    if (norm.includes("status")) return orig;
  }
  return null;
}

export function classifyStatus(raw: unknown): "active" | "inactive" | "unknown" {
  const norm = normalizeId(raw);
  if (ACTIVE_VALUES.has(norm)) return "active";
  if (INACTIVE_VALUES.has(norm)) return "inactive";
  return "unknown";
}

export function guessNameColumn(columns: string[]): string | null {
  const candidates = ["employee name", "name", "full name", "staff name"];
  const normMap = new Map(columns.map((c) => [c.trim().toLowerCase().split(/\s+/).join(" "), c]));
  for (const cand of candidates) {
    if (normMap.has(cand)) return normMap.get(cand)!;
  }
  for (const [norm, orig] of normMap) {
    if (norm.includes("name")) return orig;
  }
  return null;
}

// ---- Format detection (mirrors the Python sniff_format) --------------------

type Detected = "xlsx" | "xls" | "csv";

function sniffFormat(buffer: Buffer): Detected {
  const sig = buffer.subarray(0, 8);
  if (sig[0] === 0x50 && sig[1] === 0x4b) return "xlsx"; // 'PK' - ZIP container
  const oleSig = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);
  if (sig.equals(oleSig)) return "xls";
  return "csv";
}

// ---- CSV parsing (handles quoted fields, no external dependency) ----------

function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let inQuotes = false;
  const pushField = () => {
    row.push(field);
    field = "";
  };
  const pushRow = () => {
    pushField();
    rows.push(row);
    row = [];
  };
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += c;
      }
    } else if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      pushField();
    } else if (c === "\r") {
      // skip, \n handles the row break
    } else if (c === "\n") {
      pushRow();
    } else {
      field += c;
    }
  }
  if (field.length > 0 || row.length > 0) pushRow();
  return rows.filter((r) => r.some((v) => v.trim() !== ""));
}

export type Table = { columns: string[]; rows: Record<string, string>[] };

export async function loadTable(buffer: Buffer, declaredName: string): Promise<Table> {
  const declaredExt = (declaredName.match(/\.[^.]+$/)?.[0] || "").toLowerCase();
  const actual = sniffFormat(buffer);

  if (actual === "xls") {
    throw new Error(
      "This file is a legacy .xls (old binary Excel) file, which isn't supported. " +
        "Please re-save it as .xlsx (Excel: File > Save As > Excel Workbook) and upload that instead."
    );
  }

  if (actual === "csv" && (declaredExt === ".xlsx" || declaredExt === ".xlsm")) {
    throw new Error(
      `This file is named like an Excel file (${declaredExt}) but its actual content is plain ` +
        "text/CSV, not a real workbook. Try renaming it to .csv, or re-save it from Excel as a genuine .xlsx file."
    );
  }

  let rawRows: unknown[][];
  let columns: string[];

  if (actual === "xlsx") {
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buffer as any);
    const ws = wb.worksheets[0];
    if (!ws || ws.rowCount === 0) return { columns: [], rows: [] };

    const headerRow = ws.getRow(1);
    columns = [];
    headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const v = cell.value;
      columns[colNumber - 1] = v === null || v === undefined ? "" : String(cellText(v));
    });
    columns = columns.map((c, i) => (c && c.trim() !== "" ? c : `Column${i + 1}`));

    rawRows = [];
    for (let r = 2; r <= ws.rowCount; r++) {
      const row = ws.getRow(r);
      const values: unknown[] = [];
      let hasValue = false;
      for (let c = 1; c <= columns.length; c++) {
        const raw = row.getCell(c).value;
        const text = raw === null || raw === undefined ? "" : cellText(raw);
        values[c - 1] = text;
        if (String(text).trim() !== "") hasValue = true;
      }
      if (hasValue) rawRows.push(values);
    }
  } else {
    const text = buffer.toString("utf-8").replace(/^\uFEFF/, "");
    const parsed = parseCsv(text);
    if (parsed.length === 0) return { columns: [], rows: [] };
    columns = parsed[0].map((c) => c.trim());
    rawRows = parsed.slice(1);
  }

  // Drop fully-blank columns.
  const keepIdx: number[] = [];
  for (let i = 0; i < columns.length; i++) {
    const hasValue = rawRows.some((r) => r[i] !== undefined && r[i] !== null && String(r[i]).trim() !== "");
    if (hasValue || (columns[i] && columns[i].trim() !== "")) keepIdx.push(i);
  }

  const seen = new Map<string, number>();
  const dedupedColumns = keepIdx.map((i) => {
    const c = String(columns[i]).trim();
    const count = seen.get(c) ?? 0;
    seen.set(c, count + 1);
    return count === 0 ? c : `${c} (${count})`;
  });

  const rows: Record<string, string>[] = rawRows.map((r) => {
    const obj: Record<string, string> = {};
    keepIdx.forEach((i, pos) => {
      const val = r[i];
      obj[dedupedColumns[pos]] = val === undefined || val === null ? "" : String(val);
    });
    return obj;
  });

  return { columns: dedupedColumns, rows };
}

function cellText(v: unknown): string {
  if (v && typeof v === "object") {
    if ("text" in (v as any)) return String((v as any).text);
    if ("result" in (v as any)) return String((v as any).result);
    if (v instanceof Date) return v.toISOString().slice(0, 10);
    if ("richText" in (v as any)) return (v as any).richText.map((t: any) => t.text).join("");
  }
  return String(v);
}

// ---- Writing the styled report ---------------------------------------------

export async function writeReport(columns: string[], rows: Record<string, string>[], sheetTitle: string): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetTitle.slice(0, 31));

  ws.addRow(columns);
  const headerRow = ws.getRow(1);
  headerRow.eachCell((cell) => {
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF0D1117" } };
    cell.font = { color: { argb: "FF3FD9DB" }, bold: true, size: 11, name: "Calibri" };
    cell.alignment = { horizontal: "left", vertical: "middle" };
    cell.border = borderStyle();
  });

  for (const row of rows) {
    const r = ws.addRow(columns.map((c) => row[c] ?? ""));
    r.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FFFFF4E5" } };
      cell.border = borderStyle();
    });
  }

  columns.forEach((col, idx) => {
    let maxLen = col.length;
    for (const row of rows) {
      const len = String(row[col] ?? "").length;
      if (len > maxLen) maxLen = len;
    }
    ws.getColumn(idx + 1).width = Math.min(maxLen + 4, 45);
  });

  ws.views = [{ state: "frozen", ySplit: 1 }];

  const arrayBuffer = await wb.xlsx.writeBuffer();
  return Buffer.from(arrayBuffer);
}

function borderStyle() {
  const thin = { style: "thin" as const, color: { argb: "FFD0D5DD" } };
  return { left: thin, right: thin, top: thin, bottom: thin };
}

// ---- The two reconciliation modes -------------------------------------------

export async function runActiveMode(hrBuffer: Buffer, hrName: string, deptBuffer: Buffer, deptName: string) {
  const hr = await loadTable(hrBuffer, hrName);
  const dept = await loadTable(deptBuffer, deptName);

  const hrIdCol = guessIdColumn(hr.columns);
  const deptIdCol = guessIdColumn(dept.columns);
  const statusCol = guessStatusColumn(hr.columns);

  let consideredHrRows = hr.rows;
  let activeFilterApplied = false;
  if (statusCol && hr.rows.length > 0) {
    const classes = hr.rows.map((r) => classifyStatus(r[statusCol] ?? ""));
    const knownCount = classes.filter((c) => c === "active" || c === "inactive").length;
    if (knownCount / classes.length > 0.5) {
      consideredHrRows = hr.rows.filter((_, i) => classes[i] === "active");
      activeFilterApplied = true;
    }
  }

  const hrIdSet = new Set(consideredHrRows.map((r) => normalizeId(r[hrIdCol])).filter((v) => v !== ""));

  const missingRows: Record<string, string>[] = [];
  let matched = 0;
  for (const r of dept.rows) {
    const did = normalizeId(r[deptIdCol]);
    if (did === "") continue;
    if (hrIdSet.has(did)) matched++;
    else missingRows.push(r);
  }

  const reportBuffer = await writeReport(dept.columns, missingRows, "Not In Active List");
  const nameCol = guessNameColumn(dept.columns);

  return {
    mode: "active" as const,
    hrIdColumn: hrIdCol,
    deptIdColumn: deptIdCol,
    statusColumn: statusCol,
    activeFilterApplied,
    hrRows: hr.rows.length,
    hrActiveRows: consideredHrRows.length,
    deptRows: dept.rows.length,
    matched,
    flagged: missingRows.length,
    flagLabel: "Dept users missing from active list",
    nameColumn: nameCol,
    columns: dept.columns,
    preview: missingRows.slice(0, 10000),
    reportBuffer
  };
}

export async function runResignedMode(resignedBuffer: Buffer, resignedName: string, deptBuffer: Buffer, deptName: string) {
  const resigned = await loadTable(resignedBuffer, resignedName);
  const dept = await loadTable(deptBuffer, deptName);

  const resignedIdCol = guessIdColumn(resigned.columns);
  const deptIdCol = guessIdColumn(dept.columns);

  const resignedIdSet = new Set(resigned.rows.map((r) => normalizeId(r[resignedIdCol])).filter((v) => v !== ""));

  const stillPresentRows: Record<string, string>[] = [];
  for (const r of dept.rows) {
    const did = normalizeId(r[deptIdCol]);
    if (did !== "" && resignedIdSet.has(did)) stillPresentRows.push(r);
  }

  const reportBuffer = await writeReport(dept.columns, stillPresentRows, "Resigned But Still Listed");
  const nameCol = guessNameColumn(dept.columns);

  return {
    mode: "resigned" as const,
    resignedIdColumn: resignedIdCol,
    deptIdColumn: deptIdCol,
    resignedRows: resigned.rows.length,
    deptRows: dept.rows.length,
    flagged: stillPresentRows.length,
    flagLabel: "Resigned employees still listed in department",
    nameColumn: nameCol,
    columns: dept.columns,
    preview: stillPresentRows.slice(0, 10000),
    reportBuffer
  };
}
