"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { EditForm } from "./edit-form";
import { TrackingSnippet } from "./tracking-snippet";
import { StatsOverview } from "./stats-overview";

type Site = {
  id: number;
  name: string;
  domain: string;
  tracking_id: string;
  gsc_property: string | null;
  timezone: string;
  is_active: boolean;
  created_at: string;
  updated_at: string;
  client_id: number;
  client_name: string | null;
  client_email: string | null;
  ghl_location_id: string | null;
  ghl_agent_enabled: boolean | null;
  ghl_dry_run: boolean | null;
};

type Props = { siteId: number };

export function WebsiteDetail({ siteId }: Props) {
  const [site, setSite] = useState<Site | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"overview" | "settings" | "tracking">("overview");

  useEffect(() => {
    fetch(`/api/sites/${siteId}`)
      .then((r) => {
        if (!r.ok) throw new Error("Site not found");
        return r.json();
      })
      .then((d) => setSite(d.site))
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [siteId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24 text-dark/60 dark:text-white/60">
        <svg className="h-6 w-6 animate-spin" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
      </div>
    );
  }

  if (error || !site) {
    return (
      <div className="flex flex-col items-center gap-4 py-24">
        <p className="text-red">Error: {error ?? "Site not found"}</p>
        <Link href="/websites" className="text-sm text-primary hover:underline">
          ← Back to Websites
        </Link>
      </div>
    );
  }

  return (
    <>
      {/* Page header */}
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="text-[26px] font-bold leading-[30px] text-dark dark:text-white">
              {site.name}
            </h2>
            <span
              className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                site.is_active
                  ? "bg-green/10 text-green dark:bg-green/20"
                  : "bg-dark-8/30 text-dark-5 dark:text-dark-7"
              }`}
            >
              <span className={`h-1.5 w-1.5 rounded-full ${site.is_active ? "bg-green" : "bg-dark-5"}`} />
              {site.is_active ? "Active" : "Inactive"}
            </span>
          </div>
          <nav className="mt-1">
            <ol className="flex items-center gap-2 text-sm">
              <li>
                <Link className="font-medium text-dark/60 hover:text-primary dark:text-white/60" href="/">
                  Dashboard /
                </Link>
              </li>
              <li>
                <Link className="font-medium text-dark/60 hover:text-primary dark:text-white/60" href="/websites">
                  Websites /
                </Link>
              </li>
              <li className="font-medium text-primary">{site.name}</li>
            </ol>
          </nav>
        </div>

        <Link
          href="/websites"
          className="inline-flex items-center gap-2 rounded-md border border-stroke bg-white px-4 py-2.5 text-sm font-medium text-dark transition-colors hover:bg-gray-2 dark:border-dark-3 dark:bg-dark-2 dark:text-white dark:hover:bg-dark-3"
        >
          <ArrowLeftIcon className="h-4 w-4" />
          Back to Websites
        </Link>
      </div>

      {/* Info cards row */}
      <div className="mb-6 grid grid-cols-2 gap-4 sm:grid-cols-4">
        <InfoCard label="Domain" value={site.domain} mono />
        <InfoCard label="Tracking ID" value={site.tracking_id} mono />
        <InfoCard label="Timezone" value={site.timezone} />
        <InfoCard
          label="Added"
          value={new Date(site.created_at).toLocaleDateString("en-US", {
            year: "numeric",
            month: "short",
            day: "numeric",
          })}
        />
      </div>

      {/* Tab navigation */}
      <div className="mb-6 flex gap-1 rounded-xl bg-gray-2 p-1 dark:bg-dark-2 w-fit">
        {(["overview", "settings", "tracking"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`rounded-lg px-4 py-2 text-sm font-medium capitalize transition-colors ${
              activeTab === tab
                ? "bg-white text-dark shadow-1 dark:bg-gray-dark dark:text-white"
                : "text-dark-5 hover:text-dark dark:text-dark-6 dark:hover:text-white"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {activeTab === "overview" && (
        <StatsOverview siteId={site.id} domain={site.domain} />
      )}

      {activeTab === "settings" && (
        <EditForm site={site} onSaved={(updated) => setSite({ ...site, ...updated })} />
      )}

      {activeTab === "tracking" && (
        <TrackingSnippet trackingId={site.tracking_id} domain={site.domain} />
      )}
    </>
  );
}

function InfoCard({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="rounded-xl bg-white px-4 py-3 shadow-1 dark:bg-gray-dark dark:shadow-card">
      <p className="mb-1 text-xs font-medium uppercase tracking-wide text-dark-5 dark:text-dark-6">
        {label}
      </p>
      <p
        className={`truncate text-sm font-semibold text-dark dark:text-white ${
          mono ? "font-mono" : ""
        }`}
      >
        {value}
      </p>
    </div>
  );
}

function ArrowLeftIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M19 12H5M12 19l-7-7 7-7" />
    </svg>
  );
}
