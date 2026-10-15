import React from "react";
import { cn } from "../../lib/utils";

export function Card({ children, className = "", hover = false, ...props }) {
  return (
    <div
      className={cn(
        "bg-white rounded-2xl border border-slate-200/80 p-6 card-elevation",
        hover && "card-hover cursor-pointer",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Badge({ children, className = "", variant = "mint", ...props }) {
  const variants = {
    mint: "bg-brand-mint text-brand-emerald-dark border-emerald-200/60",
    blue: "bg-brand-pale-blue text-brand-blue-dark border-blue-200/60",
    slate: "bg-slate-100 text-slate-700 border-slate-200",
  };

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border tracking-wide uppercase",
        variants[variant] || variants.mint,
        className
      )}
      {...props}
    >
      {children}
    </span>
  );
}
