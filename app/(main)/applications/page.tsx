"use client";

import { Suspense } from "react";
import { TablePageSuspenseFallback } from "@/components/ui/TableSkeleton";
import { ApplicationsBrowse } from "@/components/master-data/browse/ApplicationsBrowse";

export default function ApplicationsPage() {
  return (
    <Suspense fallback={<TablePageSuspenseFallback />}>
      <div className="w-full font-sans pb-24">
        <ApplicationsBrowse />
      </div>
    </Suspense>
  );
}
