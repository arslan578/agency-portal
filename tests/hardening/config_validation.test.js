const validateEnv = require('../../orchestrator/shared/config/validate_env');

describe('Config Validation', () => {
    let originalEnv;
    let exitMock;
    let consoleErrorMock;
    let consoleWarnMock;

    beforeEach(() => {
        originalEnv = { ...process.env };
        exitMock = jest.spyOn(process, 'exit').mockImplementation(() => { });
        consoleErrorMock = jest.spyOn(console, 'error').mockImplementation(() => { });
        consoleWarnMock = jest.spyOn(console, 'warn').mockImplementation(() => { });
    });

    afterEach(() => {
        process.env = originalEnv;
        jest.restoreAllMocks();
    });

    test('Observe Mode (Default): Warns but does not exit on missing keys', () => {
        delete process.env.FF_STRICT_ENV_VALIDATION; // Ensure default

        // Test with a missing key
        validateEnv(['MISSING_KEY_123']);

        expect(exitMock).not.toHaveBeenCalled();
        expect(consoleWarnMock).toHaveBeenCalledTimes(2);
        const firstCall = consoleWarnMock.mock.calls[0][0];
        const secondCall = consoleWarnMock.mock.calls[1][0];
        expect(firstCall).toContain('MISSING_KEY_123');
        expect(secondCall).toContain('OBSERVE mode');
    });

    test('Strict Mode: Exits on missing keys', () => {
        process.env.FF_STRICT_ENV_VALIDATION = 'true';

        // Test with a missing key
        validateEnv(['MISSING_KEY_XYZ']);

        expect(exitMock).toHaveBeenCalledWith(1);
        expect(consoleErrorMock).toHaveBeenCalled();
        const errorCall = consoleErrorMock.mock.calls[0][0];
        expect(errorCall).toContain('MISSING_KEY_XYZ');
        expect(errorCall).toContain('FATAL');
    });

    test('Success: No warning or exit if keys are present', () => {
        process.env.TEST_KEY_EXISTING = 'value';

        validateEnv(['TEST_KEY_EXISTING']);

        expect(exitMock).not.toHaveBeenCalled();
        expect(consoleWarnMock).not.toHaveBeenCalled();
        expect(consoleErrorMock).not.toHaveBeenCalled();
    });

    test('Determinism: Sorted keys in output', () => {
        delete process.env.FF_STRICT_ENV_VALIDATION;

        // Pass keys in unsorted order
        validateEnv(['Z_KEY', 'A_KEY', 'B_KEY']);

        const warnCall = consoleWarnMock.mock.calls[0][0];
        // Expected output should match sorted array structure from JSON.stringify
        // ["A_KEY","B_KEY","Z_KEY"]
        expect(warnCall).toContain('["A_KEY","B_KEY","Z_KEY"]');
    });
});
