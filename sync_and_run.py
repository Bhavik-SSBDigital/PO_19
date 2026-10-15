#!/usr/bin/env python3
"""
sync_and_run.py  (FIXED: empty RC files no longer block the batch)

Changes vs. the previous version:
  1. _has_data_rows(): detects RC files that contain only a header.
  2. run_batch(): if the RC file has no data rows, the merge into the
     cumulative RC master is SKIPPED (nothing new to merge) and the batch
     continues with the existing rc_master_cumulative.csv.
  3. last_known_rc.csv is only refreshed from RC files that have data.
  4. _run_or_raise() now has a default timeout (900s) so a hung child
     process can never hold the lock forever.
"""

import ftplib
import json
import logging
import re
import shutil
import subprocess
import sys
from datetime import datetime
from pathlib import Path

SYNC_DIR = Path(__file__).resolve().parent
INCOMING_DIR = SYNC_DIR / "incoming"
PROCESSED_DIR = SYNC_DIR / "processed"
FAILED_DIR = SYNC_DIR / "failed"
STATE_DIR = SYNC_DIR / "state"
OUTPUT_DIR = SYNC_DIR / "output"
LOG_DIR = SYNC_DIR / "logs"
STATE_FILE = STATE_DIR / "state.json"
LOCK_FILE = STATE_DIR / "sync.lock"
LAST_RC_FILE = STATE_DIR / "last_known_rc.csv"

for d in (INCOMING_DIR, PROCESSED_DIR, FAILED_DIR, STATE_DIR, OUTPUT_DIR, LOG_DIR):
    d.mkdir(parents=True, exist_ok=True)

LOG_FILE = LOG_DIR / f"sync_{datetime.now():%Y%m%d}.log"
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    handlers=[logging.FileHandler(LOG_FILE), logging.StreamHandler(sys.stdout)],
)
log = logging.getLogger("sync")


def load_env(path):
    cfg = {}
    if not path.exists():
        raise RuntimeError(
            f"Config file not found: {path}\n"
            f"Copy sync.env.example to sync.env and fill in real values."
        )
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            v = v.strip()
            if (v.startswith('"') and v.endswith('"')) or (v.startswith("'") and v.endswith("'")):
                v = v[1:-1]
            cfg[k.strip()] = v
    return cfg


CFG = load_env(SYNC_DIR / "sync.env")

PROTOCOL = CFG.get("PROTOCOL", "ftp").lower()
REMOTE_HOST = CFG["REMOTE_HOST"]
REMOTE_PORT = int(CFG.get("REMOTE_PORT", "21" if PROTOCOL == "ftp" else "22"))
REMOTE_USER = CFG["REMOTE_USER"]
REMOTE_PASS = CFG.get("REMOTE_PASS", "")
REMOTE_DIR = CFG["REMOTE_DIR"]

APP_DIR = Path(CFG.get("APP_DIR", "/P2P/PO_19"))
SAP_BASE_DIR = Path(CFG["SAP_BASE_DIR"])
NODE_BIN = CFG.get("NODE_BIN", "node")
PYTHON_BIN = CFG.get("PYTHON_BIN", "python3")

MATCH_TOLERANCE_MIN = int(CFG.get("MATCH_TOLERANCE_MINUTES", "30"))
RC_MATCH_TOLERANCE_MIN = int(CFG.get("RC_MATCH_TOLERANCE_MINUTES", "180"))
PRUNE_DB = CFG.get("PRUNE_DB", "false").lower() == "true"
CMD_TIMEOUT_SEC = int(CFG.get("CMD_TIMEOUT_SECONDS", "900"))

DWS_EXTRACT_ENABLED = CFG.get("DWS_EXTRACT_ENABLED", "true").lower() == "true"
DWS_EXTRACTOR = Path(CFG.get(
    "DWS_EXTRACTOR",
    str(APP_DIR / "backend" / "dws_rate_approval_extract.cjs"),
))
DWS_EXTRACTOR_TIMEOUT_SEC = int(CFG.get("DWS_EXTRACTOR_TIMEOUT_SECONDS", "180"))

FNAME_RE = re.compile(r"^(POAUDIT|POAUDITCND|POAUDITRC)_(\d{14})\.(csv|xlsx)$", re.IGNORECASE)


# ---------------------------------------------------------------------
# Remote connection helpers
# ---------------------------------------------------------------------
def list_remote_files():
    if PROTOCOL == "ftp":
        ftp = ftplib.FTP()
        ftp.connect(REMOTE_HOST, REMOTE_PORT, timeout=30)
        ftp.login(REMOTE_USER, REMOTE_PASS)
        ftp.cwd(REMOTE_DIR)
        names = ftp.nlst()
        return ftp, names
    elif PROTOCOL == "sftp":
        import paramiko
        transport = paramiko.Transport((REMOTE_HOST, REMOTE_PORT))
        transport.banner_timeout = 30
        transport.connect(username=REMOTE_USER, password=REMOTE_PASS)
        sftp = paramiko.SFTPClient.from_transport(transport)
        sftp.get_channel().settimeout(60)
        sftp.chdir(REMOTE_DIR)
        names = sftp.listdir()
        return sftp, names
    else:
        raise ValueError(f"Unknown PROTOCOL '{PROTOCOL}' in sync.env - use 'ftp' or 'sftp'")


def download_file(conn, remote_name, local_path):
    if PROTOCOL == "ftp":
        with open(local_path, "wb") as f:
            conn.retrbinary(f"RETR {remote_name}", f.write)
    else:
        conn.get(remote_name, str(local_path))


def close_conn(conn):
    if PROTOCOL == "ftp":
        try:
            conn.quit()
        except Exception:
            conn.close()
    else:
        conn.close()


def parse_fname(name):
    m = FNAME_RE.match(name)
    if not m:
        return None
    kind, ts, ext = m.groups()
    try:
        dt = datetime.strptime(ts, "%Y%m%d%H%M%S")
    except ValueError:
        return None
    return kind.upper(), dt, ext.lower()


def load_state():
    if STATE_FILE.exists():
        return json.loads(STATE_FILE.read_text())
    return {"seen_remote_files": [], "imported_batches": []}


def save_state(state):
    STATE_FILE.write_text(json.dumps(state, indent=2))


def sync_new_files(state):
    conn, remote_names = list_remote_files()
    seen = set(state["seen_remote_files"])
    new_names = sorted(n for n in remote_names if parse_fname(n) and n not in seen)

    downloaded = []
    for name in new_names:
        local_path = INCOMING_DIR / name
        log.info(f"Downloading {name} ...")
        try:
            download_file(conn, name, local_path)
            downloaded.append(name)
            state["seen_remote_files"].append(name)
        except Exception as e:
            log.error(f"  FAILED to download {name}: {e}")
    close_conn(conn)
    save_state(state)
    return downloaded


def scan_incoming():
    files = {"POAUDIT": [], "POAUDITCND": [], "POAUDITRC": []}
    for p in INCOMING_DIR.iterdir():
        if not p.is_file():
            continue
        parsed = parse_fname(p.name)
        if not parsed:
            continue
        kind, dt, _ext = parsed
        files[kind].append((dt, p))
    for k in files:
        files[k].sort(key=lambda x: x[0])
    return files


def find_nearest(target_dt, candidates, used, tolerance_minutes):
    best, best_diff = None, None
    for dt, path in candidates:
        if path in used:
            continue
        diff = abs((dt - target_dt).total_seconds())
        if diff <= tolerance_minutes * 60 and (best_diff is None or diff < best_diff):
            best, best_diff = (dt, path), diff
    return best


def build_batches(files):
    used = set()
    batches = []
    for dt, poaudit_path in files["POAUDIT"]:
        if poaudit_path in used:
            continue
        cnd_match = find_nearest(dt, files["POAUDITCND"], used, MATCH_TOLERANCE_MIN)
        if not cnd_match:
            continue
        used.add(poaudit_path)
        used.add(cnd_match[1])

        rc_match = find_nearest(dt, files["POAUDITRC"], used, RC_MATCH_TOLERANCE_MIN)
        rc_path, rc_is_cached = None, False
        if rc_match:
            used.add(rc_match[1])
            rc_path = rc_match[1]
        elif LAST_RC_FILE.exists():
            rc_path = LAST_RC_FILE
            rc_is_cached = True

        batches.append({
            "batch_id": dt.strftime("%Y%m%d_%H%M%S"),
            "poaudit": poaudit_path,
            "cnd": cnd_match[1],
            "rc": rc_path,
            "rc_is_cached": rc_is_cached,
        })
    return batches


# ---------------------------------------------------------------------
# NEW: empty-file detection
# ---------------------------------------------------------------------
def _has_data_rows(path):
    """True if a CSV has a header plus at least one non-blank data row."""
    try:
        with open(path, encoding="latin-1") as f:
            next(f, None)  # header
            return any(line.strip().strip(",;") for line in f)
    except Exception:
        return False


def _run_or_raise(cmd, cwd, timeout=CMD_TIMEOUT_SEC):
    log.info("  $ " + " ".join(str(c) for c in cmd))
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True, timeout=timeout)
    if result.stdout.strip():
        log.info(result.stdout)
    if result.returncode != 0:
        if result.stderr.strip():
            log.error(result.stderr)
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(str(c) for c in cmd)}")


def _run_dws_extractor(out_csv: Path) -> bool:
    if not DWS_EXTRACT_ENABLED:
        log.info("  DWS extractor disabled via sync.env (DWS_EXTRACT_ENABLED=false).")
        return False

    if not DWS_EXTRACTOR.exists():
        log.warning(f"  DWS extractor not found at {DWS_EXTRACTOR}; skipping (Point #8 will be Not Applicable).")
        return False

    try:
        log.info("  Running DWS Rate Approval extractor ...")
        _run_or_raise(
            [NODE_BIN, str(DWS_EXTRACTOR), "--out", str(out_csv)],
            cwd=DWS_EXTRACTOR.parent,
            timeout=DWS_EXTRACTOR_TIMEOUT_SEC,
        )
    except subprocess.TimeoutExpired:
        log.warning(f"  DWS extractor timed out after {DWS_EXTRACTOR_TIMEOUT_SEC}s; continuing without --dws.")
        return False
    except Exception as e:
        log.warning(f"  DWS extractor failed: {e}; continuing without --dws.")
        return False

    if not out_csv.exists():
        log.warning("  DWS extractor did not produce a CSV; continuing without --dws.")
        return False

    try:
        with open(out_csv) as f:
            line_count = sum(1 for _ in f)
    except Exception as e:
        log.warning(f"  Could not read DWS CSV: {e}")
        return False

    if line_count <= 1:
        log.warning("  DWS extractor produced 0 data rows; Point #8 will be Not Applicable for this batch.")
        return False

    log.info(f"  DWS extract OK - {line_count - 1} PO row(s) in {out_csv.name}")
    return True


def run_batch(batch, state):
    batch_id = batch["batch_id"]
    file_ts_match = re.match(r"^POAUDIT_(\d{14})\.csv$", batch["poaudit"].name, re.IGNORECASE)
    if not file_ts_match:
        raise RuntimeError(f"Cannot derive --file-ts from POAUDIT filename: {batch['poaudit'].name}")
    file_ts = file_ts_match.group(1)
    log.info(f"--- Running batch {batch_id} ---")

    if not batch["rc"]:
        log.warning(
            f"  No RC file available yet (none received, ever) - holding batch "
            f"{batch_id} back until one arrives."
        )
        return False

    masters_path = SAP_BASE_DIR / "Masters" / "TAX code Master - Working.xlsx"
    if not masters_path.exists():
        raise RuntimeError(
            f"Masters file not found at {masters_path}. Check SAP_BASE_DIR in sync.env - "
            f"it must be the folder that directly contains 'Masters/'."
        )

    work_dir = SAP_BASE_DIR / f"AutoBatch_{batch_id}"
    work_dir.mkdir(parents=True, exist_ok=True)

    poaudit_dst = work_dir / batch["poaudit"].name
    cnd_dst = work_dir / batch["cnd"].name
    shutil.copy2(batch["poaudit"], poaudit_dst)
    shutil.copy2(batch["cnd"], cnd_dst)

    rc_dst = work_dir / (batch["rc"].name if not batch["rc_is_cached"] else "POAUDITRC_cached.csv")
    shutil.copy2(batch["rc"], rc_dst)
    if batch["rc_is_cached"]:
        log.warning("  No fresh RC file for this batch - reusing last cached RC master.")

    out_dir = OUTPUT_DIR / batch_id
    out_dir.mkdir(parents=True, exist_ok=True)
    out_xlsx = out_dir / "audit_results.xlsx"
    addpo_json = out_dir / "audit_results_for_db.json"
    header_json = out_dir / "po_header_results_for_db.json"
    rc_json = out_dir / "rc_overlap_for_db.json"
    dws_csv = out_dir / "dws_rate_approval_for_po.csv"

    dws_args = []
    if _run_dws_extractor(dws_csv):
        dws_args = ["--dws", str(dws_csv)]
    else:
        log.info("  Proceeding without --dws - Point #8 will be Not Applicable for this batch.")

    # --- RC master merge (FIXED) --------------------------------------
    rc_master = APP_DIR / "data" / "rc_master_cumulative.csv"
    rc_has_rows = _has_data_rows(rc_dst)
    if rc_has_rows:
        _run_or_raise([NODE_BIN, "scripts/merge-rc-master.js", str(rc_dst)], cwd=APP_DIR)
    elif rc_master.exists():
        log.warning(
            "  RC file has no data rows (no new RCs) - skipping merge, "
            "using existing cumulative RC master."
        )
    else:
        raise RuntimeError(
            "RC file is empty and no cumulative RC master exists yet "
            f"({rc_master}) - cannot continue."
        )

    _run_or_raise(
        [
            PYTHON_BIN, str(APP_DIR / "engine.py"),
            "--poaudit", str(poaudit_dst),
            "--cnd", str(cnd_dst),
            "--rc", str(rc_master),
            "--po9-history", str(APP_DIR / "data" / "po9_history.csv"),
            *dws_args,
            "--out", str(out_xlsx),
            "--addpo-json", str(addpo_json),
            "--header-json", str(header_json),
            "--rc-json", str(rc_json),
        ],
        cwd=APP_DIR,
    )

    _run_or_raise([NODE_BIN, "addpo.js", str(addpo_json), "--file-ts", file_ts], cwd=APP_DIR)
    _run_or_raise([NODE_BIN, "addheader.js", str(header_json), "--file-ts", file_ts], cwd=APP_DIR)
    prune_flag = [] if PRUNE_DB else ["--no-prune"]
    _run_or_raise([NODE_BIN, "addrc.js", str(rc_json), *prune_flag], cwd=APP_DIR)

    # Only cache RC files that actually contain data
    if not batch["rc_is_cached"] and rc_has_rows:
        shutil.copy2(batch["rc"], LAST_RC_FILE)

    archive_dir = PROCESSED_DIR / batch_id
    archive_dir.mkdir(parents=True, exist_ok=True)
    for src in [batch["poaudit"], batch["cnd"]] + ([batch["rc"]] if not batch["rc_is_cached"] else []):
        shutil.move(str(src), str(archive_dir / src.name))
    shutil.rmtree(work_dir, ignore_errors=True)

    state["imported_batches"].append(batch_id)
    save_state(state)
    log.info(f"--- Batch {batch_id} completed successfully ---")
    return True


def main():
    state = load_state()

    downloaded = sync_new_files(state)
    log.info(f"Downloaded {len(downloaded)} new file(s) this run.")

    files = scan_incoming()
    batches = build_batches(files)
    if not batches:
        log.info("No complete batches ready to run (waiting on matching files).")
        return

    for batch in batches:
        if batch["batch_id"] in state["imported_batches"]:
            continue
        try:
            run_batch(batch, state)
        except Exception as e:
            log.error(f"  ERROR processing batch {batch['batch_id']}: {e}")
            log.error("  Leaving source files in place - will retry automatically next run.")


if __name__ == "__main__":
    import fcntl

    lock_fd = open(LOCK_FILE, "w")
    try:
        fcntl.flock(lock_fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        log.warning("Another sync run is already in progress - exiting.")
        sys.exit(0)

    try:
        main()
    except Exception:
        log.exception("Fatal error in sync run")
        sys.exit(1)
    finally:
        lock_fd.close()
