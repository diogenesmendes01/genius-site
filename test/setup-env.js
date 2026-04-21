// Make every spec deterministic: mock mode, in-memory DB, fixed admin
// credentials. Loaded before Jest spins up the test workers.
process.env.NODE_ENV = 'test';
process.env.Q10_MOCK = 'true';
process.env.Q10_API_KEY = '';
process.env.Q10_BASE_URL = 'https://api.q10.com/v1';
process.env.Q10_CACHE_TTL = '0';
process.env.JWT_SECRET = 'test-secret-test-secret-test-secret-test-secret-test-secret';
process.env.JWT_EXPIRES_MINUTES = '60';
process.env.ADMIN_EMAIL = 'admin@test.local';
process.env.ADMIN_PASSWORD = 'test-password-123';
process.env.ADMIN_NAME = 'Test Admin';
process.env.DATABASE_PATH = ':memory:';
process.env.ALLOWED_ORIGINS = '';
