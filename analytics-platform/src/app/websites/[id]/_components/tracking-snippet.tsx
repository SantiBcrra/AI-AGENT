"use client";

import { useState } from "react";

type Props = { trackingId: string; domain: string };

export function TrackingSnippet({ trackingId, domain }: Props) {
  const [copied, setCopied] = useState<"snippet" | "id" | null>(null);

  const snippet = `<!-- Analytics Platform Tracking -->
<script>
  (function(w,d,s,id){
    w.__ap_id = id;
    var j=d.createElement(s);
    j.async=true;
    j.src='https://${domain.replace(/^https?:\/\//, '')}/api/collect.js';
    d.head.appendChild(j);
  })(window,document,'script','${trackingId}');
</script>`;

  function copy(text: string, key: "snippet" | "id") {
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key);
      setTimeout(() => setCopied(null), 2000);
    });
  }

  return (
    <div className="flex flex-col gap-6">
      {/* Tracking ID card */}
      <div className="rounded-[10px] bg-white px-7.5 pb-7 pt-7.5 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <h3 className="mb-1 text-base font-semibold text-dark dark:text-white">
          Tracking ID
        </h3>
        <p className="mb-4 text-sm text-dark-5 dark:text-dark-6">
          Your unique site identifier used in all tracking requests.
        </p>

        <div className="flex items-center gap-3 rounded-lg border border-stroke bg-gray-2 px-4 py-3 dark:border-dark-3 dark:bg-dark-2">
          <code className="flex-1 font-mono text-sm font-semibold text-dark dark:text-white">
            {trackingId}
          </code>
          <button
            onClick={() => copy(trackingId, "id")}
            className="flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-xs font-medium text-dark-5 transition-colors hover:bg-white hover:text-dark dark:text-dark-6 dark:hover:bg-dark-3 dark:hover:text-white"
          >
            {copied === "id" ? (
              <>
                <CheckIcon className="h-3.5 w-3.5 text-green" />
                Copied
              </>
            ) : (
              <>
                <CopyIcon className="h-3.5 w-3.5" />
                Copy
              </>
            )}
          </button>
        </div>
      </div>

      {/* Script snippet */}
      <div className="rounded-[10px] bg-white px-7.5 pb-7 pt-7.5 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h3 className="mb-1 text-base font-semibold text-dark dark:text-white">
              Installation Snippet
            </h3>
            <p className="text-sm text-dark-5 dark:text-dark-6">
              Paste this code before the closing{" "}
              <code className="rounded bg-gray-2 px-1.5 py-0.5 text-xs dark:bg-dark-2">
                &lt;/head&gt;
              </code>{" "}
              tag on every page you want to track.
            </p>
          </div>
          <button
            onClick={() => copy(snippet, "snippet")}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-md border border-stroke bg-white px-3 py-2 text-sm font-medium text-dark transition-colors hover:bg-gray-2 dark:border-dark-3 dark:bg-dark-2 dark:text-white dark:hover:bg-dark-3"
          >
            {copied === "snippet" ? (
              <>
                <CheckIcon className="h-4 w-4 text-green" />
                Copied!
              </>
            ) : (
              <>
                <CopyIcon className="h-4 w-4" />
                Copy
              </>
            )}
          </button>
        </div>

        <pre className="overflow-x-auto rounded-lg bg-dark p-4 text-xs leading-relaxed text-dark-7 dark:bg-dark-2 dark:text-dark-6">
          <code>{snippet}</code>
        </pre>
      </div>

      {/* Instructions */}
      <div className="rounded-[10px] bg-white px-7.5 pb-7 pt-7.5 shadow-1 dark:bg-gray-dark dark:shadow-card">
        <h3 className="mb-4 text-base font-semibold text-dark dark:text-white">
          Verification Steps
        </h3>
        <ol className="flex flex-col gap-4">
          {[
            {
              step: "1",
              title: "Add the snippet",
              desc: "Copy the script above and paste it before </head> on every page you want to track.",
            },
            {
              step: "2",
              title: "Deploy your changes",
              desc: "Publish the updated pages to your production website.",
            },
            {
              step: "3",
              title: "Visit your website",
              desc: "Open your website in a browser. This will trigger the first tracking event.",
            },
            {
              step: "4",
              title: "Check the dashboard",
              desc: "Return here and open the Overview tab. You should see your first session within a few minutes.",
            },
          ].map((item) => (
            <li key={item.step} className="flex gap-4">
              <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">
                {item.step}
              </div>
              <div>
                <p className="text-sm font-semibold text-dark dark:text-white">
                  {item.title}
                </p>
                <p className="mt-0.5 text-sm text-dark-5 dark:text-dark-6">
                  {item.desc}
                </p>
              </div>
            </li>
          ))}
        </ol>
      </div>
    </div>
  );
}

function CopyIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}>
      <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
      <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
    </svg>
  );
}

function CheckIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2.5}>
      <polyline points="20 6 9 17 4 12" />
    </svg>
  );
}
