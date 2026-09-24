"use client";

/**
 * Last-resort error page (when the root layout itself fails). It replaces the whole
 * document, so it can't use translations or the app's styles: it shows both languages
 * with inline styles.
 */
export default function GlobalError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  const code = error.digest ?? "—";
  return (
    <html lang="es">
      <body
        style={{
          margin: 0,
          minHeight: "100dvh",
          display: "grid",
          placeItems: "center",
          fontFamily: "system-ui, sans-serif",
          background: "#f5f6fb",
          color: "#16204f",
          padding: 16,
          textAlign: "center",
        }}
      >
        <main style={{ maxWidth: 480 }}>
          <h1 style={{ fontSize: 24 }}>Algo salió mal · Something went wrong</h1>
          <p style={{ color: "#586187" }}>
            Inténtalo otra vez. Si sigue, escribe a soporte@stratumpr.com con esta referencia.
            <br />
            Please try again. If it continues, email soporte@stratumpr.com with this reference.
          </p>
          <p
            style={{
              fontFamily: "ui-monospace, monospace",
              background: "#eceff8",
              padding: "6px 12px",
              borderRadius: 8,
            }}
          >
            {code}
          </p>
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 8,
              background: "#1e2b7e",
              color: "#fff",
              border: 0,
              borderRadius: 10,
              padding: "10px 18px",
              font: "inherit",
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Intentar otra vez · Try again
          </button>
        </main>
      </body>
    </html>
  );
}
