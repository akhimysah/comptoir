import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/lib/db";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ "x-forwarded-for": "203.0.113.9" }), cookies: async () => ({ get: () => undefined, set: () => {} }) }));

/** Commentaires de blog : réglage de la boutique, validation, limite par adresse, publication ou attente. */
let storeId: string, postId: string;
beforeEach(async () => {
  await db.user.deleteMany();
  const owner = await db.user.create({ data: { email: `cm-${Date.now()}@test.local`, name: "M", passwordHash: "x" } });
  storeId = (await db.store.create({ data: { ownerId: owner.id, name: "B", slug: `cm-${Date.now()}`, theme: "{}", blogComments: "moderated" } })).id;
  postId = (await db.blogPost.create({ data: { storeId, title: "Article", handle: "article", published: true, publishedAt: new Date() } })).id;
});

describe("commentaires de blog", () => {
  it("attend la validation en mode modéré, refuse les entrées invalides et les commentaires désactivés", async () => {
    const { postComment, publishedComments } = await import("@/lib/comments");
    const store = await db.store.findUniqueOrThrow({ where: { id: storeId } });
    expect((await postComment(store, postId, { author: "", email: "x", body: "" })).error).toBeTruthy();
    const r = await postComment(store, postId, { author: "Léa", email: "lea@test.local", body: "Très bel article !" });
    expect(r).toMatchObject({ ok: true, status: "pending" });
    expect(await publishedComments(postId)).toHaveLength(0);
    await db.blogComment.updateMany({ where: { postId }, data: { status: "published" } });
    expect((await publishedComments(postId)).map((c) => c.author)).toEqual(["Léa"]);
    const off = await db.store.update({ where: { id: storeId }, data: { blogComments: "off" } });
    expect((await postComment(off, postId, { author: "Max", email: "max@test.local", body: "Bonjour" })).error).toMatch(/désactivés/);
    const auto = await db.store.update({ where: { id: storeId }, data: { blogComments: "auto" } });
    expect((await postComment(auto, postId, { author: "Max", email: "max@test.local", body: "Bonjour" })).status).toBe("published");
  });
});
