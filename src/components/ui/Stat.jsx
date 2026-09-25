import IconTile from "./IconTile";
import { cn } from "./cn";

/** KPI tile: label · value · optional hint/trend. Values should be pre-formatted. */
export default function Stat({ icon, tone = "gold", label, value, hint, className }) {
  return (
    <div className={cn("surface-flat flex items-start gap-3.5 p-4 sm:p-5", className)}>
      {icon && <IconTile icon={icon} tone={tone} size="md" />}
      <div className="min-w-0">
        <p className="t-caption">{label}</p>
        <p className="mt-0.5 text-2xl font-bold leading-tight text-ink tabular">{value}</p>
        {hint && <p className="t-caption mt-1">{hint}</p>}
      </div>
    </div>
  );
}
