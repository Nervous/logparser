"use client";

import { useEffect, useState } from "react";
import { Loader2, Search as SearchIcon } from "lucide-react";
import { groupLabel } from "@/lib/logGroups";

interface Row {
  id: number; username: string; region: string; server: string;
  query: string; logTypes: string[]; range: string; resultCount: number; createdAt: string;
}

export default function SearchesTable({ superAdmin }: { superAdmin: boolean }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/searches");
      const j = await res.json();
      if (res.ok) setRows(j.searches);
      setLoading(false);
    })();
  }, []);

  const shown = rows.filter((r) => !q || `${r.username} ${r.query}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <div className="relative mb-4 max-w-sm">
        <SearchIcon size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-text-dim" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Filter by admin or term…"
          className="w-full rounded-lg border border-border bg-bg-elev-2 py-2 pl-9 pr-3 text-sm outline-none focus:border-accent-2" />
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-bg-elev">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wider text-text-dim">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Admin</th>
              {superAdmin && <th className="px-4 py-3">Region</th>}
              <th className="px-4 py-3">Server</th>
              <th className="px-4 py-3">Search</th>
              <th className="px-4 py-3">Categories</th>
              <th className="px-4 py-3">Range</th>
              <th className="px-4 py-3 text-right">Hits</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((r) => (
              <tr key={r.id} className="border-b border-border-soft hover:bg-bg-elev-2/40">
                <td className="whitespace-nowrap px-4 py-2.5 text-text-dim">{new Date(r.createdAt).toLocaleString()}</td>
                <td className="px-4 py-2.5 font-medium">{r.username}</td>
                {superAdmin && <td className="px-4 py-2.5 uppercase text-text-dim">{r.region}</td>}
                <td className="px-4 py-2.5 text-text-soft">{r.server}</td>
                <td className="px-4 py-2.5 font-mono text-xs">{r.query}</td>
                <td className="px-4 py-2.5">
                  <div className="flex flex-wrap gap-1">
                    {r.logTypes.slice(0, 4).map((t) => (
                      <span key={t} className="rounded bg-bg-elev-2 px-1.5 py-0.5 text-[10px] text-text-soft">{groupLabel(t)}</span>
                    ))}
                    {r.logTypes.length > 4 && <span className="text-[10px] text-text-dim">+{r.logTypes.length - 4}</span>}
                  </div>
                </td>
                <td className="px-4 py-2.5 text-text-dim">{r.range}</td>
                <td className="px-4 py-2.5 text-right font-mono tabular-nums">{r.resultCount.toLocaleString()}</td>
              </tr>
            ))}
            {loading && <tr><td colSpan={superAdmin ? 8 : 7} className="px-4 py-12 text-center text-text-dim"><Loader2 className="inline animate-spin" /></td></tr>}
            {!loading && shown.length === 0 && <tr><td colSpan={superAdmin ? 8 : 7} className="px-4 py-12 text-center text-text-dim">No searches logged yet.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
