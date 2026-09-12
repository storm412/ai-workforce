const { getDb } = require("./database");

function cleanText(value) {
    if (value === undefined || value === null) {
        return "";
    }

    return String(value).trim();
}

function normalizeStatus(status) {
    const value = cleanText(status).toLowerCase();

    const allowed = [
        "pending",
        "processing",
        "shipped",
        "in_transit",
        "out_for_delivery",
        "delivered",
        "delayed",
        "cancelled",
        "unknown"
    ];

    return allowed.includes(value) ? value : "unknown";
}

function validateOrderData(data) {
    const orderId = cleanText(data.order_id);
    const customerId = cleanText(data.customer_id);

    if (!orderId) {
        throw new Error("Order ID is required.");
    }

    if (!customerId) {
        throw new Error("Customer ID is required.");
    }

    return {
        orderId,
        customerId
    };
}

function getCustomerForBusiness(businessId, customerId) {
    const db = getDb();

    return db.prepare(`
        SELECT *
        FROM customers
        WHERE business_id = ?
          AND customer_id = ?
        LIMIT 1
    `).get(businessId, customerId);
}

function createOrder(businessId, data) {
    const db = getDb();

    const {
        orderId,
        customerId
    } = validateOrderData(data);

    const customer = getCustomerForBusiness(
        businessId,
        customerId
    );

    if (!customer) {
        throw new Error(
            "Customer not found in this business."
        );
    }

    const existing = db.prepare(`
        SELECT *
        FROM orders
        WHERE business_id = ?
          AND order_id = ?
        LIMIT 1
    `).get(businessId, orderId);

    if (existing) {
        throw new Error("An order with this Order ID already exists.");
    }

    const product = cleanText(data.product) || "Unknown product";
    const orderDate = cleanText(data.order_date);
    const deliveryStatus =
        normalizeStatus(data.delivery_status || data.status);

    const expectedDeliveryDate =
        cleanText(data.expected_delivery_date);

    const trackingNumber =
        cleanText(data.tracking_number);

    const now = new Date().toISOString();

    const result = db.prepare(`
        INSERT INTO orders (
            business_id,
            order_id,
            customer_id,
            product,
            order_date,
            delivery_status,
            expected_delivery_date,
            tracking_number,
            created_at,
            updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `).run(
        businessId,
        orderId,
        customerId,
        product,
        orderDate,
        deliveryStatus,
        expectedDeliveryDate,
        trackingNumber,
        now,
        now
    );

    return getOrderById(businessId, result.lastInsertRowid);
}

function getOrderById(businessId, id) {
    const db = getDb();

    return db.prepare(`
        SELECT
            o.*,
            c.name AS customer_name,
            c.email AS customer_email
        FROM orders o
        LEFT JOIN customers c
            ON c.business_id = o.business_id
           AND c.customer_id = o.customer_id
        WHERE o.business_id = ?
          AND o.id = ?
        LIMIT 1
    `).get(businessId, id);
}

function getOrderByOrderId(businessId, orderId) {
    const db = getDb();

    return db.prepare(`
        SELECT
            o.*,
            c.name AS customer_name,
            c.email AS customer_email
        FROM orders o
        LEFT JOIN customers c
            ON c.business_id = o.business_id
           AND c.customer_id = o.customer_id
        WHERE o.business_id = ?
          AND o.order_id = ?
        LIMIT 1
    `).get(businessId, cleanText(orderId));
}

function findOrder(businessId, orderId) {
    return getOrderByOrderId(
        businessId,
        orderId
    );
}

function findOrdersForCustomer(
    businessId,
    customerId
) {
    const db = getDb();

    return db.prepare(`
        SELECT
            o.*,
            c.name AS customer_name,
            c.email AS customer_email
        FROM orders o
        LEFT JOIN customers c
            ON c.business_id = o.business_id
           AND c.customer_id = o.customer_id
        WHERE o.business_id = ?
          AND o.customer_id = ?
        ORDER BY o.created_at DESC
    `).all(
        businessId,
        cleanText(customerId)
    );
}

function searchOrders(
    businessId,
    searchTerm
) {
    const db = getDb();

    const term = `%${cleanText(searchTerm)}%`;

    return db.prepare(`
        SELECT
            o.*,
            c.name AS customer_name,
            c.email AS customer_email
        FROM orders o
        LEFT JOIN customers c
            ON c.business_id = o.business_id
           AND c.customer_id = o.customer_id
        WHERE o.business_id = ?
          AND (
                o.order_id LIKE ?
                OR o.customer_id LIKE ?
                OR o.product LIKE ?
                OR o.tracking_number LIKE ?
                OR o.delivery_status LIKE ?
                OR c.name LIKE ?
                OR c.email LIKE ?
          )
        ORDER BY o.created_at DESC
    `).all(
        businessId,
        term,
        term,
        term,
        term,
        term,
        term,
        term
    );
}

function listOrders(
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
                o.*,
                c.name AS customer_name,
                c.email AS customer_email
            FROM orders o
            LEFT JOIN customers c
                ON c.business_id = o.business_id
               AND c.customer_id = o.customer_id
            WHERE o.business_id = ?
              AND o.delivery_status = ?
            ORDER BY o.created_at DESC
            LIMIT ? OFFSET ?
        `).all(
            businessId,
            normalizeStatus(options.status),
            limit,
            offset
        );
    }

    return db.prepare(`
        SELECT
            o.*,
            c.name AS customer_name,
            c.email AS customer_email
        FROM orders o
        LEFT JOIN customers c
            ON c.business_id = o.business_id
           AND c.customer_id = o.customer_id
        WHERE o.business_id = ?
        ORDER BY o.created_at DESC
        LIMIT ? OFFSET ?
    `).all(
        businessId,
        limit,
        offset
    );
}

function countOrders(businessId) {
    const db = getDb();

    const result = db.prepare(`
        SELECT COUNT(*) AS count
        FROM orders
        WHERE business_id = ?
    `).get(businessId);

    return result.count;
}

function updateOrder(
    businessId,
    id,
    updates
) {
    const db = getDb();

    const existing = getOrderById(
        businessId,
        id
    );

    if (!existing) {
        throw new Error("Order not found.");
    }

    if (
        updates.customer_id !== undefined &&
        cleanText(updates.customer_id) !== existing.customer_id
    ) {
        const customer = getCustomerForBusiness(
            businessId,
            updates.customer_id
        );

        if (!customer) {
            throw new Error(
                "The new customer does not exist in this business."
            );
        }
    }

    const fields = [];
    const values = [];

    if (updates.order_id !== undefined) {
        const newOrderId = cleanText(
            updates.order_id
        );

        if (!newOrderId) {
            throw new Error(
                "Order ID cannot be empty."
            );
        }

        const duplicate = db.prepare(`
            SELECT id
            FROM orders
            WHERE business_id = ?
              AND order_id = ?
              AND id != ?
            LIMIT 1
        `).get(
            businessId,
            newOrderId,
            id
        );

        if (duplicate) {
            throw new Error(
                "Another order already uses this Order ID."
            );
        }

        fields.push("order_id = ?");
        values.push(newOrderId);
    }

    if (updates.customer_id !== undefined) {
        fields.push("customer_id = ?");
        values.push(
            cleanText(updates.customer_id)
        );
    }

    if (updates.product !== undefined) {
        fields.push("product = ?");
        values.push(
            cleanText(updates.product)
        );
    }

    if (updates.order_date !== undefined) {
        fields.push("order_date = ?");
        values.push(
            cleanText(updates.order_date)
        );
    }

    if (
        updates.delivery_status !== undefined ||
        updates.status !== undefined
    ) {
        fields.push("delivery_status = ?");
        values.push(
            normalizeStatus(
                updates.delivery_status ??
                updates.status
            )
        );
    }

    if (
        updates.expected_delivery_date !== undefined
    ) {
        fields.push(
            "expected_delivery_date = ?"
        );

        values.push(
            cleanText(
                updates.expected_delivery_date
            )
        );
    }

    if (updates.tracking_number !== undefined) {
        fields.push("tracking_number = ?");
        values.push(
            cleanText(
                updates.tracking_number
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
        UPDATE orders
        SET ${fields.join(", ")}
        WHERE business_id = ?
          AND id = ?
    `).run(...values);

    return getOrderById(
        businessId,
        id
    );
}

function updateDeliveryStatus(
    businessId,
    id,
    status
) {
    return updateOrder(
        businessId,
        id,
        {
            delivery_status: status
        }
    );
}

function checkDeliveryStatus(
    businessId,
    orderId
) {
    const order = getOrderByOrderId(
        businessId,
        orderId
    );

    if (!order) {
        return {
            found: false,
            order_id: cleanText(orderId),
            status: "unknown",
            message: "Order not found."
        };
    }

    return {
        found: true,
        order_id: order.order_id,
        customer_id: order.customer_id,
        delivery_status: order.delivery_status,
        expected_delivery_date:
            order.expected_delivery_date,
        tracking_number:
            order.tracking_number,
        product: order.product,
        order_date: order.order_date
    };
}

function deleteOrder(
    businessId,
    id
) {
    const db = getDb();

    const existing = getOrderById(
        businessId,
        id
    );

    if (!existing) {
        throw new Error("Order not found.");
    }

    const caseCount = db.prepare(`
        SELECT COUNT(*) AS count
        FROM cases
        WHERE business_id = ?
          AND order_id = ?
    `).get(
        businessId,
        existing.order_id
    );

    if (caseCount.count > 0) {
        throw new Error(
            "This order cannot be deleted because it has case history."
        );
    }

    db.prepare(`
        DELETE FROM orders
        WHERE business_id = ?
          AND id = ?
    `).run(
        businessId,
        id
    );

    return {
        deleted: true,
        order_id: existing.order_id
    };
}

function getDelayedOrders(
    businessId
) {
    const db = getDb();

    return db.prepare(`
        SELECT
            o.*,
            c.name AS customer_name,
            c.email AS customer_email
        FROM orders o
        LEFT JOIN customers c
            ON c.business_id = o.business_id
           AND c.customer_id = o.customer_id
        WHERE o.business_id = ?
          AND o.delivery_status = 'delayed'
        ORDER BY o.expected_delivery_date ASC
    `).all(businessId);
}

module.exports = {
    createOrder,
    getOrderById,
    getOrderByOrderId,
    findOrder,
    findOrdersForCustomer,
    searchOrders,
    listOrders,
    countOrders,
    updateOrder,
    updateDeliveryStatus,
    checkDeliveryStatus,
    deleteOrder,
    getDelayedOrders
};