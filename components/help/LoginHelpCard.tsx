"use client";

import { LOGIN_GUIDE, dataSourceLabel } from "@/lib/page-guide";
import { CircleHelp, Lightbulb } from "lucide-react";

export function LoginHelpCard() {
  const guide = LOGIN_GUIDE;

  return (
    <div className="mt-6 rounded-xl border border-brand-200/80 bg-brand-50/40 p-4 text-left max-w-md mx-auto">
      <div className="flex gap-2 items-start">
        <CircleHelp className="h-5 w-5 text-brand-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-semibold text-gray-800">{guide.title}</p>
          <p className="text-xs text-brand-700 mt-0.5">{dataSourceLabel(guide.dataSource)}</p>
          <p className="text-sm text-gray-600 mt-2">{guide.description}</p>
          <ul className="mt-2 space-y-1 text-xs text-gray-600 list-disc pl-4">
            {guide.tips.map((tip) => (
              <li key={tip}>{tip}</li>
            ))}
          </ul>
          <p className="text-xs font-semibold uppercase text-gray-400 mt-3 flex items-center gap-1">
            <Lightbulb className="h-3 w-3" /> After sign-in
          </p>
          <div className="flex flex-wrap gap-2 mt-1.5">
            {guide.related.map((link) => (
              <span key={link.href} className="text-xs text-brand-600">
                → {link.label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
