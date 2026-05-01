import Breadcrumb from "@/components/Breadcrumbs/Breadcrumb";
import { WebsitesTable } from "./_components/websites-table";
import { AddWebsiteButton } from "./_components/add-website-button";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Websites" };

export default function WebsitesPage() {
  return (
    <>
      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-[26px] font-bold leading-[30px] text-dark dark:text-white">
            Websites
          </h2>
          <nav className="mt-1">
            <ol className="flex items-center gap-2 text-sm">
              <li>
                <a className="font-medium text-dark/60 hover:text-primary dark:text-white/60" href="/">
                  Dashboard /
                </a>
              </li>
              <li className="font-medium text-primary">Websites</li>
            </ol>
          </nav>
        </div>

        <AddWebsiteButton />
      </div>

      <WebsitesTable />
    </>
  );
}
