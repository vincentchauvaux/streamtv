import { getSessionUser } from "@/lib/auth";
import { DashboardClient } from "./dashboard-client";

export default async function AppPage() {
  const user = await getSessionUser();
  const userName = user!.name ?? user!.email;

  return <DashboardClient userName={userName} />;
}
