import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createApp } from '../app';
import Assignment from '../models/assignment.model';
import { getDepartmentForCategory, isMappedCategory } from '../services/router.service';
import { generateEscalationContent, checkAndEscalate, ESCALATION_LADDER } from '../services/escalation.service';

// ─── Test Setup ────────────────────────────────────────────────────────────────

let mongod: MongoMemoryServer;
const app = createApp();

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  const uri = mongod.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.connection.dropDatabase();
  await mongoose.connection.close();
  await mongod.stop();
});

afterEach(async () => {
  await Assignment.deleteMany({});
});

// ─── Health Check ──────────────────────────────────────────────────────────────

describe('GET /health', () => {
  it('returns 200 with service info', async () => {
    const res = await request(app).get('/health');
    expect(res.status).toBe(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.service).toBe('assignment-service');
    expect(res.body.timestamp).toBeDefined();
  });
});

// ─── Router Service Tests ──────────────────────────────────────────────────────

describe('Router Service — getDepartmentForCategory', () => {
  it('routes roads to Roads & Infrastructure Dept', () => {
    const dept = getDepartmentForCategory('roads');
    expect(dept.departmentName).toBe('Roads & Infrastructure Dept');
    expect(dept.contactEmail).toBe('roads@civicconnect.gov');
    expect(dept.category).toBe('roads');
  });

  it('routes garbage to Solid Waste Management Dept', () => {
    const dept = getDepartmentForCategory('garbage');
    expect(dept.departmentName).toBe('Solid Waste Management Dept');
    expect(dept.contactEmail).toBe('swm@civicconnect.gov');
  });

  it('routes streetlights to Street Lighting Authority', () => {
    const dept = getDepartmentForCategory('streetlights');
    expect(dept.departmentName).toBe('Street Lighting Authority');
    expect(dept.contactEmail).toBe('lighting@civicconnect.gov');
  });

  it('routes water to Water Supply Board', () => {
    const dept = getDepartmentForCategory('water');
    expect(dept.departmentName).toBe('Water Supply Board');
    expect(dept.contactEmail).toBe('water@civicconnect.gov');
  });

  it('routes drainage to Drainage & Sewerage Board', () => {
    const dept = getDepartmentForCategory('drainage');
    expect(dept.departmentName).toBe('Drainage & Sewerage Board');
    expect(dept.contactEmail).toBe('drainage@civicconnect.gov');
  });

  it('routes unknown category to Municipal Corporation (default)', () => {
    const dept = getDepartmentForCategory('unknown-category');
    expect(dept.departmentName).toBe('Municipal Corporation');
    expect(dept.contactEmail).toBe('municipal@civicconnect.gov');
  });

  it('is case-insensitive', () => {
    const dept = getDepartmentForCategory('ROADS');
    expect(dept.departmentName).toBe('Roads & Infrastructure Dept');
  });

  it('handles empty string with default department', () => {
    const dept = getDepartmentForCategory('');
    expect(dept.departmentName).toBe('Municipal Corporation');
  });

  it('isMappedCategory returns true for known categories', () => {
    expect(isMappedCategory('roads')).toBe(true);
    expect(isMappedCategory('garbage')).toBe(true);
    expect(isMappedCategory('water')).toBe(true);
  });

  it('isMappedCategory returns false for unknown categories', () => {
    expect(isMappedCategory('parks')).toBe(false);
    expect(isMappedCategory('')).toBe(false);
  });
});

// ─── POST /api/assignments ─────────────────────────────────────────────────────

describe('POST /api/assignments', () => {
  it('creates an assignment with correct department routing', async () => {
    const res = await request(app)
      .post('/api/assignments')
      .send({ issueId: 'ISS-001', category: 'roads', wardId: 'WARD-01' });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.issueId).toBe('ISS-001');
    expect(res.body.data.departmentName).toBe('Roads & Infrastructure Dept');
    expect(res.body.data.contactEmail).toBe('roads@civicconnect.gov');
    expect(res.body.data.status).toBe('pending');
    expect(res.body.data.escalationLevel).toBe(0);
    expect(res.body.data.dueDate).toBeDefined();
  });

  it('sets dueDate to assignedAt + 3 days', async () => {
    const res = await request(app)
      .post('/api/assignments')
      .send({ issueId: 'ISS-002', category: 'water', wardId: 'WARD-02' });

    expect(res.status).toBe(201);
    const assignedAt = new Date(res.body.data.assignedAt);
    const dueDate = new Date(res.body.data.dueDate);
    const diffDays = Math.round((dueDate.getTime() - assignedAt.getTime()) / (1000 * 60 * 60 * 24));
    expect(diffDays).toBe(3);
  });

  it('routes unrecognized category to Municipal Corporation', async () => {
    const res = await request(app)
      .post('/api/assignments')
      .send({ issueId: 'ISS-003', category: 'parks', wardId: 'WARD-03' });

    expect(res.status).toBe(201);
    expect(res.body.data.departmentName).toBe('Municipal Corporation');
  });

  it('returns 409 if assignment already exists for issue', async () => {
    await request(app)
      .post('/api/assignments')
      .send({ issueId: 'ISS-DUP', category: 'garbage', wardId: 'WARD-01' });

    const res = await request(app)
      .post('/api/assignments')
      .send({ issueId: 'ISS-DUP', category: 'garbage', wardId: 'WARD-01' });

    expect(res.status).toBe(409);
    expect(res.body.success).toBe(false);
  });

  it('returns 400 when required fields are missing', async () => {
    const res = await request(app)
      .post('/api/assignments')
      .send({ category: 'roads' }); // missing issueId and wardId

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ─── GET /api/assignments/:issueId ────────────────────────────────────────────

describe('GET /api/assignments/:issueId', () => {
  it('retrieves assignment by issueId', async () => {
    await request(app)
      .post('/api/assignments')
      .send({ issueId: 'ISS-GET-01', category: 'streetlights', wardId: 'WARD-01' });

    const res = await request(app).get('/api/assignments/ISS-GET-01');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.issueId).toBe('ISS-GET-01');
  });

  it('returns 404 for non-existent issueId', async () => {
    const res = await request(app).get('/api/assignments/NON-EXISTENT-ID');
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ─── PUT /api/assignments/:id/status ─────────────────────────────────────────

describe('PUT /api/assignments/:id/status', () => {
  it('updates assignment status to acknowledged', async () => {
    const create = await request(app)
      .post('/api/assignments')
      .send({ issueId: 'ISS-STATUS-01', category: 'drainage', wardId: 'WARD-01' });

    const { _id } = create.body.data;

    const res = await request(app)
      .put(`/api/assignments/${_id}/status`)
      .send({ status: 'acknowledged', assignedTo: 'staff-123', notes: 'Field officer dispatched' });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe('acknowledged');
    expect(res.body.data.assignedTo).toBe('staff-123');
    expect(res.body.data.notes).toBe('Field officer dispatched');
  });

  it('updates status to completed', async () => {
    const create = await request(app)
      .post('/api/assignments')
      .send({ issueId: 'ISS-STATUS-02', category: 'water', wardId: 'WARD-02' });

    const { _id } = create.body.data;

    const res = await request(app)
      .put(`/api/assignments/${_id}/status`)
      .send({ status: 'completed' });

    expect(res.status).toBe(200);
    expect(res.body.data.status).toBe('completed');
  });

  it('returns 400 for invalid status', async () => {
    const create = await request(app)
      .post('/api/assignments')
      .send({ issueId: 'ISS-STATUS-03', category: 'roads', wardId: 'WARD-01' });

    const { _id } = create.body.data;

    const res = await request(app)
      .put(`/api/assignments/${_id}/status`)
      .send({ status: 'invalid-status' });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it('returns 404 for non-existent assignment id', async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app)
      .put(`/api/assignments/${fakeId}/status`)
      .send({ status: 'acknowledged' });

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ─── GET /api/assignments/department/:dept ────────────────────────────────────

describe('GET /api/assignments/department/:dept', () => {
  it('lists assignments for a department', async () => {
    await request(app)
      .post('/api/assignments')
      .send({ issueId: 'ISS-DEPT-01', category: 'roads', wardId: 'WARD-01' });
    await request(app)
      .post('/api/assignments')
      .send({ issueId: 'ISS-DEPT-02', category: 'roads', wardId: 'WARD-02' });

    const res = await request(app).get('/api/assignments/department/Roads');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.assignments.length).toBeGreaterThanOrEqual(2);
    expect(res.body.data.pagination).toBeDefined();
  });

  it('filters by status', async () => {
    await request(app)
      .post('/api/assignments')
      .send({ issueId: 'ISS-DEPT-03', category: 'garbage', wardId: 'WARD-01' });

    const res = await request(app)
      .get('/api/assignments/department/Solid%20Waste')
      .query({ status: 'pending' });

    expect(res.status).toBe(200);
    expect(res.body.data.assignments.every((a: { status: string }) => a.status === 'pending')).toBe(true);
  });
});

// ─── GET /api/assignments/stats/overview ─────────────────────────────────────

describe('GET /api/assignments/stats/overview', () => {
  it('returns stats with correct structure', async () => {
    await request(app)
      .post('/api/assignments')
      .send({ issueId: 'ISS-STATS-01', category: 'water', wardId: 'WARD-01' });
    await request(app)
      .post('/api/assignments')
      .send({ issueId: 'ISS-STATS-02', category: 'drainage', wardId: 'WARD-02' });

    const res = await request(app).get('/api/assignments/stats/overview');
    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(typeof res.body.data.total).toBe('number');
    expect(res.body.data.total).toBeGreaterThanOrEqual(2);
    expect(res.body.data.byStatus).toBeDefined();
    expect(res.body.data.byDepartment).toBeDefined();
  });
});

// ─── Escalation Service Tests ─────────────────────────────────────────────────

describe('Escalation Service — generateEscalationContent', () => {
  const issueId = 'ISS-ESC-001';
  const dept = 'Roads & Infrastructure Dept';
  const email = 'roads@civicconnect.gov';

  it('generates Level 1 follow-up content', () => {
    const content = generateEscalationContent(1, issueId, dept, email);
    expect(content).toContain('FOLLOW-UP REMINDER');
    expect(content).toContain(issueId);
    expect(content).toContain(dept);
  });

  it('generates Level 2 senior escalation content', () => {
    const content = generateEscalationContent(2, issueId, dept, email);
    expect(content).toContain('SENIOR OFFICER ESCALATION');
    expect(content).toContain(issueId);
    expect(content).toContain('RTI');
  });

  it('generates Level 3 RTI application draft', () => {
    const content = generateEscalationContent(3, issueId, dept, email);
    expect(content).toContain('RTI APPLICATION DRAFT');
    expect(content).toContain('Right to Information Act');
    expect(content).toContain(issueId);
  });

  it('generates Level 4 social pressure pack', () => {
    const content = generateEscalationContent(4, issueId, dept, email);
    expect(content).toContain('SOCIAL PRESSURE PACK');
    expect(content).toContain('TWITTER');
    expect(content).toContain(issueId);
  });
});

describe('Escalation Service — checkAndEscalate', () => {
  it('escalates assignment when dueDate is passed', async () => {
    // Create assignment with old assignedAt (5 days ago) — should trigger Level 1
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const assignment = await Assignment.create({
      issueId: 'ISS-ESC-TEST-01',
      category: 'roads',
      departmentName: 'Roads & Infrastructure Dept',
      contactEmail: 'roads@civicconnect.gov',
      wardId: 'WARD-01',
      assignedAt: fiveDaysAgo,
      dueDate: new Date(fiveDaysAgo.getTime() + 3 * 24 * 60 * 60 * 1000),
      status: 'pending',
      escalationLevel: 0,
      escalationDrafts: [],
      notes: '',
    });

    const wasEscalated = await checkAndEscalate(assignment);
    expect(wasEscalated).toBe(true);

    const updated = await Assignment.findById(assignment._id);
    expect(updated!.escalationLevel).toBe(1);
    expect(updated!.status).toBe('escalated');
    expect(updated!.escalationDrafts).toHaveLength(1);
    expect(updated!.escalationDrafts[0].type).toBe('follow_up');
    expect(updated!.escalationDrafts[0].status).toBe('pending_approval');
  });

  it('does not escalate completed assignments', async () => {
    const tenDaysAgo = new Date();
    tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

    const assignment = await Assignment.create({
      issueId: 'ISS-ESC-TEST-02',
      category: 'water',
      departmentName: 'Water Supply Board',
      contactEmail: 'water@civicconnect.gov',
      wardId: 'WARD-02',
      assignedAt: tenDaysAgo,
      dueDate: new Date(tenDaysAgo.getTime() + 3 * 24 * 60 * 60 * 1000),
      status: 'completed',
      escalationLevel: 0,
      escalationDrafts: [],
      notes: '',
    });

    const wasEscalated = await checkAndEscalate(assignment);
    expect(wasEscalated).toBe(false);
  });

  it('does not create duplicate escalation drafts', async () => {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const assignment = await Assignment.create({
      issueId: 'ISS-ESC-TEST-03',
      category: 'garbage',
      departmentName: 'Solid Waste Management Dept',
      contactEmail: 'swm@civicconnect.gov',
      wardId: 'WARD-03',
      assignedAt: fiveDaysAgo,
      dueDate: new Date(fiveDaysAgo.getTime() + 3 * 24 * 60 * 60 * 1000),
      status: 'pending',
      escalationLevel: 1,
      escalationDrafts: [{
        level: 1,
        type: 'follow_up',
        content: 'Existing draft',
        status: 'pending_approval',
        generatedAt: new Date(),
      }],
      notes: '',
    });

    const wasEscalated = await checkAndEscalate(assignment);
    // Level 1 draft already exists, so should not create another
    const updated = await Assignment.findById(assignment._id);
    expect(updated!.escalationDrafts).toHaveLength(1);
  });
});

// ─── POST /api/assignments/:id/escalation/:draftIndex/approve ─────────────────

describe('POST /api/assignments/:id/escalation/:draftIndex/approve', () => {
  it('approves a pending_approval escalation draft', async () => {
    const fiveDaysAgo = new Date();
    fiveDaysAgo.setDate(fiveDaysAgo.getDate() - 5);

    const assignment = await Assignment.create({
      issueId: 'ISS-APPROVE-01',
      category: 'roads',
      departmentName: 'Roads & Infrastructure Dept',
      contactEmail: 'roads@civicconnect.gov',
      wardId: 'WARD-01',
      assignedAt: fiveDaysAgo,
      dueDate: new Date(),
      status: 'escalated',
      escalationLevel: 1,
      escalationDrafts: [{
        level: 1,
        type: 'follow_up',
        content: 'Follow up content',
        status: 'pending_approval',
        generatedAt: new Date(),
      }],
      notes: '',
    });

    const res = await request(app)
      .post(`/api/assignments/${assignment._id}/escalation/0/approve`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.approvedDraft.status).toBe('approved');
  });

  it('returns 404 for invalid draft index', async () => {
    const assignment = await Assignment.create({
      issueId: 'ISS-APPROVE-02',
      category: 'water',
      departmentName: 'Water Supply Board',
      contactEmail: 'water@civicconnect.gov',
      wardId: 'WARD-02',
      assignedAt: new Date(),
      dueDate: new Date(),
      status: 'pending',
      escalationLevel: 0,
      escalationDrafts: [],
      notes: '',
    });

    const res = await request(app)
      .post(`/api/assignments/${assignment._id}/escalation/5/approve`);

    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ─── Escalation Ladder Config Tests ───────────────────────────────────────────

describe('ESCALATION_LADDER configuration', () => {
  it('has 4 escalation levels', () => {
    expect(ESCALATION_LADDER).toHaveLength(4);
  });

  it('has correct day thresholds', () => {
    expect(ESCALATION_LADDER[0].daysAfterAssignment).toBe(3);
    expect(ESCALATION_LADDER[1].daysAfterAssignment).toBe(7);
    expect(ESCALATION_LADDER[2].daysAfterAssignment).toBe(14);
    expect(ESCALATION_LADDER[3].daysAfterAssignment).toBe(21);
  });

  it('has correct types', () => {
    expect(ESCALATION_LADDER[0].type).toBe('follow_up');
    expect(ESCALATION_LADDER[1].type).toBe('senior_escalation');
    expect(ESCALATION_LADDER[2].type).toBe('rti');
    expect(ESCALATION_LADDER[3].type).toBe('social_pack');
  });
});
