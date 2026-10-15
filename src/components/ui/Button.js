import React from "react";
import { cn } from "../../lib/utils";

export function Button({
  children,
  className = "",
  variant = "primary",
  size = "md",
  type = "button",
  onClick,
  disabled = false,
  ...props
}) {
  const baseStyles =
    "inline-flex items-center justify-center font-medium rounded-lg transition-all focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-60 disabled:cursor-not-allowed select-none active:scale-[0.98]";

  const variants = {
    primary:
      "bg-brand-emerald text-white hover:bg-brand-emerald-dark focus:ring-brand-emerald shadow-sm hover:shadow",
    secondary:
      "bg-brand-blue text-white hover:bg-brand-blue-dark focus:ring-brand-blue shadow-sm hover:shadow",
    outline:
      "border border-slate-300 bg-white text-slate-700 hover:bg-slate-50 hover:border-slate-400 focus:ring-brand-emerald",
    ghost:
      "text-slate-700 hover:bg-slate-100 hover:text-slate-900 focus:ring-slate-400",
    mint:
      "bg-brand-mint text-brand-emerald-dark hover:bg-emerald-100 focus:ring-brand-emerald border border-emerald-200/60 font-semibold",
    paleBlue:
      "bg-brand-pale-blue text-brand-blue-dark hover:bg-blue-100 focus:ring-brand-blue border border-blue-200/60 font-semibold",
  };

  const sizes = {
    sm: "text-xs px-3 py-1.5 gap-1.5",
    md: "text-sm px-4 py-2.5 gap-2",
    lg: "text-base px-6 py-3.5 gap-2.5",
  };

  return (
    <button
      type={type}
      className={cn(baseStyles, variants[variant], sizes[size], className)}
      onClick={onClick}
      disabled={disabled}
      {...props}
    >
      {children}
    </button>
  );
}
