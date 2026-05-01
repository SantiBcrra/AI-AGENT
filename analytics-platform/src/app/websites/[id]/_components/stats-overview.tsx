"use client";

import { useEffect, useState } from "react";

type StatRow = {
  label: string;
  value: string;
  sublabel?: string;
  icon: React.ReactNode;
  trend?: "up" | "down" | "neutral";
};

type Props = { siteId: number; domain: string };

export function StatsOverview({ siteId, domain }: Props) {
  const [stats, setStats] = useState<{
    visits7d: number;
    sessions7d: number;
    bounceRate: number;
    avgDuration: number;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Fetch stats for this specific site from the analytics API
    fetch(`/api/dashboard?siteId=${siteId}&period=7`)
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => {
        if (d) {
          setStats({
            visits7d: d.totalVisits ?? 0,
            sessions7d: d.totalSessions ?? 0,
            bounceRate: d.avgBounceRate ?? 0,
            avgDuration: d.avgDuration ?? 0,
          });
        }
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [siteId]);

  const rows: StatRow[] = loading
    ? []
    : [
        {
          label: "Unique Visits",
          value: (stats?.visits7d ?? 0).toLocaleString(),
          sublabel: "Last 7 days",
          trend: "neutral",
          icon: <EyeIcon className="h-5 w-5" />,
        },
        {
          label: "Sessions",
          value: (stats?.sessions7d ?? 0).toLocaleString(),
          sublabel: "Last 7 days",
          trend: "neutral",
          icon: <UsersIcon className="h-5 w-5" />,
        },
        {
          label: "Bounce Rate",
          value: `${(stats?.bounceRate ?? 0).toFixed(1)}%`,
          sublabel: "Avg last 7 days",
          trend: (stats?.bounceRate ?? 0) > 70 ? "down" : "up",
          icon: <ArrowUTurnIcon className="h-5 w-5" />,
        },
        {
          label: "Avg. Duration",
          value: formatDuration(stats?.avgDuration ?? 0),
          sublabel: "Per session",
          trend: (stats?.avgDuration ?? 0) > 60 ? "up" : "down",
          icon: <ClockIcon className="h-5 w-5" />,
        },
      ];

  return (
    <div className="flex flex-col gap-6">
      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
        {loading
          ? Array.from({ length: 4 }).map((_, i) => (
              <div
                key={i}
                className="rounded-xl bg-white px-5 py-4 shadow-1 dark:bg-gray-dark dark:shadow-card animate-pulse"
              >
                <div className="mb-3 h-8 w-8 rounded-full bg-gray-3 dark:bg-dark-2" />
                <div className="mb-1.5 h-6 w-20 rounded bg-gray-3 dark:bg-dark-2" />
                <div className="h-3 w-16 rounded bg-gray-3 dark:bg-dark-2" />
              </div>
            ))
          : rows.map((row) => (
              <div
                key={row.label}
                className="rounded-xl bg-white px-5 py-4 shadow-1 dark:bg-gray-dark dark:shadow-card"
              >
                <div
                  className={`mb-3 flex h-10 w-10 items-center justify-center rounded-full ${
                    row.trend === "up"
                      ? "bg-green/10 text-green"
                      : row.trend === "down"
                      ? "bg-red/10 text-red"
                      : "bg-primary/10 text-primary"
                  }`}
                >
                  {row.icon}
                </div>
                <p className="text-2xl font-bold tabular-nums text-dark dark:text-white">
                  {row.value}
                </p>
                <p className="mt-1 text-xs text-dark-5 dark:text-dark-6">{row.label}</p>
                {row.sublabel && (
                  <p className="text-xs text-dark-5/70 dark:text-dark-6/70">
                    {row.sublabel}
                  </p>
                )}
              </div>
            ))}
      </div>

      {/* Quick links */}
      <div className="rounded-[10px] bg-white px-7.5 pb-7 pt-7.5 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <h3 className="mb-4 text-base font-semibold text-dark dark:text-white">
          Quick Links
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <QuickLink
            href={`/dashboard/${siteId}`}
            icon={<ChartIcon className="h-4 w-4" />}
            title="Full Analytics"
            desc="Sessions, events, geography"
          />
          <QuickLink
            href={`/dashboard/${siteId}/rich-results`}
            icon={<StarIcon className="h-4 w-4" />}
            title="Rich Results"
            desc="Schema & SERP features"
          />
          <QuickLink
            href={`/dashboard/${siteId}/keywords`}
            icon={<SearchIcon className="h-4 w-4" />}
            title="Keywords"
            desc="GSC search performance"
          />
        </div>
      </div>
    </div>
  );
}

function QuickLink({
  href,
  icon,
  title,
  desc,
}: {
  href: string;
  icon: React.ReactNode;
  title: string;
  desc: string;
}) {
  return (
    <a
      href={href}
      className="flex items-center gap-3 rounded-lg border border-stroke p-4 transition-colors hover:border-primary hover:bg-primary/5 dark:border-dark-3 dark:hover:border-primary dark:hover:bg-primary/10"
    >
      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </div>
      <div>
        <p className="text-sm font-medium text-dark dark:text-white">{title}</p>
        <p className="text-xs text-dark-5 dark:text-dark-6">{desc}</p>
      </div>
    </a>
  );
}

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const m = Math.floor(seconds / 60);
  const s = Math.round(seconds % 60);
  return `${m}m ${s}s`;
}

// Icons
function EyeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}
function UsersIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
      <circle cx="9" cy="7" r="4" />
      <path d="M23 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />
    </svg>
  );
}
function ArrowUTurnIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M9 14L4 9l5-5" />
      <path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11" />
    </svg>
  );
}
function ClockIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="12" cy="12" r="10" />
      <polyline points="12 6 12 12 16 14" />
    </svg>
  );
}
function ChartIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}
function StarIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  );
}
function SearchIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <circle cx="11" cy="11" r="8" />
      <path d="m21 21-4.35-4.35" />
    </svg>
  );
}
