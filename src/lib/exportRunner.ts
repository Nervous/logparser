import { promises as fs } from "fs";
import path from "path";
import { prisma } from "./prisma";
import { fetchAll } from "./loki";
import { getFlags } from "./logTypes";
import { groupLabel, resolveGroupsToPlan } from "./logGroups";
import { SERVER_TIME_ZONE } from "./serverTime";
import { bulkDateTimeFormatter, fmtDateTime } from "./time";

const EXPORT_DIR = process.env.EXPORT_DIR ?? path.join(process.cwd(), "data", "exports");

// Run the Loki pull for an already-authorized request, write the file, mark COMPLETE.
// Used both by the immediate path (fully-authorized request) and after approval.
export async function runExport(requestId: number): Promise<void> {
  const req = await prisma.exportRequest.findUnique({ where: { id: requestId } });
  if (!req) return;
  await prisma.exportRequest.update({ where: { id: requestId }, data: { status: "RUNNING" } });
  try {
    const groupKeys: string[] = JSON.parse(req.logTypes);
    const terms: string[] = req.searchParams.split("|").map((s: string) => s.trim()).filter(Boolean);
    const subqueries = resolveGroupsToPlan(groupKeys, await getFlags());
    const entries = await fetchAll({
      region: req.region,
      server: req.server,
      subqueries,
      terms,
      fromMs: req.fromDate.getTime(),
      toMs: req.toDate.getTime(),
    });

    await fs.mkdir(EXPORT_DIR, { recursive: true });
    const file = path.join(EXPORT_DIR, `export-${req.id}.txt`);
    // every timestamp in the file is server time, 24-hour (lines keep their milliseconds)
    const tz = SERVER_TIME_ZONE;
    const stamp = bulkDateTimeFormatter(tz, { ms: true });
    const header =
      `# GTA World log export #${req.id}\n` +
      `# region=${req.region} server=${req.server}\n` +
      `# terms=${terms.join(" | ")}\n` +
      (req.reason ? `# reason=${req.reason.replace(/\s+/g, " ")}\n` : "") +
      `# types=${groupKeys.map((k) => groupLabel(k)).join(", ")}\n` +
      `# range=${fmtDateTime(req.fromDate, tz)} .. ${fmtDateTime(req.toDate, tz)}\n` +
      `# timezone=${tz} (server time, 24-hour)\n` +
      `# lines=${entries.length}\n\n`;
    const body = entries
      .map((e) => `[${stamp(e.ts)}] [${e.flag}] ${e.line}`)
      .join("\n");
    await fs.writeFile(file, header + body, "utf8");

    await prisma.exportRequest.update({
      where: { id: requestId },
      data: { status: "COMPLETE", resultPath: file, lineCount: entries.length, completedAt: new Date() },
    });
  } catch (e) {
    await prisma.exportRequest.update({
      where: { id: requestId },
      data: { status: "FAILED", error: (e as Error).message },
    });
  }
}
