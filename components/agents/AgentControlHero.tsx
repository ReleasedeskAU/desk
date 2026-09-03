"use client";

import { motion } from "framer-motion";
import { agents, activityFeed } from "@/lib/dummy-data";
import { MagicCard } from "@/components/ui/magic-card";
import { DotPattern } from "@/components/ui/dot-pattern";
import { ShimmerText } from "@/components/ui/shimmer-text";
import { Bot, Radio, Zap } from "lucide-react";

export function AgentControlHero() {
  const active = agents.filter((a) => a.status === "Active").length;
  const liveAi = agents.filter((a) => a.liveAi).length;
  const agentEvents = activityFeed.filter((a) => a.type === "agent").length;

  const stats = [
    { label: "Agents online", value: active, icon: Bot },
    { label: "LLM-powered", value: liveAi, icon: Zap },
    { label: "Events today", value: agentEvents, icon: Radio },
  ];

  return (
    <MagicCard gradient="from-brand-500 via-brand-500 to-cyan-500" beam glow className="mb-6">
      <div className="relative overflow-hidden p-6 md:p-8">
        <DotPattern opacity={0.4} />
        <div className="relative flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <div>
            <motion.p
              className="text-xs font-semibold uppercase tracking-widest text-brand-500 mb-2"
              animate={{ opacity: [0.7, 1, 0.7] }}
              transition={{ repeat: Infinity, duration: 2 }}
            >
              ReleaseDesk Everywhere AI Fleet
            </motion.p>
            <h2 className="text-2xl md:text-3xl font-bold text-gray-900">
              <ShimmerText>{agents.length} agents</ShimmerText> monitoring releases
            </h2>
            <p className="text-sm text-gray-500 mt-2 max-w-xl">
              Real-time analysis across tickets, builds, risk, deployments, security, and stakeholder comms — annotate only, never act.
            </p>
          </div>
          <div className="flex gap-4">
            {stats.map(({ label, value, icon: Icon }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: i * 0.1 }}
                className="rounded-xl bg-white/80 backdrop-blur border border-white/60 px-4 py-3 text-center min-w-[100px] shadow-theme-sm"
              >
                <Icon className="h-5 w-5 text-brand-500 mx-auto mb-1" />
                <p className="text-2xl font-bold text-gray-900">{value}</p>
                <p className="text-[10px] text-gray-500 uppercase tracking-wide">{label}</p>
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </MagicCard>
  );
}
