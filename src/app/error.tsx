"use client";

import { Button } from "@/components/ui/button";
import { FullScreenMessage } from "@/components/ui/states";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <FullScreenMessage emoji="🎛️" title="Something hit a wrong note" action={<Button onClick={reset}>Try again</Button>}>
      The party is safe — the queue lives on the server. Try again, or reload the page.
    </FullScreenMessage>
  );
}
