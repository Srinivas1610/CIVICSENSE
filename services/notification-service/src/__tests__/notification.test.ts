import request from "supertest";
import mongoose from "mongoose";
import { MongoMemoryServer } from "mongodb-memory-server";
import app from "../app";
import { Notification } from "../models/notification.model";

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
  await Notification.deleteMany({});
});

// ──────────────────────────────────────────────
// Health check
// ──────────────────────────────────────────────
describe("GET /health", () => {
  it("should return 200 with status ok", async () => {
    const res = await request(app).get("/health");
    expect(res.status).toBe(200);
    expect(res.body.status).toBe("ok");
    expect(res.body.service).toBe("notification-service");
    expect(res.body.timestamp).toBeDefined();
  });
});

// ──────────────────────────────────────────────
// POST /api/notifications/send
// ──────────────────────────────────────────────
describe("POST /api/notifications/send", () => {
  it("should create an in_app notification successfully", async () => {
    const payload = {
      citizenId: "citizen-001",
      issueId: "issue-001",
      type: "status_update",
      title: "Test Notification",
      message: "Your issue has been updated.",
      channel: "in_app",
    };

    const res = await request(app)
      .post("/api/notifications/send")
      .send(payload);

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.citizenId).toBe("citizen-001");
    expect(res.body.data.type).toBe("status_update");
    expect(res.body.data.channel).toBe("in_app");
    expect(res.body.data.status).toBe("sent");
  });

  it("should return 400 if required fields are missing", async () => {
    const res = await request(app)
      .post("/api/notifications/send")
      .send({ citizenId: "citizen-001" });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
    expect(res.body.error).toBeDefined();
  });

  it("should return 400 for invalid notification type", async () => {
    const res = await request(app).post("/api/notifications/send").send({
      citizenId: "citizen-001",
      issueId: "issue-001",
      type: "invalid_type",
      title: "Test",
      message: "Test message",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });

  it("should return 400 for invalid channel", async () => {
    const res = await request(app).post("/api/notifications/send").send({
      citizenId: "citizen-001",
      issueId: "issue-001",
      type: "status_update",
      title: "Test",
      message: "Test message",
      channel: "pigeon",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// POST /api/notifications/status-update
// ──────────────────────────────────────────────
describe("POST /api/notifications/status-update", () => {
  it("should create a status_update notification", async () => {
    const res = await request(app).post("/api/notifications/status-update").send({
      citizenId: "citizen-002",
      issueId: "issue-002",
      oldStatus: "pending",
      newStatus: "in_progress",
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.type).toBe("status_update");
    expect(res.body.data.metadata.oldStatus).toBe("pending");
    expect(res.body.data.metadata.newStatus).toBe("in_progress");
  });

  it("should return 400 if oldStatus or newStatus missing", async () => {
    const res = await request(app).post("/api/notifications/status-update").send({
      citizenId: "citizen-002",
      issueId: "issue-002",
      oldStatus: "pending",
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// POST /api/notifications/escalation
// ──────────────────────────────────────────────
describe("POST /api/notifications/escalation", () => {
  it("should create an escalation notification", async () => {
    const res = await request(app).post("/api/notifications/escalation").send({
      citizenId: "citizen-003",
      issueId: "issue-003",
      escalationLevel: 2,
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.type).toBe("escalation");
    expect(res.body.data.metadata.escalationLevel).toBe(2);
  });

  it("should reject escalationLevel out of range", async () => {
    const res = await request(app).post("/api/notifications/escalation").send({
      citizenId: "citizen-003",
      issueId: "issue-003",
      escalationLevel: 99,
    });

    expect(res.status).toBe(400);
    expect(res.body.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// GET /api/notifications/:citizenId
// ──────────────────────────────────────────────
describe("GET /api/notifications/:citizenId", () => {
  it("should return notifications for a citizen", async () => {
    // Seed two notifications
    await Notification.create([
      {
        citizenId: "citizen-004",
        issueId: "issue-004",
        type: "status_update",
        title: "Update 1",
        message: "Message 1",
        channel: "in_app",
        status: "sent",
        metadata: {},
        sentAt: new Date(),
        readAt: null,
      },
      {
        citizenId: "citizen-004",
        issueId: "issue-005",
        type: "escalation",
        title: "Escalation 1",
        message: "Escalation message",
        channel: "in_app",
        status: "sent",
        metadata: { escalationLevel: 1 },
        sentAt: new Date(),
        readAt: null,
      },
    ]);

    const res = await request(app).get("/api/notifications/citizen-004");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.notifications).toHaveLength(2);
  });

  it("should filter by type", async () => {
    await Notification.create([
      {
        citizenId: "citizen-005",
        issueId: "issue-006",
        type: "status_update",
        title: "Update",
        message: "Msg",
        channel: "in_app",
        status: "sent",
        metadata: {},
        sentAt: new Date(),
        readAt: null,
      },
      {
        citizenId: "citizen-005",
        issueId: "issue-007",
        type: "resolution",
        title: "Resolved",
        message: "Resolved msg",
        channel: "in_app",
        status: "sent",
        metadata: {},
        sentAt: new Date(),
        readAt: null,
      },
    ]);

    const res = await request(app)
      .get("/api/notifications/citizen-005")
      .query({ type: "resolution" });

    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(1);
    expect(res.body.data.notifications[0].type).toBe("resolution");
  });

  it("should return empty array for unknown citizen", async () => {
    const res = await request(app).get("/api/notifications/unknown-citizen");
    expect(res.status).toBe(200);
    expect(res.body.data.total).toBe(0);
    expect(res.body.data.notifications).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────
// PUT /api/notifications/:id/read
// ──────────────────────────────────────────────
describe("PUT /api/notifications/:id/read", () => {
  it("should mark a notification as read", async () => {
    const notif = await Notification.create({
      citizenId: "citizen-006",
      issueId: "issue-008",
      type: "status_update",
      title: "Mark me read",
      message: "Please read me",
      channel: "in_app",
      status: "sent",
      metadata: {},
      sentAt: new Date(),
      readAt: null,
    });

    const res = await request(app).put(`/api/notifications/${notif._id}/read`);

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.status).toBe("read");
    expect(res.body.data.readAt).not.toBeNull();
  });

  it("should return 404 for non-existent notification id", async () => {
    const fakeId = new mongoose.Types.ObjectId().toString();
    const res = await request(app).put(`/api/notifications/${fakeId}/read`);
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});

// ──────────────────────────────────────────────
// GET /api/notifications/stats/summary
// ──────────────────────────────────────────────
describe("GET /api/notifications/stats/summary", () => {
  it("should return stats with correct shape", async () => {
    await Notification.create([
      {
        citizenId: "c1",
        issueId: "i1",
        type: "status_update",
        title: "T1",
        message: "M1",
        channel: "email",
        status: "sent",
        metadata: {},
        sentAt: new Date(),
        readAt: null,
      },
      {
        citizenId: "c2",
        issueId: "i2",
        type: "escalation",
        title: "T2",
        message: "M2",
        channel: "in_app",
        status: "failed",
        metadata: {},
        sentAt: null,
        readAt: null,
      },
    ]);

    const res = await request(app).get("/api/notifications/stats/summary");

    expect(res.status).toBe(200);
    expect(res.body.success).toBe(true);
    expect(res.body.data.total).toBe(2);
    expect(res.body.data.byType).toBeDefined();
    expect(res.body.data.byChannel).toBeDefined();
    expect(res.body.data.byStatus).toBeDefined();
    expect(res.body.data.byType.status_update).toBe(1);
    expect(res.body.data.byType.escalation).toBe(1);
  });
});

// ──────────────────────────────────────────────
// POST /api/notifications/validation-request
// ──────────────────────────────────────────────
describe("POST /api/notifications/validation-request", () => {
  it("should send validation requests to multiple citizens", async () => {
    const res = await request(app)
      .post("/api/notifications/validation-request")
      .send({
        nearbyCitizenIds: ["citizen-007", "citizen-008"],
        issueId: "issue-009",
        location: "Main Street, Block 5",
      });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.sent).toBe(2);
    expect(res.body.data.notifications).toHaveLength(2);
  });
});

// ──────────────────────────────────────────────
// POST /api/notifications/resolution
// ──────────────────────────────────────────────
describe("POST /api/notifications/resolution", () => {
  it("should send a resolution notice", async () => {
    const res = await request(app).post("/api/notifications/resolution").send({
      citizenId: "citizen-009",
      issueId: "issue-010",
    });

    expect(res.status).toBe(201);
    expect(res.body.success).toBe(true);
    expect(res.body.data.type).toBe("resolution");
    expect(res.body.data.status).toBe("sent");
  });
});

// ──────────────────────────────────────────────
// 404 for unknown routes
// ──────────────────────────────────────────────
describe("Unknown routes", () => {
  it("should return 404 for unregistered routes", async () => {
    const res = await request(app).get("/api/unknown-route");
    expect(res.status).toBe(404);
    expect(res.body.success).toBe(false);
  });
});
