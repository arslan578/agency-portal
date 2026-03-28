const { runLLM } = require('../index');
const { resolveModel } = require('../router');
const { executeCompletion } = require('../responses_client');
const {
    LLMConfigError,
    LLMTimeoutError,
    LLMRateLimitError,
    LLMTransientNetworkError,
    LLMInvalidOutputError
} = require('../errors');
const fixtures = require('../fixtures/golden');

// Mock dependencies
jest.mock('../responses_client');

// Mock Env
const originalEnv = process.env;

describe('LLM Module Tests', () => {
    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...originalEnv };
        // Default flags OFF
        process.env.FF_OPENAI_RESPONSES_ENABLED = 'false';
        process.env.FF_OPENAI_MODEL_ROUTER_ENABLED = 'false';
    });

    afterAll(() => {
        process.env = originalEnv;
    });

    // --- 6 Happy Path Tests ---

    test('Happy Path 1: Default legacy behavior (Router OFF)', async () => {
        executeCompletion.mockResolvedValue(fixtures.SUCCESS_SCHEMA_OUTPUT);
        const result = await runLLM({ task: 'ORCHESTRATION_CORE', messages: [] });
        expect(result.model).toBe('gpt-5.2-preview');
        expect(result.outputText).toBeDefined();
        // Since router is OFF, resolveModel should return 'gpt-4o' internally, tested separately?
        // Actually executeCompletion gets passed the model.
        expect(executeCompletion).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4o' }));
    });

    test('Happy Path 2: Router ON selects correct model', async () => {
        process.env.FF_OPENAI_MODEL_ROUTER_ENABLED = 'true';
        process.env.OPENAI_MODEL_CORE = 'gpt-5.2';
        executeCompletion.mockResolvedValue(fixtures.SUCCESS_SCHEMA_OUTPUT);

        await runLLM({ task: 'ORCHESTRATION_CORE', messages: [] });
        expect(executeCompletion).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-5.2' }));
    });

    test('Happy Path 3: GATING_FINAL with idempotencyKey', async () => {
        process.env.FF_OPENAI_MODEL_ROUTER_ENABLED = 'true';
        process.env.OPENAI_MODEL_GATING = 'gpt-5.2-pro';
        executeCompletion.mockResolvedValue(fixtures.SUCCESS_SCHEMA_OUTPUT);

        await runLLM({
            task: 'GATING_FINAL',
            messages: [],
            idempotencyKey: 'abc-123'
        });
        expect(executeCompletion).toHaveBeenCalledWith(
            expect.objectContaining({
                model: 'gpt-5.2-pro',
                requestOptions: { idempotencyKey: 'abc-123' }
            })
        );
    });

    test('Happy Path 4: Structured Output (Schema provided)', async () => {
        const schema = { type: "object", properties: { result: { type: "string" } } };
        executeCompletion.mockResolvedValue(fixtures.SUCCESS_SCHEMA_OUTPUT);

        const result = await runLLM({ task: 'TRANSFORM', messages: [], jsonSchema: schema });
        expect(result.outputJson).toEqual({ result: "success", score: 0.99 });
        expect(executeCompletion).toHaveBeenCalledWith(
            expect.objectContaining({ jsonSchema: schema })
        );
    });

    test('Happy Path 5: Pass through requestedAt', async () => {
        executeCompletion.mockResolvedValue(fixtures.SUCCESS_SCHEMA_OUTPUT);
        const ts = '2024-01-01T12:00:00Z';
        const result = await runLLM({ task: 'TAGGING', messages: [], requestedAt: ts });
        expect(result.requestedAt).toBe(ts);
    });

    test('Happy Path 6: Token usage reporting', async () => {
        executeCompletion.mockResolvedValue(fixtures.SUCCESS_SCHEMA_OUTPUT);
        const result = await runLLM({ task: 'VISION', messages: [] });
        expect(result.usage).toEqual(fixtures.SUCCESS_SCHEMA_OUTPUT.usage);
    });

    // --- 6 Negative Tests ---

    test('Negative 1: Missing Env Var when Router ON', async () => {
        process.env.FF_OPENAI_MODEL_ROUTER_ENABLED = 'true';
        process.env.OPENAI_MODEL_CORE = ''; // Unset

        await expect(runLLM({ task: 'ORCHESTRATION_CORE', messages: [] }))
            .rejects.toThrow(LLMConfigError);
    });

    test('Negative 2: Missing Idempotency Key for GATING_FINAL', async () => {
        await expect(runLLM({ task: 'GATING_FINAL', messages: [] }))
            .rejects.toThrow(LLMConfigError);
    });

    test('Negative 3: Invalid JSON Output (Malformed)', async () => {
        executeCompletion.mockResolvedValue(fixtures.MALFORMED_JSON_OUTPUT);
        const schema = { type: "object" };

        await expect(runLLM({ task: 'TRANSFORM', messages: [], jsonSchema: schema }))
            .rejects.toThrow(LLMInvalidOutputError);
    });

    test('Negative 4: LLM Timeout', async () => {
        executeCompletion.mockRejectedValue(new LLMTimeoutError());
        await expect(runLLM({ task: 'TAGGING', messages: [] }))
            .rejects.toThrow(LLMTimeoutError);
    });

    test('Negative 5: LLM Rate Limit', async () => {
        executeCompletion.mockRejectedValue(new LLMRateLimitError());
        await expect(runLLM({ task: 'ORCHESTRATION_CORE', messages: [] }))
            .rejects.toThrow(LLMRateLimitError);
    });

    test('Negative 6: Transient Network Error', async () => {
        executeCompletion.mockRejectedValue(new LLMTransientNetworkError());
        await expect(runLLM({ task: 'VISION', messages: [] }))
            .rejects.toThrow(LLMTransientNetworkError);
    });

    // --- 4 Edge Cases ---

    test('Edge 1: Unknown Task Type (Router ON)', async () => {
        process.env.FF_OPENAI_MODEL_ROUTER_ENABLED = 'true';
        // Router OFF behaves safely (default fallback), Router ON throws
        await expect(runLLM({ task: 'UNKNOWN_TASK', messages: [] }))
            .rejects.toThrow(LLMConfigError);
    });

    test('Edge 2: Empty choices array from provider', async () => {
        // Technically unlikely from OpenAI but good defensive check
        executeCompletion.mockResolvedValue({
            ...fixtures.SUCCESS_SCHEMA_OUTPUT,
            choices: []
        }); // Or implementation might throw accessing [0]

        await expect(runLLM({ task: 'TRANSFORM', messages: [] }))
            .rejects.toThrow(); // Should probably be caught and wrapped or JS TypeError
    });

    test('Edge 3: Zero token usage', async () => {
        executeCompletion.mockResolvedValue({
            ...fixtures.SUCCESS_SCHEMA_OUTPUT,
            usage: null
        });
        const result = await runLLM({ task: 'TRANSFORM', messages: [] });
        expect(result.usage).toEqual({ total_tokens: 0, prompt_tokens: 0, completion_tokens: 0 });
    });

    test('Edge 4: Router OFF ignores specific model env vars', async () => {
        process.env.FF_OPENAI_MODEL_ROUTER_ENABLED = 'false';
        process.env.OPENAI_MODEL_CORE = 'BAD_MODEL';
        executeCompletion.mockResolvedValue(fixtures.SUCCESS_SCHEMA_OUTPUT);

        await runLLM({ task: 'ORCHESTRATION_CORE', messages: [] });
        // Should use default 'gpt-4o', not 'BAD_MODEL'
        expect(executeCompletion).toHaveBeenCalledWith(expect.objectContaining({ model: 'gpt-4o' }));
    });

    // --- 1 Regression Test ---
    test('Regression 1: Legacy call params allowed', async () => {
        // Existing codebase sends simple messages array. Ensure it passes through.
        executeCompletion.mockResolvedValue(fixtures.SUCCESS_SCHEMA_OUTPUT);
        const msgs = [{ role: 'user', content: 'hi' }];
        await runLLM({ task: 'ORCHESTRATION_CORE', messages: msgs });
        expect(executeCompletion).toHaveBeenCalledWith(expect.objectContaining({ messages: msgs }));
    });

    // --- 1 Determinism Test ---
    test('Determinism 1: Identical input produces identical output structure', async () => {
        process.env.FF_OPENAI_MODEL_ROUTER_ENABLED = 'true';
        process.env.OPENAI_MODEL_GATING = 'gpt-5.2-pro';
        executeCompletion.mockResolvedValue(fixtures.SUCCESS_SCHEMA_OUTPUT);

        const input1 = {
            task: fixtures.DETERMINISM_INPUT.task,
            messages: fixtures.DETERMINISM_INPUT.messages,
            idempotencyKey: fixtures.DETERMINISM_INPUT.idempotencyKey
        };
        const input2 = { ...input1 };

        const res1 = await runLLM(input1);
        const res2 = await runLLM(input2);

        expect(res1.model).toEqual(res2.model);
        // Exclude raw which might differ in IDs if mocked to be dynamic, but here mock is static.
        // We ensure logic path is deterministic.
        expect(res1.usage).toEqual(res2.usage);
    });

});
