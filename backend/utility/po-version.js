import { prisma } from "../lib/prisma.js";

export function parseSourceFileTs(value) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

export async function resolvePoHeader(poNumber, sourceFileTs, client = prisma) {
  const ts = parseSourceFileTs(sourceFileTs);
  if (ts) return client.poHeaderResult.findFirst({ where: { po_number: String(poNumber), source_file_ts: ts } });
  return client.poHeaderResult.findFirst({ where: { po_number: String(poNumber) }, orderBy: { source_file_ts: "desc" } });
}

export async function resolveAuditLine(poNumber, lineItem, sourceFileTs, client = prisma) {
  const where = { po_number: String(poNumber), po_line_item: String(lineItem) };
  const ts = parseSourceFileTs(sourceFileTs);
  if (ts) where.source_file_ts = ts;
  return client.auditResult.findFirst({ where, orderBy: ts ? undefined : { source_file_ts: "desc" } });
}

export const versionKey = (poNumber, sourceFileTs) =>
  `${poNumber || ""}\u0000${sourceFileTs instanceof Date ? sourceFileTs.toISOString() : sourceFileTs || ""}`;
