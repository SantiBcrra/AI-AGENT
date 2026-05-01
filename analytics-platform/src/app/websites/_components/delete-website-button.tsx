"use client";

import { useState } from "react";

type Props = {
  siteId: number;
  siteName: string;
  onDeleted: () => void;
};

export function DeleteWebsiteButton({ siteId, siteName, onDeleted }: Props) {
  const [showConfirm, setShowConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleDelete() {
    setDeleting(true);
    setError(null);
    try {
      const res = await fetch(`/api/sites/${siteId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? "Failed to delete site");
      }
      setShowConfirm(false);
      onDeleted();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unknown error");
      setDeleting(false);
    }
  }

  return (
    <>
      <button
        onClick={() => setShowConfirm(true)}
        className="inline-flex h-8 items-center gap-1.5 rounded-md border border-red/30 bg-white px-3 text-sm font-medium text-red transition-colors hover:bg-red/5 dark:border-red/40 dark:bg-dark-2 dark:hover:bg-red/10"
      >
        <TrashIcon className="h-3.5 w-3.5" />
        Delete
      </button>

      {/* Confirm modal */}
      {showConfirm && (
        <div
          className="fixed inset-0 z-[9999] flex items-center justify-center bg-black/50 px-4"
          onClick={() => !deleting && setShowConfirm(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 shadow-4 dark:bg-gray-dark"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="mb-4 flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red/10">
                <TrashIcon className="h-5 w-5 text-red" />
              </div>
              <div>
                <h3 className="font-semibold text-dark dark:text-white">
                  Delete Website
                </h3>
                <p className="text-sm text-dark-5 dark:text-dark-6">
                  This action cannot be undone.
                </p>
              </div>
            </div>

            {/* Body */}
            <p className="mb-5 text-sm text-dark-4 dark:text-dark-6">
              Are you sure you want to delete{" "}
              <span className="font-semibold text-dark dark:text-white">
                {siteName}
              </span>
              ? All associated analytics data, sessions, and events will be
              permanently removed.
            </p>

            {error && (
              <p className="mb-4 rounded-md bg-red/10 px-3 py-2 text-sm text-red">
                {error}
              </p>
            )}

            {/* Actions */}
            <div className="flex justify-end gap-3">
              <button
                onClick={() => setShowConfirm(false)}
                disabled={deleting}
                className="rounded-md border border-stroke px-4 py-2 text-sm font-medium text-dark transition-colors hover:bg-gray-2 disabled:opacity-50 dark:border-dark-3 dark:text-white dark:hover:bg-dark-2"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                disabled={deleting}
                className="inline-flex items-center gap-2 rounded-md bg-red px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-red-dark disabled:opacity-60"
              >
                {deleting && (
                  <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {deleting ? "Deleting…" : "Yes, delete"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function TrashIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <polyline points="3 6 5 6 21 6" />
      <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6" />
      <path d="M10 11v6M14 11v6" />
      <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" />
    </svg>
  );
}
