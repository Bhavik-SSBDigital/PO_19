import bcrypt from "bcryptjs";
import crypto from "crypto";
import nodemailer from "nodemailer";
import { prisma } from "../lib/prisma.js";

/**
 * ============================================================
 * SMTP CONFIGURATION
 * ============================================================
 *
 * Uses the same SMTP server configuration as the current
 * project. No SMTP authentication block is required.
 */
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: parseInt(process.env.SMTP_PORT || "25"),
  secure: false,
  connectionTimeout: 10000,
  socketTimeout: 15000,
});

/**
 * ============================================================
 * EDIT USER
 * ============================================================
 *
 * IMPORTANT:
 * Password is intentionally NOT handled here.
 *
 * User password can only be changed through:
 *   - changePassword
 *   - forgotPassword
 *
 * Even if frontend sends a "password" field, it is ignored.
 */
export const editUser = async (req, res) => {
  try {
    const {
      id,
      _id,
      username,
      email,
      firstName,
      lastName,
      roleName,
      canViewDashboard,
      allowedAuditors,
      allowedModules,
    } = req.body;

    // Support both:
    //   req.params.id
    // and
    //   req.body.id / req.body._id
    const userId = req.params?.id || id || _id;

    if (!userId) {
      return res.status(400).json({
        message: "User ID is required",
      });
    }

    // --------------------------------------------------------
    // Check user exists
    // --------------------------------------------------------

    const existingUser = await prisma.user.findUnique({
      where: {
        id: userId,
      },
    });

    if (!existingUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const updateData = {};

    // --------------------------------------------------------
    // Username
    // --------------------------------------------------------

    if (username !== undefined) {
      const trimmedUsername =
        typeof username === "string" ? username.trim() : "";

      if (!trimmedUsername) {
        return res.status(400).json({
          message: "Username cannot be empty",
        });
      }

      const usernameExists = await prisma.user.findFirst({
        where: {
          username: trimmedUsername,
          NOT: {
            id: userId,
          },
        },
      });

      if (usernameExists) {
        return res.status(400).json({
          message: "Username already exists",
        });
      }

      updateData.username = trimmedUsername;
    }

    // --------------------------------------------------------
    // Email
    // --------------------------------------------------------

    if (email !== undefined) {
      const trimmedEmail = typeof email === "string" ? email.trim() : "";

      if (!trimmedEmail) {
        return res.status(400).json({
          message: "Email cannot be empty",
        });
      }

      updateData.email = trimmedEmail;
    }

    // --------------------------------------------------------
    // First name
    // --------------------------------------------------------

    if (firstName !== undefined) {
      updateData.firstName =
        typeof firstName === "string" ? firstName.trim() : "";
    }

    // --------------------------------------------------------
    // Last name
    // --------------------------------------------------------

    if (lastName !== undefined) {
      updateData.lastName = typeof lastName === "string" ? lastName.trim() : "";
    }

    // --------------------------------------------------------
    // Role
    // --------------------------------------------------------

    if (roleName !== undefined) {
      if (roleName === null || roleName === "") {
        updateData.roleId = null;
      } else {
        const role = await prisma.role.findUnique({
          where: {
            name: roleName,
          },
        });

        if (!role) {
          return res.status(400).json({
            message: `Role '${roleName}' not found`,
          });
        }

        updateData.roleId = role.id;
      }
    }

    // --------------------------------------------------------
    // Dashboard access
    // --------------------------------------------------------

    if (canViewDashboard !== undefined) {
      updateData.canViewDashboard = canViewDashboard;
    }

    // --------------------------------------------------------
    // Allowed auditors
    // --------------------------------------------------------

    if (allowedAuditors !== undefined) {
      updateData.allowedAuditors = Array.isArray(allowedAuditors)
        ? allowedAuditors
        : [];
    }

    // --------------------------------------------------------
    // Allowed modules
    // --------------------------------------------------------

    if (allowedModules !== undefined) {
      updateData.allowedModules = Array.isArray(allowedModules)
        ? allowedModules
        : [];
    }

    // --------------------------------------------------------
    // IMPORTANT:
    //
    // DO NOT UPDATE PASSWORD HERE.
    //
    // There is intentionally NO:
    //
    // updateData.password = ...
    //
    // Password is handled only by:
    //   changePassword()
    //   forgotPassword()
    // --------------------------------------------------------

    const updatedUser = await prisma.user.update({
      where: {
        id: userId,
      },
      data: updateData,
      include: {
        role: true,
      },
    });

    return res.status(200).json({
      message: "User updated successfully",
      user: {
        id: updatedUser.id,
        username: updatedUser.username,
        email: updatedUser.email,
        firstName: updatedUser.firstName,
        lastName: updatedUser.lastName,
        roleId: updatedUser.roleId,
        roleName: updatedUser.role?.name || null,
        canViewDashboard: updatedUser.canViewDashboard,
        allowedAuditors: updatedUser.allowedAuditors,
        allowedModules: updatedUser.allowedModules,
      },
    });
  } catch (error) {
    console.error("Error in editUser:", error);

    if (error?.code === "P2002") {
      return res.status(400).json({
        message: "Username already exists",
      });
    }

    return res.status(500).json({
      message: "Failed to update user",
    });
  }
};

/**
 * ============================================================
 * SIGNUP / CREATE USER
 * ============================================================
 *
 * IMPORTANT:
 * Admin NEVER provides a password.
 *
 * Backend:
 *   1. Generates random password
 *   2. Hashes password
 *   3. Stores hash
 *   4. Emails plaintext password to user
 */
export const signup = async (req, res) => {
  try {
    const { username, email, firstName, lastName, roleName, canViewDashboard } =
      req.body;

    const trimmedUsername = typeof username === "string" ? username.trim() : "";

    const trimmedEmail = typeof email === "string" ? email.trim() : "";

    if (!trimmedUsername || !trimmedEmail) {
      return res.status(400).json({
        message: "Username and email are required",
      });
    }

    // --------------------------------------------------------
    // Check duplicate username
    // --------------------------------------------------------

    const existingUser = await prisma.user.findFirst({
      where: {
        username: trimmedUsername,
      },
    });

    if (existingUser) {
      return res.status(400).json({
        message: "Username already exists",
      });
    }

    // --------------------------------------------------------
    // Find role
    // --------------------------------------------------------

    let role = null;

    if (roleName) {
      role = await prisma.role.findFirst({
        where: {
          name: roleName,
        },
      });

      if (!role) {
        return res.status(400).json({
          message: `Role '${roleName}' not found`,
        });
      }
    }

    // ========================================================
    // ALWAYS GENERATE PASSWORD
    // ========================================================

    const generatedPassword = crypto.randomBytes(9).toString("base64url");

    const hashedPassword = await bcrypt.hash(generatedPassword, 10);

    // --------------------------------------------------------
    // Create user
    // --------------------------------------------------------

    const user = await prisma.user.create({
      data: {
        username: trimmedUsername,
        email: trimmedEmail,
        password: hashedPassword,

        firstName: typeof firstName === "string" ? firstName.trim() : "",

        lastName: typeof lastName === "string" ? lastName.trim() : "",

        roleId: role?.id || null,

        canViewDashboard: canViewDashboard ?? true,
      },
    });

    // ========================================================
    // SEND GENERATED CREDENTIALS
    // ========================================================

    const mailOptions = {
      from: process.env.SMTP_FROM || '"AIA Audit System" <no-reply@aia.com>',

      to: user.email,

      subject: "Your AIA Audit account credentials",

      text: `Hello ${user.firstName},

Your AIA Audit account has been created successfully.

Your login credentials are:

Username: ${user.username}
Password: ${generatedPassword}

Please log in using these credentials and change your password after logging in.

Regards,
AIA Audit System`,
    };

    try {
      await transporter.sendMail(mailOptions);

      console.log(`User credentials email sent successfully to ${user.email}`);
    } catch (mailError) {
      console.error("Failed to send user credentials email:", mailError);

      // User remains created.
      // Never return the generated password in API response.

      return res.status(201).json({
        message:
          "User created successfully, but credentials email could not be sent",
        userId: user.id,
      });
    }

    return res.status(201).json({
      message: "User created successfully and credentials emailed",
      userId: user.id,
    });
  } catch (error) {
    console.error("Error in signup:", error);

    if (error?.code === "P2002") {
      return res.status(400).json({
        message: "Username already exists",
      });
    }

    return res.status(500).json({
      message: "Failed to create user",
    });
  }
};

/**
 * ============================================================
 * GET USERS
 * ============================================================
 */
export const get_users = async (req, res) => {
  try {
    const users = await prisma.user.findMany({
      include: {
        role: true,
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    const formattedUsers = users.map((user) => ({
      id: user.id,
      _id: user.id,

      firstName: user.firstName,
      lastName: user.lastName,

      email: user.email,
      username: user.username,

      canViewDashboard: user.canViewDashboard,

      roleId: user.roleId,
      roleName: user.role?.name || null,

      isAdmin: user.role?.isAdmin || false,

      isBuyer: user.role?.isBuyer || false,

      isProcurementManager: user.role?.isProcurementManager || false,
    }));

    return res.status(200).json({
      data: formattedUsers,
    });
  } catch (error) {
    console.error("Error fetching users:", error);

    return res.status(500).json({
      message: "Failed to fetch users",
    });
  }
};

/**
 * ============================================================
 * CHANGE PASSWORD
 * ============================================================
 *
 * This is the ONLY normal password-change endpoint.
 */
export const changePassword = async (req, res) => {
  try {
    const { username, currentPassword, newPassword, confirmPassword } =
      req.body;

    if (!username || !currentPassword || !newPassword || !confirmPassword) {
      return res.status(400).json({
        message: "All fields are required",
      });
    }

    if (newPassword !== confirmPassword) {
      return res.status(400).json({
        message: "New password and confirm password do not match",
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        username,
      },
    });

    if (!user) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);

    if (!isMatch) {
      return res.status(400).json({
        message: "Current password is incorrect",
      });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        password: hashedPassword,
      },
    });

    return res.status(200).json({
      message: "Password changed successfully",
    });
  } catch (error) {
    console.error("Error changing password:", error);

    return res.status(500).json({
      message: "Failed to change password",
    });
  }
};

/**
 * ============================================================
 * FORGOT PASSWORD
 * ============================================================
 *
 * Flow:
 *
 *   username + email
 *          ↓
 *   verify same user
 *          ↓
 *   generate new password
 *          ↓
 *   bcrypt hash
 *          ↓
 *   update DB
 *          ↓
 *   email new password
 */
export const forgotPassword = async (req, res) => {
  try {
    const { username, email } = req.body;

    const trimmedUsername = typeof username === "string" ? username.trim() : "";

    const trimmedEmail = typeof email === "string" ? email.trim() : "";

    if (!trimmedUsername || !trimmedEmail) {
      return res.status(400).json({
        message: "Username and email are required",
      });
    }

    // --------------------------------------------------------
    // Verify username + email belong to same user
    // --------------------------------------------------------

    const user = await prisma.user.findFirst({
      where: {
        username: trimmedUsername,
        email: trimmedEmail,
      },
    });

    if (!user) {
      return res.status(400).json({
        message: "Username and email do not match",
      });
    }

    // ========================================================
    // ALWAYS GENERATE NEW PASSWORD
    // ========================================================

    const newPlainPassword = crypto.randomBytes(9).toString("base64url");

    const hashedPassword = await bcrypt.hash(newPlainPassword, 10);

    // --------------------------------------------------------
    // Update password
    // --------------------------------------------------------

    await prisma.user.update({
      where: {
        id: user.id,
      },
      data: {
        password: hashedPassword,
      },
    });

    // ========================================================
    // SEND NEW CREDENTIALS
    // ========================================================

    const mailOptions = {
      from: process.env.SMTP_FROM || '"AIA Audit System" <no-reply@aia.com>',

      to: user.email,

      subject: "Your AIA Audit password has been reset",

      text: `Hello ${user.firstName},

Your AIA Audit password has been reset successfully.

Your new login credentials are:

Username: ${user.username}
Password: ${newPlainPassword}

Please log in using these credentials and change your password after logging in.

Regards,
AIA Audit System`,
    };

    try {
      await transporter.sendMail(mailOptions);

      console.log(`Password reset email sent successfully to ${user.email}`);
    } catch (mailError) {
      console.error("Failed to send password reset email:", mailError);

      return res.status(500).json({
        message:
          "Password was reset, but the credentials email could not be sent. Please contact the administrator.",
      });
    }

    return res.status(200).json({
      message:
        "Password reset successfully. New credentials have been sent to your email.",
    });
  } catch (error) {
    console.error("Error in forgotPassword:", error);

    return res.status(500).json({
      message: "Failed to reset password",
    });
  }
};

/**
 * ============================================================
 * GET ROLES
 * ============================================================
 */
export const getRoles = async (req, res) => {
  try {
    const roles = await prisma.role.findMany({
      orderBy: {
        name: "asc",
      },
    });

    return res.status(200).json(roles);
  } catch (error) {
    console.error("Error fetching roles:", error);

    return res.status(500).json({
      message: "Failed to fetch roles",
    });
  }
};

/**
 * ============================================================
 * LOGIN
 * ============================================================
 */
export const login = async (req, res) => {
  try {
    const rawUsername = req.body.username;
    const rawPassword = req.body.password;

    const username =
      typeof rawUsername === "string" ? rawUsername.trim() : rawUsername;

    const password =
      typeof rawPassword === "string" ? rawPassword.trim() : rawPassword;

    if (!username || !password) {
      return res.status(400).json({
        message: "Username and password are required",
      });
    }

    const user = await prisma.user.findFirst({
      where: {
        username,
      },
      include: {
        role: true,
      },
    });

    console.log("LOGIN USERNAME:", JSON.stringify(username));

    console.log("USER FOUND:", !!user);

    if (!user) {
      return res.status(401).json({
        message: "Invalid username or password",
      });
    }

    const passwordMatches = await bcrypt.compare(password, user.password);

    console.log("USER ID:", user.id);

    console.log("DB USERNAME:", JSON.stringify(user.username));

    console.log("PASSWORD MATCH:", passwordMatches);

    if (!passwordMatches) {
      return res.status(401).json({
        message: "Invalid username or password",
      });
    }

    // --------------------------------------------------------
    // Create access token
    // --------------------------------------------------------

    const accessToken = crypto.randomBytes(32).toString("hex");

    await prisma.token.create({
      data: {
        token: accessToken,
        userId: user.id,
      },
    });

    // --------------------------------------------------------
    // Create login log
    // --------------------------------------------------------

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

      isAdmin: !!user.role?.isAdmin,

      isBuyer: !!user.role?.isBuyer,

      isProcurementManager: !!user.role?.isProcurementManager,

      name: `${user.firstName} ${user.lastName}`,

      email: user.email,

      userName: user.username,

      canViewDashboard: user.canViewDashboard,

      userId: user.id,

      roleId: user.roleId,

      firstName: user.firstName,

      lastName: user.lastName,

      loginTime,

      logId: log.id,
    });
  } catch (error) {
    console.error("Error in login:", error);

    return res.status(500).json({
      message: "Failed to log in",
    });
  }
};

/**
 * ============================================================
 * LOGOUT
 * ============================================================
 */
export const logout = async (req, res) => {
  try {
    const accessToken = req.headers["authorization"]?.substring(7);

    if (accessToken) {
      await prisma.token.deleteMany({
        where: {
          token: accessToken,
        },
      });
    }

    return res.status(200).json({
      message: "Logged out",
    });
  } catch (error) {
    console.error("Error in logout:", error);

    return res.status(500).json({
      message: "Failed to log out",
    });
  }
};

/**
 * ============================================================
 * DELETE USER
 * ============================================================
 */
export const deleteUser = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({
        message: "User ID is required",
      });
    }

    // --------------------------------------------------------
    // Check user exists
    // --------------------------------------------------------

    const existingUser = await prisma.user.findUnique({
      where: {
        id,
      },
    });

    if (!existingUser) {
      return res.status(404).json({
        message: "User not found",
      });
    }

    // --------------------------------------------------------
    // Delete user
    // --------------------------------------------------------

    await prisma.user.delete({
      where: {
        id,
      },
    });

    return res.status(200).json({
      message: "User deleted successfully",
    });
  } catch (error) {
    console.error("Error in deleteUser:", error);

    return res.status(500).json({
      message: "Failed to delete user",
    });
  }
};
