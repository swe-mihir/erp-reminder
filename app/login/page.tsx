import { redirect } from "next/navigation";
import { currentUser } from "@/lib/auth";
import Topbar from "../Topbar";
import AuthForm from "../AuthForm";

export const dynamic = "force-dynamic";

export default async function Page() {
  if (await currentUser()) redirect("/dashboard");
  return (
    <>
      <Topbar />
      <main className="wrap">
        <AuthForm mode="login" />
      </main>
    </>
  );
}
