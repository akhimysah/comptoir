import LoginForm from "./LoginForm";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; email?: string; expired?: string; reset?: string }> }) {
  const { next, email, expired, reset } = await searchParams;
  const notice = expired ? "La vérification a expiré ou a échoué trop de fois : reconnectez-vous." : reset ? "Mot de passe modifié. Connectez-vous avec le nouveau, puis saisissez votre code de vérification." : undefined;
  return <LoginForm next={next} email={email} notice={notice} />;
}
