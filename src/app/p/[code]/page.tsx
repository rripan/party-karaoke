import type { Metadata } from "next";
import { Suspense } from "react";
import { LoadingScreen } from "@/components/ui/states";
import { GuestApp } from "./guest-app";

export const metadata: Metadata = { title: "Join the party" };

export default function GuestPage({ params }: PageProps<"/p/[code]">) {
  return (
    <Suspense fallback={<LoadingScreen label="Finding the party…" />}>
      <GuestApp params={params} />
    </Suspense>
  );
}
