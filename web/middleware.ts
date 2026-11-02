import { NextResponse, type NextRequest } from "next/server";

/** Pages that need an account. Real checks happen on the server; this just saves a round trip. */
const GATED = ["/start", "/match", "/profile", "/account", "/me", "/connections"];

export function middleware(req: NextRequest) {
  const { pathname, search } = req.nextUrl;
  if (GATED.some((p) => pathname === p || pathname.startsWith(p + "/")) && !req.cookies.get("hs_session")) {
    const url = req.nextUrl.clone();
    url.pathname = "/signin"; url.search = "?next=" + encodeURIComponent(pathname + search);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = { matcher: ["/start/:path*", "/match/:path*", "/profile/:path*", "/account/:path*", "/me/:path*", "/connections/:path*"] };
