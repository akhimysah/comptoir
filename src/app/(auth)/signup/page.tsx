import SignupForm from "./SignupForm";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ step?: string }> }) {
  const { step } = await searchParams;
  return <SignupForm step={step === "store" ? "store" : "account"} />;
}
