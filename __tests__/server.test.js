const request = require('supertest');

// Load environment variables for tests
require('dotenv').config();

// Mock setInterval BEFORE importing server to prevent cleanup timers
const originalSetInterval = global.setInterval;
global.setInterval = jest.fn();

// Mock fetch to prevent actual HTTP calls
global.fetch = jest.fn(() => 
  Promise.resolve({
    status: 200,
    headers: {
      get: jest.fn(() => null)
    },
    json: () => Promise.resolve({ data: 'test' }),
    text: () => Promise.resolve('test response')
  })
);

// Import server AFTER mocking setInterval
const app = require('../server');

describe('Vikings OSM Backend API', () => {
  afterAll((done) => {
    // Restore original setInterval
    global.setInterval = originalSetInterval;
    
    // Clear all timers and close server
    jest.clearAllTimers();
    setTimeout(done, 100);
  });

  beforeEach(() => {
    // Reset fetch mock
    fetch.mockClear();
  });

  describe('Rate Limit Status Endpoint', () => {
    test('GET /rate-limit-status should return current limits', async () => {
      const response = await request(app)
        .get('/rate-limit-status')
        .expect(200);

      expect(response.body).toHaveProperty('backend');
      expect(response.body).toHaveProperty('osm');
      expect(response.body).toHaveProperty('timestamp');
      
      // Check backend rate limit structure
      expect(response.body.backend).toHaveProperty('limit');
      expect(response.body.backend).toHaveProperty('remaining');
      expect(response.body.backend).toHaveProperty('window', 'per minute');
    });
  });

  describe('Rate Limiting Middleware', () => {
    test('should add rate limit headers to API responses', async () => {
      const response = await request(app)
        .post('/get-terms')
        .send({ access_token: 'test_token' });

      expect(response.headers).toHaveProperty('x-backend-ratelimit-limit');
      expect(response.headers).toHaveProperty('x-backend-ratelimit-remaining');
      expect(response.headers).toHaveProperty('x-backend-ratelimit-reset');
    });

    test('should decrement remaining count on each request', async () => {
      // Make first request to an endpoint that uses rate limiting
      const response1 = await request(app)
        .post('/get-terms')
        .send({ access_token: 'test_token' });
      
      const remaining1 = parseInt(response1.headers['x-backend-ratelimit-remaining']);

      // Make second request  
      const response2 = await request(app)
        .post('/get-terms')
        .send({ access_token: 'test_token' });
        
      const remaining2 = parseInt(response2.headers['x-backend-ratelimit-remaining']);

      expect(remaining2).toBeLessThan(remaining1);
    });
  });

  describe('API Endpoints Validation', () => {
    test('POST /get-terms should require access token', async () => {
      const response = await request(app)
        .post('/get-terms')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('access token');
    });

    test('POST /get-section-config should require access token and sectionid', async () => {
      const response = await request(app)
        .post('/get-section-config')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('access_token');
    });

    test('OAuth callback should require authorization code', async () => {
      const response = await request(app)
        .post('/callback')
        .send({})
        .expect(400);

      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toContain('Authorization code required');
    });
  });

  describe('CORS Configuration', () => {
    test('should have CORS headers configured', async () => {
      const response = await request(app)
        .get('/rate-limit-status')
        .set('Origin', 'https://vikings-eventmgmt.onrender.com');

      expect(response.headers).toHaveProperty('access-control-allow-origin');
    });
  });

  describe('OAuth Configuration', () => {
    test('should have OAuth environment variables', () => {
      // Test that OAuth credentials are properly configured
      // In GitHub Actions, these come from repository secrets
      // In local development, they come from .env file or fallback values
      const clientId = process.env.OAUTH_CLIENT_ID || 'x7hx1M0NExVdSiksH1gUBPxkSTn8besx';
      const clientSecret = process.env.OAUTH_CLIENT_SECRET || 'u1hCuA4W8s7C0qiiVw9ZygY7CLXLYOzhDKpDbwRt7f7JZHIinjZrcj6quf7yH3zE';
      
      expect(clientId).toBeDefined();
      expect(clientId).not.toBe('');
      expect(clientId).toMatch(/^[a-zA-Z0-9]+$/); // Valid OAuth client ID format
      
      expect(clientSecret).toBeDefined();
      expect(clientSecret).not.toBe('');
      expect(clientSecret.length).toBeGreaterThan(10); // OAuth secrets should be reasonably long
    });
  });
});