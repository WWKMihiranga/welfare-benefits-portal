import { Children, cloneElement, isValidElement, type ReactElement, type ButtonHTMLAttributes } from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils/cn";

const buttonStyles = cva(
  "inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium transition-colors disabled:opacity-50 disabled:pointer-events-none focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2",
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--color-accent)] text-white hover:bg-[var(--color-accent-hover)] focus-visible:outline-[var(--color-accent)]",
        secondary:
          "bg-white text-[var(--color-text)] border border-[var(--color-border-strong)] hover:bg-[var(--color-surface-2)]",
        ghost:
          "text-[var(--color-text-muted)] hover:bg-[var(--color-surface-2)]",
        danger: "bg-[var(--color-danger)] text-white hover:bg-red-800",
      },
      size: {
        sm: "h-8 px-3",
        md: "h-10 px-4",
        lg: "h-11 px-6",
      },
    },
    defaultVariants: { variant: "primary", size: "md" },
  }
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonStyles> {
  /** Render as the single child element instead of a <button>. Useful for
   * giving button styling to a <Link>. The child must be a valid element. */
  asChild?: boolean;
}

export function Button({
  className,
  variant,
  size,
  asChild,
  children,
  ...props
}: ButtonProps) {
  const styles = cn(buttonStyles({ variant, size }), className);

  if (asChild) {
    const child = Children.only(children) as ReactElement<{
      className?: string;
    }>;
    if (!isValidElement(child)) return null;
    return cloneElement(child, {
      className: cn(styles, child.props.className),
    });
  }

  return (
    <button className={styles} {...props}>
      {children}
    </button>
  );
}
