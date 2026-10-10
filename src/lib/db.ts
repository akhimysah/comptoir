import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const db = globalForPrisma.prisma ?? new PrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = db;

/** Base PostgreSQL (production) ou SQLite (développement), d'après DATABASE_URL. */
export const isPostgres = /^postgres(ql)?:/.test(process.env.DATABASE_URL ?? "");

/** Recherche « contient », sans tenir compte des majuscules sur les deux bases (SQLite l'est déjà ; PostgreSQL a besoin de mode insensitive). */
export const textSearch = (q: string) => (isPostgres ? { contains: q, mode: "insensitive" } : { contains: q }) as { contains: string };
