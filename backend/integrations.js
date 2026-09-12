const { db } = require("./database");

const SUPPORTED_TYPES = [
    "email",
    "ecommerce",
    "helpdesk",
    "shipping"
];

const SUPPORTED_STATUSES = [
    "disconnected",
    "connected",
    "error",
    "disabled"
];

function now() {
    return new Date().toISOString();
}

function safeJsonParse(value, fallback = {}) {
    if (value === null || value === undefined || value === "") {
        return fallback;
    }

    if (typeof value === "object") {
        return value;
    }

    try {
        return JSON.parse(value);
    } catch {
        return fallback;
    }
}

function sanitizeIntegration(row) {
    if (!row) {
        return null;
    }

    return {
        id: row.id,
        business_id: row.business_id,
        name: row.name,
        type: row.type,
        provider: row.provider,
        status: row.status,
        settings: safeJsonParse(row.settings, {}),
        created_at: row.created_at,
        updated_at: row.updated_at
    };
}

/*
|--------------------------------------------------------------------------
| Integration lookup
|--------------------------------------------------------------------------
*/

function getIntegrationById(businessId, integrationId) {
    const row = db
        .prepare(
            `
            SELECT *
            FROM integrations
            WHERE id = ?
              AND business_id = ?
            LIMIT 1
            `
        )
        .get(integrationId, businessId);

    return sanitizeIntegration(row);
}

function getIntegrationByType(
    businessId,
    type,
    provider = null
) {
    const row = db
        .prepare(
            `
            SELECT *
            FROM integrations
            WHERE business_id = ?
              AND type = ?
              AND (? IS NULL OR provider = ?)
            ORDER BY created_at DESC
            LIMIT 1
            `
        )
        .get(
            businessId,
            type,
            provider,
            provider
        );

    return sanitizeIntegration(row);
}

function listIntegrations(businessId) {
    const rows = db
        .prepare(
            `
            SELECT *
            FROM integrations
            WHERE business_id = ?
            ORDER BY created_at DESC
            `
        )
        .all(businessId);

    return rows.map(sanitizeIntegration);
}

/*
|--------------------------------------------------------------------------
| Create integration
|--------------------------------------------------------------------------
*/

function createIntegration(
    businessId,
    input = {}
) {
    const name =
        typeof input.name === "string" && input.name.trim()
            ? input.name.trim()
            : null;

    const type =
        typeof input.type === "string"
            ? input.type.trim().toLowerCase()
            : "";

    const provider =
        typeof input.provider === "string"
            ? input.provider.trim()
            : "";

    if (!name) {
        throw new Error("Integration name is required.");
    }

    if (!SUPPORTED_TYPES.includes(type)) {
        throw new Error(
            `Unsupported integration type: ${type}.`
        );
    }

    if (!provider) {
        throw new Error("Integration provider is required.");
    }

    const settings =
        input.settings &&
        typeof input.settings === "object"
            ? input.settings
            : {};

    const result = db
        .prepare(
            `
            INSERT INTO integrations (
                business_id,
                name,
                type,
                provider,
                status,
                settings,
                created_at,
                updated_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `
        )
        .run(
            businessId,
            name,
            type,
            provider,
            "disconnected",
            JSON.stringify(settings),
            now(),
            now()
        );

    return getIntegrationById(
        businessId,
        result.lastInsertRowid
    );
}

/*
|--------------------------------------------------------------------------
| Update integration
|--------------------------------------------------------------------------
*/

function updateIntegration(
    businessId,
    integrationId,
    input = {}
) {
    const existing = getIntegrationById(
        businessId,
        integrationId
    );

    if (!existing) {
        throw new Error("Integration not found.");
    }

    const name =
        input.name !== undefined
            ? String(input.name).trim()
            : existing.name;

    const type =
        input.type !== undefined
            ? String(input.type).trim().toLowerCase()
            : existing.type;

    const provider =
        input.provider !== undefined
            ? String(input.provider).trim()
            : existing.provider;

    const status =
        input.status !== undefined
            ? String(input.status).trim().toLowerCase()
            : existing.status;

    if (!SUPPORTED_TYPES.includes(type)) {
        throw new Error(
            `Unsupported integration type: ${type}.`
        );
    }

    if (!SUPPORTED_STATUSES.includes(status)) {
        throw new Error(
            `Unsupported integration status: ${status}.`
        );
    }

    const settings =
        input.settings !== undefined
            ? input.settings
            : existing.settings;

    db.prepare(
        `
        UPDATE integrations
        SET
            name = ?,
            type = ?,
            provider = ?,
            status = ?,
            settings = ?,
            updated_at = ?
        WHERE id = ?
          AND business_id = ?
        `
    ).run(
        name,
        type,
        provider,
        status,
        JSON.stringify(settings || {}),
        now(),
        integrationId,
        businessId
    );

    return getIntegrationById(
        businessId,
        integrationId
    );
}

/*
|--------------------------------------------------------------------------
| Connection state
|--------------------------------------------------------------------------
*/

function connectIntegration(
    businessId,
    integrationId,
    settings = null
) {
    const existing = getIntegrationById(
        businessId,
        integrationId
    );

    if (!existing) {
        throw new Error("Integration not found.");
    }

    const nextSettings =
        settings !== null
            ? settings
            : existing.settings;

    db.prepare(
        `
        UPDATE integrations
        SET
            status = ?,
            settings = ?,
            updated_at = ?
        WHERE id = ?
          AND business_id = ?
        `
    ).run(
        "connected",
        JSON.stringify(nextSettings || {}),
        now(),
        integrationId,
        businessId
    );

    return getIntegrationById(
        businessId,
        integrationId
    );
}

function disconnectIntegration(
    businessId,
    integrationId
) {
    const existing = getIntegrationById(
        businessId,
        integrationId
    );

    if (!existing) {
        throw new Error("Integration not found.");
    }

    db.prepare(
        `
        UPDATE integrations
        SET
            status = ?,
            updated_at = ?
        WHERE id = ?
          AND business_id = ?
        `
    ).run(
        "disconnected",
        now(),
        integrationId,
        businessId
    );

    return getIntegrationById(
        businessId,
        integrationId
    );
}

function disableIntegration(
    businessId,
    integrationId
) {
    const existing = getIntegrationById(
        businessId,
        integrationId
    );

    if (!existing) {
        throw new Error("Integration not found.");
    }

    db.prepare(
        `
        UPDATE integrations
        SET
            status = ?,
            updated_at = ?
        WHERE id = ?
          AND business_id = ?
        `
    ).run(
        "disabled",
        now(),
        integrationId,
        businessId
    );

    return getIntegrationById(
        businessId,
        integrationId
    );
}

/*
|--------------------------------------------------------------------------
| Integration health
|--------------------------------------------------------------------------
*/

function getIntegrationHealth(
    businessId,
    integrationId
) {
    const integration = getIntegrationById(
        businessId,
        integrationId
    );

    if (!integration) {
        throw new Error("Integration not found.");
    }

    return {
        integration_id: integration.id,
        name: integration.name,
        type: integration.type,
        provider: integration.provider,
        status: integration.status,
        healthy: integration.status === "connected",
        checked_at: now()
    };
}

function getAllIntegrationHealth(
    businessId
) {
    return listIntegrations(businessId).map(
        integration => ({
            integration_id: integration.id,
            name: integration.name,
            type: integration.type,
            provider: integration.provider,
            status: integration.status,
            healthy: integration.status === "connected",
            checked_at: now()
        })
    );
}

/*
|--------------------------------------------------------------------------
| Credential protection
|--------------------------------------------------------------------------
|
| Credentials must NEVER be stored in frontend JavaScript.
|
| This helper deliberately removes common secret fields before returning
| integration settings to the frontend.
|
*/

function sanitizePublicSettings(settings = {}) {
    const protectedKeys = [
        "api_key",
        "apikey",
        "apiKey",
        "secret",
        "client_secret",
        "clientSecret",
        "access_token",
        "accessToken",
        "refresh_token",
        "refreshToken",
        "password",
        "token",
        "private_key",
        "privateKey"
    ];

    const result = {};

    for (const [key, value] of Object.entries(settings)) {
        if (
            protectedKeys.some(
                protectedKey =>
                    key.toLowerCase() ===
                    protectedKey.toLowerCase()
            )
        ) {
            result[key] = "[PROTECTED]";
        } else {
            result[key] = value;
        }
    }

    return result;
}

function getPublicIntegration(
    businessId,
    integrationId
) {
    const integration = getIntegrationById(
        businessId,
        integrationId
    );

    if (!integration) {
        return null;
    }

    return {
        ...integration,
        settings: sanitizePublicSettings(
            integration.settings
        )
    };
}

function listPublicIntegrations(
    businessId
) {
    return listIntegrations(businessId).map(
        integration => ({
            ...integration,
            settings: sanitizePublicSettings(
                integration.settings
            )
        })
    );
}

/*
|--------------------------------------------------------------------------
| Provider capability layer
|--------------------------------------------------------------------------
|
| These functions define the boundary between AI Workforce and external
| systems.
|
| They intentionally do not pretend that a provider is connected when
| there are no credentials/configuration.
|
*/

function canUseIntegration(
    businessId,
    type,
    provider = null
) {
    const integration = getIntegrationByType(
        businessId,
        type,
        provider
    );

    return Boolean(
        integration &&
        integration.status === "connected"
    );
}

function requireConnectedIntegration(
    businessId,
    type,
    provider = null
) {
    const integration = getIntegrationByType(
        businessId,
        type,
        provider
    );

    if (!integration) {
        throw new Error(
            `No ${type} integration is configured.`
        );
    }

    if (integration.status !== "connected") {
        throw new Error(
            `The ${integration.name} integration is not connected.`
        );
    }

    return integration;
}

/*
|--------------------------------------------------------------------------
| Placeholder provider operations
|--------------------------------------------------------------------------
|
| These are deliberately controlled boundaries.
| Real provider-specific API calls will be added here when the provider
| is selected and credentials are configured.
|
*/

async function sendEmail(
    businessId,
    input = {}
) {
    const integration =
        requireConnectedIntegration(
            businessId,
            "email",
            input.provider || null
        );

    if (!input.to) {
        throw new Error(
            "Email recipient is required."
        );
    }

    if (!input.subject) {
        throw new Error(
            "Email subject is required."
        );
    }

    if (!input.body) {
        throw new Error(
            "Email body is required."
        );
    }

    /*
     * Provider-specific sending is intentionally not faked.
     *
     * Once a real email provider is selected, this function becomes the
     * single backend boundary through which the worker can send email.
     */

    return {
        success: false,
        provider: integration.provider,
        status: "not_implemented",
        message:
            "Email provider connection exists, but provider sending has not been implemented yet."
    };
}

async function lookupEcommerceOrder(
    businessId,
    input = {}
) {
    const integration =
        requireConnectedIntegration(
            businessId,
            "ecommerce",
            input.provider || null
        );

    if (!input.order_id) {
        throw new Error(
            "Order ID is required."
        );
    }

    return {
        success: false,
        provider: integration.provider,
        status: "not_implemented",
        message:
            "E-commerce order lookup is reserved for the real provider connector."
    };
}

async function lookupShippingStatus(
    businessId,
    input = {}
) {
    const integration =
        requireConnectedIntegration(
            businessId,
            "shipping",
            input.provider || null
        );

    if (!input.tracking_number) {
        throw new Error(
            "Tracking number is required."
        );
    }

    return {
        success: false,
        provider: integration.provider,
        status: "not_implemented",
        message:
            "Shipping status lookup is reserved for the real provider connector."
    };
}

async function createHelpdeskCase(
    businessId,
    input = {}
) {
    const integration =
        requireConnectedIntegration(
            businessId,
            "helpdesk",
            input.provider || null
        );

    if (!input.subject) {
        throw new Error(
            "Helpdesk case subject is required."
        );
    }

    return {
        success: false,
        provider: integration.provider,
        status: "not_implemented",
        message:
            "Helpdesk case creation is reserved for the real provider connector."
    };
}

/*
|--------------------------------------------------------------------------
| Safe provider summary
|--------------------------------------------------------------------------
*/

function getSupportedIntegrationTypes() {
    return SUPPORTED_TYPES.map(type => ({
        type,
        available: true
    }));
}

module.exports = {
    SUPPORTED_TYPES,
    SUPPORTED_STATUSES,

    getIntegrationById,
    getIntegrationByType,
    listIntegrations,

    createIntegration,
    updateIntegration,

    connectIntegration,
    disconnectIntegration,
    disableIntegration,

    getIntegrationHealth,
    getAllIntegrationHealth,

    sanitizePublicSettings,
    getPublicIntegration,
    listPublicIntegrations,

    canUseIntegration,
    requireConnectedIntegration,

    sendEmail,
    lookupEcommerceOrder,
    lookupShippingStatus,
    createHelpdeskCase,

    getSupportedIntegrationTypes
};