const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const stringify = require('fast-json-stable-stringify');
const crypto = require('crypto');
const { adaptAndDispatch } = require('./dispatcher_adapter');
const capabilities = require('./capabilities.json');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(helmet());
app.use(cors());
app.use(express.json());

// Routes
app.get('/os/capabilities', (req, res) => {
    res.json({
        environment: process.env.NODE_ENV || 'development',
        version: capabilities.version || '1.0.0',
        available_intents: capabilities.available_intents || [],
        platforms: ["meta", "google_ads"] // Static or loaded from config
    });
});

app.post('/os/run', async (req, res) => {
    try {
        const { execution_id, intent, payload, requested_at } = req.body;

        // 1. Strict Validation
        const errors = [];
        if (typeof execution_id !== 'string' || !execution_id.trim()) errors.push("execution_id must be a non-empty string");
        if (typeof intent !== 'string' || !intent.trim()) errors.push("intent must be a non-empty string");
        if (typeof requested_at !== 'string' || !requested_at.trim()) errors.push("requested_at must be a non-empty string");
        if (!payload || typeof payload !== 'object' || Array.isArray(payload)) errors.push("payload must be an object");

        if (errors.length > 0) {
            return res.status(400).json({
                code: "INVALID_REQUEST",
                errors: errors.sort() // Deterministic order
            });
        }

        // 2. Invoke Dispatcher
        const result = await adaptAndDispatch({ execution_id, intent, payload, requested_at });

        // 3. Compute Canonical Hash
        // Shape: { execution_id, intent, requested_at, result }
        const canonicalObj = {
            execution_id,
            intent,
            requested_at,
            result
        };
        const canonicalString = stringify(canonicalObj);
        const canonicalHash = crypto.createHash('sha256').update(canonicalString).digest('hex');

        // 4. Return Strict Contract
        const response = {
            execution_id,
            intent,
            requested_at,
            completed_at: new Date().toISOString(),
            result,
            canonical_hash: canonicalHash
        };

        res.json(response);

    } catch (error) {
        console.error('OS Runtime Error:', error);
        res.status(500).json({
            error: "Internal OS Runtime Error",
            message: error.message
        });
    }
});

app.get('/health', (req, res) => {
    res.json({ status: 'ok' });
});

// Start Server
if (require.main === module) {
    app.listen(PORT, () => {
        console.log(`OS Runtime Service running on port ${PORT}`);
    });
}
module.exports = app;
