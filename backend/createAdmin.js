import db, { prisma } from "./lib/prisma.js";
import bcrypt from "bcryptjs"; // pure-JS, no native build step; swap for "bcrypt" in prod if you prefer
import dotenv from "dotenv";

dotenv.config();
async function createAdmin() {
  try {
    await db();

    // Check if the admin role exists
    let adminRole = await prisma.role.findFirst({ where: { isAdmin: true } });
    if (!adminRole) {
      adminRole = await prisma.role.create({
        data: { name: "admin", isAdmin: true },
      });
      console.log("Admin role created");
    }

    // Check if the admin user already exists
    let adminUser = await prisma.user.findFirst({
      where: { roleId: adminRole.id },
    });

    if (!adminUser) {
      const hashedPassword = await bcrypt.hash("admin123", 10);
      adminUser = await prisma.user.create({
        data: {
          username: "admin",
          email: "AIAUDIT@AIAENGINEERING.COM",
          password: hashedPassword,
          firstName: "System",
          lastName: "Administrator",
          createdAt: new Date(),
          roleId: adminRole.id,
        },
      });
      console.log("Admin user created");
    } else {
      console.log("Admin user already exists");
    }
  } catch (error) {
    console.error("Error creating admin user:", error);
  } finally {
    await prisma.$disconnect();
  }
}

createAdmin();
