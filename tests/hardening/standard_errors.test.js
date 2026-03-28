const KaivoError = require('../../orchestrator/shared/errors/KaivoError');

describe('Standard Error Discipline', () => {
    test('Constructs with required fields', () => {
        const error = new KaivoError({
            message: 'Validation failed',
            code: 'VALIDATION_ERROR',
            category: 'VALIDATION',
            retryable: false
        });

        expect(error).toBeInstanceOf(Error);
        expect(error).toBeInstanceOf(KaivoError);
        expect(error.message).toBe('Validation failed');
        expect(error.code).toBe('VALIDATION_ERROR');
        expect(error.category).toBe('VALIDATION');
        expect(error.retryable).toBe(false);
    });

    test('Defaults unknown params correctly', () => {
        const error = new KaivoError({ message: 'Something exploded' });

        expect(error.code).toBe('UNKNOWN_ERROR');
        expect(error.category).toBe('INTERNAL');
        expect(error.retryable).toBe(false);
        expect(error.meta).toEqual({});
    });

    test('Serializes to JSON safely', () => {
        const error = new KaivoError({
            message: 'Upstream timeout',
            code: 'UPSTREAM_TIMEOUT',
            category: 'UPSTREAM',
            retryable: true,
            meta: { service: 'stripe', attempt: 2 }
        });

        const json = error.toJSON();

        expect(json).toEqual({
            message: 'Upstream timeout',
            code: 'UPSTREAM_TIMEOUT',
            category: 'UPSTREAM',
            retryable: true,
            meta: { service: 'stripe', attempt: 2 }
        });
    });

    test('isKaivoError check works', () => {
        const kError = new KaivoError({ message: 'Test' });
        const stdError = new Error('Test');

        expect(KaivoError.isKaivoError(kError)).toBe(true);
        expect(KaivoError.isKaivoError(stdError)).toBe(false);
    });
});
