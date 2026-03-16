const twilio = require('twilio');
require('dotenv').config();
const client = twilio(process.env.TWILIO_ACCOUNT_SID, process.env.TWILIO_AUTH_TOKEN);
const accountSid = process.env.TWILIO_ACCOUNT_SID;

async function check() {
  console.log('=== ACCOUNT INFO ===');
  try {
    const account = await client.api.accounts(accountSid).fetch();
    console.log('Name:', account.friendlyName);
    console.log('Status:', account.status);
    console.log('Type:', account.type);
    console.log('Created:', account.dateCreated);
  } catch(e) { console.log('Account error:', e.message); }

  console.log('\n=== PHONE NUMBERS ===');
  try {
    const numbers = await client.incomingPhoneNumbers.list({ limit: 20 });
    numbers.forEach(n => {
      console.log(n.phoneNumber, '| SMS:', n.capabilities.sms, '| MMS:', n.capabilities.mms, '| Voice:', n.capabilities.voice);
      console.log('  SID:', n.sid);
      console.log('  SmsUrl:', n.smsUrl);
    });
    console.log('Total numbers:', numbers.length);
  } catch(e) { console.log('Numbers error:', e.message); }

  console.log('\n=== MESSAGING SERVICES ===');
  try {
    const services = await client.messaging.v1.services.list({ limit: 10 });
    if (services.length === 0) {
      console.log('NO messaging services found');
    } else {
      services.forEach(s => {
        console.log('Service:', s.friendlyName, '| SID:', s.sid);
        console.log('  InboundUrl:', s.inboundRequestUrl);
      });
    }
  } catch(e) { console.log('Messaging Service error:', e.message); }

  console.log('\n=== A2P BRAND REGISTRATIONS ===');
  try {
    const brands = await client.messaging.v1.brandRegistrations.list({ limit: 10 });
    if (brands.length === 0) {
      console.log('NO brand registrations — A2P 10DLC NOT registered');
    } else {
      brands.forEach(b => {
        console.log('Brand:', b.sid, '| Status:', b.brandRegistrationStatus);
      });
    }
  } catch(e) { console.log('Brand error:', e.message); }

  console.log('\n=== TOLL-FREE VERIFICATION ===');
  try {
    const verifications = await client.messaging.v1.tollfreeVerifications.list({ limit: 10 });
    if (verifications.length === 0) {
      console.log('NO toll-free verifications');
    } else {
      verifications.forEach(v => {
        console.log('TollFree:', v.tollfreePhoneNumberSid, '| Status:', v.status);
      });
    }
  } catch(e) { console.log('TollFree verif error:', e.message); }

  console.log('\n=== TRUST HUB / CUSTOMER PROFILES ===');
  try {
    const profiles = await client.trusthub.v1.customerProfiles.list({ limit: 10 });
    if (profiles.length === 0) {
      console.log('NO customer profiles — business verification NOT started');
    } else {
      profiles.forEach(p => {
        console.log('Profile:', p.friendlyName, '| Status:', p.status, '| SID:', p.sid);
      });
    }
  } catch(e) { console.log('TrustHub error:', e.message); }

  console.log('\n=== A2P CAMPAIGNS ===');
  try {
    const services = await client.messaging.v1.services.list({ limit: 10 });
    for (const svc of services) {
      const usapptopers = await client.messaging.v1.services(svc.sid).usAppToPerson.list({ limit: 10 });
      usapptopers.forEach(u => {
        console.log('Campaign:', u.sid, '| Status:', u.campaignStatus);
        console.log('  UseCase:', u.useCase);
        console.log('  MessageFlow:', u.messageFlow);
      });
    }
    if (services.length === 0) console.log('No services, so no A2P campaigns');
  } catch(e) { console.log('A2P campaigns error:', e.message); }
}

check().catch(e => console.log('Fatal:', e.message));
