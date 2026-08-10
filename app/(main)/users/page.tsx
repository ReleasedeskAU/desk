"use client";

import { Suspense } from "react";
import { TablePageSuspenseFallback } from "@/components/ui/TableSkeleton";
import { UsersBrowse } from "@/components/master-data/browse/UsersBrowse";

export default function UsersPage() {
  return (
    <Suspense fallback={<TablePageSuspenseFallback />}>
      <div className="w-full font-sans pb-24">
        <UsersBrowse />
      </div>
    </Suspense>
  );
}
