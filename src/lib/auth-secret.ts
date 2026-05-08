const DEV_FALLBACK_SECRET = "wrong-notebook-dev-fallback-secret";

export function getAuthSecret(): string | undefined {
    if (process.env.NEXTAUTH_SECRET) {
        return process.env.NEXTAUTH_SECRET;
    }

    if (process.env.NODE_ENV !== "production") {
        return DEV_FALLBACK_SECRET;
    }

    return undefined;
}
