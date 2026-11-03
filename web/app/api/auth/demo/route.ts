import { signInDemo } from "@/lib/auth";
import { handle, ok } from "@/lib/http";

/** TEMPORARY: sign in as the shared demo account. Remove with sql/demo when going live. */
export const POST = handle(async () => ok({ user: await signInDemo() }));
