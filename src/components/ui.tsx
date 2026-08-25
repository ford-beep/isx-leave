import type { ReactNode } from "react";
import type { LeaveStatus } from "@/lib/types";
import { IconInbox } from "./icons";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`card ${className}`}>{children}</div>;
}

export function CardHead({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="card-head">
      <div style={{ flex: 1, minWidth: 0 }}>
        <h2>{title}</h2>
        {sub && <p className="muted-sm" style={{ marginTop: 2 }}>{sub}</p>}
      </div>
      {action}
    </div>
  );
}

const STATUS_LABEL: Record<LeaveStatus, string> = {
  pending: "Pending", approved: "Approved", rejected: "Rejected", cancelled: "Cancelled",
};

export function StatusBadge({ status }: { status: LeaveStatus }) {
  return <span className={`badge badge-${status}`}>{STATUS_LABEL[status]}</span>;
}

export function EmptyState({ title, body, action, icon }: {
  title: string; body?: string; action?: ReactNode; icon?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-ico">{icon ?? <IconInbox size={20} />}</div>
      <h3>{title}</h3>
      {body && <p>{body}</p>}
      {action}
    </div>
  );
}

export function Alert({ kind = "info", children }: {
  kind?: "info" | "error" | "warn" | "ok"; children: ReactNode;
}) {
  return <div className={`alert alert-${kind}`} role={kind === "error" ? "alert" : undefined}>{children}</div>;
}

export function Field({ label, hint, error, htmlFor, children, className = "" }: {
  label: string; hint?: string; error?: string; htmlFor?: string; children: ReactNode; className?: string;
}) {
  return (
    <div className={`field ${className}`}>
      <label htmlFor={htmlFor}>{label}</label>
      {children}
      {error ? <span className="err">{error}</span> : hint ? <span className="hint">{hint}</span> : null}
    </div>
  );
}

export function Avatar({ name, className = "" }: { name: string; className?: string }) {
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("");
  return <div className={`avatar ${className}`} aria-hidden>{initials || "?"}</div>;
}

export function Person({ name, email }: { name: string; email?: string }) {
  return (
    <div className="person">
      <Avatar name={name} />
      <div style={{ minWidth: 0 }}>
        <div className="person-name">{name}</div>
        {email && <div className="person-mail">{email}</div>}
      </div>
    </div>
  );
}

export function Kpi({ label, value, unit, sub, meter, tone }: {
  label: string; value: ReactNode; unit?: string; sub?: ReactNode;
  meter?: { used: number; total: number }; tone?: "accent" | "warn";
}) {
  const pct = meter && meter.total > 0 ? Math.min(100, Math.round((meter.used / meter.total) * 100)) : 0;
  return (
    <div className={`kpi ${tone ?? ""}`}>
      <div className="kpi-label">{label}</div>
      <div className={`kpi-value ${typeof value === "string" && value.length > 6 ? "sm" : ""}`}>
        {value}{unit && <span className="unit">{unit}</span>}
      </div>
      {meter ? (
        <div className={`meter ${pct >= 80 ? "low" : ""}`} title={`${meter.used} of ${meter.total} days used`}>
          <span style={{ width: `${pct}%` }} />
        </div>
      ) : null}
      {sub && <div className="kpi-sub">{sub}</div>}
    </div>
  );
}
