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
      className="flex h-7 items-center gap-2 rounded-md px-2 text-muted transition-colors hover:bg-foreground/5 hover:text-foreground aria-[current=page]:bg-foreground/[0.07] aria-[current=page]:text-foreground [&>svg]:shrink-0"
    >
      {children}
    </Link>
  );
}
