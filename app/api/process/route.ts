import { NextRequest, NextResponse } from "next/server";
import { runActiveMode, runResignedMode } from "@/lib/reconcile";

export const runtime = "nodejs";

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const mode = String(formData.get("mode") || "");
    const file1 = formData.get("file1") as File | null;
    const file2 = formData.get("file2") as File | null;

    if (mode !== "active" && mode !== "resigned") {
      return NextResponse.json({ ok: false, error: "Invalid mode." }, { status: 400 });
    }
    if (!file1 || !file2) {
      return NextResponse.json({ ok: false, error: "Both files are required." }, { status: 400 });
    }

    const buf1 = Buffer.from(await file1.arrayBuffer());
    const buf2 = Buffer.from(await file2.arrayBuffer());

    const result =
      mode === "active"
        ? await runActiveMode(buf1, file1.name, buf2, file2.name)
        : await runResignedMode(buf1, file1.name, buf2, file2.name);

    const { reportBuffer, ...rest } = result;

    return NextResponse.json({
      ok: true,
      ...rest,
      reportBase64: reportBuffer.toString("base64"),
      reportFileName: "reconciliation-report.xlsx",
      engine: "node"
    });
  } catch (err: any) {
    console.error("[reconcile] error:", err);
    return NextResponse.json({ ok: false, error: err?.message || "Unexpected server error." }, { status: 500 });
  }
}
