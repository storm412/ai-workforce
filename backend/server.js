require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");

const { databaseHealth } = require("./database");

const {
    registerBusiness,
    loginUser,
    authenticate,
    getUserById
} = require("./auth");

const aiWorker = require("./ai-worker");
const knowledge = require("./knowledge");
const customers = require("./customers");
const orders = require("./orders");
const cases = require("./cases");
const activity = require("./activity");
const integrations = require("./integrations");

const app = express();

const PORT = Number(process.env.PORT) || 3000;
const CLIENT_URL = process.env.CLIENT_URL || "*";

app.disable("x-powered-by");

app.use(
    cors({
        origin: CLIENT_URL === "*" ? true : CLIENT_URL,
        credentials: false
    })
);

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true, limit: "1mb" }));

/* =========================================================
   HELPERS
========================================================= */

function asyncRoute(handler) {
    return function routeHandler(req, res, next) {
        Promise.resolve(handler(req, res, next)).catch(next);
    };
}

function requireAuth(req, res, next) {
    try {
        return authenticate(req, res, next);
    } catch (error) {
        next(error);
    }
}

function getBusinessId(req) {
    if (!req.user || !req.user.business_id) {
        const error = new Error("Business account not found.");
        error.status = 401;
        throw error;
    }

    return req.user.business_id;
}

function getUserId(req) {
    if (!req.user || !req.user.id) {
        const error = new Error("User account not found.");
        error.status = 401;
        throw error;
    }

    return req.user.id;
}

function requireAdmin(req, res, next) {
    const allowedRoles = ["owner", "admin"];

    if (!req.user || !allowedRoles.includes(req.user.role)) {
        return res.status(403).json({
            success: false,
            error: "Administrator permission required."
        });
    }

    next();
}

function requireWorkerAccess(req, res, next) {
    if (!req.user) {
        return res.status(401).json({
            success: false,
            error: "Authentication required."
        });
    }

    next();
}

function sendSuccess(res, data = {}, status = 200) {
    return res.status(status).json({
        success: true,
        ...data
    });
}

function sendError(res, message, status = 400, details = undefined) {
    const response = {
        success: false,
        error: message
    };

    if (details !== undefined) {
        response.details = details;
    }

    return res.status(status).json(response);
}

function parseLimit(value, fallback = 100, maximum = 500) {
    const number = Number(value);

    if (!Number.isFinite(number) || number <= 0) {
        return fallback;
    }

    return Math.min(Math.floor(number), maximum);
}

function parseOffset(value) {
    const number = Number(value);

    if (!Number.isFinite(number) || number < 0) {
        return 0;
    }

    return Math.floor(number);
}

/* =========================================================
   PUBLIC HEALTH
========================================================= */

app.get("/api/health", (req, res) => {
    const health = databaseHealth();

    const healthy = health.connected === true;

    return res.status(healthy ? 200 : 503).json({
        success: healthy,
        service: "AI Workforce API",
        status: healthy ? "healthy" : "unhealthy",
        database: health,
        timestamp: new Date().toISOString()
    });
});

/* =========================================================
   AUTHENTICATION
========================================================= */

app.post(
    "/api/auth/register",
    asyncRoute(async (req, res) => {
        const {
            businessName,
            companyName,
            name,
            fullName,
            email,
            password
        } = req.body || {};

        const result = await registerBusiness({
            businessName: businessName || companyName,
            name: name || fullName,
            email,
            password
        });

        /*
         * Every new business starts with one AI Customer
         * Operations Worker in Draft mode.
         */
        let worker = null;

        if (result && result.business && result.business.id) {
            const existingWorkers = aiWorker.listWorkers(
                result.business.id
            );

            if (!existingWorkers || existingWorkers.length === 0) {
                worker = aiWorker.createWorker(
                    result.business.id,
                    {
                        name: "Customer Operations Worker",
                        description:
                            "Handles customer delivery problems from investigation through resolution or human escalation.",
                        instructions:
                            "Handle delivery-related customer problems using verified customer, order, delivery, and company-policy information.",
                        tone: "Professional",
                        allowed_actions: [
                            "find_customer",
                            "find_order",
                            "check_delivery_status",
                            "update_case",
                            "escalate_to_human"
                        ],
                        escalation_rules:
                            "Escalate when information is missing, the request is outside the worker's authority, company rules are insufficient, the customer requests a human, or an action cannot be safely verified.",
                        response_rules:
                            "Be professional, accurate, concise, and never claim an action was completed unless it was successfully verified.",
                        status: "draft"
                    }
                );
            } else {
                worker = existingWorkers[0];
            }
        }

        return sendSuccess(
            res,
            {
                message: "Business account created successfully.",
                ...result,
                worker
            },
            201
        );
    })
);

app.post(
    "/api/auth/login",
    asyncRoute(async (req, res) => {
        const { email, password } = req.body || {};

        const result = await loginUser({
            email,
            password
        });

        return sendSuccess(res, {
            message: "Login successful.",
            ...result
        });
    })
);

app.post("/api/auth/logout", requireAuth, (req, res) => {
    /*
     * Authentication uses stateless JWTs.
     * The frontend removes the token after this response.
     */
    return sendSuccess(res, {
        message: "Logout successful."
    });
});

app.get(
    "/api/auth/me",
    requireAuth,
    asyncRoute(async (req, res) => {
        const user = getUserById(req.user.id);

        return sendSuccess(res, {
            user
        });
    })
);

/* =========================================================
   WORKERS
========================================================= */

app.get(
    "/api/workers",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const workers = aiWorker.listWorkers(businessId);

        return sendSuccess(res, {
            workers
        });
    })
);

app.get(
    "/api/workers/:workerId",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const worker = aiWorker.getWorkerById(
            businessId,
            req.params.workerId
        );

        if (!worker) {
            return sendError(res, "Worker not found.", 404);
        }

        return sendSuccess(res, {
            worker
        });
    })
);

app.post(
    "/api/workers",
    requireAuth,
    requireAdmin,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const worker = aiWorker.createWorker(
            businessId,
            req.body || {}
        );

        return sendSuccess(
            res,
            {
                message: "Worker created.",
                worker
            },
            201
        );
    })
);

app.patch(
    "/api/workers/:workerId",
    requireAuth,
    requireAdmin,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        if (
            req.body &&
            req.body.status === "active" &&
            req.body.confirm !== true
        ) {
            return sendError(
                res,
                "Activation requires explicit confirmation.",
                400
            );
        }

        const worker = aiWorker.updateWorker(
            businessId,
            req.params.workerId,
            req.body || {}
        );

        return sendSuccess(res, {
            message: "Worker configuration updated.",
            worker
        });
    })
);

app.patch(
    "/api/workers/:workerId/status",
    requireAuth,
    requireAdmin,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);
        const { status, confirm } = req.body || {};

        if (!status) {
            return sendError(res, "Worker status is required.");
        }

        if (status === "active" && confirm !== true) {
            return sendError(
                res,
                "You must explicitly confirm worker activation.",
                400
            );
        }

        const worker = aiWorker.setWorkerStatus(
            businessId,
            req.params.workerId,
            status
        );

        return sendSuccess(res, {
            message: `Worker status changed to ${status}.`,
            worker
        });
    })
);

/* =========================================================
   TEACH WORKER
========================================================= */

app.get(
    "/api/workers/:workerId/teaching",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const materials = aiWorker.listTeachingMaterials(
            businessId,
            req.params.workerId
        );

        return sendSuccess(res, {
            materials
        });
    })
);

app.post(
    "/api/workers/:workerId/teaching",
    requireAuth,
    requireAdmin,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const material = aiWorker.createTeachingMaterial(
            businessId,
            req.params.workerId,
            req.body || {}
        );

        return sendSuccess(
            res,
            {
                message: "Teaching material saved.",
                material
            },
            201
        );
    })
);

app.patch(
    "/api/workers/:workerId/teaching/:materialId",
    requireAuth,
    requireAdmin,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const material = aiWorker.updateTeachingMaterial(
            businessId,
            req.params.materialId,
            req.body || {}
        );

        return sendSuccess(res, {
            message: "Teaching material updated.",
            material
        });
    })
);

app.delete(
    "/api/workers/:workerId/teaching/:materialId",
    requireAuth,
    requireAdmin,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        aiWorker.deleteTeachingMaterial(
            businessId,
            req.params.materialId
        );

        return sendSuccess(res, {
            message: "Teaching material deleted."
        });
    })
);

/* =========================================================
   KNOWLEDGE
========================================================= */

app.get(
    "/api/knowledge",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const items = knowledge.listKnowledge(
            businessId,
            {
                category: req.query.category,
                limit: parseLimit(req.query.limit),
                offset: parseOffset(req.query.offset)
            }
        );

        return sendSuccess(res, {
            knowledge: items
        });
    })
);

app.get(
    "/api/knowledge/search",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);
        const query = String(req.query.q || "").trim();

        if (!query) {
            return sendError(res, "Search query is required.");
        }

        const results = knowledge.searchKnowledge(
            businessId,
            query,
            parseLimit(req.query.limit)
        );

        return sendSuccess(res, {
            results
        });
    })
);

app.get(
    "/api/knowledge/categories",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const categories = knowledge.listCategories(
            businessId
        );

        return sendSuccess(res, {
            categories
        });
    })
);

app.get(
    "/api/knowledge/:knowledgeId",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const item = knowledge.getKnowledgeById(
            businessId,
            req.params.knowledgeId
        );

        if (!item) {
            return sendError(res, "Knowledge item not found.", 404);
        }

        return sendSuccess(res, {
            knowledge: item
        });
    })
);

app.post(
    "/api/knowledge",
    requireAuth,
    requireAdmin,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const item = knowledge.createKnowledge(
            businessId,
            req.body || {}
        );

        return sendSuccess(
            res,
            {
                message: "Knowledge item created.",
                knowledge: item
            },
            201
        );
    })
);

app.patch(
    "/api/knowledge/:knowledgeId",
    requireAuth,
    requireAdmin,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const item = knowledge.updateKnowledge(
            businessId,
            req.params.knowledgeId,
            req.body || {}
        );

        return sendSuccess(res, {
            message: "Knowledge item updated.",
            knowledge: item
        });
    })
);

app.delete(
    "/api/knowledge/:knowledgeId",
    requireAuth,
    requireAdmin,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        knowledge.deleteKnowledge(
            businessId,
            req.params.knowledgeId
        );

        return sendSuccess(res, {
            message: "Knowledge item deleted."
        });
    })
);

/* =========================================================
   CUSTOMERS
========================================================= */

app.get(
    "/api/customers",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result = customers.listCustomers(
            businessId,
            {
                limit: parseLimit(req.query.limit),
                offset: parseOffset(req.query.offset)
            }
        );

        return sendSuccess(res, {
            customers: result
        });
    })
);

app.get(
    "/api/customers/search",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);
        const query = String(req.query.q || "").trim();

        if (!query) {
            return sendError(res, "Search query is required.");
        }

        const result = customers.searchCustomers(
            businessId,
            query,
            parseLimit(req.query.limit)
        );

        return sendSuccess(res, {
            customers: result
        });
    })
);

app.get(
    "/api/customers/:customerId/profile",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const profile = customers.getCustomerProfile(
            businessId,
            req.params.customerId
        );

        if (!profile) {
            return sendError(res, "Customer not found.", 404);
        }

        return sendSuccess(res, {
            profile
        });
    })
);

app.get(
    "/api/customers/:customerId",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const customer = customers.getCustomerById(
            businessId,
            req.params.customerId
        );

        if (!customer) {
            return sendError(res, "Customer not found.", 404);
        }

        return sendSuccess(res, {
            customer
        });
    })
);

app.post(
    "/api/customers",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const customer = customers.createCustomer(
            businessId,
            req.body || {}
        );

        return sendSuccess(
            res,
            {
                message: "Customer created.",
                customer
            },
            201
        );
    })
);

app.patch(
    "/api/customers/:customerId",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const customer = customers.updateCustomer(
            businessId,
            req.params.customerId,
            req.body || {}
        );

        return sendSuccess(res, {
            message: "Customer updated.",
            customer
        });
    })
);

app.delete(
    "/api/customers/:customerId",
    requireAuth,
    requireAdmin,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        customers.deleteCustomer(
            businessId,
            req.params.customerId
        );

        return sendSuccess(res, {
            message: "Customer deleted."
        });
    })
);

/* =========================================================
   ORDERS
========================================================= */

app.get(
    "/api/orders",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result = orders.listOrders(
            businessId,
            {
                limit: parseLimit(req.query.limit),
                offset: parseOffset(req.query.offset),
                status: req.query.status
            }
        );

        return sendSuccess(res, {
            orders: result
        });
    })
);

app.get(
    "/api/orders/search",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);
        const query = String(req.query.q || "").trim();

        if (!query) {
            return sendError(res, "Search query is required.");
        }

        const result = orders.searchOrders(
            businessId,
            query,
            parseLimit(req.query.limit)
        );

        return sendSuccess(res, {
            orders: result
        });
    })
);

app.get(
    "/api/orders/delayed",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result = orders.getDelayedOrders(
            businessId,
            parseLimit(req.query.limit)
        );

        return sendSuccess(res, {
            orders: result
        });
    })
);

app.get(
    "/api/orders/:orderId/status",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result = orders.checkDeliveryStatus(
            businessId,
            req.params.orderId
        );

        if (!result) {
            return sendError(res, "Order not found.", 404);
        }

        return sendSuccess(res, {
            delivery: result
        });
    })
);

app.get(
    "/api/orders/:orderId",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const order = orders.getOrderById(
            businessId,
            req.params.orderId
        );

        if (!order) {
            return sendError(res, "Order not found.", 404);
        }

        return sendSuccess(res, {
            order
        });
    })
);

app.post(
    "/api/orders",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const order = orders.createOrder(
            businessId,
            req.body || {}
        );

        return sendSuccess(
            res,
            {
                message: "Order created.",
                order
            },
            201
        );
    })
);

app.patch(
    "/api/orders/:orderId",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const order = orders.updateOrder(
            businessId,
            req.params.orderId,
            req.body || {}
        );

        return sendSuccess(res, {
            message: "Order updated.",
            order
        });
    })
);

app.patch(
    "/api/orders/:orderId/delivery-status",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);
        const { status, expectedDeliveryDate } = req.body || {};

        const order = orders.updateDeliveryStatus(
            businessId,
            req.params.orderId,
            status,
            expectedDeliveryDate
        );

        return sendSuccess(res, {
            message: "Delivery status updated.",
            order
        });
    })
);

app.delete(
    "/api/orders/:orderId",
    requireAuth,
    requireAdmin,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        orders.deleteOrder(
            businessId,
            req.params.orderId
        );

        return sendSuccess(res, {
            message: "Order deleted."
        });
    })
);

/* =========================================================
   CASES
========================================================= */

app.get(
    "/api/cases",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result = cases.listCases(
            businessId,
            {
                status: req.query.status,
                limit: parseLimit(req.query.limit),
                offset: parseOffset(req.query.offset)
            }
        );

        return sendSuccess(res, {
            cases: result
        });
    })
);

app.get(
    "/api/cases/search",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);
        const query = String(req.query.q || "").trim();

        if (!query) {
            return sendError(res, "Search query is required.");
        }

        const result = cases.searchCases(
            businessId,
            query,
            parseLimit(req.query.limit)
        );

        return sendSuccess(res, {
            cases: result
        });
    })
);

app.get(
    "/api/cases/:caseId/history",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const history = cases.getCaseHistory(
            businessId,
            req.params.caseId
        );

        return sendSuccess(res, {
            history
        });
    })
);

app.get(
    "/api/cases/:caseId",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const caseRecord = cases.getCaseById(
            businessId,
            req.params.caseId
        );

        if (!caseRecord) {
            return sendError(res, "Case not found.", 404);
        }

        return sendSuccess(res, {
            case: caseRecord
        });
    })
);

app.post(
    "/api/cases",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const caseRecord = cases.createCase(
            businessId,
            req.body || {}
        );

        return sendSuccess(
            res,
            {
                message: "Case created.",
                case: caseRecord
            },
            201
        );
    })
);

app.patch(
    "/api/cases/:caseId",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const caseRecord = cases.updateCase(
            businessId,
            req.params.caseId,
            req.body || {}
        );

        return sendSuccess(res, {
            message: "Case updated.",
            case: caseRecord
        });
    })
);

app.post(
    "/api/cases/:caseId/resolve",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result = cases.resolveCase(
            businessId,
            req.params.caseId,
            req.body || {}
        );

        return sendSuccess(res, {
            message: "Case resolved.",
            case: result
        });
    })
);

app.post(
    "/api/cases/:caseId/escalate",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result = cases.escalateCase(
            businessId,
            req.params.caseId,
            req.body || {}
        );

        return sendSuccess(res, {
            message: "Case escalated to a human.",
            case: result
        });
    })
);

/* =========================================================
   HUMAN ESCALATIONS
========================================================= */

app.get(
    "/api/escalations",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result = cases.listEscalations(
            businessId,
            {
                status: req.query.status,
                limit: parseLimit(req.query.limit),
                offset: parseOffset(req.query.offset)
            }
        );

        return sendSuccess(res, {
            escalations: result
        });
    })
);

app.post(
    "/api/escalations/:escalationId/resolve",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);
        const userId = getUserId(req);

        const result = cases.resolveEscalation(
            businessId,
            req.params.escalationId,
            {
                ...req.body,
                resolved_by: userId
            }
        );

        return sendSuccess(res, {
            message: "Escalation resolved.",
            escalation: result
        });
    })
);

app.post(
    "/api/cases/:caseId/return-to-ai",
    requireAuth,
    requireAdmin,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result = cases.returnCaseToAI(
            businessId,
            req.params.caseId,
            req.body || {}
        );

        return sendSuccess(res, {
            message: "Case returned to AI Worker.",
            case: result
        });
    })
);

/* =========================================================
   AI WORKER EXECUTION
========================================================= */

app.post(
    "/api/workers/:workerId/run",
    requireAuth,
    requireWorkerAccess,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const input = req.body || {};

        if (!input.message && !input.customerMessage) {
            return sendError(
                res,
                "A customer message is required."
            );
        }

        const result = await aiWorker.runWorker({
            businessId,
            workerId: req.params.workerId,
            ...input
        });

        return sendSuccess(res, {
            result
        });
    })
);

app.get(
    "/api/workers/:workerId/runs",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result = aiWorker.listWorkerRuns(
            businessId,
            req.params.workerId,
            {
                limit: parseLimit(req.query.limit),
                offset: parseOffset(req.query.offset)
            }
        );

        return sendSuccess(res, {
            runs: result
        });
    })
);

app.get(
    "/api/workers/:workerId/runs/:runId",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result = aiWorker.getWorkerRun(
            businessId,
            req.params.runId
        );

        if (!result) {
            return sendError(res, "Worker run not found.", 404);
        }

        return sendSuccess(res, {
            run: result
        });
    })
);

/* =========================================================
   ACTIVITY
========================================================= */

app.get(
    "/api/activity",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result = activity.listActivities(
            businessId,
            {
                limit: parseLimit(req.query.limit),
                offset: parseOffset(req.query.offset),
                type: req.query.type
            }
        );

        return sendSuccess(res, {
            activities: result
        });
    })
);

app.get(
    "/api/activity/search",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);
        const query = String(req.query.q || "").trim();

        if (!query) {
            return sendError(res, "Search query is required.");
        }

        const result = activity.searchActivities(
            businessId,
            query,
            parseLimit(req.query.limit)
        );

        return sendSuccess(res, {
            activities: result
        });
    })
);

app.get(
    "/api/activity/recent",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result = activity.getRecentActivities(
            businessId,
            parseLimit(req.query.limit, 20, 100)
        );

        return sendSuccess(res, {
            activities: result
        });
    })
);

app.get(
    "/api/activity/case/:caseId",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result = activity.getCaseActivity(
            businessId,
            req.params.caseId
        );

        return sendSuccess(res, {
            activities: result
        });
    })
);

app.get(
    "/api/activity/customer/:customerId",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result = activity.getCustomerActivity(
            businessId,
            req.params.customerId
        );

        return sendSuccess(res, {
            activities: result
        });
    })
);

app.get(
    "/api/activity/order/:orderId",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result = activity.getOrderActivity(
            businessId,
            req.params.orderId
        );

        return sendSuccess(res, {
            activities: result
        });
    })
);

app.get(
    "/api/activity/export",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result = activity.exportActivities(
            businessId,
            {
                type: req.query.type,
                limit: parseLimit(req.query.limit, 500, 5000)
            }
        );

        res.setHeader(
            "Content-Type",
            "application/json"
        );

        res.setHeader(
            "Content-Disposition",
            'attachment; filename="ai-workforce-activity.json"'
        );

        return res.status(200).send(
            JSON.stringify(result, null, 2)
        );
    })
);

app.delete(
    "/api/activity/:activityId",
    requireAuth,
    requireAdmin,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        activity.deleteActivity(
            businessId,
            req.params.activityId
        );

        return sendSuccess(res, {
            message: "Activity deleted."
        });
    })
);

/* =========================================================
   INTEGRATIONS
========================================================= */

app.get(
    "/api/integrations/supported",
    requireAuth,
    asyncRoute(async (req, res) => {
        const result =
            integrations.getSupportedIntegrationTypes();

        return sendSuccess(res, {
            integrations: result
        });
    })
);

app.get(
    "/api/integrations",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result =
            integrations.getPublicIntegrations(
                businessId
            );

        return sendSuccess(res, {
            integrations: result
        });
    })
);

app.get(
    "/api/integrations/:integrationId",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result =
            integrations.getPublicIntegrationById(
                businessId,
                req.params.integrationId
            );

        if (!result) {
            return sendError(
                res,
                "Integration not found.",
                404
            );
        }

        return sendSuccess(res, {
            integration: result
        });
    })
);

app.post(
    "/api/integrations",
    requireAuth,
    requireAdmin,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result =
            integrations.createIntegration(
                businessId,
                req.body || {}
            );

        return sendSuccess(
            res,
            {
                message: "Integration created.",
                integration:
                    integrations.sanitizeIntegration(result)
            },
            201
        );
    })
);

app.patch(
    "/api/integrations/:integrationId",
    requireAuth,
    requireAdmin,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result =
            integrations.updateIntegration(
                businessId,
                req.params.integrationId,
                req.body || {}
            );

        return sendSuccess(res, {
            message: "Integration updated.",
            integration:
                integrations.sanitizeIntegration(result)
        });
    })
);

app.post(
    "/api/integrations/:integrationId/connect",
    requireAuth,
    requireAdmin,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result =
            integrations.connectIntegration(
                businessId,
                req.params.integrationId
            );

        return sendSuccess(res, {
            message: "Integration connected.",
            integration:
                integrations.sanitizeIntegration(result)
        });
    })
);

app.post(
    "/api/integrations/:integrationId/disconnect",
    requireAuth,
    requireAdmin,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result =
            integrations.disconnectIntegration(
                businessId,
                req.params.integrationId
            );

        return sendSuccess(res, {
            message: "Integration disconnected.",
            integration:
                integrations.sanitizeIntegration(result)
        });
    })
);

app.post(
    "/api/integrations/:integrationId/disable",
    requireAuth,
    requireAdmin,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result =
            integrations.disableIntegration(
                businessId,
                req.params.integrationId
            );

        return sendSuccess(res, {
            message: "Integration disabled.",
            integration:
                integrations.sanitizeIntegration(result)
        });
    })
);

app.get(
    "/api/integrations/:integrationId/health",
    requireAuth,
    asyncRoute(async (req, res) => {
        const businessId = getBusinessId(req);

        const result =
            integrations.integrationHealth(
                businessId,
                req.params.integrationId
            );

        return sendSuccess(res, {
            health: result
        });
    })
);

/* =========================================================
   BASIC FRONTEND SERVING
========================================================= */

/*
 * We deliberately serve only the three frontend files.
 * We do NOT expose the entire project directory because it
 * contains the SQLite database and backend source code.
 */

app.get("/", (req, res) => {
    res.sendFile(
        path.join(__dirname, "..", "index.html")
    );
});

app.get("/index.html", (req, res) => {
    res.sendFile(
        path.join(__dirname, "..", "index.html")
    );
});

app.get("/style.css", (req, res) => {
    res.sendFile(
        path.join(__dirname, "..", "style.css")
    );
});

app.get("/app.js", (req, res) => {
    res.sendFile(
        path.join(__dirname, "..", "app.js")
    );
});

/* =========================================================
   API 404
========================================================= */

app.use("/api", (req, res) => {
    return sendError(
        res,
        "API endpoint not found.",
        404
    );
});

/* =========================================================
   GLOBAL ERROR HANDLER
========================================================= */

app.use((error, req, res, next) => {
    console.error(
        `[API ERROR] ${req.method} ${req.originalUrl}`,
        error
    );

    const status =
        Number(error.status) >= 400 &&
        Number(error.status) < 600
            ? Number(error.status)
            : 500;

    const message =
        status === 500
            ? "Internal server error."
            : error.message || "Request failed.";

    return res.status(status).json({
        success: false,
        error: message
    });
});

/* =========================================================
   START SERVER
========================================================= */

const server = app.listen(PORT, () => {
    console.log("");
    console.log("==========================================");
    console.log("        AI WORKFORCE API SERVER");
    console.log("==========================================");
    console.log(`Server: http://localhost:${PORT}`);
    console.log(`Health: http://localhost:${PORT}/api/health`);
    console.log("Environment:", process.env.NODE_ENV || "development");
    console.log("==========================================");
    console.log("");
});

function shutdown(signal) {
    console.log(`\nReceived ${signal}. Shutting down...`);

    server.close(() => {
        console.log("AI Workforce server stopped.");
        process.exit(0);
    });
}

process.on("SIGTERM", () => shutdown("SIGTERM"));
process.on("SIGINT", () => shutdown("SIGINT"));

module.exports = {
    app,
    server
};