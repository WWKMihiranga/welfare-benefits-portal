import { cn } from "@/lib/utils/cn";
import type { InputHTMLAttributes } from "react";

export type InputProps = InputHTMLAttributes<HTMLInputElement>;

export function Input({ className, ...props }: InputProps) {
  return (
    <input
      className={cn(
        "h-10 w-full rounded-md border border-[var(--color-border-strong)] bg-white px-3 text-sm placeholder:text-[var(--color-text-subtle)] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-[-1px] focus-visible:outline-[var(--color-accent)] disabled:bg-[var(--color-surface-2)] disabled:opacity-60",
        className
      )}
      {...props}
    />
  );
}
