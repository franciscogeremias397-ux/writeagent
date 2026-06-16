import type { ButtonHTMLAttributes, HTMLAttributes, ReactNode } from "react";
import { ShieldCheck } from "lucide-react";
import { cn } from "@/lib/cn";

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <section className={cn("min-w-0 rounded-lg border border-line bg-white shadow-soft", className)} {...props} />;
}

export function CardHeader({
  title,
  eyebrow,
  action,
  className
}: {
  title: string;
  eyebrow?: string;
  action?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-3 border-b border-line px-5 py-4 sm:flex-row sm:items-start sm:justify-between", className)}>
      <div className="min-w-0">
        {eyebrow ? <p className="mb-1 break-words text-xs font-medium text-muted">{eyebrow}</p> : null}
        <h2 className="break-words text-base font-semibold text-ink">{title}</h2>
      </div>
      {action ? <div className="flex max-w-full shrink-0 flex-wrap gap-2">{action}</div> : null}
    </div>
  );
}

export function Button({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-md bg-ink px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80 disabled:cursor-not-allowed disabled:opacity-50",
        !hasJustifyClass(className) && "justify-center",
        className
      )}
      {...props}
    />
  );
}

export function GhostButton({ className, ...props }: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={cn(
        "inline-flex min-h-10 items-center gap-2 rounded-md border border-line bg-white px-4 py-2 text-sm font-medium text-ink transition hover:border-ink",
        !hasJustifyClass(className) && "justify-center",
        className
      )}
      {...props}
    />
  );
}

export function Badge({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span className={cn("inline-flex items-center rounded-md border border-line bg-paper px-2 py-1 text-xs text-muted", className)}>
      {children}
    </span>
  );
}

export function Progress({ value }: { value: number }) {
  return (
    <div className="h-2 rounded-full bg-paper">
      <div className="h-2 rounded-full bg-ink" style={{ width: `${Math.min(100, Math.max(0, value))}%` }} />
    </div>
  );
}

export function FieldLabel({ children }: { children: ReactNode }) {
  return <label className="text-sm font-medium text-ink">{children}</label>;
}

export function TextInput({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return <input className={cn("h-11 w-full min-w-0 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-ink", className)} {...props} />;
}

export function SelectInput({ className, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return <select className={cn("h-11 w-full min-w-0 rounded-md border border-line bg-white px-3 text-sm outline-none focus:border-ink", className)} {...props} />;
}

export function ComplianceNotice({ className }: { className?: string }) {
  return (
    <div className={cn("flex gap-3 rounded-md border border-line bg-paper p-3 text-xs leading-5 text-muted", className)}>
      <ShieldCheck size={16} className="mt-0.5 shrink-0 text-ink" />
      <p>AI 生成内容仅供创作参考，请结合人工编辑、原创设定与平台规范后再发布；系统不会提供绕过登录、验证码、审核或检测的建议。</p>
    </div>
  );
}

function hasJustifyClass(className?: string) {
  return Boolean(className?.split(/\s+/).some((name) => name.startsWith("justify-")));
}
