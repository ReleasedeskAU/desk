"use client";

import { Filter, Settings, User, Rocket, List, AlertCircle, Bot, SlidersHorizontal, Settings2 } from "lucide-react";
import { cn } from "@/lib/utils";

export default function HistoryPage() {
  return (
    <div className="w-full font-sans pb-12">
      {/* Header Section */}
      <div className="flex items-start justify-between mb-10 mt-2">
        <div>
          <h1 className="text-[28px] font-bold text-[#111827] tracking-tight">Audit Trail</h1>
          <p className="mt-1 text-[15px] text-gray-500 font-medium">Detailed history of all system actions and release cycles.</p>
        </div>
        <div className="flex items-center gap-3">
          <button className="flex items-center gap-2 rounded-lg bg-gray-50/80 px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm border border-gray-200 hover:bg-gray-100 transition-colors h-[42px]">
            <Filter className="h-4 w-4 text-gray-500" /> Filter Release
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-gray-50/80 px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm border border-gray-200 hover:bg-gray-100 transition-colors h-[42px]">
            <User className="h-4 w-4 text-gray-500" /> Actor
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-gray-50/80 px-4 py-2.5 text-sm font-semibold text-gray-700 shadow-sm border border-gray-200 hover:bg-gray-100 transition-colors h-[42px]">
            <Settings2 className="h-4 w-4 text-gray-500" /> Action Type
          </button>
          <button className="flex items-center gap-2 rounded-lg bg-[#2548C9] px-6 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-[#1E3A9F] transition-colors h-[42px]">
            Export Log
          </button>
        </div>
      </div>

      {/* Timeline Section */}
      <div className="relative pl-6">
        {/* Continuous Vertical Line */}
        <div className="absolute left-[39px] top-4 bottom-0 w-px bg-gray-200 z-0" />

        {/* TODAY Section */}
        <div className="relative z-10 mb-8">
          <div className="flex items-center gap-4 mb-6">
            <span className="bg-[#E2E8F0] text-[#475569] text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded">
              Today
            </span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="space-y-6">
            {/* Timeline Item 1: Production Deployment Successful */}
            <div className="relative flex gap-6">
              {/* Icon Circle */}
              <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white bg-[#EFF3FF] text-[#2548C9] shadow-sm ring-1 ring-gray-100 mt-2">
                <Rocket className="h-4 w-4" />
              </div>
              
              {/* Card */}
              <div className="flex-1 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-[15px] font-bold text-gray-900">Production Deployment Successful</h3>
                      <span className="rounded bg-[#DCFCE7] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#166534]">
                        Success
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[13px] font-medium text-gray-500">
                      <span>09:42 AM</span>
                      <span className="text-gray-300">|</span>
                      <span className="text-[#2548C9] font-semibold hover:underline cursor-pointer"># Release: v2.14.0</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <p className="text-[13px] font-bold text-gray-900">System Agent</p>
                      <p className="text-[11px] text-gray-500">Automated Trigger</p>
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-[#EFF3FF] text-[#2548C9]">
                      <Bot className="h-4 w-4" />
                    </div>
                  </div>
                </div>
                <p className="text-[14px] text-gray-600 font-medium leading-relaxed mt-4">
                  Production pipeline "Global-Node-Cluster-01" finished all stages. Automated health checks passed with 100% confidence score.
                </p>
              </div>
            </div>

            {/* Timeline Item 2: Compliance Policy Updated */}
            <div className="relative flex gap-6">
              {/* Icon Circle */}
              <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white bg-gray-100 text-gray-500 shadow-sm ring-1 ring-gray-100 mt-2">
                <List className="h-4 w-4" />
              </div>
              
              {/* Card */}
              <div className="flex-1 rounded-xl border border-gray-200 bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-[15px] font-bold text-gray-900">Compliance Policy Updated</h3>
                    </div>
                    <div className="flex items-center gap-2 text-[13px] font-medium text-gray-500">
                      <span>08:15 AM</span>
                      <span className="text-gray-300">|</span>
                      <span className="font-semibold text-gray-700">PCI-DSS-2024</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <p className="text-[13px] font-bold text-gray-900">Marcus Chen</p>
                      <p className="text-[11px] text-gray-500">Security Lead</p>
                    </div>
                    <img 
                      src="https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=32&h=32" 
                      alt="Avatar" 
                      className="h-8 w-8 rounded-full bg-gray-200 object-cover"
                    />
                  </div>
                </div>
                <div className="mt-4 rounded-lg bg-[#282C34] p-4 font-mono text-[13px] leading-relaxed">
                  <div className="text-[#98C379]">+ enforce_strict_tls: true</div>
                  <div className="text-[#E06C75]">- allow_legacy_cipher: true</div>
                  <div className="text-[#98C379]">+ minimum_protocol: "TLSv1.3"</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* YESTERDAY Section */}
        <div className="relative z-10">
          <div className="flex items-center gap-4 mb-6">
            <span className="bg-[#E2E8F0] text-[#475569] text-[10px] font-bold uppercase tracking-widest px-2.5 py-1 rounded">
              Yesterday
            </span>
            <div className="flex-1 h-px bg-gray-200" />
          </div>

          <div className="space-y-6">
            {/* Timeline Item 3: Staging Deployment Failed */}
            <div className="relative flex gap-6">
              {/* Icon Circle */}
              <div className="relative z-10 flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-white bg-[#FEF2F2] text-[#DC2626] shadow-sm ring-1 ring-gray-100 mt-2">
                <AlertCircle className="h-4 w-4" />
              </div>
              
              {/* Card */}
              <div className="flex-1 rounded-xl border border-gray-200 border-l-4 border-l-[#DC2626] bg-white p-5 shadow-sm">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <div className="flex items-center gap-3 mb-1">
                      <h3 className="text-[15px] font-bold text-gray-900">Staging Deployment Failed</h3>
                      <span className="rounded bg-[#FEF2F2] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#DC2626]">
                        Failed
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-[13px] font-medium text-gray-500">
                      <span>04:50 PM</span>
                      <span className="text-gray-300">|</span>
                      <span className="text-gray-700 font-semibold cursor-pointer"># Release: v2.14.0-rc3</span>
                    </div>
                  </div>
                  <div className="flex items-center gap-3 text-right">
                    <div>
                      <p className="text-[13px] font-bold text-gray-900">CI/CD Pipeline</p>
                      <p className="text-[11px] text-gray-500">GitHub Actions</p>
                    </div>
                    <div className="flex h-8 w-8 items-center justify-center rounded bg-gray-100 text-gray-600">
                      <SlidersHorizontal className="h-4 w-4" />
                    </div>
                  </div>
                </div>
                <div className="mt-4 rounded-lg bg-[#FEF2F2]/50 border border-[#FECACA] p-4 text-[13px] text-[#DC2626] font-mono">
                  Error: Integration test "User-Auth-Flow" timed out after 180s. Container "auth-service" reported OOMKill.
                </div>
              </div>
            </div>
          </div>
        </div>

      </div>
    </div>
  );
}
