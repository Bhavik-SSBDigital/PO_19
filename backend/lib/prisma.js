import { PrismaClient } from "@prisma/client";

// Single shared Prisma Client instance for the whole app (same role as the
// old mongoose db.js connection, but Prisma manages its own pool internally
// so this is just the client you import everywhere, e.g.:
//   import { prisma } from "../lib/prisma.js";
//   await prisma.auditResult.findMany(...)
export const prisma = new PrismaClient({
  log: process.env.NODE_ENV === "development" ? ["query", "warn", "error"] : ["error"],
});

const db = async () => {
  try {
    await prisma.$connect();
    console.log("Connected to PostgreSQL (Prisma)");
  } catch (error) {
    console.error("Error connecting to database:", error);
  }
};

export default db;
