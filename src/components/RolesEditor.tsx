"use client";

import { useEffect, useState } from "react";
import { Check, X, Loader2, ShieldCheck } from "lucide-react";

interface LT { key: string; label: string; desc?: string; featured?: boolean }
interface Role {
  id: number; region: string; name: string; rank: number; seeAll: boolean;
  users: number; permissions: Record<string, boolean>;
}
interface Srv { key: string; label: string; region: string }

export default function RolesEditor({ superAdmin }: { superAdmin: boolean }) {
  const [logTypes, setLogTypes] = useState<LT[]>([]);
  const [roles, setRoles] = useState<Role[]>([]);
  const [servers, setServers] = useState<Srv[]>([]);
  const [server, setServer] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);

  async function loadFor(srv?: string) {
    setLoading(true);
    const res = await fetch(`/api/roles${srv ? `?server=${encodeURIComponent(srv)}` : ""}`);
    const j = await res.json();
    if (res.ok) {
      setLogTypes(j.logTypes); setRoles(j.roles); setServers(j.servers); setServer(j.server);
    }
    setLoading(false);
  }
  useEffect(() => { loadFor(); }, []);

  async function toggle(role: Role, key: string, next: boolean) {
    const cell = `${role.id}:${key}`;
    setSaving(cell);
    setRoles((rs) => rs.map((r) => r.id === role.id ? { ...r, permissions: { ...r.permissions, [key]: next } } : r));
    await fetch("/api/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId: role.id, server, logTypeKey: key, allowed: next }) });
    setSaving(null);
  }
  async function toggleSeeAll(role: Role, next: boolean) {
    setSaving(`${role.id}:seeAll`);
    setRoles((rs) => rs.map((r) => r.id === role.id ? { ...r, seeAll: next } : r));
    await fetch("/api/roles", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ roleId: role.id, server, seeAll: next }) });
    setSaving(null);
  }

  if (loading) return <div className="py-16 text-center text-text-dim"><Loader2 className="inline animate-spin" /></div>;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <span className="text-sm text-text-soft">Permissions for server</span>
        <select value={server} onChange={(e) => { setServer(e.target.value); loadFor(e.target.value); }}
          className="rounded-lg border border-border bg-bg-elev-2 px-3 py-1.5 text-sm outline-none focus:border-accent-2">
          {servers.map((s) => <option key={s.key} value={s.key}>{superAdmin ? `${s.region.toUpperCase()} · ${s.label}` : s.label}</option>)}
        </select>
        <span className="text-xs text-text-dim">permissions are set per server instance</span>
      </div>
      <div className="overflow-x-auto rounded-xl border border-border bg-bg-elev">
        <table className="w-full text-left text-sm">
          <thead className="border-b border-border text-xs uppercase tracking-wider text-text-dim">
            <tr>
              {superAdmin && <th className="px-4 py-3">Region</th>}
              <th className="px-4 py-3">Role</th>
              <th className="px-4 py-3">Members</th>
              {logTypes.map((t) => (
                <th key={t.key} className={`px-3 py-3 text-center text-[11px] whitespace-nowrap ${t.featured ? "text-accent" : ""}`} title={t.desc ?? t.label}>{t.label}</th>
              ))}
              <th className="px-4 py-3 text-center">See all</th>
            </tr>
          </thead>
          <tbody>
            {roles.map((r) => (
              <tr key={r.id} className="border-b border-border-soft hover:bg-bg-elev-2/40">
                {superAdmin && <td className="px-4 py-3 uppercase text-text-dim">{r.region}</td>}
                <td className="px-4 py-3 font-medium">{r.name}</td>
                <td className="px-4 py-3 text-text-dim">{r.users}</td>
                {logTypes.map((t) => {
                  const on = r.seeAll || r.permissions[t.key];
                  const cell = `${r.id}:${t.key}`;
                  return (
                    <td key={t.key} className="px-4 py-3 text-center">
                      <button
                        disabled={r.seeAll || saving === cell}
                        onClick={() => toggle(r, t.key, !r.permissions[t.key])}
                        className={`inline-flex h-6 w-6 items-center justify-center rounded ${on ? "bg-good/20 text-good" : "bg-bad/10 text-bad"} ${r.seeAll ? "opacity-50" : "hover:brightness-125"}`}
                        title={r.seeAll ? "Granted via See all" : on ? "Allowed — click to revoke" : "Denied — click to grant"}
                      >
                        {saving === cell ? <Loader2 size={13} className="animate-spin" /> : on ? <Check size={14} /> : <X size={14} />}
                      </button>
                    </td>
                  );
                })}
                <td className="px-4 py-3 text-center">
                  <button onClick={() => toggleSeeAll(r, !r.seeAll)} disabled={saving === `${r.id}:seeAll`}
                    className={`inline-flex items-center gap-1 rounded px-2 py-1 text-xs ${r.seeAll ? "bg-accent/20 text-accent" : "bg-bg-elev-2 text-text-dim hover:text-text"}`}>
                    {saving === `${r.id}:seeAll` ? <Loader2 size={12} className="animate-spin" /> : <ShieldCheck size={13} />}
                    {r.seeAll ? "On" : "Off"}
                  </button>
                </td>
              </tr>
            ))}
            {roles.length === 0 && (
              <tr><td colSpan={logTypes.length + 4} className="px-4 py-12 text-center text-text-dim">
                No roles yet — they appear here as staff sign in for the first time.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
