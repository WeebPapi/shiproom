"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function NavLink({ href, exact = false, children }: { href: string; exact?: boolean; children: React.ReactNode }) {
  const pathname = usePathname();
  const active = exact ? pathname === href : pathname === href || pathname.startsWith(`${href}/`);
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      className="flex items-center justify-between rounded-md px-2 py-1.5 text-muted hover:bg-border/50 hover:text-foreground aria-[current=page]:bg-border/60 aria-[current=page]:text-foreground"
    >
      {children}
    </Link>
  );
}
