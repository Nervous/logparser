"use client";

import { useEffect, useState } from "react";
import { Loader2, ShieldCheck } from "lucide-react";

interface U {
  id: number; region: string; username: string; discordName: string | null;
  adminLevel: number; rank: string; roles: string[]; isManager: boolean; seeAll: boolean; lastLogin: string | null;
}

export default function UsersList({ superAdmin }: { superAdmin: boolean }) {
  const [users, setUsers] = useState<U[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  useEffect(() => {
    (async () => {
      const res = await fetch("/api/users");
      const j = await res.json();
      if (res.ok) setUsers(j.users);
      setLoading(false);
    })();
  }, []);

  const shown = users.filter((u) => !q || `${u.username} ${u.discordName} ${u.rank}`.toLowerCase().includes(q.toLowerCase()));

  return (
    <div>
      <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search staff…"
        className="mb-4 w-full rounded-lg border border-border bg-bg-elev-2 px-3 py-2 text-sm outline-none focus:border-accent-2" />
      <div className="overflow-x-auto rounded-xl border border-border bg-bg-elev">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wider text-text-dim">
            <tr>
              <th className="px-4 py-3">#</th>
              {superAdmin && <th className="px-4 py-3">Region</th>}
              <th className="px-4 py-3">Nickname</th>
              <th className="px-4 py-3">Discord</th>
              <th className="px-4 py-3">Rank</th>
              <th className="px-4 py-3">Last login</th>
              <th className="px-4 py-3 text-center">Access</th>
            </tr>
          </thead>
          <tbody>
            {shown.map((u, i) => (
              <tr key={u.id} className="border-b border-border-soft hover:bg-bg-elev-2/40">
                <td className="px-4 py-3 text-text-dim">{i + 1}</td>
                {superAdmin && <td className="px-4 py-3 uppercase text-text-dim">{u.region}</td>}
                <td className="px-4 py-3 font-medium">{u.username}</td>
                <td className="px-4 py-3 font-mono text-xs text-text-soft">{u.discordName ?? "—"}</td>
                <td className="px-4 py-3 text-text-soft">{u.rank}</td>
                <td className="px-4 py-3 text-text-dim">{u.lastLogin ? new Date(u.lastLogin).toLocaleString() : "—"}</td>
                <td className="px-4 py-3 text-center">
                  {u.seeAll
                    ? <span className="inline-flex items-center gap-1 rounded bg-accent/15 px-2 py-0.5 text-xs text-accent"><ShieldCheck size={12} /> All</span>
                    : <span className="text-xs text-text-dim">per role</span>}
                </td>
              </tr>
            ))}
            {loading && <tr><td colSpan={superAdmin ? 7 : 6} className="px-4 py-12 text-center text-text-dim"><Loader2 className="inline animate-spin" /></td></tr>}
            {!loading && shown.length === 0 && <tr><td colSpan={superAdmin ? 7 : 6} className="px-4 py-12 text-center text-text-dim">No staff found.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
