import Link from "next/link";
export default function NotFound() {
  return <main className="wrap section"><h2>We couldn&apos;t find that</h2><p className="lede2">The link may be out of date: the campaign or conversation may have been removed, or it&apos;s a ZIP code without Census data (PO boxes and some business ZIPs).</p><p style={{ marginTop: 16 }}><Link className="btn btn-green" href="/">Back to the map</Link></p></main>;
}
