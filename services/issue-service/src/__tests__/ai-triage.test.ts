import request from 'supertest';
import mongoose from 'mongoose';
import { MongoMemoryServer } from 'mongodb-memory-server';
import app from '../index';
import Issue from '../models/issue.model';
import {
  heuristicTriage,
  triageCivicHazard,
  triageResultToDNA,
} from '../services/ai-triage.service';

let mongoServer: MongoMemoryServer;

beforeAll(async () => {
  mongoServer = await MongoMemoryServer.create();
  const uri = mongoServer.getUri();
  await mongoose.connect(uri);
});

afterAll(async () => {
  await mongoose.disconnect();
  await mongoServer.stop();
});

beforeEach(async () => {
  await Issue.deleteMany({});
});

describe('Autonomous Multimodal AI Triage Agent — Core Logic', () => {
  it('should accurately triage road surface potholes and craters', () => {
    const result = heuristicTriage({
      text: 'Hazardous deep pothole on Tiger Circle highway causing vehicle wheel rim damage.',
      location: { address: 'Tiger Circle, Manipal', wardName: 'Ward 01' },
    });

    expect(result.category).toBe('roads');
    expect(result.severityScore).toBeGreaterThanOrEqual(6);
    expect(result.suggestedDepartment.zoneId).toBe('ZONE-ROADS');
    expect(result.suggestedDepartment.name).toContain('Roads');
    expect(result.actionPlan).toBeDefined();
    expect(result.safetyAdvisory).toBeDefined();
  });

  it('should accurately triage solid waste and overflowing garbage bins', () => {
    const result = heuristicTriage({
      text: 'Huge commercial dumpster overflowing with plastic waste and garbage.',
      location: { address: 'Kamath Circle, Manipal' },
    });

    expect(result.category).toBe('garbage');
    expect(result.suggestedDepartment.zoneId).toBe('ZONE-SWM');
    expect(result.severityTrajectory).toBe('worsening');
  });

  it('should accurately triage dark streets and broken lighting infrastructure', () => {
    const result = heuristicTriage({
      text: 'Consecutive streetlights are unlit creating a dark street hazard at night.',
    });

    expect(result.category).toBe('streetlights');
    expect(result.suggestedDepartment.zoneId).toBe('ZONE-ELEC');
  });

  it('should convert triage result into valid IIssueDNA schema', () => {
    const triage = heuristicTriage({
      text: 'Water pipe rupture flooding main street.',
    });
    const dna = triageResultToDNA(triage);

    expect(dna.classification).toBe(triage.hazardType);
    expect(dna.severityScore).toBe(triage.severityScore);
    expect(dna.department.name).toBe(triage.suggestedDepartment.name);
    expect(dna.confidence).toBe(triage.confidence);
  });
});

describe('POST /api/issues/triage — Autonomous AI Triage Endpoint', () => {
  it('should return a dry-run triage diagnosis without creating an issue when autoDispatch=false', async () => {
    const res = await request(app)
      .post('/api/issues/triage')
      .send({
        text: 'Broken water supply pipeline gushing drinking water outside MIT library',
        autoDispatch: false,
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.autoDispatched).toBe(false);
    expect(res.body.triage).toBeDefined();
    expect(res.body.triage.category).toBe('water');
    expect(res.body.triage.severityScore).toBeGreaterThanOrEqual(7);

    // Verify nothing saved to database
    const count = await Issue.countDocuments();
    expect(count).toBe(0);
  });

  it('should autonomously triage, persist, and auto-dispatch ticket when autoDispatch=true', async () => {
    const res = await request(app)
      .post('/api/issues/triage')
      .send({
        text: 'Massive pothole crater on main carriageway near Tiger Circle',
        reportedBy: '+919845012345',
        location: {
          lat: 13.3525,
          lng: 74.7928,
          address: 'Tiger Circle, Manipal',
          wardId: 'WARD-01',
          wardName: 'MIT Campus',
        },
        autoDispatch: true,
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.autoDispatched).toBe(true);
    expect(res.body.data.issue).toBeDefined();
    expect(res.body.data.issue.category).toBe('roads');
    expect(res.body.data.issue.status).toBe('assigned');
    expect(res.body.data.issue.dna).toBeDefined();
    expect(res.body.data.issue.dna.severityScore).toBeGreaterThanOrEqual(6);

    // Verify issue was saved in database with status 'assigned'
    const saved = await Issue.findById(res.body.data.issue._id);
    expect(saved).not.toBeNull();
    expect(saved?.status).toBe('assigned');
    expect(saved?.reportedBy).toBe('+919845012345');
  });
});

describe('POST /api/issues/webhook/whatsapp — Autonomous Ingestion & Dispatch', () => {
  it('should autonomously triage and auto-dispatch incoming WhatsApp hazard report', async () => {
    const res = await request(app)
      .post('/api/issues/webhook/whatsapp')
      .send({
        from: '+919845099999',
        text: 'Choked underground storm drainage culvert overflowing onto road near Canara Mall',
        location: {
          lat: 13.3518,
          lng: 74.7865,
          address: 'Canara Mall Crossing, Manipal',
          wardId: 'WARD-02',
          wardName: 'KMC Ward',
        },
      });

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.autoDispatched).toBe(true);
    expect(res.body.category).toBe('drainage');
    expect(res.body.department).toContain('Drainage');

    const created = await Issue.findById(res.body.issueId);
    expect(created).not.toBeNull();
    expect(created?.channel).toBe('whatsapp');
    expect(created?.status).toBe('assigned');
  });
});
