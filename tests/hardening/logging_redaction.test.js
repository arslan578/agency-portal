const logging = require('../../orchestrator/shared/logging');

describe('Security Hardening: Logging Redaction', () => {
    let consoleLogMock;

    beforeEach(() => {
        consoleLogMock = jest.spyOn(console, 'log').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('Redacts sensitive keys', () => {
        const sensitivePayload = {
            user: 'alice',
            password: 'superSecretPassword',
            apiKey: 'sk_12345',
            nested: {
                secretToken: 'xyz-987'
            }
        };

        logging.logStructuredRequired('TEST_SENSITIVE', sensitivePayload, { execution_id: '1' });

        const loggedJson = JSON.parse(consoleLogMock.mock.calls[0][0]);

        expect(loggedJson.user).toBe('alice');
        expect(loggedJson.password).toBe('[REDACTED]');
        expect(loggedJson.apiKey).toBe('[REDACTED]');
        expect(loggedJson.nested.secretToken).toBe('[REDACTED]');
    });
});
