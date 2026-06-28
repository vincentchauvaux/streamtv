import { cn } from "@/lib/utils";

export function Badge({
  children,
  variant = "default",
  className,
}: {
  children: React.ReactNode;
  variant?: "default" | "live" | "primary" | "danger";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        {
          "bg-surface-hover text-muted": variant === "default",
          "bg-accent/20 text-accent": variant === "live",
          "bg-primary/20 text-primary": variant === "primary",
          "bg-danger/20 text-danger": variant === "danger",
        },
        className
      )}
    >
      {children}
    </span>
  );
}
