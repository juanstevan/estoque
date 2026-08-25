import { ChaleurApp } from "@/components/chaleur/ChaleurApp";
import { currentUser } from "@/lib/auth";
import { redirect } from "next/navigation";

export default async function HomePage() {
  const user = await currentUser();
  if (!user) redirect("/login");
  return <ChaleurApp userName={user.name} />;
}
