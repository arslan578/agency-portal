export type MetaAdAccount = {
    id?: string;
    name?: string;
    account_id?: string;
    account_status?: number;
    currency?: string;
    timezone_name?: string;
    spend_cap?: string;
    amount_spent?: string;
    // Meta can return extra fields; keep compatibility with exact upstream contract
    [key: string]: unknown;
};

export type MetaAdAccountsSuccessResponse = {
    success: true;
    ad_accounts: MetaAdAccount[];
    count: number;
    has_more: boolean;
    next_cursor: string | null;
};

export type MetaAdAccountsFailureResponse = {
    success: false;
    error: string;
    error_code?: string;
    message?: string;
    // Some failure paths omit ad_accounts (e.g. gateway missing token); preserve exact contract
    ad_accounts?: MetaAdAccount[];
};

export type MetaAdAccountsResponse =
    | MetaAdAccountsSuccessResponse
    | MetaAdAccountsFailureResponse;

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/**
 * Parses the Meta ad-accounts response using the backend's response contract.
 * Throws on contract mismatch so the caller can surface a clear integration error.
 */
export function parseMetaAdAccountsResponse(input: unknown): MetaAdAccountsResponse {
    if (!isRecord(input)) {
        throw new Error('Meta ad-accounts contract violation: expected an object');
    }

    if (typeof input.success !== 'boolean') {
        throw new Error('Meta ad-accounts contract violation: missing boolean "success"');
    }

    if (input.success === true) {
        if (!Array.isArray(input.ad_accounts)) {
            throw new Error('Meta ad-accounts contract violation: missing array "ad_accounts" on success');
        }
        if (typeof input.count !== 'number') {
            throw new Error('Meta ad-accounts contract violation: missing number "count" on success');
        }
        if (typeof input.has_more !== 'boolean') {
            throw new Error('Meta ad-accounts contract violation: missing boolean "has_more" on success');
        }

        const nextCursor =
            input.next_cursor === null || typeof input.next_cursor === 'string'
                ? input.next_cursor
                : null;

        return {
            success: true,
            ad_accounts: input.ad_accounts as MetaAdAccount[],
            count: input.count,
            has_more: input.has_more,
            next_cursor: nextCursor,
        };
    }

    // Failure contract
    if (typeof input.error !== 'string') {
        throw new Error('Meta ad-accounts contract violation: missing string "error" on failure');
    }

    const failure: MetaAdAccountsFailureResponse = {
        success: false,
        error: input.error,
    };

    if (typeof input.error_code === 'string') failure.error_code = input.error_code;
    if (typeof input.message === 'string') failure.message = input.message;
    if (Array.isArray(input.ad_accounts)) failure.ad_accounts = input.ad_accounts as MetaAdAccount[];

    return failure;
}


