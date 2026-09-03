"use client";

import {
  ComposedChart,
  Area,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { AdvancedCard } from "@/components/ui/advanced-card";
import type { ForecastTrendPoint } from "@/lib/types";
import { Brain } from "lucide-react";

export function ForecastChart({ data }: { data: ForecastTrendPoint[] }) {
  const forecastStart = data.findIndex((d) => d.isForecast);

  return (
    <AdvancedCard
      title="Predictive Readiness Model"
      subtitle="ReleaseDesk Everywhere · 8 weeks actual + 4 week forecast"
      icon={Brain}
      variant="glass"
      action={
        <span className="text-[10px] bg-brand-25 text-ai px-2 py-1 rounded-full font-medium">ML Forecast</span>
      }
    >
      <ResponsiveContainer minWidth={0} minHeight={0} width="100%" height={260}>
        <ComposedChart data={data}>
          <CartesianGrid strokeDasharray="3 3" stroke="#E2E8F0" />
          <XAxis dataKey="week" tick={{ fontSize: 10 }} stroke="#94A3B8" />
          <YAxis yAxisId="left" domain={[50, 100]} tick={{ fontSize: 10 }} stroke="#94A3B8" />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} stroke="#94A3B8" />
          <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #E4E7EC" }} />
          {forecastStart >= 0 && (
            <ReferenceLine
              x={data[forecastStart]?.week}
              stroke="#8B5CF6"
              strokeDasharray="4 4"
              label={{ value: "Forecast →", position: "top", fontSize: 10, fill: "#8B5CF6" }}
            />
          )}
          <Area
            yAxisId="left"
            type="monotone"
            dataKey="actualReadiness"
            fill="#3b5bdb15"
            stroke="#3b5bdb"
            name="Actual readiness %"
            connectNulls={false}
          />
          <Line
            yAxisId="left"
            type="monotone"
            dataKey="predictedReadiness"
            stroke="#8B5CF6"
            strokeDasharray="6 4"
            name="Predicted readiness %"
            dot={{ r: 3 }}
          />
          <Line
            yAxisId="right"
            type="monotone"
            dataKey="predictedRollbacks"
            stroke="#F04438"
            name="Predicted rollbacks"
            dot={false}
          />
        </ComposedChart>
      </ResponsiveContainer>
    </AdvancedCard>
  );
}
