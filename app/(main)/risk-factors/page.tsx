"use client";

import { Suspense } from "react";
import { TablePageSuspenseFallback } from "@/components/ui/TableSkeleton";
import { RiskFactorsBrowse } from "@/components/master-data/browse/RiskFactorsBrowse";

export default function RiskFactorsPage() {
  return (
    <Suspense fallback={<TablePageSuspenseFallback />}>
      <div className="w-full font-sans pb-24">
        <RiskFactorsBrowse />
      </div>
    </Suspense>
  );
}
