const { db } = require("./database");

/**
 * Clean text input.
 */
function cleanText(value) {
    return String(value || "").trim();
}

/**
 * Validate a knowledge item.
 */
function validateKnowledgeInput({ title, content, category }) {
    if (!cleanText(title)) {
        throw new Error("Knowledge title is required.");
    }

    if (!cleanText(content)) {
        throw new Error("Knowledge content is required.");
    }

    if (!cleanText(category)) {
        throw new Error("Knowledge category is required.");
    }
}

/**
 * Create a knowledge item.
 */
function createKnowledge({
    businessId,
    title,
    content,
    category,
    source = "business"
}) {
    validateKnowledgeInput({
        title,
        content,
        category
    });

    const result = db
        .prepare(
            `
            INSERT INTO knowledge (
                business_id,
                title,
                content,
                category,
                source
            )
            VALUES (?, ?, ?, ?, ?)
            `
        )
        .run(
            businessId,
            cleanText(title),
            cleanText(content),
            cleanText(category),
            cleanText(source) || "business"
        );

    return getKnowledgeById(
        businessId,
        Number(result.lastInsertRowid)
    );
}

/**
 * Get one knowledge item.
 */
function getKnowledgeById(businessId, knowledgeId) {
    return db
        .prepare(
            `
            SELECT
                id,
                business_id,
                title,
                content,
                category,
                source,
                created_at,
                updated_at
            FROM knowledge
            WHERE id = ?
              AND business_id = ?
            `
        )
        .get(knowledgeId, businessId);
}

/**
 * List knowledge for a business.
 */
function listKnowledge(businessId, options = {}) {
    const category = cleanText(options.category);

    if (category) {
        return db
            .prepare(
                `
                SELECT
                    id,
                    business_id,
                    title,
                    content,
                    category,
                    source,
                    created_at,
                    updated_at
                FROM knowledge
                WHERE business_id = ?
                  AND category = ?
                ORDER BY created_at DESC
                `
            )
            .all(businessId, category);
    }

    return db
        .prepare(
            `
            SELECT
                id,
                business_id,
                title,
                content,
                category,
                source,
                created_at,
                updated_at
            FROM knowledge
            WHERE business_id = ?
            ORDER BY created_at DESC
            `
        )
        .all(businessId);
}

/**
 * Update a knowledge item.
 */
function updateKnowledge(
    businessId,
    knowledgeId,
    {
        title,
        content,
        category,
        source
    }
) {
    const existing = getKnowledgeById(
        businessId,
        knowledgeId
    );

    if (!existing) {
        throw new Error("Knowledge item not found.");
    }

    const newTitle =
        title !== undefined
            ? cleanText(title)
            : existing.title;

    const newContent =
        content !== undefined
            ? cleanText(content)
            : existing.content;

    const newCategory =
        category !== undefined
            ? cleanText(category)
            : existing.category;

    const newSource =
        source !== undefined
            ? cleanText(source)
            : existing.source;

    validateKnowledgeInput({
        title: newTitle,
        content: newContent,
        category: newCategory
    });

    db.prepare(
        `
        UPDATE knowledge
        SET
            title = ?,
            content = ?,
            category = ?,
            source = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND business_id = ?
        `
    ).run(
        newTitle,
        newContent,
        newCategory,
        newSource,
        knowledgeId,
        businessId
    );

    return getKnowledgeById(
        businessId,
        knowledgeId
    );
}

/**
 * Delete a knowledge item.
 */
function deleteKnowledge(
    businessId,
    knowledgeId
) {
    const existing = getKnowledgeById(
        businessId,
        knowledgeId
    );

    if (!existing) {
        throw new Error("Knowledge item not found.");
    }

    db.prepare(
        `
        DELETE FROM knowledge
        WHERE id = ?
          AND business_id = ?
        `
    ).run(
        knowledgeId,
        businessId
    );

    return {
        deleted: true,
        id: knowledgeId
    };
}

/**
 * Search business knowledge.
 *
 * This is the first version of retrieval.
 * Later we can replace/extend this with
 * embeddings/vector search without changing
 * the rest of the application architecture.
 */
function searchKnowledge(
    businessId,
    searchText,
    options = {}
) {
    const query = cleanText(searchText);

    if (!query) {
        return listKnowledge(businessId, options);
    }

    const searchPattern = `%${query}%`;
    const category = cleanText(options.category);
    const limit = Math.min(
        Math.max(Number(options.limit) || 10, 1),
        50
    );

    if (category) {
        return db
            .prepare(
                `
                SELECT
                    id,
                    business_id,
                    title,
                    content,
                    category,
                    source,
                    created_at,
                    updated_at
                FROM knowledge
                WHERE business_id = ?
                  AND category = ?
                  AND (
                      title LIKE ?
                      OR content LIKE ?
                      OR category LIKE ?
                  )
                ORDER BY
                    CASE
                        WHEN title LIKE ? THEN 0
                        WHEN category LIKE ? THEN 1
                        ELSE 2
                    END,
                    updated_at DESC
                LIMIT ?
                `
            )
            .all(
                businessId,
                category,
                searchPattern,
                searchPattern,
                searchPattern,
                searchPattern,
                searchPattern,
                limit
            );
    }

    return db
        .prepare(
            `
            SELECT
                id,
                business_id,
                title,
                content,
                category,
                source,
                created_at,
                updated_at
            FROM knowledge
            WHERE business_id = ?
              AND (
                  title LIKE ?
                  OR content LIKE ?
                  OR category LIKE ?
              )
            ORDER BY
                CASE
                    WHEN title LIKE ? THEN 0
                    WHEN category LIKE ? THEN 1
                    ELSE 2
                END,
                updated_at DESC
            LIMIT ?
            `
        )
        .all(
            businessId,
            searchPattern,
            searchPattern,
            searchPattern,
            searchPattern,
            searchPattern,
            limit
        );
}

/**
 * Retrieve knowledge specifically for an AI Worker
 * handling a customer problem.
 *
 * We search the user's message and also include
 * delivery-related knowledge because V1 is focused
 * on delivery problems.
 */
function retrieveForWorker(
    businessId,
    customerMessage
) {
    const message = cleanText(customerMessage);

    const results = searchKnowledge(
        businessId,
        message,
        {
            limit: 10
        }
    );

    const deliveryResults = searchKnowledge(
        businessId,
        "delivery delayed shipping refund order tracking",
        {
            limit: 10
        }
    );

    const combined = new Map();

    for (const item of results) {
        combined.set(item.id, item);
    }

    for (const item of deliveryResults) {
        combined.set(item.id, item);
    }

    return Array.from(combined.values())
        .slice(0, 15);
}

/**
 * Return available knowledge categories.
 */
function listCategories(businessId) {
    return db
        .prepare(
            `
            SELECT
                category,
                COUNT(*) AS item_count
            FROM knowledge
            WHERE business_id = ?
            GROUP BY category
            ORDER BY category ASC
            `
        )
        .all(businessId);
}

module.exports = {
    createKnowledge,
    getKnowledgeById,
    listKnowledge,
    updateKnowledge,
    deleteKnowledge,
    searchKnowledge,
    retrieveForWorker,
    listCategories
};