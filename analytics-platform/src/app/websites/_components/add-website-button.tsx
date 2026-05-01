"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function AddWebsiteButton() {
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [domain, setDomain] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();

  function reset() {
    setName("");
    setDomain("");
    setError(null);
    setSubmitting(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const res = await fetch("/api/sites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), domain: domain.trim() }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error ?? "Failed to create site");
      }

      setOpen(false);
      reset();
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => { reset(); setOpen(true); }}
        className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-medium text-white shadow-1 transition-colors hover:bg-blue-dark"
      >
        <PlusIcon className="h-4 w-4" />
        Add Website
      </button>

      {open && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4"
          onClick={() => !submitting && setOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-4 dark:bg-gray-dark"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mb-5 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-dark dark:text-white">
                Add New Website
              </h3>
              <button
                onClick={() => setOpen(false)}
                className="text-dark-5 hover:text-dark dark:text-dark-6 dark:hover:text-white"
              >
                <XIcon className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              <div>
                <label className="mb-1.5 block text-sm font-medium text-dark dark:text-white">
                  Website Name <span className="text-red">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. My Online Store"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="w-full rounded-lg border border-stroke bg-transparent px-4 py-2.5 text-sm text-dark outline-none transition focus:border-primary dark:border-dark-3 dark:text-white dark:focus:border-primary"
                />
              </div>

              <div>
                <label className="mb-1.5 block text-sm font-medium text-dark dark:text-white">
                  Domain <span className="text-red">*</span>
                </label>
                <input
                  type="text"
                  placeholder="e.g. example.com"
                  value={domain}
                  onChange={(e) => setDomain(e.target.value)}
                  required
                  className="w-full rounded-lg border border-stroke bg-transparent px-4 py-2.5 text-sm text-dark outline-none transition focus:border-primary dark:border-dark-3 dark:text-white dark:focus:border-primary"
                />
                <p className="mt-1 text-xs text-dark-5 dark:text-dark-6">
                  Enter without protocol (https://). Example: example.com
                </p>
              </div>

              {error && (
                <p className="rounded-md bg-red/10 px-3 py-2 text-sm text-red">
                  {error}
                </p>
              )}

              <div className="flex justify-end gap-3 pt-1">
                <button
                  type="button"
                  onClick={() => setOpen(false)}
                  disabled={submitting}
                  className="rounded-md border border-stroke px-4 py-2 text-sm font-medium text-dark transition-colors hover:bg-gray-2 disabled:opacity-50 dark:border-dark-3 dark:text-white dark:hover:bg-dark-2"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting || !name.trim() || !domain.trim()}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-dark disabled:opacity-60"
                >
                  {submitting && (
                    <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                  )}
                  {submitting ? "Creating…" : "Create Website"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}

function PlusIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

function XIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <path d="M18 6 6 18M6 6l12 12" />
    </svg>
  );
}
