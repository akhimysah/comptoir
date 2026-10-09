"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requirePerm, storesWithPerm } from "@/lib/auth";
import { db } from "@/lib/db";
import { sendMail } from "@/lib/mail";
import { buildDailyReport } from "@/lib/reports";

export async function sendMyDailyReport() {
  const { user } = await requirePerm("analytics");
  const stores = await storesWithPerm(user.id, "analytics");
  const report = await buildDailyReport(stores);
  await sendMail({ to: user.email, storeId: stores[0].id, ...report });
  redirect("/admin/overview?sent=1");
}

export async function setDailyReport(form: FormData) {
  const { user } = await requirePerm("analytics");
  await db.user.update({ where: { id: user.id }, data: { dailyReport: form.get("on") === "1" } });
  revalidatePath("/admin/overview");
}
