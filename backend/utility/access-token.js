import { createHash } from "crypto";

/** Store only a one-way digest of bearer tokens in the database. */
export const hashAccessToken = (token) =>
  createHash("sha256").update(token, "utf8").digest("hex");
