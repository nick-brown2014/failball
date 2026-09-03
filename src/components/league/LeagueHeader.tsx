"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { signOut, useSession } from "next-auth/react";
import { useEffect, useRef, useState } from "react";
import { useLeagueNav } from "./LeagueContext";

interface NavLink {
  label: string;
  href: string;
}

type NavItem =
  | { label: string; href: string; links?: undefined }
  | { label: string; href?: undefined; links: NavLink[] };

export default function LeagueHeader() {
  const pathname = usePathname();
  const { data: session } = useSession();
  const {
    leagueId,
    leagueName,
    activeSeason,
    role,
    myTeamId,
    myTeamName,
  } = useLeagueNav();
  const [openGroup, setOpenGroup] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const groupRef = useRef<HTMLDivElement>(null);
  const accountRef = useRef<HTMLDivElement>(null);

  const base = `/leagues/${leagueId}`;
  const myTeamHref = myTeamId ? `${base}/teams/${myTeamId}` : null;
  const items: NavItem[] = [
    ...(myTeamHref ? [{ label: "My Team", href: myTeamHref }] : []),
    {
      label: "Players",
      links: [
        { label: "Available Players", href: `${base}/free-agents` },
        { label: "Waivers", href: `${base}/waivers` },
        { label: "Trades", href: `${base}/trades` },
      ],
    },
    { label: "Scores", href: `${base}/matchups` },
    { label: "Standings", href: `${base}/standings` },
    {
      label: "League",
      links: [
        { label: "League Home", href: `${base}/overview` },
        { label: "League History", href: `${base}/history` },
        { label: "Activity", href: `${base}/activity` },
        { label: "Draft Room", href: `${base}/draft` },
        { label: "Draft Rankings", href: `${base}/draft/rankings` },
        { label: "Settings", href: `${base}/settings` },
        ...(role === "COMMISSIONER"
          ? [{ label: "Commissioner", href: `${base}/commissioner` }]
          : []),
      ],
    },
  ];

  const activeItem = items
    .flatMap((item) =>
      item.links
        ? item.links.map((link) => ({ href: link.href, item: item.label }))
        : [{ href: item.href, item: item.label }],
    )
    .filter(({ href }) => pathname === href || pathname.startsWith(`${href}/`))
    .sort((a, b) => b.href.length - a.href.length)[0]?.item;

  useEffect(() => {
    const closeMenus = (event: MouseEvent) => {
      if (!groupRef.current?.contains(event.target as Node)) setOpenGroup(null);
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpenGroup(null);
        setAccountOpen(false);
        setMobileOpen(false);
      }
    };
    document.addEventListener("mousedown", closeMenus);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeMenus);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, []);

  return (
    <header className="sticky top-0 z-40 w-full shadow-sm">
      <div className="bg-slate-900 text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4 px-4 py-3">
          <div className="flex min-w-0 items-center gap-4">
            <Link href="/dashboard" className="shrink-0 text-lg font-bold tracking-tight">
              Fantasy Failball
            </Link>
            <span className="hidden h-5 w-px bg-slate-600 sm:block" />
            <div className="min-w-0">
              <span className="block truncate text-sm font-semibold sm:text-base">{leagueName}</span>
              {activeSeason && (
                <span className="mt-0.5 inline-flex items-center gap-2 rounded-full bg-slate-700 px-2 py-0.5 text-xs text-slate-200">
                  Season {activeSeason.season}
                  {activeSeason.isUpcoming && (
                    <span className="rounded bg-orange-600 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-white">
                      Upcoming
                    </span>
                  )}
                </span>
              )}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-3 text-sm">
            <Link href="/rules" className="hover:text-orange-300">Rules</Link>
            <Link href="/contact" className="hover:text-orange-300">Contact</Link>
            <div className="relative" ref={accountRef}>
              <button
                type="button"
                aria-expanded={accountOpen}
                aria-haspopup="menu"
                onClick={() => setAccountOpen((open) => !open)}
                className="max-w-40 truncate rounded px-2 py-1 font-medium hover:bg-slate-800"
              >
                {session?.user?.name || session?.user?.email || "Account"} ▾
              </button>
              {accountOpen && (
                <div className="absolute right-0 top-full mt-2 w-44 rounded-md border border-slate-700 bg-slate-800 p-1 shadow-lg" role="menu">
                  <Link href="/dashboard" role="menuitem" className="block rounded px-3 py-2 hover:bg-slate-700">Dashboard</Link>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => signOut({ callbackUrl: "/" })}
                    className="block w-full rounded px-3 py-2 text-left hover:bg-slate-700"
                  >
                    Sign out
                  </button>
                </div>
              )}
            </div>
            <button
              type="button"
              aria-expanded={mobileOpen}
              aria-controls="league-mobile-nav"
              onClick={() => setMobileOpen((open) => !open)}
              className="rounded p-1 hover:bg-slate-800 md:hidden"
              aria-label="Toggle league navigation"
            >
              <span className="text-xl">☰</span>
            </button>
          </div>
        </div>
      </div>
      <div className="border-b border-gray-200 bg-white dark:border-gray-700 dark:bg-gray-800">
        <div className="mx-auto hidden max-w-7xl items-center gap-1 px-4 md:flex" ref={groupRef}>
          {items.map((item) => {
            const active = activeItem === item.label;
            const tabClass = `border-b-2 px-4 py-3 text-sm font-semibold transition-colors ${
              active
                ? "border-orange-600 text-orange-600"
                : "border-transparent text-gray-700 hover:border-orange-300 hover:text-orange-600 dark:text-gray-200"
            }`;
            if (!item.links) {
              return (
                <Link key={item.label} href={item.href} className={tabClass}>
                  {item.label}
                </Link>
              );
            }
            const open = openGroup === item.label;
            return (
              <div key={item.label} className="relative">
                <button
                  type="button"
                  aria-expanded={open}
                  aria-haspopup="menu"
                  onClick={() => setOpenGroup(open ? null : item.label)}
                  className={tabClass}
                >
                  {item.label} ▾
                </button>
                {open && (
                  <div className="absolute left-0 top-full z-50 min-w-48 rounded-b-md border border-gray-200 bg-white p-1 shadow-lg dark:border-gray-700 dark:bg-gray-800" role="menu">
                    {item.links.map((link) => (
                      <Link key={link.href} href={link.href} role="menuitem" onClick={() => setOpenGroup(null)} className="block rounded px-3 py-2 text-sm text-gray-700 hover:bg-orange-50 hover:text-orange-600 dark:text-gray-200 dark:hover:bg-gray-700">
                        {link.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
        {mobileOpen && (
          <nav id="league-mobile-nav" className="space-y-3 px-4 py-4 md:hidden">
            {items.map((item) => {
              const headingClass = `border-l-4 pl-2 text-sm font-bold ${activeItem === item.label ? "border-orange-600 text-orange-600" : "border-transparent text-gray-700 dark:text-gray-200"}`;
              if (!item.links) {
                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => setMobileOpen(false)}
                    className={`block ${headingClass}`}
                  >
                    {item.label}
                  </Link>
                );
              }
              return (
                <div key={item.label}>
                  <div className={`mb-1 ${headingClass}`}>{item.label}</div>
                  <div className="grid gap-1 pl-3">
                    {item.links.map((link) => (
                      <Link key={link.href} href={link.href} onClick={() => setMobileOpen(false)} className="rounded px-2 py-1.5 text-sm text-gray-600 hover:bg-orange-50 hover:text-orange-600 dark:text-gray-300 dark:hover:bg-gray-700">
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </div>
              );
            })}
          </nav>
        )}
      </div>
    </header>
  );
}
