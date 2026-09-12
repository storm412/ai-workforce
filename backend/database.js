const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

// ------------------------------------------------------------
// DATABASE LOCATION
// ------------------------------------------------------------

const projectRoot = path.join(__dirname, "..");
const databaseDirectory = path.join(projectRoot, "database");
const databaseFile = path.join(databaseDirectory, "ai-workforce.db");

if (!fs.existsSync(databaseDirectory)) {
    fs.mkdirSync(databaseDirectory, { recursive: true });
}

// ------------------------------------------------------------
// OPEN DATABASE
// ------------------------------------------------------------

const db = new Database(databaseFile);

// SQLite safety/performance settings
db.pragma("journal_mode = WAL");
db.pragma("foreign_keys = ON");

// ------------------------------------------------------------
// CREATE DATABASE STRUCTURE
// ------------------------------------------------------------

const schemaFile = path.join(databaseDirectory, "schema.sql");

if (!fs.existsSync(schemaFile)) {
    throw new Error(
        `Database schema not found at: ${schemaFile}`
    );
}

const schema = fs.readFileSync(schemaFile, "utf8");

db.exec(schema);

// ------------------------------------------------------------
// DATABASE HELPERS
// ------------------------------------------------------------

function getDb() {
    return db;
}

function transaction(callback) {
    const runTransaction = db.transaction(callback);
    return runTransaction();
}

function closeDatabase() {
    if (db.open) {
        db.close();
    }
}

// ------------------------------------------------------------
// HEALTH CHECK
// ------------------------------------------------------------

function databaseHealth() {
    try {
        const result = db
            .prepare("SELECT 1 AS ok")
            .get();

        return {
            connected: result && result.ok === 1,
            database: databaseFile
        };
    } catch (error) {
        return {
            connected: false,
            database: databaseFile,
            error: error.message
        };
    }
}

// ------------------------------------------------------------
// EXPORTS
// ------------------------------------------------------------

module.exports = {
    db,
    getDb,
    transaction,
    closeDatabase,
    databaseHealth
};