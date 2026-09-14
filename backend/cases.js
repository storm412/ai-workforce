const { getDb } = require("./database");

function cleanText(value) {
    if (value === undefined || value === null) {
        return "";
    }

    return String(value).trim();
}

function normalizeCaseStatus(status) {
    const value = cleanText(status).toLowerCase();

    const allowed = [
        "open",
        "investigating",
        "waiting",
        "resolved",
        "escalated",
        "closed"
    ];

    return allowed.includes(value)
        ? value
        : "open";
}

function getCaseById(businessId, id) {
    const db = getDb();

    return db.prepare(`
        SELECT
            c.*,
            cu.name AS customer_name,
            cu.email AS customer_email,
            o.product AS order_product,
            o.delivery_status,
            o.expected_delivery_date,
            o.tracking_number
        FROM cases c
        LEFT JOIN customers cu
            ON cu.business_id = c.business_id
           AND cu.customer_id = c.customer_id
        LEFT JOIN orders o
            ON o.business_id = c.business_id
           AND o.order_id = c.order_id
        WHERE c.business_id = ?
          AND c.id = ?
        LIMIT 1
    `).get(
        businessId,
        id
    );
}

function getCaseByCaseId(
    businessId,
    caseId
) {
    const db = getDb();

    return db.prepare(`
        SELECT
            c.*,
            cu.name AS customer_name,
            cu.email AS customer_email,
            o.product AS order_product,
            o.delivery_status,
            o.expected_delivery_date,
            o.tracking_number
        FROM cases c
        LEFT JOIN customers cu
            ON cu.business_id = c.business_id
           AND cu.customer_id = c.customer_id
        LEFT JOIN orders o
            ON o.business_id = c.business_id
           AND o.order_id = c.order_id
        WHERE c.business_id = ?
          AND c.case_id = ?
        LIMIT 1
    `).get(
        businessId,
        cleanText(caseId)
    );
}

function createCase(
    businessId,
    data
) {
    const db = getDb();

    const customerId =
        cleanText(data.customer_id);

    if (!customerId) {
        throw new Error(
            "Customer ID is required."
        );
    }

    const customer = db.prepare(`
        SELECT *
        FROM customers
        WHERE business_id = ?
          AND customer_id = ?
        LIMIT 1
    `).get(
        businessId,
        customerId
    );

    if (!customer) {
        throw new Error(
            "Customer not found in this business."
        );
    }

    const orderId =
        cleanText(data.order_id);

    if (orderId) {
        const order = db.prepare(`
            SELECT *
            FROM orders
            WHERE business_id = ?
              AND order_id = ?
            LIMIT 1
        `).get(
            businessId,
            orderId
        );

        if (!order) {
            throw new Error(
                "Order not found in this business."
            );
        }

        if (
            order.customer_id !== customerId
        ) {
            throw new Error(
                "The order does not belong to this customer."
            );
        }
    }

    const caseId =
        cleanText(data.case_id) ||
        `CASE-${Date.now()}`;

    const existing = getCaseByCaseId(
        businessId,
        caseId
    );

    if (existing) {
        throw new Error(
            "A case with this Case ID already exists."
        );
    }

    const problem =
        cleanText(data.problem) ||
        "Customer issue";

    const status =
        normalizeCaseStatus(
            data.status
        );

    const now =
        new Date().toISOString();

    const result = db.prepare(`
        INSERT INTO cases (
            business_id,
            case_id,
            customer_id,
            order_id,
            problem,
            status,
            ai_decision,
            resolution,
            escalation_reason,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        businessId,
        caseId,
        customerId,
        orderId || null,
        problem,
        status,
        cleanText(data.ai_decision),
        cleanText(data.resolution),
        cleanText(data.escalation_reason),
        now,
        now
    );

    const createdCase =
        getCaseById(
            businessId,
            result.lastInsertRowid
        );

    addCaseEvent(
        businessId,
        createdCase.id,
        {
            event_type: "case_created",
            actor_type: "system",
            description: "Case created."
        }
    );

    return getCaseById(
        businessId,
        createdCase.id
    );
}

function addCaseEvent(
    businessId,
    caseDatabaseId,
    data
) {
    const db = getDb();

    const existing = getCaseById(
        businessId,
        caseDatabaseId
    );

    if (!existing) {
        throw new Error(
            "Case not found."
        );
    }

    const eventType =
        cleanText(data.event_type) ||
        "case_event";

    const actorType =
        cleanText(data.actor_type) ||
        "system";

    const description =
        cleanText(data.description);

    const metadata =
        data.metadata
            ? JSON.stringify(data.metadata)
            : null;

    const now =
        new Date().toISOString();

    const result = db.prepare(`
        INSERT INTO case_events (
            business_id,
            case_id,
            event_type,
            actor_type,
            description,
            metadata,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
        businessId,
        existing.case_id,
        eventType,
        actorType,
        description,
        metadata,
        now
    );

    return db.prepare(`
        SELECT *
        FROM case_events
        WHERE business_id = ?
          AND id = ?
        LIMIT 1
    `).get(
        businessId,
        result.lastInsertRowid
    );
}

function getCaseHistory(
    businessId,
    caseId
) {
    const db = getDb();

    const existing =
        getCaseByCaseId(
            businessId,
            caseId
        );

    if (!existing) {
        throw new Error(
            "Case not found."
        );
    }

    const events = db.prepare(`
        SELECT *
        FROM case_events
        WHERE business_id = ?
          AND case_id = ?
        ORDER BY created_at ASC, id ASC
    `).all(
        businessId,
        existing.case_id
    );

    return {
        case: existing,
        events
    };
}

function updateCase(
    businessId,
    id,
    updates
) {
    const db = getDb();

    const existing =
        getCaseById(
            businessId,
            id
        );

    if (!existing) {
        throw new Error(
            "Case not found."
        );
    }

    const fields = [];
    const values = [];

    if (updates.problem !== undefined) {
        fields.push("problem = ?");
        values.push(
            cleanText(updates.problem)
        );
    }

    if (updates.status !== undefined) {
        fields.push("status = ?");
        values.push(
            normalizeCaseStatus(
                updates.status
            )
        );
    }

    if (
        updates.ai_decision !== undefined
    ) {
        fields.push(
            "ai_decision = ?"
        );
        values.push(
            cleanText(
                updates.ai_decision
            )
        );
    }

    if (
        updates.resolution !== undefined
    ) {
        fields.push(
            "resolution = ?"
        );
        values.push(
            cleanText(
                updates.resolution
            )
        );
    }

    if (
        updates.escalation_reason !== undefined
    ) {
        fields.push(
            "escalation_reason = ?"
        );
        values.push(
            cleanText(
                updates.escalation_reason
            )
        );
    }

    if (fields.length === 0) {
        return existing;
    }

    fields.push(
        "updated_at = ?"
    );

    values.push(
        new Date().toISOString()
    );

    values.push(
        businessId
    );

    values.push(id);

    db.prepare(`
        UPDATE cases
        SET ${fields.join(", ")}
        WHERE business_id = ?
          AND id = ?
    `).run(...values);

    return getCaseById(
        businessId,
        id
    );
}

function setCaseStatus(
    businessId,
    id,
    status,
    description
) {
    const updated =
        updateCase(
            businessId,
            id,
            {
                status
            }
        );

    addCaseEvent(
        businessId,
        id,
        {
            event_type:
                `status_changed_to_${normalizeCaseStatus(status)}`,
            actor_type: "system",
            description:
                description ||
                `Case status changed to ${normalizeCaseStatus(status)}.`
        }
    );

    return updated;
}

function recordAIDecision(
    businessId,
    id,
    decision,
    description
) {
    const updated =
        updateCase(
            businessId,
            id,
            {
                ai_decision: decision
            }
        );

    addCaseEvent(
        businessId,
        id,
        {
            event_type: "ai_decision",
            actor_type: "ai_worker",
            description:
                description ||
                decision,
            metadata: {
                decision
            }
        }
    );

    return updated;
}

function recordAction(
    businessId,
    id,
    actionName,
    result,
    metadata = {}
) {
    addCaseEvent(
        businessId,
        id,
        {
            event_type: "tool_action",
            actor_type: "ai_worker",
            description:
                `${actionName}: ${result}`,
            metadata: {
                action: actionName,
                result,
                ...metadata
            }
        }
    );

    return getCaseById(
        businessId,
        id
    );
}

function resolveCase(
    businessId,
    id,
    resolution,
    actorType = "ai_worker"
) {
    const cleanResolution =
        cleanText(resolution) ||
        "Case resolved.";

    const updated =
        updateCase(
            businessId,
            id,
            {
                status: "resolved",
                resolution:
                    cleanResolution
            }
        );

    addCaseEvent(
        businessId,
        id,
        {
            event_type: "case_resolved",
            actor_type: actorType,
            description:
                cleanResolution
        }
    );

    return updated;
}

function escalateCase(
    businessId,
    id,
    reason,
    details = {}
) {
    const cleanReason =
        cleanText(reason) ||
        "Case requires human review.";

    const updated =
        updateCase(
            businessId,
            id,
            {
                status: "escalated",
                escalation_reason:
                    cleanReason
            }
        );

    const db = getDb();

    const existing =
        getCaseById(
            businessId,
            id
        );

    const now =
        new Date().toISOString();

    db.prepare(`
        INSERT INTO human_escalations (
            business_id,
            case_id,
            reason,
            ai_investigation,
            ai_actions,
            human_next_step,
            status,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        businessId,
        existing.case_id,
        cleanReason,
        cleanText(
            details.ai_investigation
        ),
        details.ai_actions
            ? JSON.stringify(
                details.ai_actions
            )
            : null,
        cleanText(
            details.human_next_step
        ),
        "open",
        now,
        now
    );

    addCaseEvent(
        businessId,
        id,
        {
            event_type:
                "human_escalation_created",
            actor_type: "ai_worker",
            description:
                cleanReason,
            metadata: {
                escalation_reason:
                    cleanReason
            }
        }
    );

    return getCaseById(
        businessId,
        id
    );
}

function listCases(
    businessId,
    options = {}
) {
    const db = getDb();

    const limit = Math.min(
        Math.max(
            Number(options.limit) || 100,
            1
        ),
        500
    );

    const offset = Math.max(
        Number(options.offset) || 0,
        0
    );

    if (options.status) {
        return db.prepare(`
            SELECT
                c.*,
                cu.name AS customer_name,
                cu.email AS customer_email
            FROM cases c
            LEFT JOIN customers cu
                ON cu.business_id = c.business_id
               AND cu.customer_id = c.customer_id
            WHERE c.business_id = ?
              AND c.status = ?
            ORDER BY c.created_at DESC
            LIMIT ? OFFSET ?
        `).all(
            businessId,
            normalizeCaseStatus(
                options.status
            ),
            limit,
            offset
        );
    }

    return db.prepare(`
        SELECT
            c.*,
            cu.name AS customer_name,
            cu.email AS customer_email
        FROM cases c
        LEFT JOIN customers cu
            ON cu.business_id = c.business_id
           AND cu.customer_id = c.customer_id
        WHERE c.business_id = ?
        ORDER BY c.created_at DESC
        LIMIT ? OFFSET ?
    `).all(
        businessId,
        limit,
        offset
    );
}

function searchCases(
    businessId,
    searchTerm
) {
    const db = getDb();

    const term =
        `%${cleanText(searchTerm)}%`;

    return db.prepare(`
        SELECT
            c.*,
            cu.name AS customer_name,
            cu.email AS customer_email
        FROM cases c
        LEFT JOIN customers cu
            ON cu.business_id = c.business_id
           AND cu.customer_id = c.customer_id
        WHERE c.business_id = ?
          AND (
                c.case_id LIKE ?
                OR c.customer_id LIKE ?
                OR c.order_id LIKE ?
                OR c.problem LIKE ?
                OR c.status LIKE ?
                OR c.ai_decision LIKE ?
                OR c.resolution LIKE ?
                OR cu.name LIKE ?
                OR cu.email LIKE ?
          )
        ORDER BY c.created_at DESC
    `).all(
        businessId,
        term,
        term,
        term,
        term,
        term,
        term,
        term,
        term,
        term
    );
}

function countCases(
    businessId,
    status = null
) {
    const db = getDb();

    if (status) {
        const result = db.prepare(`
            SELECT COUNT(*) AS count
            FROM cases
            WHERE business_id = ?
              AND status = ?
        `).get(
            businessId,
            normalizeCaseStatus(status)
        );

        return result.count;
    }

    const result = db.prepare(`
        SELECT COUNT(*) AS count
        FROM cases
        WHERE business_id = ?
    `).get(
        businessId
    );

    return result.count;
}

function listEscalations(
    businessId,
    status = null
) {
    const db = getDb();

    if (status) {
        return db.prepare(`
            SELECT
                h.*,
                c.customer_id,
                c.order_id,
                c.problem,
                cu.name AS customer_name,
                cu.email AS customer_email
            FROM human_escalations h
            JOIN cases c
                ON c.business_id = h.business_id
               AND c.case_id = h.case_id
            LEFT JOIN customers cu
                ON cu.business_id = c.business_id
               AND cu.customer_id = c.customer_id
            WHERE h.business_id = ?
              AND h.status = ?
            ORDER BY h.created_at DESC
        `).all(
            businessId,
            cleanText(status)
        );
    }

    return db.prepare(`
        SELECT
            h.*,
            c.customer_id,
            c.order_id,
            c.problem,
            cu.name AS customer_name,
            cu.email AS customer_email
        FROM human_escalations h
        JOIN cases c
            ON c.business_id = h.business_id
           AND c.case_id = h.case_id
        LEFT JOIN customers cu
            ON cu.business_id = c.business_id
           AND cu.customer_id = c.customer_id
        WHERE h.business_id = ?
        ORDER BY h.created_at DESC
    `).all(
        businessId
    );
}

function resolveEscalation(
    businessId,
    escalationId,
    humanResolution
) {
    const db = getDb();

    const escalation = db.prepare(`
        SELECT *
        FROM human_escalations
        WHERE business_id = ?
          AND id = ?
        LIMIT 1
    `).get(
        businessId,
        escalationId
    );

    if (!escalation) {
        throw new Error(
            "Human escalation not found."
        );
    }

    const resolution =
        cleanText(humanResolution) ||
        "Human resolved the case.";

    const now =
        new Date().toISOString();

    db.prepare(`
        UPDATE human_escalations
        SET status = ?,
            human_next_step = ?,
            updated_at = ?
        WHERE business_id = ?
          AND id = ?
    `).run(
        "resolved",
        resolution,
        now,
        businessId,
        escalationId
    );

    const caseRecord =
        getCaseByCaseId(
            businessId,
            escalation.case_id
        );

    if (caseRecord) {
        updateCase(
            businessId,
            caseRecord.id,
            {
                status: "resolved",
                resolution
            }
        );

        addCaseEvent(
            businessId,
            caseRecord.id,
            {
                event_type:
                    "human_resolved_case",
                actor_type: "human",
                description:
                    resolution
            }
        );
    }

    return db.prepare(`
        SELECT *
        FROM human_escalations
        WHERE business_id = ?
          AND id = ?
        LIMIT 1
    `).get(
        businessId,
        escalationId
    );
}

function returnCaseToAI(
    businessId,
    escalationId
) {
    const db = getDb();

    const escalation = db.prepare(`
        SELECT *
        FROM human_escalations
        WHERE business_id = ?
          AND id = ?
        LIMIT 1
    `).get(
        businessId,
        escalationId
    );

    if (!escalation) {
        throw new Error(
            "Human escalation not found."
        );
    }

    const caseRecord =
        getCaseByCaseId(
            businessId,
            escalation.case_id
        );

    if (!caseRecord) {
        throw new Error(
            "Associated case not found."
        );
    }

    const now =
        new Date().toISOString();

    db.prepare(`
        UPDATE human_escalations
        SET status = ?,
            updated_at = ?
        WHERE business_id = ?
          AND id = ?
    `).run(
        "returned_to_ai",
        now,
        businessId,
        escalationId
    );

    updateCase(
        businessId,
        caseRecord.id,
        {
            status: "investigating"
        }
    );

    addCaseEvent(
        businessId,
        caseRecord.id,
        {
            event_type:
                "returned_to_ai",
            actor_type: "human",
            description:
                "Human returned the case to the AI Worker."
        }
    );

    return getCaseById(
        businessId,
        caseRecord.id
    );
}

module.exports = {
    createCase,
    getCaseById,
    getCaseByCaseId,
    addCaseEvent,
    getCaseHistory,
    updateCase,
    setCaseStatus,
    recordAIDecision,
    recordAction,
    resolveCase,
    escalateCase,
    listCases,
    searchCases,
    countCases,
    listEscalations,
    resolveEscalation,
    returnCaseToAI
};