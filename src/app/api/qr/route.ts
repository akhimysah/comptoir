import { NextResponse } from "next/server";
import QRCode from "qrcode";

const COLOR = /^#[0-9a-f]{3,8}$/i;

/** QR code en SVG (page carte cadeau des thèmes Shopify, via vendor/qrcode.js). */
export async function GET(req: Request) {
  const u = new URL(req.url);
  const text = (u.searchParams.get("t") ?? "").slice(0, 500);
  if (!text) return new NextResponse(null, { status: 400 });
  const size = Math.min(1024, Math.max(32, Number(u.searchParams.get("s")) || 256));
  const dark = u.searchParams.get("d") ?? "#000000", light = u.searchParams.get("l") ?? "#ffffff";
  const svg = await QRCode.toString(text, { type: "svg", width: size, margin: 1, color: { dark: COLOR.test(dark) ? dark : "#000000", light: COLOR.test(light) ? light : "#ffffff" } });
  return new NextResponse(svg, { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" } });
}
