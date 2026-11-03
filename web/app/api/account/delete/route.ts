import { deleteAccount } from "@/lib/auth";
import { fail, handle, ok, requireUser, readJson } from "@/lib/http";

export const POST = handle(async (req: Request) => {
  const user = await requireUser();
  const { password, confirm } = await readJson(req);
  if (String(confirm || "").trim().toUpperCase() !== "DELETE") return fail('Type DELETE to confirm.');
  await deleteAccount(user, String(password || ""));
  return ok({ ok: true });
});
