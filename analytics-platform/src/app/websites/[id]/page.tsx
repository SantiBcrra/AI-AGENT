import { WebsiteDetail } from "./_components/website-detail";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Edit Website" };

type Props = { params: { id: string } };

export default function WebsiteDetailPage({ params }: Props) {
  const id = parseInt(params.id, 10);
  return <WebsiteDetail siteId={id} />;
}
