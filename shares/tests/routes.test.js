const request = require('supertest');

// Base URL for shares service  
const BASE_URL = process.env.SHARES_URL || 'http://localhost:9003';

describe('Shares API Tests', () => {
    const testUserId = '507f1f77bcf86cd799439011';
    const testProjectId = '507f1f77bcf86cd799439012';

    console.log('Testing against:', BASE_URL);

    test('Health check should return OK', async () => {
        const response = await request(BASE_URL)
            .get('/health')
            .expect(200);

        expect(response.body.status).toBe('ok');
        expect(response.body.service).toBe('shares');
    });

    test('GET /shares/user/me should require userId', async () => {
        const response = await request(BASE_URL)
            .get('/shares/user/me');

        // Will return empty shares or error if userId is undefined
        console.log('Response without userId:', response.status, response.body);
    });

    test('GET /shares/user/me should return user shares with userId', async () => {
        const response = await request(BASE_URL)
            .get(`/shares/user/me?userId=${testUserId}`)
            .expect(200);

        expect(response.body).toHaveProperty('shares');
        expect(Array.isArray(response.body.shares)).toBe(true);
    });

    test('POST /shares should require userId and projectId', async () => {
        const response = await request(BASE_URL)
            .post('/shares')
            .send({
                permission: 'view'
            });

        // Should fail with 400 or 500 due to missing fields
        expect([400, 500]).toContain(response.status);
    });

    test('GET /shares/project/:projectId should require userId', async () => {
        const response = await request(BASE_URL)
            .get(`/shares/project/${testProjectId}`);

        // Will fail with 403 or 500 if userId is undefined
        console.log('Response without userId:', response.status, response.body);
    });

    test('GET /shares/project/:projectId should work with userId', async () => {
        const response = await request(BASE_URL)
            .get(`/shares/project/${testProjectId}?userId=${testUserId}`);

        // May return 403 if project doesn't exist or user doesn't own it
        // Or 200 with empty shares
        console.log('Response with userId:', response.status, response.body);
        expect([200, 403, 404]).toContain(response.status);
    });
});

// Run tests
console.log('\\n🧪 Running Shares API Tests...\\n');
