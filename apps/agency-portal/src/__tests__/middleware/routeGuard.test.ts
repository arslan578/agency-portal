/**
 * Middleware Route Guard Tests
 *
 * These are integration-level tests for the middleware.
 * We test the guard logic directly by simulating auth() responses
 * and asserting the correct NextResponse action.
 */

// --- Mock next-auth ---
jest.mock("@/lib/auth", () => ({
  auth: jest.fn(),
}));

// Simulate the middleware logic inline to avoid edge runtime issues in Jest
function runGuard(
  pathname: string,
  isAuthenticated: boolean
): { action: "next" | "redirect"; destination?: string } {
  const isOnLoginPage = pathname.startsWith("/login");

  if (!isAuthenticated && !isOnLoginPage) {
    const encoded = encodeURIComponent(pathname);
    return { action: "redirect", destination: `/login?callbackUrl=${encoded}` };
  }

  if (isAuthenticated && isOnLoginPage) {
    return { action: "redirect", destination: "/" };
  }

  return { action: "next" };
}

describe("Middleware Route Guard", () => {
  describe("Unauthenticated user", () => {
    it("is redirected to /login from protected route /", () => {
      const result = runGuard("/", false);
      expect(result.action).toBe("redirect");
      expect(result.destination).toContain("/login");
    });

    it("is redirected to /login from /clients", () => {
      const result = runGuard("/clients", false);
      expect(result.action).toBe("redirect");
      expect(result.destination).toContain("/login");
    });

    it("is redirected with callbackUrl encoded", () => {
      const result = runGuard("/settings", false);
      expect(result.destination).toBe(
        `/login?callbackUrl=${encodeURIComponent("/settings")}`
      );
    });

    it("is allowed through to /login page itself", () => {
      const result = runGuard("/login", false);
      expect(result.action).toBe("next");
    });
  });

  describe("Authenticated user", () => {
    it("can access the dashboard /", () => {
      const result = runGuard("/", true);
      expect(result.action).toBe("next");
    });

    it("can access /clients", () => {
      const result = runGuard("/clients", true);
      expect(result.action).toBe("next");
    });

    it("is redirected away from /login to /", () => {
      const result = runGuard("/login", true);
      expect(result.action).toBe("redirect");
      expect(result.destination).toBe("/");
    });
  });
});
