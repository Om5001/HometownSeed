import Link from "next/link";
export default function NotFound() {
  return <main className="wrap section"><h2>We couldn&apos;t find that</h2><p className="lede2">It may be a ZIP without Census data (PO boxes and some business ZIPs), or a campaign that was removed.</p><p style={{ marginTop: 16 }}><Link className="btn btn-green" href="/">Back to the map</Link></p></main>;
}
