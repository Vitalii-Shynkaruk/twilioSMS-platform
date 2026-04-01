const { PrismaClient } = require('./server/node_modules/@prisma/client');
const p = new PrismaClient();

(async () => {
  const stuartId = 'cmmv0jfph0002zohvy6ibbq6q';

  // Check Stuart assignments
  const assignments = await p.numberAssignment.findMany({
    where: { userId: stuartId, isActive: true },
    include: { phoneNumber: { select: { phoneNumber: true, status: true } } }
  });
  console.log('Stuart active assignments:', assignments.length);
  assignments.forEach(a => console.log('  ', a.phoneNumber.phoneNumber, a.phoneNumber.status));

  // Check total active numbers
  const totalNums = await p.phoneNumber.count({ where: { status: 'ACTIVE' } });
  console.log('\nTotal ACTIVE numbers:', totalNums);

  // Check all assignments by user
  const allAssignments = await p.numberAssignment.findMany({
    where: { isActive: true },
    include: { 
      user: { select: { firstName: true, lastName: true } }, 
      phoneNumber: { select: { phoneNumber: true } } 
    }
  });
  console.log('\nAll active assignments:', allAssignments.length);
  const byUser = {};
  allAssignments.forEach(a => {
    const name = a.user.firstName + ' ' + a.user.lastName;
    if (!byUser[name]) byUser[name] = 0;
    byUser[name]++;
  });
  Object.entries(byUser).forEach(([n, c]) => console.log('  ', n, ':', c, 'numbers'));

  await p.$disconnect();
})();
