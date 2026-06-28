import { cn } from "@/lib/utils";

type Props = {
  title: string;
  description?: string;
  icon?: React.ReactNode;
  action?: React.ReactNode;
  className?: string;
};

export function PageHeader({ title, description, icon, action, className }: Props) {
  return (
    <header className={cn("animate-fade-in flex items-start justify-between gap-4", className)}>
      <div>
        <div className="flex items-center gap-2">
          {icon}
          <h1 className="text-2xl font-bold tracking-tight lg:text-3xl">{title}</h1>
        </div>
        {description && <p className="mt-1 text-muted">{description}</p>}
      </div>
      {action}
    </header>
  );
}
