/** Shown right away while the next page loads. */
export default function Loading() {
  return (
    <main className="wrap section page-loading" aria-busy="true" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>Loading…</span>
    </main>
  );
}
