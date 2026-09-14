"use client";

import { useState } from "react";
import UsersList from "./UsersList";
import RolesEditor from "./RolesEditor";

export default function UsersRolesTabs({ superAdmin }: { superAdmin: boolean }) {
  const [tab, setTab] = useState<"users" | "roles">("users");
  return (
    <div>
      <div className="mb-5 flex gap-1 border-b border-border">
        {(["users", "roles"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`relative px-4 py-2 text-sm ${tab === t ? "text-text" : "text-text-soft hover:text-text"}`}>
            {t === "users" ? "User List" : "Roles & Permissions"}
            {tab === t && <span className="absolute inset-x-3 -bottom-px h-0.5 rounded bg-accent-2" />}
          </button>
        ))}
      </div>
      {tab === "users" ? <UsersList superAdmin={superAdmin} /> : <RolesEditor superAdmin={superAdmin} />}
    </div>
  );
}
