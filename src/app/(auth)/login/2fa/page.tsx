import { redirect } from "next/navigation";
import TwoFactorForm from "./TwoFactorForm";
import { currentChallenge } from "@/lib/two-factor";

export const metadata = { title: "Code de vérification" };

export default async function TwoFactorPage() {
  if (!(await currentChallenge())) redirect("/login?expired=1");
  return <TwoFactorForm />;
}
