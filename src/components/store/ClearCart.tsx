"use client";

import { useEffect } from "react";
import { useCart } from "./cart";

export function ClearCart({ slug }: { slug: string }) {
  const { clear } = useCart(slug);
  useEffect(() => { clear(); }, [clear]);
  return null;
}
