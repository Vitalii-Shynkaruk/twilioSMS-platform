const http = require('http');

const ADMIN_EMAIL = process.env.SCL_ADMIN_EMAIL;
const ADMIN_PASSWORD = process.env.SCL_ADMIN_PASSWORD;

if (!ADMIN_EMAIL || !ADMIN_PASSWORD) {
  console.error('Set SCL_ADMIN_EMAIL and SCL_ADMIN_PASSWORD before running this script.');
  process.exit(1);
}

function apiCall(method, path, token, body) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3001, path, method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers['Authorization'] = 'Bearer ' + token;
    if (data) opts.headers['Content-Length'] = Buffer.byteLength(data);
    const req = http.request(opts, res => {
      let b = '';
      res.on('data', c => b += c);
      res.on('end', () => resolve(JSON.parse(b)));
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  // Login as admin
  const login = await apiCall('POST', '/api/auth/login', null, {
    email: ADMIN_EMAIL,
    password: ADMIN_PASSWORD
  });
  console.log('Login:', login.token ? 'OK' : 'FAILED', login.error || '');
  if (!login.token) { console.log('Full response:', JSON.stringify(login)); return; }

  // Get pipeline board
  const board = await apiCall('GET', '/api/deals/board', login.token);
  console.log('\n=== Pipeline Board ===');
  
  const stuartId = 'cmmv0jfph0002zohvy6ibbq6q';
  let found = false;
  
  for (const stageObj of board.stages) {
    const stuartDeals = stageObj.deals.filter(d => d.assignedRepId === stuartId);
    console.log(`\n${stageObj.label} (${stageObj.deals.length} total, ${stuartDeals.length} Stuart's):`);
    for (const d of stuartDeals) {
      const mark = d.id === 'cmndjljnf0008zo9mmybdvbhv' ? ' <<<< IVAN' : '';
      console.log(`  - ${d.client?.businessName || 'no client'} | ${d.id}${mark}`);
      if (d.client?.businessName === 'Headmasters' || d.id === 'cmndjljnf0008zo9mmybdvbhv') found = true;
    }
    // Also check ALL deals in this stage for Ivan
    for (const d of stageObj.deals) {
      if (d.id === 'cmndjljnf0008zo9mmybdvbhv' && d.assignedRepId !== stuartId) {
        console.log(`  >>> IVAN found but assigned to DIFFERENT rep: ${d.assignedRepId}`);
        found = true;
      }
    }
  }
  
  if (!found) console.log('\n>>> Ivan/Headmasters deal NOT FOUND in any stage of board response');
})();
