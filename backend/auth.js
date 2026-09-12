const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { db } = require("./database");

const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
    throw new Error(
        "JWT_SECRET is missing. Create a .env file using .env.example before starting the server."
    );
}

const TOKEN_EXPIRATION = "7d";

/**
 * Normalize email addresses so the same email
 * cannot accidentally create multiple accounts.
 */
function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
}

/**
 * Basic email validation.
 */
function isValidEmail(email) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

/**
 * Password validation.
 *
 * We deliberately keep this simple for V1.
 * Production deployments should also add rate limiting,
 * email verification and account recovery.
 */
function validatePassword(password) {
    return typeof password === "string" && password.length >= 8;
}

/**
 * Create a JWT for an authenticated user.
 */
function createToken(user) {
    return jwt.sign(
        {
            userId: user.id,
            businessId: user.business_id,
            role: user.role,
            email: user.email
        },
        JWT_SECRET,
        {
            expiresIn: TOKEN_EXPIRATION
        }
    );
}

/**
 * Safely return public user information.
 *
 * Never return password_hash to the frontend.
 */
function publicUser(user) {
    return {
        id: user.id,
        businessId: user.business_id,
        email: user.email,
        name: user.name,
        role: user.role,
        createdAt: user.created_at
    };
}

/**
 * Register a new business and its first user.
 *
 * The first user becomes the business owner.
 */
function registerBusiness({
    businessName,
    name,
    email,
    password
}) {
    const cleanBusinessName = String(businessName || "").trim();
    const cleanName = String(name || "").trim();
    const cleanEmail = normalizeEmail(email);

    if (!cleanBusinessName) {
        throw new Error("Business name is required.");
    }

    if (!cleanName) {
        throw new Error("Name is required.");
    }

    if (!isValidEmail(cleanEmail)) {
        throw new Error("A valid email address is required.");
    }

    if (!validatePassword(password)) {
        throw new Error("Password must contain at least 8 characters.");
    }

    const existingUser = db
        .prepare(
            `
            SELECT id
            FROM users
            WHERE email = ?
            `
        )
        .get(cleanEmail);

    if (existingUser) {
        throw new Error("An account with this email already exists.");
    }

    const passwordHash = bcrypt.hashSync(password, 12);

    const createAccount = db.transaction(() => {
        const businessResult = db
            .prepare(
                `
                INSERT INTO businesses (
                    name
                )
                VALUES (?)
                `
            )
            .run(cleanBusinessName);

        const businessId = Number(businessResult.lastInsertRowid);

        const userResult = db
            .prepare(
                `
                INSERT INTO users (
                    business_id,
                    name,
                    email,
                    password_hash,
                    role
                )
                VALUES (?, ?, ?, ?, ?)
                `
            )
            .run(
                businessId,
                cleanName,
                cleanEmail,
                passwordHash,
                "owner"
            );

        const userId = Number(userResult.lastInsertRowid);

        const user = db
            .prepare(
                `
                SELECT
                    id,
                    business_id,
                    name,
                    email,
                    role,
                    created_at
                FROM users
                WHERE id = ?
                `
            )
            .get(userId);

        return {
            businessId,
            user
        };
    });

    const account = createAccount();

    return {
        user: publicUser(account.user),
        token: createToken(account.user)
    };
}

/**
 * Authenticate an existing user.
 */
function loginUser({ email, password }) {
    const cleanEmail = normalizeEmail(email);

    if (!isValidEmail(cleanEmail)) {
        throw new Error("A valid email address is required.");
    }

    if (!password) {
        throw new Error("Password is required.");
    }

    const user = db
        .prepare(
            `
            SELECT
                id,
                business_id,
                name,
                email,
                password_hash,
                role,
                created_at
            FROM users
            WHERE email = ?
            `
        )
        .get(cleanEmail);

    if (!user) {
        throw new Error("Invalid email or password.");
    }

    const passwordMatches = bcrypt.compareSync(
        password,
        user.password_hash
    );

    if (!passwordMatches) {
        throw new Error("Invalid email or password.");
    }

    return {
        user: publicUser(user),
        token: createToken(user)
    };
}

/**
 * Read the Authorization header.
 *
 * Expected format:
 *
 * Authorization: Bearer <token>
 */
function getTokenFromRequest(req) {
    const header = req.headers.authorization;

    if (!header) {
        return null;
    }

    const parts = header.split(" ");

    if (parts.length !== 2) {
        return null;
    }

    const scheme = parts[0];
    const token = parts[1];

    if (scheme.toLowerCase() !== "bearer") {
        return null;
    }

    return token;
}

/**
 * Verify the user's JWT.
 */
function verifyToken(token) {
    if (!token) {
        throw new Error("Authentication token is required.");
    }

    try {
        return jwt.verify(token, JWT_SECRET);
    } catch (error) {
        throw new Error("Invalid or expired authentication token.");
    }
}

/**
 * Express middleware that protects an API route.
 *
 * Example:
 *
 * app.get("/api/customers", authenticate, handler);
 */
function authenticate(req, res, next) {
    try {
        const token = getTokenFromRequest(req);

        if (!token) {
            return res.status(401).json({
                success: false,
                error: "Authentication required."
            });
        }

        const payload = verifyToken(token);

        const user = db
            .prepare(
                `
                SELECT
                    id,
                    business_id,
                    name,
                    email,
                    role,
                    created_at
                FROM users
                WHERE id = ?
                `
            )
            .get(payload.userId);

        if (!user) {
            return res.status(401).json({
                success: false,
                error: "User account no longer exists."
            });
        }

        req.user = publicUser(user);

        next();
    } catch (error) {
        return res.status(401).json({
            success: false,
            error: error.message
        });
    }
}

/**
 * Require one or more specific user roles.
 *
 * Example:
 *
 * requireRole("owner", "admin")
 */
function requireRole(...allowedRoles) {
    return (req, res, next) => {
        if (!req.user) {
            return res.status(401).json({
                success: false,
                error: "Authentication required."
            });
        }

        if (!allowedRoles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                error: "You do not have permission to perform this action."
            });
        }

        next();
    };
}

/**
 * Get the currently authenticated user from the database.
 */
function getUserById(userId) {
    return db
        .prepare(
            `
            SELECT
                id,
                business_id,
                name,
                email,
                role,
                created_at
            FROM users
            WHERE id = ?
            `
        )
        .get(userId);
}

/**
 * Get the business belonging to a user.
 */
function getBusinessById(businessId) {
    return db
        .prepare(
            `
            SELECT
                id,
                name,
                created_at
            FROM businesses
            WHERE id = ?
            `
        )
        .get(businessId);
}

/**
 * Check that a resource belongs to the
 * authenticated user's business.
 *
 * This is one of the important pieces of
 * tenant isolation for AI Workforce.
 */
function assertBusinessAccess(user, businessId) {
    if (!user) {
        throw new Error("Authentication required.");
    }

    if (Number(user.businessId) !== Number(businessId)) {
        const error = new Error(
            "You do not have access to this business."
        );

        error.statusCode = 403;

        throw error;
    }

    return true;
}

module.exports = {
    normalizeEmail,
    isValidEmail,
    validatePassword,
    createToken,
    publicUser,
    registerBusiness,
    loginUser,
    getTokenFromRequest,
    verifyToken,
    authenticate,
    requireRole,
    getUserById,
    getBusinessById,
    assertBusinessAccess
};