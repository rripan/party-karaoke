"use client";

export default function GlobalError({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <html lang="en">
      <body style={{ background: "#06030d", color: "#f7f2ff", fontFamily: "system-ui, sans-serif", display: "grid", placeItems: "center", minHeight: "100vh", margin: 0, textAlign: "center" }}>
        <div>
          <p style={{ fontSize: 48, margin: 0 }}>🎛️</p>
          <h1>Something went wrong</h1>
          <p style={{ color: "#b9a9db" }}>The party data is safe on the server.</p>
          <button onClick={reset} style={{ marginTop: 16, padding: "12px 20px", borderRadius: 16, border: 0, background: "#d946ef", color: "white", fontWeight: 700 }}>
            Try again
          </button>
        </div>
      </body>
    </html>
  );
}
