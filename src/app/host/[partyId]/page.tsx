import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingScreen } from "@/components/ui/states";
import { HostDashboard } from "./host-dashboard";

export const metadata: Metadata = { title: "Host dashboard" };

export default function HostPage({ params }: PageProps<"/host/[partyId]">) {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <HostDashboard params={params} />
    </Suspense>
  );
}
