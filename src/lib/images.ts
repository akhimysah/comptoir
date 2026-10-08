/** Images envoyées par l'admin : stockage local (/uploads/…) ou Vercel Blob en production. */
const LOCAL = /^\/uploads\/[a-f0-9]{24}\.(jpg|png|webp|gif)$/;
const BLOB = /^https:\/\/[a-z0-9]+\.public\.blob\.vercel-storage\.com\/uploads\/[a-f0-9]{24}(-[A-Za-z0-9]+)?\.(jpg|png|webp|gif)$/;

export const isImageUrl = (url: string) => LOCAL.test(url) || BLOB.test(url);
