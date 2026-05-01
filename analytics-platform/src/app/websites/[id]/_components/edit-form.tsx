"use client";

import { useState } from "react";

type Site = {
  id: number;
  name: string;
  domain: string;
  gsc_property: string | null;
  timezone: string;
  is_active: boolean;
  ghl_location_id: string | null;
};

type Props = {
  site: Site;
  onSaved: (updated: Partial<Site>) => void;
};


const TIMEZONES = [
  "UTC",
  "America/New_York",
  "America/Chicago",
  "America/Denver",
  "America/Los_Angeles",
  "America/Mexico_City",
  "America/Bogota",
  "America/Lima",
  "America/Santiago",
  "America/Buenos_Aires",
  "America/Sao_Paulo",
  "Europe/London",
  "Europe/Paris",
  "Europe/Berlin",
  "Europe/Madrid",
  "Europe/Rome",
  "Europe/Moscow",
  "Asia/Dubai",
  "Asia/Kolkata",
  "Asia/Singapore",
  "Asia/Tokyo",
  "Asia/Shanghai",
  "Australia/Sydney",
  "Pacific/Auckland",
];

export function EditForm({ site, onSaved }: Props) {
  const [name, setName] = useState(site.name);
  const [domain, setDomain] = useState(site.domain);
  const [gscProperty, setGscProperty] = useState(site.gsc_property ?? "");
  const [timezone, setTimezone] = useState(site.timezone);
  const [isActive, setIsActive] = useState(site.is_active);
  const [ghlLocationId, setGhlLocationId] = useState(site.ghl_location_id ?? "");

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const isDirty =
    name !== site.name ||
    domain !== site.domain ||
    gscProperty !== (site.gsc_property ?? "") ||
    timezone !== site.timezone ||
    isActive !== site.is_active ||
    ghlLocationId !== (site.ghl_location_id ?? "");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isDirty) return;

    setSaving(true);
    setError(null);
    setSuccess(false);

    try {
      const res = await fetch(`/api/sites/${site.id}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name,
          domain,
          gscProperty,
          timezone,
          isActive,
          ghlLocationId,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to save changes");
      }

      setSuccess(true);
      onSaved({ name, domain, gsc_property: gscProperty || null, timezone, is_active: isActive, ghl_location_id: ghlLocationId || null });
      setTimeout(() => setSuccess(false), 3000);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-[10px] bg-white px-7.5 pb-8 pt-7.5 shadow-1 dark:bg-gray-dark dark:shadow-card">
      <h3 className="mb-6 text-lg font-semibold text-dark dark:text-white">
        Website Settings
      </h3>

      <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        {/* Name */}
        <div className="sm:col-span-2">
          <label className="mb-2 block text-sm font-medium text-dark dark:text-white">
            Website Name <span className="text-red">*</span>
          </label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            required
            className="w-full rounded-lg border border-stroke bg-transparent px-4 py-3 text-sm text-dark outline-none transition focus:border-primary dark:border-dark-3 dark:text-white dark:focus:border-primary"
          />
        </div>

        {/* Domain */}
        <div>
          <label className="mb-2 block text-sm font-medium text-dark dark:text-white">
            Domain <span className="text-red">*</span>
          </label>
          <input
            type="text"
            value={domain}
            onChange={(e) => setDomain(e.target.value)}
            required
            placeholder="example.com"
            className="w-full rounded-lg border border-stroke bg-transparent px-4 py-3 text-sm text-dark outline-none transition focus:border-primary dark:border-dark-3 dark:text-white dark:focus:border-primary"
          />
          <p className="mt-1 text-xs text-dark-5 dark:text-dark-6">
            Without protocol (https://)
          </p>
        </div>

        {/* Timezone */}
        <div>
          <label className="mb-2 block text-sm font-medium text-dark dark:text-white">
            Timezone
          </label>
          <select
            value={timezone}
            onChange={(e) => setTimezone(e.target.value)}
            className="w-full rounded-lg border border-stroke bg-transparent px-4 py-3 text-sm text-dark outline-none transition focus:border-primary dark:border-dark-3 dark:bg-dark-2 dark:text-white dark:focus:border-primary"
          >
            {TIMEZONES.map((tz) => (
              <option key={tz} value={tz}>
                {tz}
              </option>
            ))}
          </select>
        </div>

        {/* GSC Property */}
        <div className="sm:col-span-2">
          <label className="mb-2 block text-sm font-medium text-dark dark:text-white">
            Google Search Console Property
          </label>
          <input
            type="text"
            value={gscProperty}
            onChange={(e) => setGscProperty(e.target.value)}
            placeholder="sc-domain:example.com or https://example.com/"
            className="w-full rounded-lg border border-stroke bg-transparent px-4 py-3 text-sm text-dark outline-none transition focus:border-primary dark:border-dark-3 dark:text-white dark:focus:border-primary"
          />
          <p className="mt-1 text-xs text-dark-5 dark:text-dark-6">
            Leave empty if GSC is not connected.
          </p>
        </div>

        {/* GHL Location ID */}
        <div className="sm:col-span-2">
          <label className="mb-2 block text-sm font-medium text-dark dark:text-white">
            GoHighLevel Location ID
          </label>
          <input
            type="text"
            value={ghlLocationId}
            onChange={(e) => setGhlLocationId(e.target.value)}
            placeholder="ve9EPM428h8vShlRW1KT"
            className="w-full rounded-lg border border-stroke bg-transparent px-4 py-3 text-sm text-dark outline-none transition focus:border-primary dark:border-dark-3 dark:text-white dark:focus:border-primary"
          />
          <p className="mt-1 text-xs text-dark-5 dark:text-dark-6">
            GHL → Settings → Business Info → Location ID. Required to enable the AI agent.
          </p>
        </div>

        {/* Status toggle */}
        <div className="sm:col-span-2">
          <label className="mb-2 block text-sm font-medium text-dark dark:text-white">
            Status
          </label>
          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={() => setIsActive(true)}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                isActive
                  ? "border-green bg-green/10 text-green dark:bg-green/20"
                  : "border-stroke text-dark-5 hover:border-green hover:text-green dark:border-dark-3 dark:text-dark-6"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${isActive ? "bg-green" : "bg-dark-5"}`} />
              Active
            </button>
            <button
              type="button"
              onClick={() => setIsActive(false)}
              className={`flex items-center gap-2 rounded-lg border px-4 py-2.5 text-sm font-medium transition-colors ${
                !isActive
                  ? "border-dark-4 bg-dark-8/30 text-dark-4 dark:bg-dark-3 dark:text-dark-6"
                  : "border-stroke text-dark-5 hover:border-dark-4 dark:border-dark-3 dark:text-dark-6"
              }`}
            >
              <span className={`h-2 w-2 rounded-full ${!isActive ? "bg-dark-4" : "bg-dark-7"}`} />
              Inactive
            </button>
          </div>
          <p className="mt-1.5 text-xs text-dark-5 dark:text-dark-6">
            Inactive sites stop collecting data but retain existing records.
          </p>
        </div>

        {/* Feedback */}
        {error && (
          <div className="sm:col-span-2 rounded-md bg-red/10 px-4 py-3 text-sm text-red">
            {error}
          </div>
        )}
        {success && (
          <div className="sm:col-span-2 flex items-center gap-2 rounded-md bg-green/10 px-4 py-3 text-sm text-green dark:bg-green/20">
            <CheckIcon className="h-4 w-4 shrink-0" />
            Changes saved successfully.
          </div>
        )}

        {/* Submit */}
        <div className="sm:col-span-2 flex justify-end">
          <button
            type="submit"
            disabled={saving || !isDirty}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-blue-dark disabled:opacity-50"
          >
            {saving && (
              <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {saving ? "Saving…" : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
