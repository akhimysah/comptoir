"use client";

import { startTransition } from "react";

/**
 * Envoi d'un formulaire sans qu'il se vide (React 19 réinitialise les champs après une action passée par `action`) :
 * en cas d'erreur, l'utilisateur garde ce qu'il a saisi.
 */
export const keepOnSubmit = (dispatch: (fd: FormData) => void) => (e: React.FormEvent<HTMLFormElement>) => {
  e.preventDefault();
  const fd = new FormData(e.currentTarget, (e.nativeEvent as SubmitEvent).submitter);
  startTransition(() => dispatch(fd));
};
