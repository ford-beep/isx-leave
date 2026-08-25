"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

export function NavLink({ href, icon, children, count, exact }: {
  href: string; icon: ReactNode; children: ReactNode; count?: number; exact?: boolean;
}) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(href + "/");
  return (
    <Link href={href} className="nav-item" aria-current={active ? "page" : undefined}>
      <span className="ico">{icon}</span>
      <span>{children}</span>
      {count ? <span className="count">{count}</span> : null}
    </Link>
  );
}
