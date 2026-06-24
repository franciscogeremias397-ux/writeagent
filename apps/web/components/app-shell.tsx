"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { BookOpen, Settings } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

const navItems = [
  { title: "写作", href: "/" },
  { title: "作品", href: "/works" },
  { title: "设置", href: "/settings" }
];

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return (
    <div className="min-h-screen bg-paper">
      <header className="sticky top-0 z-30 border-b border-line bg-paper/95 backdrop-blur">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6">
          <Link href="/" className="flex min-w-0 items-center gap-3">
            <Image src="/assets/logo.png" alt="神笔马良" width={34} height={34} className="h-8 w-8 rounded-md object-cover" priority />
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-ink">神笔马良</p>
              <p className="truncate text-xs text-muted">短篇小说 Agent</p>
            </div>
          </Link>

          <nav className="flex items-center gap-1 rounded-lg border border-line bg-white p-1" aria-label="主导航">
            {navItems.map((item) => {
              const active = isActivePath(pathname, item.href);

              return (
                <Link
                  key={item.href}
                  href={item.href}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "inline-flex h-9 items-center justify-center rounded-md px-3 text-sm font-medium transition",
                    active ? "bg-ink text-white" : "text-muted hover:bg-paper hover:text-ink"
                  )}
                >
                  {item.title}
                </Link>
              );
            })}
          </nav>

          <div className="hidden items-center gap-2 text-xs text-muted sm:flex">
            <BookOpen size={15} />
            <span>本地运行</span>
            <Link
              href="/settings"
              aria-label="打开设置"
              title="设置"
              className="ml-2 grid h-9 w-9 place-items-center rounded-md border border-line bg-white text-muted transition hover:border-ink hover:text-ink"
            >
              <Settings size={16} />
            </Link>
          </div>
        </div>
      </header>

      <div className="px-4 sm:px-6">{children}</div>
    </div>
  );
}

function isActivePath(pathname: string, href: string) {
  if (href === "/") {
    return pathname === "/" || pathname === "/auto" || pathname === "/inspiration";
  }

  return pathname === href || pathname.startsWith(`${href}/`);
}
