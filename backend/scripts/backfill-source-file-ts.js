#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import db, { prisma } from "../lib/prisma.js";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const dirIndex = args.indexOf("--processed-dir");
const processedDir = dirIndex >= 0 ? args[dirIndex + 1] : null;
if (!processedDir) {
  console.error("Usage: node scripts/backfill-source-file-ts.js --processed-dir /P2P/PO_19/sync/processed [--dry-run]");
  process.exit(1);
}

function timestampFromName(name) {
  const m = name.match(/^POAUDIT_(\d{14})\.csv$/i);
  if (!m) return null;
  const s = m[1];
  const [y, mo, d, h, mi, sec] = [s.slice(0,4),s.slice(4,6),s.slice(6,8),s.slice(8,10),s.slice(10,12),s.slice(12,14)].map(Number);
  const check = new Date(Date.UTC(y, mo - 1, d, h, mi, sec));
  if (check.getUTCFullYear() !== y || check.getUTCMonth() !== mo - 1 || check.getUTCDate() !== d || check.getUTCHours() !== h || check.getUTCMinutes() !== mi || check.getUTCSeconds() !== sec) return null;
  return new Date(Date.UTC(y, mo - 1, d, h - 5, mi - 30, sec));
}
function csvRows(text) {
  const rows=[]; let row=[], field="", quoted=false;
  for (let i=0;i<text.length;i++) {
    const c=text[i];
    if (quoted) { if (c==='"' && text[i+1]==='"') { field+='"'; i++; } else if (c==='"') quoted=false; else field+=c; }
    else if (c==='"') quoted=true;
    else if (c===',') { row.push(field); field=""; }
    else if (c==='\n') { row.push(field.replace(/\r$/, "")); rows.push(row); row=[]; field=""; }
    else field+=c;
  }
  if (field.length || row.length) { row.push(field.replace(/\r$/, "")); rows.push(row); }
  return rows;
}
// SAP identifiers are compared as trimmed strings; line values exported with
// a numeric decimal suffix (e.g. 10.0) are normalized to the engine's integer form.
const norm = (v, line=false) => {
  let s=String(v ?? "").trim();
  if (line) s=s.replace(/\.0+$/, "");
  return s;
};
function readArchive(dir) {
  const files=[];
  for (const entry of fs.readdirSync(dir, {withFileTypes:true})) {
    const p=path.join(dir,entry.name);
    if (entry.isDirectory()) files.push(...readArchive(p));
    else { const ts=timestampFromName(entry.name); if (ts) files.push({path:p,ts,name:entry.name}); }
  }
  return files.sort((a,b)=>a.ts-b.ts);
}
async function main() {
  const files=readArchive(processedDir);
  const latestLine=new Map(), latestHeader=new Map();
  for (const file of files) {
    const rows=csvRows(fs.readFileSync(file.path,"utf8"));
    if (!rows.length) continue;
    const headers=rows[0].map(x=>x.trim());
    const poIdx=headers.indexOf("PO number"), lineIdx=headers.indexOf("PO Line item");
    if (poIdx<0 || lineIdx<0) throw new Error(`Required PO number / PO Line item columns missing in ${file.path}`);
    for (const row of rows.slice(1)) {
      const po=norm(row[poIdx]), line=norm(row[lineIdx],true);
      if (!po) continue;
      latestHeader.set(po,file.ts);
      if (line) latestLine.set(`${po}\u0000${line}`,file.ts);
    }
  }
  const audit=await prisma.auditResult.findMany({select:{id:true,po_number:true,po_line_item:true,po_material_number:true,updatedAt:true,source_file_ts:true}});
  const headers=await prisma.poHeaderResult.findMany({select:{id:true,po_number:true,updatedAt:true,source_file_ts:true}});
  const remarks=await prisma.poHeaderRemark.findMany({select:{id:true,po_number:true,source_file_ts:true}});
  const batches=await prisma.syncBatchLog.findMany({select:{batchId:true,processedAt:true}});
  const batchDate=(b)=>{ const m=b.batchId.match(/^(\d{8})_(\d{6})$/); if(!m)return b.processedAt; return timestampFromName(`POAUDIT_${m[1]}${m[2]}.csv`) || b.processedAt; };
  const closest=(date)=>batches.reduce((best,b)=>!best||Math.abs(batchDate(b)-date)<Math.abs(batchDate(best)-date)?b:best,null);
  let lineArchive=0,lineFallback=0,headerArchive=0,headerFallback=0,remarkCount=0;
  const lineUpdates=[];
  for (const row of audit) {
    const po=norm(row.po_number), li=norm(row.po_line_item || (row.po_material_number||"").split("-").at(-1),true);
    let ts=latestLine.get(`${po}\u0000${li}`);
    if (ts) lineArchive++; else { const b=closest(row.updatedAt); ts=b?batchDate(b):row.updatedAt; lineFallback++; }
    lineUpdates.push({id:row.id,source_file_ts:ts});
  }
  const headerUpdates=[];
  for (const row of headers) {
    let ts=latestHeader.get(norm(row.po_number));
    if (ts) headerArchive++; else { const b=closest(row.updatedAt); ts=b?batchDate(b):row.updatedAt; headerFallback++; }
    headerUpdates.push({id:row.id,source_file_ts:ts});
  }
  for (const r of remarks) {
    const matching=headerUpdates[headers.findIndex(h=>h.po_number===r.po_number)];
    if (matching) { r.source_file_ts=matching.source_file_ts; remarkCount++; }
  }
  console.log(JSON.stringify({dryRun,processedFiles:files.length,auditRows:audit.length,headerRows:headers.length,remarksAssigned:remarkCount,auditFromArchive:lineArchive,auditFallback:lineFallback,headersFromArchive:headerArchive,headersFallback:headerFallback},null,2));
  if (!dryRun) {
    for (const u of lineUpdates) await prisma.auditResult.update({where:{id:u.id},data:{source_file_ts:u.source_file_ts}});
    for (const u of headerUpdates) await prisma.poHeaderResult.update({where:{id:u.id},data:{source_file_ts:u.source_file_ts}});
    for (const r of remarks) if (r.source_file_ts) await prisma.poHeaderRemark.update({where:{id:r.id},data:{source_file_ts:r.source_file_ts}});
    const [a,h,r]=await Promise.all([
      prisma.auditResult.count({where:{source_file_ts:null}}),
      prisma.poHeaderResult.count({where:{source_file_ts:null}}),
      prisma.poHeaderRemark.count({where:{source_file_ts:null}}),
    ]);
    console.log(`NULL source_file_ts check: audit=${a}, headers=${h}, headerRemarks=${r}`);
    if (a+h+r) process.exitCode=1;
  }
}
db().then(main).catch(e=>{console.error(e);process.exitCode=1;}).finally(async()=>{await prisma.$disconnect();});
