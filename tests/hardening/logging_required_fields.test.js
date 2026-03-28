const logging = require('../../orchestrator/shared/logging');

describe('Observability Hardening', () => {
    let consoleLogMock;

    beforeEach(() => {
        consoleLogMock = jest.spyOn(console, 'log').mockImplementation(() => { });
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('Injects required fields from explicit context', () => {
        const payload = { foo: 'bar' };
        const context = {
            execution_id: 'exec-123',
            phase: 'PHASE_TEST',
            contract_version: 'v1'
        };

        logging.logStructuredRequired('TEST_EVENT', payload, context);

        expect(consoleLogMock).toHaveBeenCalled();
        const loggedJson = JSON.parse(consoleLogMock.mock.calls[0][0]);

        expect(loggedJson.event).toBe('TEST_EVENT');
        expect(loggedJson.foo).toBe('bar');
        expect(loggedJson.execution_id).toBe('exec-123');
        expect(loggedJson.phase).toBe('PHASE_TEST');
    });

    test('Injects required fields from input fallback', () => {
        const payload = { foo: 'bar' };
        const input = {
            execution_id: 'exec-fallback',
            phase: 'PHASE_FALLBACK',
            contract_version: 'v2',
            intent: 'INTENT_TEST'
        };
        const context = { input };

        logging.logStructuredRequired('TEST_EVENT', payload, context);

        const loggedJson = JSON.parse(consoleLogMock.mock.calls[0][0]);
        expect(loggedJson.execution_id).toBe('exec-fallback');
        expect(loggedJson.phase).toBe('PHASE_FALLBACK');
        expect(loggedJson.intent).toBe('INTENT_TEST');
    });

    test('Defaults to unknown if missing', () => {
        logging.logStructuredRequired('TEST_EVENT', {});

        const loggedJson = JSON.parse(consoleLogMock.mock.calls[0][0]);
        expect(loggedJson.execution_id).toBe('unknown');
        expect(loggedJson.phase).toBe('unknown');
    });

    test('Explicit context overrides input fallback', () => {
        const input = { execution_id: 'fallback-id' };
        const context = {
            input,
            execution_id: 'explicit-id'
        };

        logging.logStructuredRequired('TEST_EVENT', {}, context);

        const loggedJson = JSON.parse(consoleLogMock.mock.calls[0][0]);
        expect(loggedJson.execution_id).toBe('explicit-id');
    });

    test('Does not mutate original payload', () => {
        const payload = { original: true };
        const context = { execution_id: 'id' };

        logging.logStructuredRequired('TEST_EVENT', payload, context);

        expect(payload).toEqual({ original: true });
        expect(payload.execution_id).toBeUndefined();
    });
});
