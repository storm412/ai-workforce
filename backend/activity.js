const { getDb } = require("./database");

function cleanText(value) {
    if (value === undefined || value === null) {
        return "";
    }

    return String(value).trim();
}

function createActivity(businessId, data) {
    const db = getDb();

    const activityType =
        cleanText(data.activity_type) ||
        "system";

    const actorType =
        cleanText(data.actor_type) ||
        "system";

    const title =
        cleanText(data.title) ||
        "Activity";

    const description =
        cleanText(data.description);

    const caseId =
        cleanText(data.case_id) || null;

    const customerId =
        cleanText(data.customer_id) || null;

    const orderId =
        cleanText(data.order_id) || null;

    const metadata =
        data.metadata
            ? JSON.stringify(data.metadata)
            : null;

    const now =
        new Date().toISOString();

    const result = db.prepare(`
        INSERT INTO activities (
            business_id,
            activity_type,
            actor_type,
            title,
            description,
            case_id,
            customer_id,
            order_id,
            metadata,
            created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        businessId,
        activityType,
        actorType,
        title,
        description,
        caseId,
        customerId,
        orderId,
        metadata,
        now
    );

    return getActivityById(
        businessId,
        result.lastInsertRowid
    );
}

function getActivityById(
    businessId,
    id
) {
    const db = getDb();

    return db.prepare(`
        SELECT *
        FROM activities
        WHERE business_id = ?
          AND id = ?
        LIMIT 1
    `).get(
        businessId,
        id
    );
}

function listActivities(
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

    const conditions = [
        "business_id = ?"
    ];

    const values = [
        businessId
    ];

    if (options.activity_type) {
        conditions.push(
            "activity_type = ?"
        );

        values.push(
            cleanText(
                options.activity_type
            )
        );
    }

    if (options.actor_type) {
        conditions.push(
            "actor_type = ?"
        );

        values.push(
            cleanText(
                options.actor_type
            )
        );
    }

    if (options.case_id) {
        conditions.push(
            "case_id = ?"
        );

        values.push(
            cleanText(
                options.case_id
            )
        );
    }

    if (options.customer_id) {
        conditions.push(
            "customer_id = ?"
        );

        values.push(
            cleanText(
                options.customer_id
            )
        );
    }

    if (options.order_id) {
        conditions.push(
            "order_id = ?"
        );

        values.push(
            cleanText(
                options.order_id
            )
        );
    }

    values.push(
        limit,
        offset
    );

    return db.prepare(`
        SELECT *
        FROM activities
        WHERE ${conditions.join(" AND ")}
        ORDER BY created_at DESC, id DESC
        LIMIT ? OFFSET ?
    `).all(...values);
}

function searchActivities(
    businessId,
    searchTerm
) {
    const db = getDb();

    const term =
        `%${cleanText(searchTerm)}%`;

    return db.prepare(`
        SELECT *
        FROM activities
        WHERE business_id = ?
          AND (
                title LIKE ?
                OR description LIKE ?
                OR activity_type LIKE ?
                OR actor_type LIKE ?
                OR case_id LIKE ?
                OR customer_id LIKE ?
                OR order_id LIKE ?
                OR metadata LIKE ?
          )
        ORDER BY created_at DESC, id DESC
        LIMIT 500
    `).all(
        businessId,
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

function countActivities(
    businessId,
    options = {}
) {
    const db = getDb();

    const conditions = [
        "business_id = ?"
    ];

    const values = [
        businessId
    ];

    if (options.activity_type) {
        conditions.push(
            "activity_type = ?"
        );

        values.push(
            cleanText(
                options.activity_type
            )
        );
    }

    if (options.actor_type) {
        conditions.push(
            "actor_type = ?"
        );

        values.push(
            cleanText(
                options.actor_type
            )
        );
    }

    const result = db.prepare(`
        SELECT COUNT(*) AS count
        FROM activities
        WHERE ${conditions.join(" AND ")}
    `).get(...values);

    return result.count;
}

function getRecentActivities(
    businessId,
    limit = 20
) {
    const db = getDb();

    const safeLimit = Math.min(
        Math.max(
            Number(limit) || 20,
            1
        ),
        100
    );

    return db.prepare(`
        SELECT *
        FROM activities
        WHERE business_id = ?
        ORDER BY created_at DESC, id DESC
        LIMIT ?
    `).all(
        businessId,
        safeLimit
    );
}

function getCaseActivity(
    businessId,
    caseId
) {
    return listActivities(
        businessId,
        {
            case_id: caseId,
            limit: 500,
            offset: 0
        }
    );
}

function getCustomerActivity(
    businessId,
    customerId
) {
    return listActivities(
        businessId,
        {
            customer_id: customerId,
            limit: 500,
            offset: 0
        }
    );
}

function getOrderActivity(
    businessId,
    orderId
) {
    return listActivities(
        businessId,
        {
            order_id: orderId,
            limit: 500,
            offset: 0
        }
    );
}

function deleteActivity(
    businessId,
    id
) {
    const db = getDb();

    const existing =
        getActivityById(
            businessId,
            id
        );

    if (!existing) {
        throw new Error(
            "Activity not found."
        );
    }

    db.prepare(`
        DELETE FROM activities
        WHERE business_id = ?
          AND id = ?
    `).run(
        businessId,
        id
    );

    return {
        deleted: true,
        id: existing.id
    };
}

function clearActivities(
    businessId
) {
    const db = getDb();

    const result = db.prepare(`
        DELETE FROM activities
        WHERE business_id = ?
    `).run(
        businessId
    );

    return {
        deleted: result.changes
    };
}

function exportActivities(
    businessId,
    options = {}
) {
    const activities =
        listActivities(
            businessId,
            {
                ...options,
                limit: 500
            }
        );

    return activities.map(
        activity => ({
            id: activity.id,
            activity_type:
                activity.activity_type,
            actor_type:
                activity.actor_type,
            title:
                activity.title,
            description:
                activity.description,
            case_id:
                activity.case_id,
            customer_id:
                activity.customer_id,
            order_id:
                activity.order_id,
            metadata:
                parseMetadata(
                    activity.metadata
                ),
            created_at:
                activity.created_at
        })
    );
}

function parseMetadata(metadata) {
    if (!metadata) {
        return {};
    }

    try {
        return JSON.parse(metadata);
    } catch (error) {
        return {
            raw: metadata
        };
    }
}

module.exports = {
    createActivity,
    getActivityById,
    listActivities,
    searchActivities,
    countActivities,
    getRecentActivities,
    getCaseActivity,
    getCustomerActivity,
    getOrderActivity,
    deleteActivity,
    clearActivities,
    exportActivities
};