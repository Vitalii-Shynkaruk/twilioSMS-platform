-- Add diverse test data: CLOSED, COMMITTED_FUNDING deals and enrich existing data
-- Run with: mysql -u root -pSmsP@ss2024Secure sms_platform < /opt/sms-platform/scripts/add_test_data.sql

SET @rep_jb = 'cmnahe3h80000zo0sdxl2arku';  -- Jonathan Baker (ADMIN)
SET @rep_ha = 'cmn37tulm01l9zo6g1ic623o4';  -- Hammad Bhatti (REP)
SET @rep_nu = 'cmn1wvtm101kzzo6g4zwn5mrm';  -- Alex Nunez (REP)
SET @rep_mc = 'cmn1qxz6701kxzo6g4pclheiy';  -- Marcos Cruz (REP)
SET @rep_ar = 'cmn24r7fh01l0zo6gywsk04ll';  -- Anthony Rack (REP)

-- ═══════════════════════════════════════════
-- 1. Create new clients for Closed deals
-- ═══════════════════════════════════════════
INSERT IGNORE INTO clients (id, businessName, contactName, phone, state, totalFunded, fundingCount, createdAt, updatedAt)
VALUES
  ('cl_winters_hw', 'Winters Hardware', 'Bob Winters', '+18135559001', 'TX', 0, 0, NOW(), NOW()),
  ('cl_loomis_weld', 'Loomis Welding', 'Gary Loomis', '+18135559002', 'FL', 0, 0, NOW(), NOW()),
  ('cl_park_nail', 'Park Nail Studio', 'Susan Park', '+18135559003', 'CA', 0, 0, NOW(), NOW()),
  ('cl_delta_plumb', 'Delta Plumbing Services', 'Mark Delta', '+18135559004', 'NY', 0, 0, NOW(), NOW()),
  ('cl_metro_clean', 'Metro Cleaning Co.', 'Jenny Wu', '+18135559005', 'NJ', 150000, 1, DATE_SUB(NOW(), INTERVAL 6 MONTH), NOW());

-- ═══════════════════════════════════════════
-- 2. Add CLOSED deals (3 like prototype + 1 extra)
-- ═══════════════════════════════════════════
INSERT IGNORE INTO deals (id, clientId, assignedRepId, stage, stageLabel, productType, dealAmount, nextAction, nextActionDue, lastActivityAt, daysInStage, staleDays, appSubmitted, lenderEngaged, disqualReason, lostReason, notes, isHot, createdAt, updatedAt)
VALUES
  ('deal_closed_1', 'cl_winters_hw', @rep_nu, 'CLOSED', 'Closed', 'MCA', NULL,
   'No follow-ups allowed', NULL,
   DATE_SUB(NOW(), INTERVAL 30 DAY), 30, 0, 1, 0,
   'Not eligible — revenue below minimum',
   NULL,
   'Revenue too low — under $10k/mo. Declined by all lenders. Not a fit for any product.',
   0, DATE_SUB(NOW(), INTERVAL 45 DAY), NOW()),

  ('deal_closed_2', 'cl_loomis_weld', @rep_jb, 'CLOSED', 'Closed', 'MCA', NULL,
   'No follow-ups allowed', NULL,
   DATE_SUB(NOW(), INTERVAL 40 DAY), 40, 0, 1, 0,
   'Declined — negative banking history',
   NULL,
   '3 NSF in 60 days. Declined by all lenders on banking history. Do not re-approach.',
   0, DATE_SUB(NOW(), INTERVAL 60 DAY), NOW()),

  ('deal_closed_3', 'cl_park_nail', @rep_ha, 'CLOSED', 'Closed', 'MCA', NULL,
   'No follow-ups allowed', NULL,
   DATE_SUB(NOW(), INTERVAL 14 DAY), 14, 0, 0, 0,
   'Do not contact — was not a serious buyer',
   NULL,
   'Was shopping brokers. Said she already had funding. Wasted 2 follow-ups. Mark DNC.',
   0, DATE_SUB(NOW(), INTERVAL 20 DAY), NOW()),

  ('deal_closed_4', 'cl_delta_plumb', @rep_mc, 'CLOSED', 'Closed', 'SBA', NULL,
   'No follow-ups allowed', NULL,
   DATE_SUB(NOW(), INTERVAL 60 DAY), 60, 0, 1, 1,
   'NQ — insufficient time in business',
   NULL,
   'Only 8 months in business. SBA requires minimum 2 years. Not eligible for any other product.',
   0, DATE_SUB(NOW(), INTERVAL 90 DAY), NOW());

-- ═══════════════════════════════════════════
-- 3. Add COMMITTED_FUNDING deals (with sub-statuses)
-- ═══════════════════════════════════════════
INSERT IGNORE INTO deals (id, clientId, assignedRepId, stage, stageLabel, productType, dealAmount, nextAction, nextActionDue, lastActivityAt, daysInStage, staleDays, appSubmitted, lenderEngaged, commitSubStatus, daysInSubStatus, notes, isHot, createdAt, updatedAt)
VALUES
  ('deal_commit_1', 'cl_metro_clean', @rep_jb, 'COMMITTED_FUNDING', 'Committed (Funding)', 'MCA', 75000,
   'Follow up — docs pending', DATE_ADD(NOW(), INTERVAL 1 DAY),
   NOW(), 3, 0, 1, 1, 'DOCS_REQUESTED', 2,
   'Client verbally committed. Waiting on last 3 months bank statements.',
   1, DATE_SUB(NOW(), INTERVAL 10 DAY), NOW());

-- Add offer for the committed deal
INSERT IGNORE INTO offers (id, dealId, lenderName, amount, terms, rateFactor, productType, createdAt, updatedAt)
VALUES
  ('offer_commit_1', 'deal_commit_1', 'Rapid Finance', 75000, '12mo, 1.28 factor', 1.28, 'MCA', NOW(), NOW());

-- ═══════════════════════════════════════════
-- 4. Enrich existing NURTURE deals with follow-up types and prev offers
-- ═══════════════════════════════════════════

-- K&R Logistics → LOST (re-engage type)
UPDATE deals SET followUpType='reengage', followUpDate=DATE_ADD(NOW(), INTERVAL 30 DAY),
  followUpNote='Went with competitor. Check back in 30 days.',
  prevOffer=85000, lostReason='Went with competitor',
  productType='MCA'
WHERE id='cmnao275t0003zo92tolw1z26' AND stage='NURTURE';

-- Olson Retail Group → Renewal type
UPDATE deals SET followUpType='renewal', followUpDate=DATE_ADD(NOW(), INTERVAL 14 DAY),
  followUpNote='Renewal opportunity - previous deal expiring.',
  prevOffer=200000, productType='SBA',
  daysInStage=45
WHERE id='cmnao27dg003nzo92pp8a327h' AND stage='NURTURE';

-- Dupree Catering & Events → Timing  
UPDATE deals SET followUpType='timing', followUpDate=DATE_ADD(NOW(), INTERVAL 60 DAY),
  followUpNote='Seasonal — not ready in winter. Call now — event season.',
  prevOffer=95000, productType='MCA',
  daysInStage=38
WHERE id='cmnao27ds003szo92fliuygfz' AND stage='NURTURE';

-- Cascade Services → competitor (LOST badge)
UPDATE deals SET followUpType='competitor', followUpDate=DATE_ADD(NOW(), INTERVAL 90 DAY),
  followUpNote='Went with competitor. Re-engage after 90 days.',
  prevOffer=120000, productType='MCA',
  daysInStage=92
WHERE id='cmnao27e5003xzo92w5ekw238' AND stage='NURTURE';

-- Navarro Auto Body → re-engage
UPDATE deals SET followUpType='reengage', followUpDate=DATE_ADD(NOW(), INTERVAL 7 DAY),
  followUpNote='Follow up - was not responsive last month.',
  productType='MCA',
  daysInStage=15
WHERE id='cmnao27eu0047zo92mca4fsjq' AND stage='NURTURE';

-- Bloom Wellness → renewal (RENEW badge)
UPDATE deals SET followUpType='renewal', followUpDate=DATE_ADD(NOW(), INTERVAL 5 DAY),
  followUpNote='Renewal opportunity approaching.',
  prevOffer=50000, productType='SBA',
  nextAction='Schedule call — she replied',
  nextActionDue=NOW(),
  isHot=1, lastReplyAt=DATE_SUB(NOW(), INTERVAL 2 HOUR),
  daysInStage=25
WHERE id='cmnao277m000xzo92brtqae0d' AND stage='NURTURE';

-- Pryce Beauty Bar → waiting-docs
UPDATE deals SET followUpType='waiting-docs', followUpDate=DATE_ADD(NOW(), INTERVAL 10 DAY),
  followUpNote='Waiting on updated financials before resubmitting.',
  productType='MCA',
  daysInStage=20
WHERE id='cmnao27eh0042zo92kad652qh' AND stage='NURTURE';

-- ═══════════════════════════════════════════
-- 5. Update deals missing productType
-- ═══════════════════════════════════════════
UPDATE deals SET productType='HELOC' WHERE id='cmnb3k44x000pzok99wv5lois' AND productType IS NULL;
UPDATE deals SET productType='MCA' WHERE id='cmnao277x0012zo92klu5lwa4' AND productType IS NULL;
UPDATE deals SET productType='EQUIPMENT' WHERE id='cmnao27860017zo92420nvlf1' AND productType IS NULL;
UPDATE deals SET productType='MCA' WHERE id='cmnao278u001mzo928b5q3ytg' AND productType IS NULL;
UPDATE deals SET productType='SBA' WHERE id='cmnao2792001rzo926jaj414g' AND productType IS NULL;
UPDATE deals SET productType='MCA' WHERE id='cmnao277c000szo92p6yg4dvy' AND productType IS NULL;

-- ═══════════════════════════════════════════
-- 6. Add funding events for funded deals that might be missing them
-- ═══════════════════════════════════════════
INSERT IGNORE INTO funding_events (id, dealId, amountFunded, lender, fundedDate, termMonths, rate, productType, createdAt)
VALUES
  ('fe_horizon', 'cmnao279v002azo92l7ax15ec', 500000, 'Rapid Finance', DATE_SUB(NOW(), INTERVAL 30 DAY), 10, 1.27, 'MCA', NOW()),
  ('fe_gulf', 'cmnao27ay002ozo92pd4lm3e0', 350000, 'OnDeck', DATE_SUB(NOW(), INTERVAL 15 DAY), 12, 1.35, 'MCA', NOW()),
  ('fe_reeves', 'cmnao27bg002vzo927esu29rj', 180000, 'Balboa Capital', DATE_SUB(NOW(), INTERVAL 45 DAY), 24, 8.5, 'EQUIPMENT', NOW()),
  ('fe_carter', 'cmnao27cd0039zo92w4u9u237', 250000, 'BlueVine', DATE_SUB(NOW(), INTERVAL 60 DAY), 18, 12.0, 'LOC', NOW()),
  ('fe_titan', 'cmnao27ah002hzo92mszpaqkv', 350000, 'First National Bank', DATE_SUB(NOW(), INTERVAL 20 DAY), 120, 7.5, 'SBA', NOW()),
  ('fe_yellow', 'cmnao27cx003gzo92gt56ffnj', 350000, 'OnDeck', DATE_SUB(NOW(), INTERVAL 10 DAY), 8, 1.32, 'MCA', NOW()),
  ('fe_pacific', 'cmnao27bx0032zo929r79sdah', 300000, 'Wells Fargo', DATE_SUB(NOW(), INTERVAL 90 DAY), 84, 6.5, 'SBA', NOW());

-- Update funded dates and cycle times on funded deals
UPDATE deals SET fundedDate=DATE_SUB(NOW(), INTERVAL 30 DAY), cycleTime=8, dealAmount=500000 WHERE id='cmnao279v002azo92l7ax15ec';
UPDATE deals SET fundedDate=DATE_SUB(NOW(), INTERVAL 15 DAY), cycleTime=12, dealAmount=350000 WHERE id='cmnao27ay002ozo92pd4lm3e0';
UPDATE deals SET fundedDate=DATE_SUB(NOW(), INTERVAL 45 DAY), cycleTime=15, dealAmount=180000 WHERE id='cmnao27bg002vzo927esu29rj';
UPDATE deals SET fundedDate=DATE_SUB(NOW(), INTERVAL 60 DAY), cycleTime=6, dealAmount=250000 WHERE id='cmnao27cd0039zo92w4u9u237';
UPDATE deals SET fundedDate=DATE_SUB(NOW(), INTERVAL 20 DAY), cycleTime=10, dealAmount=350000 WHERE id='cmnao27ah002hzo92mszpaqkv';
UPDATE deals SET fundedDate=DATE_SUB(NOW(), INTERVAL 10 DAY), cycleTime=4, dealAmount=350000 WHERE id='cmnao27cx003gzo92gt56ffnj';
UPDATE deals SET fundedDate=DATE_SUB(NOW(), INTERVAL 90 DAY), cycleTime=20, dealAmount=300000 WHERE id='cmnao27bx0032zo929r79sdah';

-- ═══════════════════════════════════════════
-- 7. Add renewal tasks for some funded deals
-- ═══════════════════════════════════════════
INSERT IGNORE INTO renewal_tasks (id, dealId, dueDate, status, taskType, notes, createdAt, updatedAt)
VALUES
  ('rt_horizon_1', 'cmnao279v002azo92l7ax15ec', DATE_ADD(NOW(), INTERVAL 5 DAY), 'PENDING', 'RENEWAL_CHECK', 'Renewal check-in — 1st override', NOW(), NOW()),
  ('rt_yellow_1', 'cmnao27cx003gzo92gt56ffnj', DATE_ADD(NOW(), INTERVAL 45 DAY), 'PENDING', 'RENEWAL', 'Next renewal: Apr 28, 2026', NOW(), NOW());

-- ═══════════════════════════════════════════
-- 8. Update returning client status
-- ═══════════════════════════════════════════
UPDATE clients SET fundingCount=2, totalFunded=850000, lastFundedDate=DATE_SUB(NOW(), INTERVAL 30 DAY)
WHERE id='cmnao279s0028zo92d7jl8qfw'; -- Horizon Auto Group

UPDATE clients SET fundingCount=1, totalFunded=350000, lastFundedDate=DATE_SUB(NOW(), INTERVAL 15 DAY)
WHERE id='cmnao27av002mzo92qunxrstj'; -- Gulf Coast Logistics

-- ═══════════════════════════════════════════
-- 9. Add offers for Approved/Offers stage deals
-- ═══════════════════════════════════════════
INSERT IGNORE INTO offers (id, dealId, lenderName, amount, terms, rateFactor, productType, createdAt, updatedAt)
VALUES
  ('offer_williams_1', 'cmnao279j0023zo92cgi2a190', 'Fora Financial', 175000, '10mo, 1.27 factor', 1.27, 'MCA', NOW(), NOW()),
  ('offer_autolift_1', 'cmnao2799001wzo92osdru3s7', 'First National Bank', 300000, '24mo, 6.9%', 6.9, 'SBA', NOW(), NOW());

-- Set deal amounts for approved deals
UPDATE deals SET dealAmount=175000, lenderEngaged=1, appSubmitted=1 WHERE id='cmnao279j0023zo92cgi2a190';
UPDATE deals SET dealAmount=300000, lenderEngaged=1, appSubmitted=1 WHERE id='cmnao2799001wzo92osdru3s7';

-- ═══════════════════════════════════════════
-- 10. Make some deals HOT for visual variety
-- ═══════════════════════════════════════════
UPDATE deals SET isHot=1, lastReplyAt=DATE_SUB(NOW(), INTERVAL 4 HOUR)
WHERE id='cmnao278f001czo92b3l06j4k'; -- Arguello Group

UPDATE deals SET isHot=1, lastReplyAt=DATE_SUB(NOW(), INTERVAL 1 HOUR),
  nextAction='Client replied just now', nextActionDue=NOW()
WHERE id='cmnao27660008zo92a9v9h2d1'; -- Peak Auto Group

-- Set some varied next actions and due dates
UPDATE deals SET nextAction='Make first contact within 24h', nextActionDue=DATE_ADD(NOW(), INTERVAL 1 DAY)
WHERE id='cmnao27660008zo92a9v9h2d1' AND nextAction IS NULL;

UPDATE deals SET nextAction='Final follow up — move to nurture', nextActionDue=DATE_SUB(NOW(), INTERVAL 3 DAY), staleDays=3
WHERE id='cmnao277c000szo92p6yg4dvy'; -- Norton Trucking

UPDATE deals SET nextAction='Send app link', nextActionDue=NOW()
WHERE id='cmnao27860017zo92420nvlf1'; -- Morrison Dental Group

UPDATE deals SET nextAction='Call client — get app done', nextActionDue=DATE_SUB(NOW(), INTERVAL 2 DAY), staleDays=2
WHERE id='cmnao278f001czo92b3l06j4k'; -- Arguello Group

UPDATE deals SET nextAction='Follow up lender — app in review', nextActionDue=DATE_ADD(NOW(), INTERVAL 1 DAY)
WHERE id='cmnao278n001hzo922eqjq3qv'; -- Manco Equipment

UPDATE deals SET nextAction='Offer in — present to client', nextActionDue=NOW()
WHERE id='cmnao279j0023zo92cgi2a190'; -- Williams HVAC

UPDATE deals SET nextAction='Call to close — SBA offer', nextActionDue=NOW()
WHERE id='cmnao2799001wzo92osdru3s7'; -- AutoLift Co.

-- Approved stage: make some HOT
UPDATE deals SET isHot=1 WHERE id='cmnao2799001wzo92osdru3s7';

-- Update submitted deals with review status
UPDATE deals SET appSubmitted=1, lenderEngaged=1, daysInStage=3 WHERE id='cmnao278f001czo92b3l06j4k';
UPDATE deals SET appSubmitted=1, lenderEngaged=1, daysInStage=5 WHERE id='cmnao278n001hzo922eqjq3qv';

-- Give some deals staleness/age variation
UPDATE deals SET staleDays=0, daysInStage=1 WHERE id='cmnb3k44x000pzok99wv5lois'; -- New Lead Fresh
UPDATE deals SET staleDays=2, daysInStage=5 WHERE id='cmnao276f000dzo92rf3sb6lr'; -- Grant Day Spa

-- Funded deals: set proper next actions and rep info
UPDATE deals SET nextAction='Call client — renewal overdue', nextActionDue=DATE_SUB(NOW(), INTERVAL 1 DAY), staleDays=1
WHERE id='cmnao279v002azo92l7ax15ec'; -- Horizon Auto Group

UPDATE deals SET nextAction='Send thank you — referral request', nextActionDue=DATE_ADD(NOW(), INTERVAL 2 DAY), staleDays=0
WHERE id='cmnao27ay002ozo92pd4lm3e0'; -- Gulf Coast Logistics

UPDATE deals SET nextAction='Request referral — 2 contacts', nextActionDue=DATE_ADD(NOW(), INTERVAL 3 DAY)
WHERE id='cmnao27ah002hzo92mszpaqkv'; -- Titan Ventures

SELECT '✅ Test data added successfully!' as result;
SELECT stage, COUNT(*) as cnt FROM deals GROUP BY stage ORDER BY FIELD(stage, 'NEW_LEAD','ENGAGED_INTERESTED','QUALIFIED','SUBMITTED_IN_REVIEW','APPROVED_OFFERS','COMMITTED_FUNDING','FUNDED','NURTURE','CLOSED');
