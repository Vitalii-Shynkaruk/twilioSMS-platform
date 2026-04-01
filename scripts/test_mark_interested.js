const http = require('http');

// 1. Login as admin to get a token (we'll pretend to be Stuart via direct API)
function apiCall(method, path, body, token) {
  return new Promise((resolve, reject) => {
    const data = body ? JSON.stringify(body) : null;
    const opts = {
      hostname: 'localhost', port: 3001, path, method,
      headers: { 'Content-Type': 'application/json' }
    };
    if (token) opts.headers['Authorization'] = `Bearer ${token}`;
    const req = http.request(opts, (res) => {
      let d = '';
      res.on('data', c => d += c);
      res.on('end', () => {
        try { resolve(JSON.parse(d)); } catch { resolve(d); }
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

(async () => {
  // Login as admin
  const loginRes = await apiCall('POST', '/api/auth/login', {
    email: 'admin@securecreditlines.com',
    password: 'SclAdmin2026!Secure'
  });
  const token = loginRes.token;
  console.log('Got token:', token ? 'yes' : 'no');

  // Find a lead without a deal that has a Stuart conversation 
  const { PrismaClient } = require('@prisma/client');
  const p = new PrismaClient();
  
  const lead = await p.lead.findFirst({
    where: { status: 'REPLIED', deal: null, deletedAt: null, conversations: { some: { assignedRepId: 'cmmv0jfph0002zohvy6ibbq6q' } } },
    select: { id: true, firstName: true, status: true }
  });
  
  if (!lead) { console.log('No test lead found'); await p.$disconnect(); return; }
  console.log('Test lead:', lead.id, lead.firstName, 'status:', lead.status);

  // Call PUT /api/leads/:id with { status: 'INTERESTED' }
  const updateRes = await apiCall('PUT', `/api/leads/${lead.id}`, { status: 'INTERESTED' }, token);
  console.log('Update response:', updateRes.lead ? { id: updateRes.lead.id, status: updateRes.lead.status, deal: updateRes.lead.deal } : updateRes);

  // Check if deal was created
  const deal = await p.deal.findFirst({ where: { leadId: lead.id }, select: { id: true, stage: true, assignedRepId: true, client: { select: { businessName: true } } } });
  console.log('Deal created:', deal || 'NONE');

  await p.$disconnect();
})();
