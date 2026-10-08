export async function uploadImage(file: File): Promise<string> {
  const body = new FormData();
  body.append("file", file);
  const res = await fetch("/api/upload", { method: "POST", body });
  const json = await res.json().catch(() => ({}));
  if (!res.ok || !json.url) throw new Error(json.error ?? "L'envoi de l'image a échoué.");
  return json.url as string;
}
