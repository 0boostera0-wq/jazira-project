import { AlertCircle, CheckCircle2, Info, TriangleAlert } from "lucide-react";
import { cn } from "./cn";

const TONES = {
  info: { cls: "bg-info-soft text-info border-info/20", Icon: Info },
  success: { cls: "bg-green-50 text-green-700 border-green-100", Icon: CheckCircle2 },
  warning: { cls: "bg-warning-soft text-warning border-warning/25", Icon: TriangleAlert },
  danger: { cls: "bg-danger-soft text-danger border-danger/20", Icon: AlertCircle },
};

/** Inline message. role="alert" for errors so screen readers announce them. */
export default function Alert({ tone = "info", title, children, action, className }) {
  const { cls, Icon } = TONES[tone];
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("flex gap-3 rounded-md border p-3.5 text-sm", cls, className)}>
      <Icon size={18} className="mt-0.5 shrink-0" aria-hidden="true" />
      <div className="min-w-0 flex-1">
        {title && <p className="font-medium">{title}</p>}
        {children && <div className={cn(title && "mt-0.5", "opacity-90")}>{children}</div>}
      </div>
      {action && <div className="shrink-0">{action}</div>}
    </div>
  );
}
