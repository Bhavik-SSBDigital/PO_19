const buildConnectSrc = () => {
  const origins = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);

  return ["'self'", ...origins].join(" ");
};

export const securityHeaders = (req, res, next) => {
  res.setHeader(
    "Strict-Transport-Security",
    "max-age=31536000; includeSubDomains; preload",
  );
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Referrer-Policy", "no-referrer");
  res.setHeader(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  );
  res.setHeader(
    "Content-Security-Policy",
    [
      "default-src 'self'",
      "base-uri 'self'",
      "object-src 'none'",
      "frame-ancestors 'none'",
      "script-src 'self'",
      "style-src 'self' 'unsafe-inline'",
      "img-src 'self' data: blob:",
      "font-src 'self' data:",
      `connect-src ${buildConnectSrc()}`,
      "form-action 'self'",
    ].join("; "),
  );

  next();
};

export const corsOptions = {
  origin(origin, callback) {
    const allowedOrigins = (process.env.CORS_ORIGINS || "")
      .split(",")
      .map((value) => value.trim())
      .filter(Boolean);

    if (
      !origin ||
      allowedOrigins.length === 0 ||
      allowedOrigins.includes(origin)
    ) {
      return callback(null, true);
    }

    return callback(new Error("Origin not allowed by CORS"));
  },
  credentials: true,
};
