import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger";
  size?: "sm" | "md" | "lg";
};

export function Button({
  className,
  variant = "primary",
  size = "md",
  ...props
}: ButtonProps) {
  return (
    <button
      className={cn(
        "tv-focus focus-ring inline-flex items-center justify-center gap-2 rounded-xl font-medium transition-all disabled:opacity-50 disabled:pointer-events-none",
        {
          "bg-primary text-white hover:bg-primary-hover": variant === "primary",
          "border border-border bg-surface hover:bg-surface-hover": variant === "secondary",
          "hover:bg-surface-hover text-muted hover:text-foreground": variant === "ghost",
          "bg-danger/15 text-danger hover:bg-danger/25": variant === "danger",
          "px-3 py-1.5 text-sm": size === "sm",
          "px-4 py-2.5 text-sm": size === "md",
          "px-6 py-3 text-base": size === "lg",
        },
        className
      )}
      {...props}
    />
  );
}
