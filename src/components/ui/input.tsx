import { cn } from "@/lib/utils";

type InputProps = React.InputHTMLAttributes<HTMLInputElement> & {
  icon?: React.ReactNode;
};

export function Input({ className, icon, ...props }: InputProps) {
  if (icon) {
    return (
      <div className="relative">
        <span className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-muted">
          {icon}
        </span>
        <input
          className={cn(
            "focus-ring tv-focus w-full rounded-2xl border border-border bg-surface py-3 pl-11 pr-4 text-foreground placeholder:text-muted/70 transition-colors focus:border-primary/50",
            className
          )}
          {...props}
        />
      </div>
    );
  }

  return (
    <input
      className={cn(
        "focus-ring tv-focus w-full rounded-xl border border-border bg-background px-4 py-3 text-foreground placeholder:text-muted/70 transition-colors focus:border-primary/50",
        className
      )}
      {...props}
    />
  );
}
