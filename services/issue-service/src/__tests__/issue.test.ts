import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../index';
import Issue from '../models/issue.model';

// ─── Test Setup ───────────────────────────────────────────────────────────────

let mongod: MongoMemoryServer;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongod.stop();
});

afterEach(async () => {
  // Clean up between tests
  await Issue.deleteMany({});
});

// ─── Test Data ────────────────────────────────────────────────────────────────

const validIssuePayload = {
  reportedBy: 'citizen-001',
  rawDescription: 'There is a large pothole on Main Street that is causing accidents.',
  channel: 'app',
  category: 'roads',
  location: {
    lat: 12.9716,
    lng: 77.5946,
    geohash: 'tdr1u',
    address: '123 Main Street, Bengaluru',
    wardId: 'WARD-042',
    wardName: 'Indiranagar Ward',
  },
  media: ['https://example.com/photo1.jpg'],
};

// ─── Health Check ─────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('should return 200 with service health info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('issue-service');
    expect(res.body.timestamp).toBeDefined();
  });
});

// ─── Create Issue ─────────────────────────────────────────────────────────────

describe('POST /api/issues', () => {
  it('should create a new issue with valid payload', async () => {
    const res = await request(app)
      .post('/api/issues')
      .send(validIssuePayload)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data).toBeDefined();
    expect(res.body.data.reportedBy).toBe('citizen-001');
    expect(res.body.data.category).toBe('roads');
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.dna).toBeNull();
    expect(res.body.data.validationCount).toBe(0);
    expect(res.body.data.escalationLevel).toBe(0);
    expect(res.body.data._id).toBeDefined();
  });

  it('should return 400 if reportedBy is missing', async () => {
    const payload = { ...validIssuePayload };
    const { reportedBy, ...rest } = payload;

    const res = await request(app)
      .post('/api/issues')
      .send(rest)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 if rawDescription is too short', async () => {
    const res = await request(app)
      .post('/api/issues')
      .send({ ...validIssuePayload, rawDescription: 'Short' })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 if location is missing required fields', async () => {
    const res = await request(app)
      .post('/api/issues')
      .send({
        ...validIssuePayload,
        location: { lat: 12.97, lng: 77.59 }, // Missing geohash, address, wardId, wardName
      })
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should default channel to app and category to other if not provided', async () => {
    const { channel, category, ...rest } = validIssuePayload;

    const res = await request(app)
      .post('/api/issues')
      .send(rest)
      .set('Content-Type', 'application/json');

    expect(res.status).toBe(201);
    expect(res.body.data.channel).toBe('app');
    expect(res.body.data.category).toBe('other');
  });
});

// ─── Get Issue By ID ──────────────────────────────────────────────────────────

describe('GET /api/issues/:id', () => {
  it('should return issue details by valid ID', async () => {
    const createRes = await request(app)
      .post('/api/issues')
      .send(validIssuePayload);

    const issueId = createRes.body.data._id;

    const res = await request(app).get(`/api/issues/${issueId}`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data._id).toBe(issueId);
    expect(res.body.data.reportedBy).toBe('citizen-001');
  });

  it('should return 404 for non-existent issue ID', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).get(`/api/issues/${fakeId}`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBe('Issue not found');
  });

  it('should return 400 for invalid ObjectId format', async () => {
    const res = await request(app).get('/api/issues/not-a-valid-id');

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ─── List Issues ──────────────────────────────────────────────────────────────

describe('GET /api/issues', () => {
  beforeEach(async () => {
    // Create multiple issues for filter testing
    await request(app).post('/api/issues').send(validIssuePayload);
    await request(app).post('/api/issues').send({
      ...validIssuePayload,
      reportedBy: 'citizen-002',
      category: 'garbage',
      rawDescription: 'There is garbage overflowing near the park entrance.',
    });
    await request(app).post('/api/issues').send({
      ...validIssuePayload,
      reportedBy: 'citizen-003',
      category: 'streetlights',
      rawDescription: 'The streetlight on Park Avenue has been broken for a week.',
      location: { ...validIssuePayload.location, wardId: 'WARD-099' },
    });
  });

  it('should list all issues with pagination', async () => {
    const res = await request(app).get('/api/issues?page=1&limit=10');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.issues).toHaveLength(3);
    expect(res.body.data.pagination.total).toBe(3);
    expect(res.body.data.pagination.page).toBe(1);
  });

  it('should filter issues by category', async () => {
    const res = await request(app).get('/api/issues?category=garbage');

    expect(res.status).toBe(200);
    expect(res.body.data.issues).toHaveLength(1);
    expect(res.body.data.issues[0].category).toBe('garbage');
  });

  it('should filter issues by wardId', async () => {
    const res = await request(app).get('/api/issues?wardId=WARD-099');

    expect(res.status).toBe(200);
    expect(res.body.data.issues).toHaveLength(1);
    expect(res.body.data.issues[0].location.wardId).toBe('WARD-099');
  });

  it('should filter issues by reportedBy', async () => {
    const res = await request(app).get('/api/issues?reportedBy=citizen-002');

    expect(res.status).toBe(200);
    expect(res.body.data.issues).toHaveLength(1);
    expect(res.body.data.issues[0].reportedBy).toBe('citizen-002');
  });

  it('should support pagination correctly', async () => {
    const res = await request(app).get('/api/issues?page=1&limit=2');

    expect(res.status).toBe(200);
    expect(res.body.data.issues).toHaveLength(2);
    expect(res.body.data.pagination.totalPages).toBe(2);
    expect(res.body.data.pagination.hasNextPage).toBe(true);
    expect(res.body.data.pagination.hasPrevPage).toBe(false);
  });
});

// ─── Update Status ────────────────────────────────────────────────────────────

describe('PATCH /api/issues/:id/status', () => {
  it('should update issue status successfully', async () => {
    const createRes = await request(app)
      .post('/api/issues')
      .send(validIssuePayload);

    const issueId = createRes.body.data._id;

    const res = await request(app)
      .patch(`/api/issues/${issueId}/status`)
      .send({ status: 'in_progress', updatedBy: 'admin-001' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('in_progress');
  });

  it('should return 400 for invalid status value', async () => {
    const createRes = await request(app)
      .post('/api/issues')
      .send(validIssuePayload);

    const issueId = createRes.body.data._id;

    const res = await request(app)
      .patch(`/api/issues/${issueId}/status`)
      .send({ status: 'flying', updatedBy: 'admin-001' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 404 for non-existent issue', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .patch(`/api/issues/${fakeId}/status`)
      .send({ status: 'resolved', updatedBy: 'admin-001' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ─── Validate Issue ───────────────────────────────────────────────────────────

describe('POST /api/issues/:id/validate', () => {
  it('should increment validation count on confirmed_bad', async () => {
    const createRes = await request(app)
      .post('/api/issues')
      .send(validIssuePayload);

    const issueId = createRes.body.data._id;

    const res = await request(app)
      .post(`/api/issues/${issueId}/validate`)
      .send({ citizenId: 'citizen-999', response: 'confirmed_bad' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.validationCount).toBe(1);
  });

  it('should increment by 2 on "worse" response', async () => {
    const createRes = await request(app)
      .post('/api/issues')
      .send(validIssuePayload);

    const issueId = createRes.body.data._id;

    const res = await request(app)
      .post(`/api/issues/${issueId}/validate`)
      .send({ citizenId: 'citizen-999', response: 'worse' });

    expect(res.status).toBe(200);
    expect(res.body.data.validationCount).toBe(2);
  });

  it('should not allow self-validation', async () => {
    const createRes = await request(app)
      .post('/api/issues')
      .send(validIssuePayload);

    const issueId = createRes.body.data._id;

    const res = await request(app)
      .post(`/api/issues/${issueId}/validate`)
      .send({ citizenId: 'citizen-001', response: 'confirmed_bad' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('should return 400 for invalid response type', async () => {
    const createRes = await request(app)
      .post('/api/issues')
      .send(validIssuePayload);

    const issueId = createRes.body.data._id;

    const res = await request(app)
      .post(`/api/issues/${issueId}/validate`)
      .send({ citizenId: 'citizen-999', response: 'maybe' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ─── DNA Analysis (Mock Mode) ─────────────────────────────────────────────────

describe('POST /api/issues/:id/analyze', () => {
  it('should run DNA analysis and update issue with dna object', async () => {
    const createRes = await request(app)
      .post('/api/issues')
      .send(validIssuePayload);

    const issueId = createRes.body.data._id;

    const res = await request(app).post(`/api/issues/${issueId}/analyze`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.dna).toBeDefined();
    expect(res.body.data.dna.classification).toBeDefined();
    expect(res.body.data.dna.severityScore).toBeGreaterThan(0);
    expect(res.body.data.dna.confidence).toBeGreaterThan(0);
    expect(res.body.data.status).toBe('validated');
  });

  it('should return 404 for non-existent issue', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).post(`/api/issues/${fakeId}/analyze`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ─── Ward Stats ───────────────────────────────────────────────────────────────

describe('GET /api/issues/ward/:wardId/stats', () => {
  beforeEach(async () => {
    await request(app).post('/api/issues').send(validIssuePayload);
    await request(app).post('/api/issues').send({
      ...validIssuePayload,
      reportedBy: 'citizen-002',
      category: 'garbage',
      rawDescription: 'Garbage overflow near the bus stand for 3 days now.',
    });
  });

  it('should return aggregated stats for a ward', async () => {
    const res = await request(app).get('/api/issues/ward/WARD-042/stats');

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.wardId).toBe('WARD-042');
    expect(res.body.data.totalIssues).toBe(2);
    expect(res.body.data.byStatus).toBeDefined();
    expect(res.body.data.byCategory).toBeDefined();
    expect(Array.isArray(res.body.data.byStatus)).toBe(true);
    expect(Array.isArray(res.body.data.byCategory)).toBe(true);
  });

  it('should return zero for ward with no issues', async () => {
    const res = await request(app).get('/api/issues/ward/WARD-999/stats');

    expect(res.status).toBe(200);
    expect(res.body.data.totalIssues).toBe(0);
  });
});
