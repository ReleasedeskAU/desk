"use client";

import { Suspense } from "react";
import { TablePageSuspenseFallback } from "@/components/ui/TableSkeleton";
import { DepartmentsBrowse } from "@/components/master-data/browse/DepartmentsBrowse";

export default function DepartmentsPage() {
  return (
    <Suspense fallback={<TablePageSuspenseFallback />}>
      <div className="w-full font-sans pb-24">
        <DepartmentsBrowse />
      </div>
    </Suspense>
  );
}
