import bcrypt from "bcryptjs";
import crypto from "crypto";
import { prisma } from "../lib/prisma.js";

/**
 * Minimal auth controller, built to satisfy the exact response contract
 * pages/authentication/auth-forms/AuthLogin.jsx expects (I read that file
 * to get the field names right: accessToken, isAuditHead/isAdmin/isAuditor/
 * isExecutor/fromSSBD, name, email, userName, canViewDashboard, userId,
 * roleId, firstName, lastName, loginTime, logId, allowedModules).
 *
 * This is NOT a full port of your real user-controller.js (I don't have its
 * source) - it only implements enough (signup, login, logout) to get past
 * the login screen for a demo. change_password / editUser / getUsers /
 * forget_password / get_allowed_auditors / add_auditor_login_log /
 * exportLogsToExcel from the real controller are not included here.
 */

export const signup = async (req, res) => {
  try {
    const { username, email, password, firstName, lastName, roleName } =
      req.body;

    const existing = await prisma.user.findFirst({ where: { username } });
    if (existing) {
      return res.status(400).json({ message: "Username already exists" });
    }

    let role = null;
    if (roleName) {
      role = await prisma.role.findFirst({ where: { name: roleName } });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: {
        username,
        email,
        password: hashedPassword,
        firstName,
        lastName,
        roleId: role?.id,
      },
    });

    return res.status(201).json({ message: "User created", userId: user.id });
  } catch (error) {
    console.error("Error in signup:", error);
    return res.status(500).json({ message: "Failed to create user" });
  }
};

// Add this to your existing controller file

export const getRoles = async (req, res) => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: {
        name: "asc", // Optional: orders the roles alphabetically
      },
    });

    return res.status(200).json(roles);
  } catch (error) {
    console.error("Error fetching roles:", error);
    return res.status(500).json({ message: "Failed to fetch roles" });
  }
};

export const login = async (req, res) => {
  try {
    const { username, password } = req.body;

    const user = await prisma.user.findFirst({
      where: { username },
      include: { role: true },
    });

    if (!user) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);
    if (!passwordMatches) {
      return res.status(401).json({ message: "Invalid username or password" });
    }

    const accessToken = crypto.randomBytes(32).toString("hex");
    await prisma.token.create({
      data: { token: accessToken, userId: user.id },
    });

    const loginTime = new Date();
    const log = await prisma.log.create({
      data: {
        userId: user.id,
        firstName: user.firstName,
        lastName: user.lastName,
        roleId: user.roleId,
        loginTime,
      },
    });

    return res.status(200).json({
      message: "Login Successful",
      accessToken,
      isAuditHead: !!user.role?.isAuditHead,
      isAdmin: !!user.role?.isAdmin,
      isAuditor: !!user.role?.isAuditor,
      isExecutor: !!user.role?.isExecutor,
      fromSSBD: !!user.role?.fromSSBD,
      name: `${user.firstName} ${user.lastName}`,
      email: user.email,
      userName: user.username,
      canViewDashboard: user.canViewDashboard,
      allowedModules: user.allowedModules,
      userId: user.id,
      roleId: user.roleId,
      firstName: user.firstName,
      lastName: user.lastName,
      loginTime,
      logId: log.id,
    });
  } catch (error) {
    console.error("Error in login:", error);
    return res.status(500).json({ message: "Failed to log in" });
  }
};

export const logout = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);
    if (accessToken) {
      await prisma.token.deleteMany({ where: { token: accessToken } });
    }
    return res.status(200).json({ message: "Logged out" });
  } catch (error) {
    console.error("Error in logout:", error);
    return res.status(500).json({ message: "Failed to log out" });
  }
};
