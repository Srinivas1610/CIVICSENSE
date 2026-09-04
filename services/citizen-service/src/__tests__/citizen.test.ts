import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';

// Set env vars BEFORE importing app so config picks them up
process.env.JWT_SECRET = 'test-secret-key-citizen';
process.env.NODE_ENV = 'test';
process.env.ISSUE_SERVICE_URL = 'http://localhost:3002';

// Import app AFTER setting env vars
// We import the express app directly without starting the server
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { Citizen } from '../models/citizen.model';
import healthRouter from '../routes/health.routes';
import citizenRouter from '../routes/citizen.routes';

// Build a test-specific app instance (no bootstrap/listen)
function buildTestApp() {
  const app = express();
  app.use(helmet());
  app.use(cors());
  app.use(express.json());
  app.use('/health', healthRouter);
  app.use('/api/citizens', citizenRouter);

  // Global error handler
  app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
    if ((err as any).code === 11000 || (err as any).name === 'MongoServerError') {
      return res.status(409).json({ success: false, error: 'Duplicate key' });
    }
    if (err.name === 'ValidationError') {
      return res.status(422).json({ success: false, error: err.message });
    }
    const status = (err as any).status ?? (err as any).statusCode ?? 500;
    return res.status(status).json({ success: false, error: err.message });
  });

  return app;
}

// ─── Test Suite ───────────────────────────────────────────────────────────────

describe('Citizen Service', () => {
  let mongoServer: MongoMemoryServer;
  let app: ReturnType<typeof buildTestApp>;

  const VALID_CITIZEN = {
    phone: '+919876543210',
    name: 'Arjun Sharma',
    wardId: 'WARD-42',
    geohash: 'tdr1u',
    preferredLanguage: 'en',
  };

  beforeAll(async () => {
    // Spin up an in-memory MongoDB instance
    mongoServer = await MongoMemoryServer.create();
    const uri = mongoServer.getUri();
    await mongoose.connect(uri);
    app = buildTestApp();
  });

  afterAll(async () => {
    await mongoose.disconnect();
    await mongoServer.stop();
  });

  afterEach(async () => {
    // Clean up between tests
    await Citizen.deleteMany({});
  });

  // ─── GET /health ──────────────────────────────────────────────────────────

  describe('GET /health', () => {
    it('should return 200 with ok status', async () => {
      const res = await request(app).get('/health');

      expect(res.status).toBe(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.service).toBe('citizen-service');
      expect(res.body).toHaveProperty('uptime');
      expect(res.body).toHaveProperty('timestamp');
    });
  });

  // ─── POST /api/citizens/register ─────────────────────────────────────────

  describe('POST /api/citizens/register', () => {
    it('should register a new citizen and return 201 with token', async () => {
      const res = await request(app)
        .post('/api/citizens/register')
        .send(VALID_CITIZEN);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
      expect(res.body.data.citizen.phone).toBe(VALID_CITIZEN.phone);
      expect(res.body.data.citizen.name).toBe(VALID_CITIZEN.name);
      expect(res.body.data.citizen.wardId).toBe(VALID_CITIZEN.wardId);
      expect(res.body.data.citizen.role).toBe('citizen');
      expect(res.body.data.citizen.trustScore).toBe(50);
      expect(res.body.data.citizen.isActive).toBe(true);
    });

    it('should return 422 when phone is missing', async () => {
      const res = await request(app)
        .post('/api/citizens/register')
        .send({ name: 'Test User', wardId: 'WARD-01' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should return 422 when phone format is invalid', async () => {
      const res = await request(app)
        .post('/api/citizens/register')
        .send({ ...VALID_CITIZEN, phone: '09876543210' }); // missing +

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should return 422 when name is missing', async () => {
      const res = await request(app)
        .post('/api/citizens/register')
        .send({ phone: '+919876543210', wardId: 'WARD-42' });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it('should return 409 when phone is already registered (duplicate)', async () => {
      // First registration
      await request(app).post('/api/citizens/register').send(VALID_CITIZEN);

      // Second registration with same phone
      const res = await request(app)
        .post('/api/citizens/register')
        .send({ ...VALID_CITIZEN, name: 'Different Name' });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error).toMatch(/already registered/i);
    });
  });

  // ─── POST /api/citizens/login ─────────────────────────────────────────────

  describe('POST /api/citizens/login', () => {
    beforeEach(async () => {
      // Seed one citizen
      await request(app).post('/api/citizens/register').send(VALID_CITIZEN);
    });

    it('should return 200 with a JWT token for valid credentials', async () => {
      const res = await request(app)
        .post('/api/citizens/login')
        .send({ phone: VALID_CITIZEN.phone });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toHaveProperty('token');
      expect(typeof res.body.data.token).toBe('string');
      expect(res.body.data.token.length).toBeGreaterThan(20);
      expect(res.body.data.citizen.phone).toBe(VALID_CITIZEN.phone);
    });

    it('should return 401 for an unregistered phone number', async () => {
      const res = await request(app)
        .post('/api/citizens/login')
        .send({ phone: '+911111111111' });

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return 422 when phone is missing from login body', async () => {
      const res = await request(app)
        .post('/api/citizens/login')
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });
  });

  // ─── GET /api/citizens/:id ────────────────────────────────────────────────

  describe('GET /api/citizens/:id', () => {
    it('should return 401 when no auth token is provided', async () => {
      const registerRes = await request(app)
        .post('/api/citizens/register')
        .send(VALID_CITIZEN);

      const citizenId = registerRes.body.data.citizen._id;

      const res = await request(app).get(`/api/citizens/${citizenId}`);
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it('should return citizen profile with valid JWT', async () => {
      const registerRes = await request(app)
        .post('/api/citizens/register')
        .send(VALID_CITIZEN);

      const { token } = registerRes.body.data;
      const citizenId = registerRes.body.data.citizen._id;

      const res = await request(app)
        .get(`/api/citizens/${citizenId}`)
        .set('Authorization', `Bearer ${token}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.citizen._id).toBe(citizenId);
    });
  });

  // ─── GET /api/citizens/ward/:wardId ──────────────────────────────────────

  describe('GET /api/citizens/ward/:wardId', () => {
    it('should return citizens in the specified ward', async () => {
      await request(app).post('/api/citizens/register').send(VALID_CITIZEN);
      await request(app)
        .post('/api/citizens/register')
        .send({ ...VALID_CITIZEN, phone: '+919999999999', name: 'Priya R' });

      const res = await request(app).get(`/api/citizens/ward/${VALID_CITIZEN.wardId}`);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.citizens.length).toBe(2);
      expect(res.body.data.pagination.total).toBe(2);
    });

    it('should return empty list for ward with no citizens', async () => {
      const res = await request(app).get('/api/citizens/ward/WARD-NONEXISTENT');

      expect(res.status).toBe(200);
      expect(res.body.data.citizens.length).toBe(0);
      expect(res.body.data.pagination.total).toBe(0);
    });
  });
});
