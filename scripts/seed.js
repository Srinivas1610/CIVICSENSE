/**
 * CivicConnect — Manipal Landmark Seed Script
 * Populates realistic civic issues centered around Manipal, Karnataka.
 * Idempotent: checks existing issues before inserting.
 */

const http = require('http');
const https = require('https');
const { URL } = require('url');

const ISSUE_SERVICE_URL = process.env.ISSUE_SERVICE_URL || 'http://localhost:3002';
const CITIZEN_SERVICE_URL = process.env.CITIZEN_SERVICE_URL || 'http://localhost:3001';

function request(targetUrl, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(targetUrl);
    const lib = parsed.protocol === 'https:' ? https : http;

    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || (parsed.protocol === 'https:' ? 443 : 80),
      path: parsed.pathname + parsed.search,
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        ...(options.headers || {}),
      },
      timeout: 10000,
    };

    const req = lib.request(reqOpts, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch {
          json = data;
        }
        resolve({ statusCode: res.statusCode, data: json });
      });
    });

    req.on('error', (err) => reject(err));
    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Request timed out'));
    });

    if (body) {
      req.write(typeof body === 'string' ? body : JSON.stringify(body));
    }
    req.end();
  });
}

async function waitForService(url, serviceName, maxAttempts = 30) {
  process.stdout.write(`⏳ Waiting for ${serviceName} (${url}/health)...`);
  for (let i = 1; i <= maxAttempts; i++) {
    try {
      const res = await request(`${url}/health`);
      if (res.statusCode === 200) {
        console.log(' Ready!');
        return true;
      }
    } catch {
      // ignore retry
    }
    process.stdout.write('.');
    await new Promise((r) => setTimeout(r, 1000));
  }
  console.log(' ⚠️ Timeout!');
  return false;
}

const SEED_CITIZENS = [
  { phone: '+919845011111', name: 'Aditya Hegde', wardId: 'WARD-01' },
  { phone: '+919845022222', name: 'Pooja Nayak', wardId: 'WARD-02' },
  { phone: '+919845033333', name: 'Kavya Shenoy', wardId: 'WARD-01' },
];

const SEED_ISSUES = [
  {
    reportedBy: 'CIT-001',
    channel: 'app',
    category: 'roads',
    targetStatus: 'pending',
    rawDescription: 'Hazardous crater-sized pothole on main carriageway near Tiger Circle traffic junction, disrupting two-wheeler traffic.',
    location: {
      lat: 13.3525,
      lng: 74.7928,
      address: 'Tiger Circle, Udupi-Manipal Highway, Manipal, Karnataka 576104',
      wardId: 'WARD-01',
      wardName: 'Tiger Circle & MIT Campus',
      geohash: 'tdm6s1q',
    },
    media: ['https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=600&auto=format&fit=crop'],
  },
  {
    reportedBy: 'CIT-002',
    channel: 'app',
    category: 'garbage',
    targetStatus: 'assigned',
    rawDescription: 'Overflowing commercial dumpster bin spilling waste onto the pedestrian walkway near Food Court 1.',
    location: {
      lat: 13.3538,
      lng: 74.7942,
      address: 'Kamath Circle, MIT Hostels Block 14 Road, Manipal, Karnataka 576104',
      wardId: 'WARD-01',
      wardName: 'Tiger Circle & MIT Campus',
      geohash: 'tdm6s3b',
    },
    media: ['https://images.unsplash.com/photo-1532996122724-e3c354a0b15b?w=600&auto=format&fit=crop'],
  },
  {
    reportedBy: 'CIT-001',
    channel: 'whatsapp',
    category: 'streetlights',
    targetStatus: 'in_progress',
    rawDescription: 'Consecutive streetlights unlit along the arterial stretch leading to Syndicate Bank HO, creating blind spot after dark.',
    location: {
      lat: 13.3508,
      lng: 74.7915,
      address: 'Syndicate Bank HO Road, Manipal, Karnataka 576104',
      wardId: 'WARD-02',
      wardName: 'Syndicate Circle & KMC',
      geohash: 'tdm6kcw',
    },
    media: ['https://images.unsplash.com/photo-1509114397022-ed747cca3f65?w=600&auto=format&fit=crop'],
  },
  {
    reportedBy: 'CIT-003',
    channel: 'app',
    category: 'water',
    targetStatus: 'resolved',
    rawDescription: 'High-pressure municipal water pipeline rupture causing localized waterlogging outside MIT Central Library.',
    location: {
      lat: 13.3562,
      lng: 74.7978,
      address: 'MIT Central Library Road, Academic Block 2, Manipal, Karnataka 576104',
      wardId: 'WARD-01',
      wardName: 'Tiger Circle & MIT Campus',
      geohash: 'tdm6s72',
    },
    media: ['https://images.unsplash.com/photo-1584467735815-f778f274e296?w=600&auto=format&fit=crop'],
  },
  {
    reportedBy: 'CIT-002',
    channel: 'whatsapp',
    category: 'drainage',
    targetStatus: 'pending',
    rawDescription: 'Stormwater drainage channel choked with plastic waste and silt, causing flood risk near End Point Park entrance.',
    location: {
      lat: 13.3615,
      lng: 74.7872,
      address: 'End Point Road, Near Swarna Viewpoint, Manipal, Karnataka 576104',
      wardId: 'WARD-03',
      wardName: 'End Point & Valley',
      geohash: 'tdm6eun',
    },
    media: ['https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=600&auto=format&fit=crop'],
  },
  {
    reportedBy: 'CIT-001',
    channel: 'app',
    category: 'garbage',
    targetStatus: 'in_progress',
    rawDescription: 'Illegal debris dumping along the southern wetland promenade of Manipal Lake encroaching walking trail.',
    location: {
      lat: 13.3458,
      lng: 74.7902,
      address: 'Manipal Lake Ring Road, Near Boating Point, Manipal, Karnataka 576104',
      wardId: 'WARD-04',
      wardName: 'Manipal Lake & Dasharath Nagar',
      geohash: 'tdm67f5',
    },
    media: ['https://images.unsplash.com/photo-1618477461853-cf6ed80faba5?w=600&auto=format&fit=crop'],
  },
  {
    reportedBy: 'CIT-003',
    channel: 'app',
    category: 'streetlights',
    targetStatus: 'resolved',
    rawDescription: 'Damaged cast iron lighting pole damaged by heavy goods vehicle, exposed electrical wires secured safely.',
    location: {
      lat: 13.3512,
      lng: 74.7920,
      address: 'Coin Circle Intersection, Manipal, Karnataka 576104',
      wardId: 'WARD-02',
      wardName: 'Syndicate Circle & KMC',
      geohash: 'tdm6kd5',
    },
    media: ['https://images.unsplash.com/photo-1509114397022-ed747cca3f65?w=600&auto=format&fit=crop'],
  },
  {
    reportedBy: 'CIT-002',
    channel: 'app',
    category: 'roads',
    targetStatus: 'assigned',
    rawDescription: 'Severe road surface subsidence and deep fissure forming near KMC Greens auditorium entrance.',
    location: {
      lat: 13.3546,
      lng: 74.7895,
      address: 'KMC Greens Road, MAHE Campus, Manipal, Karnataka 576104',
      wardId: 'WARD-02',
      wardName: 'Syndicate Circle & KMC',
      geohash: 'tdm67y2',
    },
    media: ['https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=600&auto=format&fit=crop'],
  },
  {
    reportedBy: 'CIT-001',
    channel: 'whatsapp',
    category: 'drainage',
    targetStatus: 'resolved',
    rawDescription: 'Underground culvert overflow following pre-monsoon downpour near Canara Mall crossing, culvert cleared.',
    location: {
      lat: 13.3518,
      lng: 74.7865,
      address: 'Udupi-Manipal Main Road, Near Canara Mall, Manipal, Karnataka 576104',
      wardId: 'WARD-02',
      wardName: 'Syndicate Circle & KMC',
      geohash: 'tdm67mu',
    },
    media: ['https://images.unsplash.com/photo-1544620347-c4fd4a3d5957?w=600&auto=format&fit=crop'],
  },
  {
    reportedBy: 'CIT-003',
    channel: 'app',
    category: 'roads',
    targetStatus: 'pending',
    rawDescription: 'Cracked and raised sidewalk pavers causing tripping hazard for pedestrians near Venugopal Temple entrance.',
    location: {
      lat: 13.3520,
      lng: 74.7935,
      address: 'Temple Road, Near Venugopal Temple, Manipal, Karnataka 576104',
      wardId: 'WARD-01',
      wardName: 'Tiger Circle & MIT Campus',
      geohash: 'tdm6se8',
    },
    media: ['https://images.unsplash.com/photo-1515162816999-a0c47dc192f7?w=600&auto=format&fit=crop'],
  },
];

async function seedData() {
  console.log('\n====================================================');
  console.log('🌱 Starting CivicConnect Manipal Seed Data Injection');
  console.log('====================================================\n');

  // 1. Check services
  const issueServiceReady = await waitForService(ISSUE_SERVICE_URL, 'issue-service');
  if (!issueServiceReady) {
    console.error('❌ Cannot seed data: issue-service is not responding.');
    return { success: false, error: 'issue-service offline' };
  }

  // 2. Seed Citizens (Optional/Best Effort)
  try {
    for (const citizen of SEED_CITIZENS) {
      await request(`${CITIZEN_SERVICE_URL}/api/citizens/register`, { method: 'POST' }, citizen);
    }
    console.log(`✅ Seeded / Verified ${SEED_CITIZENS.length} sample citizens`);
  } catch (err) {
    console.log('ℹ️ Citizen service seed skipped or already present.');
  }

  // 3. Fetch existing issues for idempotency
  let existingDescriptions = new Set();
  try {
    const listRes = await request(`${ISSUE_SERVICE_URL}/api/issues?limit=100`);
    if (listRes.statusCode === 200 && listRes.data && listRes.data.data) {
      const items = listRes.data.data.issues || listRes.data.data;
      if (Array.isArray(items)) {
        for (const item of items) {
          if (item.rawDescription) existingDescriptions.add(item.rawDescription.trim().toLowerCase());
        }
      }
    }
  } catch (err) {
    console.warn('⚠️ Could not check existing issues:', err.message);
  }

  let createdCount = 0;
  let skippedCount = 0;

  for (const item of SEED_ISSUES) {
    const descKey = item.rawDescription.trim().toLowerCase();
    if (existingDescriptions.has(descKey)) {
      skippedCount++;
      continue;
    }

    try {
      const createRes = await request(`${ISSUE_SERVICE_URL}/api/issues`, { method: 'POST' }, {
        reportedBy: item.reportedBy,
        channel: item.channel,
        category: item.category,
        rawDescription: item.rawDescription,
        location: item.location,
        media: item.media,
      });

      if (createRes.statusCode === 201 && createRes.data && createRes.data.data) {
        const issueId = createRes.data.data._id || createRes.data.data.id;
        createdCount++;
        console.log(`  [+] Created: "${item.location.address.split(',')[0]}" (${item.category}) -> ID: ${issueId}`);

        // If target status is not pending, update status
        if (item.targetStatus && item.targetStatus !== 'pending') {
          await request(`${ISSUE_SERVICE_URL}/api/issues/${issueId}/status`, { method: 'PATCH' }, {
            status: item.targetStatus,
            updatedBy: 'SYSTEM_SEED',
          });
        }

        // Trigger DNA analysis to populate department / root cause
        try {
          await request(`${ISSUE_SERVICE_URL}/api/issues/${issueId}/analyze`, { method: 'POST' });
        } catch {
          // ignore if analyzer is in fallback
        }
      } else {
        console.warn(`  [-] Failed to create: ${item.location.address}`, createRes.data);
      }
    } catch (err) {
      console.error(`  [-] Error creating issue:`, err.message);
    }
  }

  console.log('\n====================================================');
  console.log(`🎉 Seed Completed! Added: ${createdCount} | Skipped (already present): ${skippedCount} | Total: ${SEED_ISSUES.length}`);
  console.log('====================================================\n');

  return { success: true, createdCount, skippedCount };
}

if (require.main === module) {
  seedData()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Seed execution error:', err);
      process.exit(1);
    });
}

module.exports = { seedData, SEED_ISSUES };
