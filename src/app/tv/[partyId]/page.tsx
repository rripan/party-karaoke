import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingScreen } from "@/components/ui/states";
import { TvScreen } from "./tv-screen";

export const metadata: Metadata = { title: "TV stage" };

export default function TvPage({ params }: PageProps<"/tv/[partyId]">) {
  return (
    <Suspense fallback={<LoadingScreen />}>
      <TvScreen params={params} />
    </Suspense>
  );
}
