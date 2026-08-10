"use client";

import { useMemo } from "react";
import { Avatar } from "@/components/ui/Avatar";
import { teamMembers } from "@/lib/dummy-data";
import { useVoiceListContext } from "@/hooks/useVoiceListContext";
import { Mail, MoreVertical, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * Settings → Team Members table. Publishes live row count to the voice page-context agent.
 */
export function TeamMembersTab() {
  const voiceRows = useMemo(
    () =>
      teamMembers.map((m) => ({
        code: m.id,
        label: `${m.name} — ${m.role}`,
        path: `/settings?tab=team`,
      })),
    []
  );
  useVoiceListContext("/settings", "user", voiceRows, "team-members");

  return (
    <div className="animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h2 className="text-[20px] font-bold text-gray-900">Team Management</h2>
          <p className="text-[14px] text-gray-500 mt-1">Manage who has access to this workspace.</p>
        </div>
        <button className="flex items-center gap-2 rounded-lg bg-[#2548C9] px-5 py-2.5 text-[14px] font-semibold text-white shadow-sm hover:bg-[#1E3A9F] transition-colors">
          <Plus className="h-4 w-4" /> Invite Member
        </button>
      </div>

      <div className="rounded-xl border border-gray-200 bg-white shadow-sm overflow-hidden">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-gray-200 bg-gray-50/50">
              <th className="px-6 py-4 text-[12px] font-bold text-gray-500 uppercase tracking-wider">User</th>
              <th className="px-6 py-4 text-[12px] font-bold text-gray-500 uppercase tracking-wider">Role</th>
              <th className="px-6 py-4 text-[12px] font-bold text-gray-500 uppercase tracking-wider">Last Active</th>
              <th className="px-6 py-4 text-[12px] font-bold text-gray-500 uppercase tracking-wider text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-100">
            {teamMembers.map((m, i) => (
              <tr key={m.id} className="hover:bg-gray-50/50 transition-colors group">
                <td className="px-6 py-4">
                  <div className="flex items-center gap-3">
                    <Avatar name={m.name} />
                    <div>
                      <div className="font-bold text-[14px] text-gray-900">{m.name}</div>
                      <div className="flex items-center gap-1.5 text-[13px] text-gray-500 mt-0.5">
                        <Mail className="h-3 w-3" /> {m.email}
                      </div>
                    </div>
                  </div>
                </td>
                <td className="px-6 py-4">
                  <span
                    className={cn(
                      "px-2.5 py-1 rounded-md text-[11px] font-bold uppercase tracking-wider border",
                      m.role.toLowerCase() === "admin"
                        ? "bg-purple-50 text-purple-700 border-purple-200"
                        : "bg-blue-50 text-blue-700 border-blue-200"
                    )}
                  >
                    {m.role}
                  </span>
                </td>
                <td className="px-6 py-4 text-[13px] text-gray-500 font-medium">
                  {i === 0 ? "Just now" : i === 1 ? "2 hours ago" : "3 days ago"}
                </td>
                <td className="px-6 py-4 text-right">
                  <button className="p-2 rounded-lg text-gray-400 hover:text-gray-900 hover:bg-gray-100 transition-colors">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
