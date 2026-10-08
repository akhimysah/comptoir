"use client";

import { useState } from "react";
import { cx } from "@/lib/utils";

/** Bouton de suppression en deux temps : le premier clic arme, le second envoie. */
export function ConfirmSubmit({ label, confirmLabel, className }: { label: string; confirmLabel: string; className?: string }) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type={armed ? "submit" : "button"}
      onClick={() => !armed && setArmed(true)}
      onBlur={() => setArmed(false)}
      className={cx("btn btn-danger", armed && "border-red-700 bg-red-700 text-white hover:bg-red-800", className)}
    >
      {armed ? confirmLabel : label}
    </button>
  );
}
