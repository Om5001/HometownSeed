"use client";
export function SignOutButton() {
  return (
    <button className="navlink" style={{ border: 0, background: "none", cursor: "pointer" }}
      onClick={async () => { await fetch("/api/auth/logout", { method: "POST" }); location.href = "/"; }}>
      Sign out
    </button>
  );
}
