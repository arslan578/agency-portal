/**
 * Mock User Helper - Development Mode
 * Used when authentication is temporarily disabled for deployment testing.
 */

export const MOCK_USER = {
    id: "dev-user",
    email: "dev@kaivo.com",
    name: "Development Mode User",
    role: "admin"
} as const;

export type MockUser = typeof MOCK_USER;

/**
 * Returns mock user for development mode.
 * This bypasses authentication during deployment testing.
 */
export function getMockUser() {
    return MOCK_USER;
}

/**
 * Mock session for development mode.
 */
export function getMockSession() {
    return {
        user: MOCK_USER,
        expires: "9999-12-31T23:59:59.999Z"
    };
}
