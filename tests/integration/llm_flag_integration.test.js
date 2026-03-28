const { runLLM } = require('../../services/shared/llm');
const { resolveModel } = require('../../services/shared/llm/router');

// Simple integration test for flag behavior
describe('LLM Flag Integration', () => {
    const originalEnv = process.env;

    beforeEach(() => {
        jest.resetModules();
        process.env = { ...originalEnv };
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    test('Flag OFF: Uses legacy default (gpt-4o)', () => {
        process.env.FF_OPENAI_MODEL_ROUTER_ENABLED = 'false';

        // We test the router logic via resolveModel because runLLM mocks would require mocking openai which we did in unit tests.
        // This confirms the env var integration.
        const model = resolveModel('ORCHESTRATION_CORE');
        expect(model).toBe('gpt-4o');
    });

    test('Flag ON: Uses pinned model from env', () => {
        process.env.FF_OPENAI_MODEL_ROUTER_ENABLED = 'true';
        process.env.OPENAI_MODEL_CORE = 'gpt-5.2-integration';

        const model = resolveModel('ORCHESTRATION_CORE');
        expect(model).toBe('gpt-5.2-integration');
    });

    test('Flag ON: Throws if pinned model missing', () => {
        process.env.FF_OPENAI_MODEL_ROUTER_ENABLED = 'true';
        delete process.env.OPENAI_MODEL_CORE;

        expect(() => resolveModel('ORCHESTRATION_CORE')).toThrow('Missing environment variable');
    });
});
