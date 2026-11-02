import { redirect } from "next/navigation";

// The giving profile now lives on the Account page.
export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { welcome } = await searchParams;
  redirect(welcome ? "/account?welcome=1#giving" : "/account#giving");
}
