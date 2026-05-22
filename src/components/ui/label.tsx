import { cn } from "@/lib/utils/cn";
import type { LabelHTMLAttributes } from "react";

export function Label({
  className,
  ...props
}: LabelHTMLAttributes<HTMLLabelElement>) {
  return (
    <label
      className={cn(
        "block text-sm font-medium text-[var(--color-text)] mb-1.5",
        className
      )}
      {...props}
    />
  );
}
