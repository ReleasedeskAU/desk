"use client";

import { Suspense } from "react";
import { TablePageSuspenseFallback } from "@/components/ui/TableSkeleton";
import SignoffsContent from "./SignoffsContent";

export default function SignoffsPage() {
  return (
    <Suspense fallback={<TablePageSuspenseFallback />}>
      <SignoffsContent />
    </Suspense>
  );
}
