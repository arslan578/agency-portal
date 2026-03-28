const ErrorAdapter = require('../../orchestrator/shared/ErrorAdapter');
const KaivoError = require('../../orchestrator/shared/errors/KaivoError');

describe('ErrorAdapter', () => {
    describe('isRetryable', () => {
        test('returns true for allowlisted transient codes', () => {
            expect(ErrorAdapter.isRetryable({ code: 'ECONNRESET' })).toBe(true);
            expect(ErrorAdapter.isRetryable({ code: 'ETIMEDOUT' })).toBe(true);
        });

        test('returns false for non-transient codes', () => {
            expect(ErrorAdapter.isRetryable({ code: 'VALIDATION_ERROR' })).toBe(false);
            expect(ErrorAdapter.isRetryable({ code: 'AUTH_FAILED' })).toBe(false);
        });

        test('respects explicit retryable override', () => {
            expect(ErrorAdapter.isRetryable({ code: 'UNKNOWN', retryable: true })).toBe(true);
        });
    });

    describe('toHttpResponse', () => {
        const validationError = new KaivoError({
            code: 'INVALID_INPUT',
            category: 'VALIDATION',
            message: 'Bad data'
        });

        test('returns correct status code', () => {
            const { status } = ErrorAdapter.toHttpResponse(validationError);
            expect(status).toBe(400);
        });

        test('returns legacy error shape by default (FF off)', () => {
            process.env.FF_STANDARD_ERRORS = 'false';
            const { body } = ErrorAdapter.toHttpResponse(validationError);
            expect(body).toEqual({ error: 'Bad data' });
            expect(body.code).toBeUndefined();
        });

        test('returns standard error shape when FF enabled', () => {
            process.env.FF_STANDARD_ERRORS = 'true';
            const { body } = ErrorAdapter.toHttpResponse(validationError);
            expect(body).toEqual({
                code: 'INVALID_INPUT',
                category: 'VALIDATION',
                message: 'Bad data'
            });
        });

        test('handling unknown errors', () => {
            const unknown = new Error('Something exploded');
            const { status, body } = ErrorAdapter.toHttpResponse(unknown);
            expect(status).toBe(500);
            // In standard mode, we might expose message key, in legacy we mirror message?
            // Adapter impl: body = { error: isStandard ? error.message : ... }
            if (process.env.FF_STANDARD_ERRORS === 'true') {
                expect(body.error).toBe('Something exploded');
            } else {
                expect(body.error).toBe('An unexpected error occurred');
            }
        });
    });
});
