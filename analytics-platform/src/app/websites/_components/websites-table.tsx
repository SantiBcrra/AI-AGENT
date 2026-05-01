"use client";

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import Link from "next/link";
import { useEffect, useState, useCallback } from "react";
import { DeleteWebsiteButton } from "./delete-website-button";

type Site = {
  id: number;
  name: string;
  domain: string;
  tracking_id: string;
  gsc_property: string | null;
  timezone: string;
  is_active: boolean;
  created_at: string;
  client_name: string | null;
  total_visits_7d: string;
  total_sessions_7d: string;
};

export function WebsitesTable() {
  const [sites, setSites] = useState<Site[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchSites = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch("/api/sites");
      if (!res.ok) throw new Error("Failed to load sites");
      const data = await res.json();
      setSites(data.sites ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchSites();
  }, [fetchSites]);

  if (loading) {
    return (
      <div className="rounded-[10px] bg-white px-7.5 py-10 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <div className="flex items-center justify-center gap-3 text-dark/60 dark:text-white/60">
          <svg className="h-5 w-5 animate-spin" viewBox="0 0 24 24" fill="none">
            <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
            <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
          </svg>
          <span>Loading websites…</span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-[10px] bg-white px-7.5 py-10 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <p className="text-center text-red">Error: {error}</p>
      </div>
    );
  }

  return (
    <div className="rounded-[10px] bg-white px-7.5 pb-4 pt-7.5 shadow-1 dark:bg-gray-dark dark:shadow-card">
      {sites.length === 0 ? (
        <div className="flex flex-col items-center gap-4 py-16 text-dark/50 dark:text-white/40">
          <GlobeIcon className="h-12 w-12 opacity-30" />
          <p className="text-base font-medium">No websites added yet</p>
          <p className="text-sm">Click &ldquo;Add Website&rdquo; to get started.</p>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow className="border-none uppercase [&>th]:text-xs [&>th]:tracking-wide">
              <TableHead className="min-w-[180px]">Website</TableHead>
              <TableHead>Domain</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Visits (7d)</TableHead>
              <TableHead>Tracking ID</TableHead>
              <TableHead>Client</TableHead>
              <TableHead className="text-right">Actions</TableHead>
            </TableRow>
          </TableHeader>

          <TableBody>
            {sites.map((site) => (
              <TableRow
                key={site.id}
                className="text-base font-medium text-dark dark:text-white"
              >
                {/* Name */}
                <TableCell>
                  <div className="flex items-center gap-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <GlobeIcon className="h-4 w-4" />
                    </div>
                    <span className="font-semibold">{site.name}</span>
                  </div>
                </TableCell>

                {/* Domain */}
                <TableCell>
                  <a
                    href={`https://${site.domain}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-primary hover:underline"
                  >
                    {site.domain}
                  </a>
                </TableCell>

                {/* Status */}
                <TableCell>
                  <span
                    className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      site.is_active
                        ? "bg-green/10 text-green dark:bg-green/20"
                        : "bg-dark-8/30 text-dark-5 dark:text-dark-7"
                    }`}
                  >
                    <span
                      className={`h-1.5 w-1.5 rounded-full ${
                        site.is_active ? "bg-green" : "bg-dark-5"
                      }`}
                    />
                    {site.is_active ? "Active" : "Inactive"}
                  </span>
                </TableCell>

                {/* Visits */}
                <TableCell>
                  <span className="tabular-nums">
                    {parseInt(site.total_visits_7d, 10).toLocaleString()}
                  </span>
                </TableCell>

                {/* Tracking ID */}
                <TableCell>
                  <code className="rounded bg-gray-2 px-2 py-0.5 text-xs text-dark-4 dark:bg-dark-2 dark:text-dark-6">
                    {site.tracking_id}
                  </code>
                </TableCell>

                {/* Client */}
                <TableCell>
                  <span className="text-dark-5 dark:text-dark-6">
                    {site.client_name ?? "—"}
                  </span>
                </TableCell>

                {/* Actions */}
                <TableCell>
                  <div className="flex items-center justify-end gap-2">
                    <Link
                      href={`/websites/${site.id}`}
                      className="inline-flex h-8 items-center gap-1.5 rounded-md border border-stroke bg-white px-3 text-sm font-medium text-dark transition-colors hover:bg-gray-2 hover:text-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white dark:hover:bg-dark-3"
                    >
                      <EditIcon className="h-3.5 w-3.5" />
                      Edit
                    </Link>

                    <DeleteWebsiteButton
                      siteId={site.id}
                      siteName={site.name}
                      onDeleted={fetchSites}
                    />
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}

// ── Inline icons ──────────────────────────────────────────

function GlobeIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.5}>
      <circle cx="12" cy="12" r="10" />
      <path d="M2 12h20M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" />
    </svg>
  );
}

function EditIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
      <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
    </svg>
  );
}
