"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  BookOpen,
  Brain,
  Database,
  Feather,
  Home,
  LayoutDashboard,
  Library,
  Lightbulb,
  PenLine,
  Settings,
  Sparkles
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { works as fallbackWorks } from "@shenbi/shared";
import { Progress } from "@/components/ui";
import { cn } from "@/lib/cn";
import { getWorks } from "@/lib/api";
import { buildWeeklyWritingProgress } from "@/lib/writing-progress";

const navItems: Array<{ title: string; href: string; icon: LucideIcon }> = [
  { title: "首页", href: "/", icon: Home },
  { title: "灵感写作", href: "/inspiration", icon: Lightbulb },
  { title: "自动写作", href: "/auto", icon: Feather },
  { title: "风向标", href: "/trends", icon: Sparkles },
  { title: "作品专栏", href: "/works", icon: Library },
  { title: "正文编辑器", href: "/editor", icon: PenLine },
  { title: "数据看板", href: "/dashboard", icon: BarChart3 },
  { title: "复盘分析", href: "/review", icon: LayoutDashboard },
  { title: "写作记忆库", href: "/memory", icon: Brain },
  { title: "数据源管理", href: "/sources", icon: Database },
  { title: "设置中心", href: "/settings", icon: Settings }
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [works, setWorks] = useState(fallbackWorks);
  const weeklyProgress = useMemo(() => buildWeeklyWritingProgress(works), [works]);

  useEffect(() => {
    getWorks()
      .then((result) => setWorks(result))
      .catch(() => undefined);
  }, []);

  return (
    <div className="app-shell grid min-h-screen grid-cols-[264px_1fr] overflow-x-hidden bg-paper">
      <aside className="app-sidebar flex h-screen min-w-0 flex-col overflow-hidden border-r border-line bg-white px-4 py-5">
        <Link href="/" className="mb-7 flex items-center gap-3">
          <Image src="/assets/logo.png" alt="神笔马良" width={42} height={42} className="rounded-md" priority />
          <div>
            <p className="text-sm font-semibold leading-tight">神笔马良短篇小说</p>
            <p className="text-xs text-muted">Agent</p>
          </div>
        </Link>

        <nav className="app-nav grid min-w-0 gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = isActivePath(pathname, item.href);

            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "flex h-10 items-center gap-3 rounded-md px-3 text-sm transition hover:bg-paper hover:text-ink",
                  active ? "bg-ink text-white hover:bg-ink hover:text-white" : "text-muted"
                )}
              >
                <Icon size={17} strokeWidth={1.8} />
                {item.title}
              </Link>
            );
          })}
        </nav>

        <div className="mt-auto rounded-lg border border-line bg-paper p-4">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-medium">本周创作进度</span>
            <span className="text-sm text-muted">{weeklyProgress.progress}%</span>
          </div>
          <Progress value={weeklyProgress.progress} />
          <p className="mt-3 text-xs leading-5 text-muted">{weeklyProgress.label}</p>
          <Link
            href={weeklyProgress.href}
            className="mt-4 inline-flex h-9 w-full items-center justify-center rounded-md bg-ink text-sm font-medium text-white"
          >
            {weeklyProgress.action}
          </Link>
        </div>
      </aside>

      <main className="min-w-0 overflow-x-hidden">
        <header className="flex h-16 items-center justify-between border-b border-line bg-paper/90 px-4 sm:px-8">
          <div className="flex items-center gap-2 text-sm text-muted">
            <BookOpen size={16} />
            本地运行版
          </div>
          <div className="flex items-center gap-3">
            <Link
              href="/settings"
              aria-label="打开设置中心"
              title="设置中心"
              className="grid h-9 w-9 place-items-center rounded-md border border-line bg-white text-muted transition hover:border-ink hover:text-ink"
            >
              <Settings size={16} />
            </Link>
            <div className="grid h-9 w-9 place-items-center rounded-full bg-ink text-sm font-semibold text-white">马</div>
          </div>
        </header>
        <div className="px-4 py-5 sm:px-8 sm:py-7">{children}</div>
      </main>
    </div>
  );
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/";
  }

  if (href === "/sources") {
    return pathname.startsWith("/sources") || pathname.startsWith("/datasources");
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
