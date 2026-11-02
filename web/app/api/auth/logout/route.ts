import { signOut } from "@/lib/auth";
import { handle, ok } from "@/lib/http";
export const POST = handle(async () => { await signOut(); return ok({ ok: true }); });
