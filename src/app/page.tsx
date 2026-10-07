import { redirect } from "next/navigation";
import { ChaleurApp } from "@/components/chaleur/ChaleurApp";
import { currentUser } from "@/lib/auth";

export default async function HomePage() {
  const me = await currentUser();
  // A temporary password is replaced on the sign-in page before anything else opens.
  if (!me || me.mustChangePassword) redirect("/login");
  return <ChaleurApp me={me} />;
}
