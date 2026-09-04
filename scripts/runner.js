const { MongoMemoryServer } = require('../services/citizen-service/node_modules/mongodb-memory-server');
const { spawn } = require('child_process');
const path = require('path');

async function main() {
  console.log('====================================================');
  console.log('🚀 Starting CivicConnect Complete Stack Locally');
  console.log('====================================================\n');

  // 1. Start MongoDB on standard port 27017
  console.log('📦 [Database] Starting In-Memory MongoDB Server on port 27017...');
  const mongod = await MongoMemoryServer.create({
    instance: {
      port: 27017,
      dbName: 'admin',
    },
  });
  console.log('✅ [Database] MongoDB is running at: mongodb://127.0.0.1:27017\n');

  const services = [
    {
      name: 'citizen-service',
      port: 3001,
      dir: path.join(__dirname, '..', 'services', 'citizen-service'),
      env: {
        PORT: '3001',
        NODE_ENV: 'development',
        MONGO_URI: 'mongodb://127.0.0.1:27017/citizen_db',
        JWT_SECRET: 'civicconnect-local-dev-jwt-secret',
        ISSUE_SERVICE_URL: 'http://localhost:3002',
      },
    },
    {
      name: 'issue-service',
      port: 3002,
      dir: path.join(__dirname, '..', 'services', 'issue-service'),
      env: {
        PORT: '3002',
        NODE_ENV: 'development',
        MONGO_URI: 'mongodb://127.0.0.1:27017/issue_db',
        ASSIGNMENT_SERVICE_URL: 'http://localhost:3003',
        NOTIFICATION_SERVICE_URL: 'http://localhost:3004',
      },
    },
    {
      name: 'assignment-service',
      port: 3003,
      dir: path.join(__dirname, '..', 'services', 'assignment-service'),
      env: {
        PORT: '3003',
        NODE_ENV: 'development',
        MONGO_URI: 'mongodb://127.0.0.1:27017/assignment_db',
        ISSUE_SERVICE_URL: 'http://localhost:3002',
        NOTIFICATION_SERVICE_URL: 'http://localhost:3004',
      },
    },
    {
      name: 'notification-service',
      port: 3004,
      dir: path.join(__dirname, '..', 'services', 'notification-service'),
      env: {
        PORT: '3004',
        NODE_ENV: 'development',
        MONGO_URI: 'mongodb://127.0.0.1:27017/notification_db',
        CITIZEN_SERVICE_URL: 'http://localhost:3001',
      },
    },
  ];

  const processes = [];

  for (const svc of services) {
    console.log(`⏳ [${svc.name}] Spawning on port ${svc.port}...`);
    const child = spawn('node', ['dist/index.js'], {
      cwd: svc.dir,
      env: { ...process.env, ...svc.env },
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    child.stdout.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.log(`[${svc.name}] ${msg}`);
    });

    child.stderr.on('data', (data) => {
      const msg = data.toString().trim();
      if (msg) console.error(`[${svc.name} ERROR] ${msg}`);
    });

    child.on('exit', (code) => {
      console.log(`⚠️ [${svc.name}] Exited with code ${code}`);
    });

    processes.push(child);
  }

  console.log('\n====================================================');
  console.log('🎉 All 4 Microservices have been launched!');
  console.log('   Citizen Service:      http://localhost:3001');
  console.log('   Issue Service:        http://localhost:3002');
  console.log('   Assignment Service:   http://localhost:3003');
  console.log('   Notification Service: http://localhost:3004');
  console.log('====================================================\n');

  // Handle termination
  const cleanup = async () => {
    console.log('\n🛑 Shutting down all services and database...');
    for (const proc of processes) {
      proc.kill('SIGINT');
    }
    await mongod.stop();
    console.log('👋 Goodbye!');
    process.exit(0);
  };

  process.on('SIGINT', cleanup);
  process.on('SIGTERM', cleanup);
}

main().catch((err) => {
  console.error('Fatal runner error:', err);
  process.exit(1);
});
