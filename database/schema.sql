PRAGMA foreign_keys = ON;

-- ============================================================
-- AI WORKFORCE V1 DATABASE
-- AI Customer Operations Worker
-- ============================================================

-- ------------------------------------------------------------
-- BUSINESSES
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS businesses (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ------------------------------------------------------------
-- USERS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    role TEXT NOT NULL DEFAULT 'owner'
        CHECK (role IN ('owner', 'admin', 'member')),
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (business_id)
        REFERENCES businesses(id)
        ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- WORKERS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS workers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,

    name TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'test', 'active', 'paused', 'disabled')),

    company_instructions TEXT NOT NULL DEFAULT '',
    tone_style TEXT NOT NULL DEFAULT 'Professional',

    allowed_find_customer INTEGER NOT NULL DEFAULT 1,
    allowed_find_order INTEGER NOT NULL DEFAULT 1,
    allowed_check_delivery INTEGER NOT NULL DEFAULT 1,
    allowed_update_case INTEGER NOT NULL DEFAULT 1,
    allowed_escalate INTEGER NOT NULL DEFAULT 1,

    escalation_rules TEXT NOT NULL DEFAULT '',
    customer_response_rules TEXT NOT NULL DEFAULT '',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (business_id)
        REFERENCES businesses(id)
        ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- KNOWLEDGE
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS knowledge (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    worker_id INTEGER,

    title TEXT NOT NULL,
    category TEXT NOT NULL DEFAULT 'General',
    content TEXT NOT NULL,

    priority INTEGER NOT NULL DEFAULT 0,
    active INTEGER NOT NULL DEFAULT 1,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (business_id)
        REFERENCES businesses(id)
        ON DELETE CASCADE,

    FOREIGN KEY (worker_id)
        REFERENCES workers(id)
        ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- TEACHING MATERIAL
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS teaching_material (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    worker_id INTEGER,

    type TEXT NOT NULL
        CHECK (type IN (
            'company_instruction',
            'response_example',
            'operating_rule'
        )),

    title TEXT NOT NULL,
    content TEXT NOT NULL,
    active INTEGER NOT NULL DEFAULT 1,

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (business_id)
        REFERENCES businesses(id)
        ON DELETE CASCADE,

    FOREIGN KEY (worker_id)
        REFERENCES workers(id)
        ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- CUSTOMERS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS customers (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,

    customer_id TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,

    phone TEXT DEFAULT '',
    address TEXT DEFAULT '',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (business_id, customer_id),

    FOREIGN KEY (business_id)
        REFERENCES businesses(id)
        ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- ORDERS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS orders (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,

    order_id TEXT NOT NULL,
    customer_id TEXT NOT NULL,

    product TEXT NOT NULL,
    order_date TEXT NOT NULL,

    delivery_status TEXT NOT NULL DEFAULT 'Processing'
        CHECK (
            delivery_status IN (
                'Processing',
                'Shipped',
                'In Transit',
                'Delayed',
                'Delivered',
                'Missing',
                'Cancelled'
            )
        ),

    expected_delivery TEXT DEFAULT '',
    tracking_number TEXT DEFAULT '',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (business_id, order_id),

    FOREIGN KEY (business_id)
        REFERENCES businesses(id)
        ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- CASES
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS cases (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    worker_id INTEGER,

    case_id TEXT NOT NULL,

    customer_id TEXT,
    order_id TEXT,

    problem TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'open'
        CHECK (
            status IN (
                'open',
                'investigating',
                'resolved',
                'escalated',
                'returned_to_ai',
                'closed'
            )
        ),

    ai_decision TEXT DEFAULT '',
    resolution TEXT DEFAULT '',
    escalation_reason TEXT DEFAULT '',

    customer_response TEXT DEFAULT '',

    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    resolved_at TEXT DEFAULT '',
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    UNIQUE (business_id, case_id),

    FOREIGN KEY (business_id)
        REFERENCES businesses(id)
        ON DELETE CASCADE,

    FOREIGN KEY (worker_id)
        REFERENCES workers(id)
        ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- CASE EVENTS / FULL CASE HISTORY
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS case_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    case_id INTEGER NOT NULL,

    event_type TEXT NOT NULL,

    actor_type TEXT NOT NULL
        CHECK (
            actor_type IN (
                'customer',
                'ai_worker',
                'human',
                'system'
            )
        ),

    description TEXT NOT NULL,

    tool_name TEXT DEFAULT '',
    action_result TEXT DEFAULT '',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (business_id)
        REFERENCES businesses(id)
        ON DELETE CASCADE,

    FOREIGN KEY (case_id)
        REFERENCES cases(id)
        ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- HUMAN ESCALATIONS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS human_escalations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    case_id INTEGER NOT NULL,

    reason TEXT NOT NULL,

    ai_investigation TEXT DEFAULT '',
    ai_actions TEXT DEFAULT '',

    human_next_step TEXT DEFAULT '',

    status TEXT NOT NULL DEFAULT 'open'
        CHECK (
            status IN (
                'open',
                'resolved',
                'returned_to_ai'
            )
        ),

    resolved_by INTEGER,
    resolved_at TEXT DEFAULT '',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (business_id)
        REFERENCES businesses(id)
        ON DELETE CASCADE,

    FOREIGN KEY (case_id)
        REFERENCES cases(id)
        ON DELETE CASCADE,

    FOREIGN KEY (resolved_by)
        REFERENCES users(id)
        ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- ACTIVITY / AUDIT LOG
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS activities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,

    case_id INTEGER,
    worker_id INTEGER,
    user_id INTEGER,

    activity_type TEXT NOT NULL,
    description TEXT NOT NULL,

    tool_name TEXT DEFAULT '',
    action TEXT DEFAULT '',
    result TEXT DEFAULT '',

    actor_type TEXT NOT NULL DEFAULT 'system'
        CHECK (
            actor_type IN (
                'ai_worker',
                'human',
                'system'
            )
        ),

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (business_id)
        REFERENCES businesses(id)
        ON DELETE CASCADE,

    FOREIGN KEY (case_id)
        REFERENCES cases(id)
        ON DELETE SET NULL,

    FOREIGN KEY (worker_id)
        REFERENCES workers(id)
        ON DELETE SET NULL,

    FOREIGN KEY (user_id)
        REFERENCES users(id)
        ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- INTEGRATIONS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS integrations (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,

    type TEXT NOT NULL
        CHECK (
            type IN (
                'email',
                'shopify',
                'ecommerce',
                'helpdesk',
                'shipping'
            )
        ),

    name TEXT NOT NULL,

    status TEXT NOT NULL DEFAULT 'disconnected'
        CHECK (
            status IN (
                'connected',
                'disconnected',
                'error',
                'paused'
            )
        ),

    configuration TEXT NOT NULL DEFAULT '{}',

    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,

    FOREIGN KEY (business_id)
        REFERENCES businesses(id)
        ON DELETE CASCADE
);

-- ------------------------------------------------------------
-- WORKER RUNS
-- ------------------------------------------------------------

CREATE TABLE IF NOT EXISTS worker_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    business_id INTEGER NOT NULL,
    worker_id INTEGER,
    case_id INTEGER,

    input_message TEXT NOT NULL,

    understanding TEXT DEFAULT '',
    investigation TEXT DEFAULT '',
    decision TEXT DEFAULT '',

    result TEXT DEFAULT '',

    status TEXT NOT NULL DEFAULT 'running'
        CHECK (
            status IN (
                'running',
                'resolved',
                'escalated',
                'failed'
            )
        ),

    started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    completed_at TEXT DEFAULT '',

    FOREIGN KEY (business_id)
        REFERENCES businesses(id)
        ON DELETE CASCADE,

    FOREIGN KEY (worker_id)
        REFERENCES workers(id)
        ON DELETE SET NULL,

    FOREIGN KEY (case_id)
        REFERENCES cases(id)
        ON DELETE SET NULL
);

-- ------------------------------------------------------------
-- INDEXES
-- ------------------------------------------------------------

CREATE INDEX IF NOT EXISTS idx_users_business
    ON users(business_id);

CREATE INDEX IF NOT EXISTS idx_workers_business
    ON workers(business_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_business
    ON knowledge(business_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_category
    ON knowledge(category);

CREATE INDEX IF NOT EXISTS idx_teaching_business
    ON teaching_material(business_id);

CREATE INDEX IF NOT EXISTS idx_customers_business
    ON customers(business_id);

CREATE INDEX IF NOT EXISTS idx_orders_business
    ON orders(business_id);

CREATE INDEX IF NOT EXISTS idx_orders_customer
    ON orders(business_id, customer_id);

CREATE INDEX IF NOT EXISTS idx_cases_business
    ON cases(business_id);

CREATE INDEX IF NOT EXISTS idx_cases_status
    ON cases(business_id, status);

CREATE INDEX IF NOT EXISTS idx_case_events_case
    ON case_events(case_id);

CREATE INDEX IF NOT EXISTS idx_escalations_business
    ON human_escalations(business_id);

CREATE INDEX IF NOT EXISTS idx_escalations_status
    ON human_escalations(business_id, status);

CREATE INDEX IF NOT EXISTS idx_activities_business
    ON activities(business_id);

CREATE INDEX IF NOT EXISTS idx_activities_case
    ON activities(case_id);

CREATE INDEX IF NOT EXISTS idx_worker_runs_business
    ON worker_runs(business_id);

CREATE INDEX IF NOT EXISTS idx_worker_runs_case
    ON worker_runs(case_id);

-- ============================================================
-- END OF AI WORKFORCE V1 DATABASE SCHEMA
-- ============================================================