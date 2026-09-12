const { db } = require("./database");

function cleanText(value) {
    return String(value || "").trim();
}

function validateCustomerInput({ name, email }) {
    if (!cleanText(name)) {
        throw new Error("Customer name is required.");
    }

    if (!cleanText(email)) {
        throw new Error("Customer email is required.");
    }
}

/**
 * Create a customer.
 */
function createCustomer({
    businessId,
    name,
    email,
    customerId = null
}) {
    validateCustomerInput({
        name,
        email
    });

    const cleanName = cleanText(name);
    const cleanEmail = cleanText(email).toLowerCase();

    let finalCustomerId = cleanText(customerId);

    if (!finalCustomerId) {
        finalCustomerId = `CUST-${Date.now()}`;
    }

    const existing = db
        .prepare(
            `
            SELECT id
            FROM customers
            WHERE business_id = ?
              AND customer_id = ?
            `
        )
        .get(
            businessId,
            finalCustomerId
        );

    if (existing) {
        throw new Error(
            "A customer with this customer ID already exists."
        );
    }

    const result = db
        .prepare(
            `
            INSERT INTO customers (
                business_id,
                customer_id,
                name,
                email
            )
            VALUES (?, ?, ?, ?)
            `
        )
        .run(
            businessId,
            finalCustomerId,
            cleanName,
            cleanEmail
        );

    return getCustomerById(
        businessId,
        Number(result.lastInsertRowid)
    );
}

/**
 * Get a customer by database ID.
 */
function getCustomerById(
    businessId,
    id
) {
    return db
        .prepare(
            `
            SELECT
                id,
                business_id,
                customer_id,
                name,
                email,
                created_at,
                updated_at
            FROM customers
            WHERE id = ?
              AND business_id = ?
            `
        )
        .get(
            id,
            businessId
        );
}

/**
 * Find a customer using the public customer ID.
 */
function findCustomer(
    businessId,
    customerId
) {
    return db
        .prepare(
            `
            SELECT
                id,
                business_id,
                customer_id,
                name,
                email,
                created_at,
                updated_at
            FROM customers
            WHERE business_id = ?
              AND customer_id = ?
            `
        )
        .get(
            businessId,
            cleanText(customerId)
        );
}

/**
 * Find a customer by email.
 */
function findCustomerByEmail(
    businessId,
    email
) {
    return db
        .prepare(
            `
            SELECT
                id,
                business_id,
                customer_id,
                name,
                email,
                created_at,
                updated_at
            FROM customers
            WHERE business_id = ?
              AND email = ?
            `
        )
        .get(
            businessId,
            cleanText(email).toLowerCase()
        );
}

/**
 * Search customers.
 */
function searchCustomers(
    businessId,
    searchText,
    limit = 25
) {
    const query = cleanText(searchText);

    const safeLimit = Math.min(
        Math.max(Number(limit) || 25, 1),
        100
    );

    if (!query) {
        return listCustomers(
            businessId,
            safeLimit
        );
    }

    const pattern = `%${query}%`;

    return db
        .prepare(
            `
            SELECT
                id,
                business_id,
                customer_id,
                name,
                email,
                created_at,
                updated_at
            FROM customers
            WHERE business_id = ?
              AND (
                  customer_id LIKE ?
                  OR name LIKE ?
                  OR email LIKE ?
              )
            ORDER BY name ASC
            LIMIT ?
            `
        )
        .all(
            businessId,
            pattern,
            pattern,
            pattern,
            safeLimit
        );
}

/**
 * List customers.
 */
function listCustomers(
    businessId,
    limit = 100
) {
    const safeLimit = Math.min(
        Math.max(Number(limit) || 100, 1),
        100
    );

    return db
        .prepare(
            `
            SELECT
                id,
                business_id,
                customer_id,
                name,
                email,
                created_at,
                updated_at
            FROM customers
            WHERE business_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            `
        )
        .all(
            businessId,
            safeLimit
        );
}

/**
 * Update a customer.
 */
function updateCustomer(
    businessId,
    id,
    {
        name,
        email,
        customerId
    }
) {
    const existing = getCustomerById(
        businessId,
        id
    );

    if (!existing) {
        throw new Error("Customer not found.");
    }

    const newName =
        name !== undefined
            ? cleanText(name)
            : existing.name;

    const newEmail =
        email !== undefined
            ? cleanText(email).toLowerCase()
            : existing.email;

    const newCustomerId =
        customerId !== undefined
            ? cleanText(customerId)
            : existing.customer_id;

    validateCustomerInput({
        name: newName,
        email: newEmail
    });

    if (!newCustomerId) {
        throw new Error(
            "Customer ID is required."
        );
    }

    const duplicate = db
        .prepare(
            `
            SELECT id
            FROM customers
            WHERE business_id = ?
              AND customer_id = ?
              AND id != ?
            `
        )
        .get(
            businessId,
            newCustomerId,
            id
        );

    if (duplicate) {
        throw new Error(
            "Another customer already uses this customer ID."
        );
    }

    db.prepare(
        `
        UPDATE customers
        SET
            customer_id = ?,
            name = ?,
            email = ?,
            updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
          AND business_id = ?
        `
    ).run(
        newCustomerId,
        newName,
        newEmail,
        id,
        businessId
    );

    return getCustomerById(
        businessId,
        id
    );
}

/**
 * Delete a customer.
 *
 * We protect customers that still have orders.
 * This prevents accidental destruction of historical
 * customer/order records.
 */
function deleteCustomer(
    businessId,
    id
) {
    const existing = getCustomerById(
        businessId,
        id
    );

    if (!existing) {
        throw new Error("Customer not found.");
    }

    const orderCount = db
        .prepare(
            `
            SELECT COUNT(*) AS count
            FROM orders
            WHERE business_id = ?
              AND customer_id = ?
            `
        )
        .get(
            businessId,
            existing.customer_id
        );

    if (Number(orderCount.count) > 0) {
        throw new Error(
            "This customer has orders and cannot be deleted. Keep the record for historical data."
        );
    }

    db.prepare(
        `
        DELETE FROM customers
        WHERE id = ?
          AND business_id = ?
        `
    ).run(
        id,
        businessId
    );

    return {
        deleted: true,
        id
    };
}

/**
 * Get a customer together with their orders.
 *
 * Useful for the AI Worker when investigating
 * a customer delivery problem.
 */
function getCustomerProfile(
    businessId,
    customerId
) {
    const customer = findCustomer(
        businessId,
        customerId
    );

    if (!customer) {
        return null;
    }

    const orders = db
        .prepare(
            `
            SELECT
                id,
                order_id,
                customer_id,
                product,
                order_date,
                delivery_status,
                expected_delivery_date,
                tracking_number,
                created_at,
                updated_at
            FROM orders
            WHERE business_id = ?
              AND customer_id = ?
            ORDER BY created_at DESC
            `
        )
        .all(
            businessId,
            customer.customer_id
        );

    return {
        ...customer,
        orders
    };
}

module.exports = {
    createCustomer,
    getCustomerById,
    findCustomer,
    findCustomerByEmail,
    searchCustomers,
    listCustomers,
    updateCustomer,
    deleteCustomer,
    getCustomerProfile
};