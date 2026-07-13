"use client";

import { Suspense } from "react";
import { TablePageSuspenseFallback } from "@/components/ui/TableSkeleton";
import BlockersContent from "./BlockersContent";

export default function BlockersPage() {
  return (
    <Suspense fallback={<TablePageSuspenseFallback />}>
      <BlockersContent />
    </Suspense>
  );
}
