import { redirect } from "next/navigation";
import { LoginForm } from "@/components/chaleur/LoginForm";
import { currentUser } from "@/lib/auth";
import { prisma } from "@/lib/db";

export default async function LoginPage() {
  const [me, settings] = await Promise.all([
    currentUser(),
    prisma.appSettings.findUnique({ where: { id: "default" }, select: { companyName: true, logoUrl: true } }),
  ]);
  if (me && !me.mustChangePassword) redirect("/");
  return (
    <LoginForm
      company={settings?.companyName ?? "Chaleur"}
      logoUrl={settings?.logoUrl ?? null}
      welcome={me ? { name: me.name, username: me.username, role: me.roleName } : null}
    />
  );
}
