-- ============================================================================
-- AIA_P2P_AUDIT — Postgres schema
--
-- NOTE: prisma/schema.prisma is now the canonical source of truth for this
-- database (run `npx prisma db push` to create/update tables from it). This
-- file is kept as a plain-SQL, DBA-readable mirror of the same design for
-- review purposes — don't apply both against the same database, they will
-- drift over time if edited independently.
--
-- Converted from the Mongoose models in models.zip.
-- Nested/array sub-documents that don't need independent querying are kept
-- as JSONB (fast to migrate, matches the app's existing read/write shape).
-- Anything the app needs to filter/join on (roles, users, workflow steps,
-- PR/PO audit line items) is a proper relational column instead.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ---------------------------------------------------------------------------
-- roles  (models/role.js)
-- ---------------------------------------------------------------------------
CREATE TABLE roles (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name            VARCHAR(100) NOT NULL UNIQUE,
    is_audit_head   BOOLEAN NOT NULL DEFAULT FALSE,
    is_admin        BOOLEAN NOT NULL DEFAULT FALSE,
    is_auditor      BOOLEAN NOT NULL DEFAULT FALSE,
    is_executor     BOOLEAN NOT NULL DEFAULT FALSE,
    from_ssbd       BOOLEAN NOT NULL DEFAULT FALSE
);

-- ---------------------------------------------------------------------------
-- users  (models/user.js)
-- ---------------------------------------------------------------------------
CREATE TABLE users (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    username            VARCHAR(150) NOT NULL UNIQUE,
    email               VARCHAR(255) NOT NULL,
    password            VARCHAR(255) NOT NULL,
    first_name          VARCHAR(150) NOT NULL,
    last_name           VARCHAR(150) NOT NULL,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    allowed_auditors    TEXT[] NOT NULL DEFAULT '{}',
    role_id             UUID REFERENCES roles(id),
    allowed_modules     TEXT[] NOT NULL DEFAULT '{}',   -- subset of BPV, PJV, PO, NONPO
    can_view_dashboard  BOOLEAN NOT NULL DEFAULT TRUE,
    CONSTRAINT chk_allowed_modules CHECK (
        allowed_modules <@ ARRAY['BPV','PJV','PO','NONPO']::TEXT[]
    )
);
CREATE INDEX idx_users_role_id ON users(role_id);

-- ---------------------------------------------------------------------------
-- tokens  (models/token.js)
-- ---------------------------------------------------------------------------
CREATE TABLE tokens (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    token       TEXT NOT NULL,
    user_id     UUID REFERENCES users(id) ON DELETE CASCADE,
    expires_at  TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '30 days')
);
CREATE INDEX idx_tokens_user_id ON tokens(user_id);

-- ---------------------------------------------------------------------------
-- logs  (models/log.js) — login/logout audit trail
-- ---------------------------------------------------------------------------
CREATE TABLE logs (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id     UUID REFERENCES users(id),
    first_name  VARCHAR(150) NOT NULL,
    last_name   VARCHAR(150) NOT NULL,
    role_id     UUID REFERENCES roles(id),
    login_time  TIMESTAMPTZ,
    logout_time TIMESTAMPTZ
);

-- ---------------------------------------------------------------------------
-- points  (models/points.js) — the master audit-point catalogue (BPV/PJV/PO/NONPO)
-- ---------------------------------------------------------------------------
CREATE TABLE points (
    id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    point_no    INTEGER NOT NULL,
    description TEXT NOT NULL,
    type        VARCHAR(10) NOT NULL DEFAULT 'PJV' CHECK (type IN ('BPV','PJV','PO','NONPO')),
    high        BOOLEAN NOT NULL DEFAULT FALSE,
    medium      BOOLEAN NOT NULL DEFAULT FALSE,
    low         BOOLEAN NOT NULL DEFAULT FALSE,
    UNIQUE (point_no, type)
);

-- ---------------------------------------------------------------------------
-- audit_results  (models/audit_result.js) — the core transaction/audit table
-- ---------------------------------------------------------------------------
CREATE TABLE audit_results (
    id                          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_date               DATE,
    type                        VARCHAR(10) NOT NULL DEFAULT 'PJV' CHECK (type IN ('BPV','PJV','PO','NONPO')),
    reference                   VARCHAR(255),
    object_key                  VARCHAR(255),
    document_number             VARCHAR(100),
    process_documents           JSONB NOT NULL DEFAULT '[]',   -- [{name,url,originalName,path,signatures:[...]}]
    vendor_title                VARCHAR(255) DEFAULT '',
    document_name               VARCHAR(255),
    document_names              TEXT[] NOT NULL DEFAULT '{}',
    vendor                      VARCHAR(100),
    advance                     BOOLEAN NOT NULL DEFAULT FALSE,
    amount                      VARCHAR(50),
    amount_currency             VARCHAR(10),
    tax_code_bpv                VARCHAR(20),   -- generic BPV/PJV tax code (mongoose field "taxCode") - distinct from the PO-specific tax_code column below
    gstin_of_vendor             VARCHAR(30),
    name_of_vendor              VARCHAR(255),
    fiscal_year                 VARCHAR(10),
    grr_nos_against_invoice     TEXT[] NOT NULL DEFAULT '{}',
    product_details_per_grr     JSONB NOT NULL DEFAULT '[]',   -- line_item_no, grr_no, description, quantity, unit, po_no, ...
    procurement_data            TEXT,
    imported                    BOOLEAN,

    -- per-audit-point results — kept as JSONB (variable, point-set differs by `type`)
    -- shape: [{pointNo, remarks:[...], verified, missing_data, not_applicable, advance, manual_verification}]
    results                     JSONB NOT NULL DEFAULT '[]',

    audited_on                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- NOTE: no FK to verification_workflows here. Unlike the mongoose model
    -- (which stored a `verificationWorkflow` ref directly on AuditResult),
    -- the relational design keeps a single FK on verification_workflows.audit_result_id
    -- (below) and reaches AuditResult -> workflow via a reverse lookup/join,
    -- which avoids a circular-FK creation order and matches schema.prisma.

    -- PO-specific columns (used by the PO audit module / addpo.js)
    po_number                          VARCHAR(50),
    purchase_req                       VARCHAR(50),
    pr_create_date                     DATE,
    po_created_date                    DATE,
    po_delivery_date                   DATE,
    vendor_code                        VARCHAR(30),
    name                                VARCHAR(255),
    gstin                               VARCHAR(30),
    tax_code                            VARCHAR(20),
    tax_code_description                VARCHAR(255),
    payment_term                        VARCHAR(20),
    payt_terms_description              VARCHAR(255),
    special_payment_terms               VARCHAR(255),
    train_station                       VARCHAR(255),
    pr_quantity                         NUMERIC(18,3),
    po_qty                              NUMERIC(18,3),
    under_delivery_tolerance_other_than_ea VARCHAR(50),
    unit_of_measure                     VARCHAR(20),
    material_code                       VARCHAR(50),
    material_disc                       VARCHAR(255),
    plant                               VARCHAR(20),
    net_value                           VARCHAR(50),
    hsn_code                            VARCHAR(20),
    inco_term                           VARCHAR(10),
    doc_cond_no                         VARCHAR(50),
    condition_type                      TEXT[] NOT NULL DEFAULT '{}',
    condition_value                     TEXT[] NOT NULL DEFAULT '{}',
    po_material_number                  VARCHAR(100),
    manual                               BOOLEAN NOT NULL DEFAULT FALSE,

    -- BPV/PJV specific
    invoice_type                        VARCHAR(50),
    bpv_po                               VARCHAR(50),
    dump_files                           TEXT[] NOT NULL DEFAULT '{}',
    pjv_invoice_ref_doc                  VARCHAR(100),
    pjv_invoice_ref_docs                 TEXT[] NOT NULL DEFAULT '{}',
    with_holding_tax_rate                VARCHAR(20),
    special_gl_indicator                 VARCHAR(20),

    created_at                          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_audit_results_po_number ON audit_results(po_number);
CREATE INDEX idx_audit_results_po_material_number ON audit_results(po_material_number);
CREATE INDEX idx_audit_results_type ON audit_results(type);
CREATE INDEX idx_audit_results_vendor_code ON audit_results(vendor_code);
CREATE INDEX idx_audit_results_fiscal_year ON audit_results(fiscal_year);
CREATE INDEX idx_audit_results_results_gin ON audit_results USING GIN (results);

-- ---------------------------------------------------------------------------
-- verification_workflows  (models/verificationWorkflow.js)
-- ---------------------------------------------------------------------------
CREATE TABLE verification_workflows (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    audit_result_id     UUID NOT NULL UNIQUE REFERENCES audit_results(id) ON DELETE CASCADE,
    closed_by           UUID REFERENCES users(id),
    closed_on           TIMESTAMPTZ,
    auditor_who_closed  VARCHAR(150),
    current_status      VARCHAR(20) NOT NULL DEFAULT 'unassigned'
        CHECK (current_status IN ('unassigned','assigned','under_review','head_review','completed')),
    assigned_to         UUID REFERENCES users(id)
);

CREATE TABLE verification_workflow_steps (
    id                      UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    verification_workflow_id UUID NOT NULL REFERENCES verification_workflows(id) ON DELETE CASCADE,
    action                  VARCHAR(20) NOT NULL
        CHECK (action IN ('assigned','self-assigned','submitted','approved','rejected','reassigned')),
    user_id                 UUID NOT NULL REFERENCES users(id),
    timestamp               TIMESTAMPTZ NOT NULL DEFAULT now(),
    details                 JSONB
);
CREATE INDEX idx_workflow_steps_workflow_id ON verification_workflow_steps(verification_workflow_id);

-- ---------------------------------------------------------------------------
-- manual_verifications  (models/manualVerification.js)
-- ---------------------------------------------------------------------------
CREATE TABLE manual_verifications (
    id                  UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    audit_result_id     UUID NOT NULL REFERENCES audit_results(id) ON DELETE CASCADE,
    -- results: [{pointNo, ssbdWorkStatus, manualVerified, manualMissingData, manualRemarks:[...],
    --            headRemarks:[...], conversation:[{remarks, addedBy, addedByUser, addedOn, auditorName, ssbdWorkStatus}]}]
    results             JSONB NOT NULL DEFAULT '[]',
    verified_by         UUID REFERENCES users(id),
    verified_on         TIMESTAMPTZ,
    verification_status VARCHAR(20) NOT NULL DEFAULT 'pending'
        CHECK (verification_status IN ('pending','submitted','approved','rejected')),
    auditor_name        VARCHAR(150)
);
CREATE INDEX idx_manual_verifications_audit_result_id ON manual_verifications(audit_result_id);

-- ---------------------------------------------------------------------------
-- audit_result_analytics  (models/auditResultAnalytics.js)
-- ---------------------------------------------------------------------------
CREATE TABLE audit_result_analytics (
    id                              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    no_of_high_risk_result          INTEGER NOT NULL DEFAULT 0,
    no_of_medium_risk_result        INTEGER NOT NULL DEFAULT 0,
    no_of_low_risk_result           INTEGER NOT NULL DEFAULT 0,
    no_of_result_with_no_variations INTEGER NOT NULL DEFAULT 0,
    no_of_total_transactions        INTEGER NOT NULL DEFAULT 0,
    date                            DATE
);

-- ---------------------------------------------------------------------------
-- po_process_details  (models/po_process_details.js)
-- ---------------------------------------------------------------------------
CREATE TABLE po_process_details (
    id              UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    po_number       VARCHAR(50) NOT NULL,
    process_id      VARCHAR(100) NOT NULL,
    process_name    VARCHAR(255),
    process_tag     VARCHAR(100),
    status          VARCHAR(10) NOT NULL DEFAULT 'SYNCED' CHECK (status IN ('PENDING','SYNCED','FAILED')),
    documents       JSONB NOT NULL DEFAULT '[]',   -- [{name, path, url, signatures:[...]}]
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    sync_attempts   INTEGER NOT NULL DEFAULT 1,
    last_sync_error TEXT
);
CREATE INDEX idx_po_process_details_po_number ON po_process_details(po_number);
CREATE INDEX idx_po_process_details_process_tag ON po_process_details(process_tag);
CREATE INDEX idx_po_process_details_po_tag ON po_process_details(po_number, process_tag);

-- ---------------------------------------------------------------------------
-- updated_at trigger helper (used on audit_results)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at() RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_results_updated_at
BEFORE UPDATE ON audit_results
FOR EACH ROW EXECUTE FUNCTION set_updated_at();
