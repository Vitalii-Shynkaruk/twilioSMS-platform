# SCL Capital — Technical Q&A for Client Meeting

**Detailed answers to expected technical questions · March 2026**

---

## PHONE NUMBERS & WARM-UP

---

### Q: My goal is to add 35 numbers but not all at once. I'm assuming I have to warm this number up first before adding more numbers? Is that correct?

**A:** Correct. You should NOT add all 35 numbers at once. Here's the recommended approach:

1. **Start with 1-3 numbers** — add them to the platform with **Ramp-Up enabled**
2. The system will automatically warm each number over **7 days**:
   - Day 1: 50 messages/day
   - Day 2: 100 messages/day
   - Day 3: 150 messages/day
   - Day 4: 200 messages/day
   - Day 5: 250 messages/day
   - Day 6: 300 messages/day
   - Day 7: 350 messages/day (full capacity)
3. Once those 1-3 numbers reach **60%+ delivery rate** after the 7-day ramp, add the next batch of 3-5 numbers
4. Repeat in batches of 3-5 until all 35 are active

**Why:** US carriers (AT&T, T-Mobile, Verizon) flag phone numbers that suddenly start sending high volume with no history. Warming builds a "sender reputation" — the carrier sees gradual, consistent traffic and rates the number as trustworthy. If you add 35 numbers and blast from all of them immediately, carriers will filter/block most of the messages.

**Recommended timeline for 35 numbers:**

- Week 1: Add 3 numbers (ramp-up)
- Week 2: Add 5 more (total 8)
- Week 3: Add 5 more (total 13)
- Week 4-5: Add 5-7 per week
- Week 6-7: Final batch → all 35 active

---

### Q: Since the number is "cooling" and delivery is 38%, it's best to wait a couple days before warming correct?

**A:** Yes, you should wait — but here's exactly what's happening and what to do:

**What "Cooling" means:** The system detected **5 consecutive failed/blocked messages** on that number, so it automatically paused it for **24 hours** to protect your sender reputation. The number cannot send anything while cooling.

**38% delivery rate** means only 38 out of 100 messages are reaching the recipient. This is very low — healthy numbers should be **above 80%**.

**What to do:**

1. **Wait for cooling to expire** (24 hours automatic). Do NOT manually force-activate.
2. After it reactivates, the system will automatically **throttle it to 50% of its daily limit** because delivery is below 80%. So if its limit is 350/day, it will only allow 175 messages.
3. Send **small, targeted campaigns** (not blast) to build the rate back up.
4. If delivery stays below 40% after 2-3 days of light use, the number may be permanently flagged by carriers. Consider retiring it and replacing with a new number.

**Prevention:** Don't send to bad/old phone lists. Invalid numbers create failed deliveries, carrier complaints, and tanked delivery rates. Always validate your lead list quality.

---

### Q: Before adding numbers, the main number needs to have delivery above 60% to be safe, correct? Adding more numbers now with current deliverability is no good.

**A:** Exactly right. Here's the logic:

- If your existing number has **low deliverability** (<60%), it means either:
  - Your lead data has too many invalid/disconnected numbers
  - Carriers have flagged your content (too aggressive, too salesy)
  - The number was overused without proper warm-up

- Adding more numbers with the **same campaign content** and **same lead list** will result in those new numbers getting flagged too. Carriers look at the content and source pattern, not just the number.

**Fix the root cause first:**

1. Clean your lead list — remove numbers that bounced or failed
2. Check your message content — avoid trigger words (FREE, GUARANTEED, ACT NOW)
3. Get the existing number above **80%** delivery before scaling
4. Then add new numbers gradually

---

### Q: How does the number health/delivery rate work? What do the percentages mean?

**A:** The delivery rate is calculated as:

**Delivery Rate = (Delivered / Total Sent) × 100%**

| Rate      | Health    | Color  | Action                                      |
| --------- | --------- | ------ | ------------------------------------------- |
| 80-100%   | Healthy   | Green  | Normal sending                              |
| 50-79%    | Degraded  | Yellow | System auto-throttles to 50% capacity       |
| Below 50% | Critical  | Red    | High risk of cooling; consider pausing      |
| Below 30% | Dangerous | Red    | Likely carrier-flagged; may need retirement |

**Important details:**

- Delivery rate only starts calculating after **50 messages** are sent from that number (before that, it shows 100% by default)
- The rate updates in **real-time** as Twilio reports delivery confirmations
- On the Numbers page, you see delivery % per number and average health across all numbers

---

### Q: What are all the number statuses and what do they mean?

**A:**

| Status        | Icon   | Meaning                                     | Can Send?        |
| ------------- | ------ | ------------------------------------------- | ---------------- |
| **Active**    | Green  | Normal operation, available for campaigns   | ✅ Yes           |
| **Warming**   | Blue   | In 7-day ramp-up, limited daily volume      | ✅ Yes (limited) |
| **Cooling**   | Orange | Paused due to errors — auto-recovers in 24h | ❌ No            |
| **Suspended** | Red    | Manually paused by admin                    | ❌ No            |
| **Retired**   | Gray   | Permanently deactivated                     | ❌ No            |

**Transitions:**

- `Active` → `Cooling`: Triggered by 5 consecutive errors
- `Cooling` → `Active`: Automatic after 24 hours, or manual activation by admin
- `Warming` → `Active`: Automatic after Day 7 of ramp-up
- Any → `Suspended`: Manual admin action
- Any → `Retired`: Manual admin action (permanent)

---

### Q: What triggers a number to go into "Cooling"?

**A:** The system tracks an **error streak** for each number. Every failed or blocked message increments the counter. Every successful delivery resets it to zero.

**When the error streak reaches 5 consecutive failures → number goes to Cooling.**

Common causes of consecutive failures:

- Sending to invalid/disconnected phone numbers
- Carrier temporarily blocking your number (spam filter)
- Twilio rate limit hit on that specific number
- Carrier network issues

**Recovery:** After 24 hours, the system automatically reactivates the number and resets the error streak to 0. Admin can also manually reactivate immediately from the Numbers page.

---

### Q: I want to confirm how ramping currently works (Day 1, Day 2, etc.) and what limits are applied.

**A:** The ramp-up system is a **7-day automatic schedule** that gradually increases how many messages a number can send per day:

| Day    | Daily Limit               | Cumulative (if sent max each day) |
| ------ | ------------------------- | --------------------------------- |
| Day 1  | 50 messages               | 50                                |
| Day 2  | 100 messages              | 150                               |
| Day 3  | 150 messages              | 300                               |
| Day 4  | 200 messages              | 500                               |
| Day 5  | 250 messages              | 750                               |
| Day 6  | 300 messages              | 1,050                             |
| Day 7  | 350 messages              | 1,400                             |
| Day 8+ | 350 messages (full limit) | —                                 |

**How it works technically:**

- When you add a number with **Ramp-Up enabled**, it starts at Day 1
- At **midnight (UTC) every day**, the system automatically increments the ramp day for all ramping numbers
- On Day 8, the number **graduates** — ramp-up is disabled and the number switches to its full daily limit (default 350, configurable up to 5,000)
- During ramp-up, the number status shows as **"Warming"** on the Numbers page
- The "Ramp" column in the numbers table shows the current day (e.g., "Day 3 of 7")

**The limits are hard-enforced:** Even if you set a campaign to send 600/min, a Day 1 number will only send 50 messages total that day. Once 50 is reached, the system skips that number and moves to the next available one.

**You can customize the schedule** via environment variables (`RAMP_DAY_1_LIMIT` through `RAMP_DAY_7_LIMIT`), but the defaults above are industry best practice for US 10DLC numbers.

---

### Q: Do we currently have an automated warm-up system running? Is this something I need to manage manually?

**A:** The warm-up system is **fully automated** — but it needs to be **enabled first**. Here's the current state:

**To check:** Go to **Settings → System** tab. Look for the **"Ramp-Up Enabled"** toggle.

- If **ON** → warm-up is active for all numbers marked as ramping
- If **OFF** → all numbers use their flat daily limit immediately (no gradual increase)

**What's automated (no manual work needed):**

1. **Daily limit increase** — system automatically moves from Day 1 → Day 2 → ... → Day 7 at midnight
2. **Graduation** — after Day 7, the number automatically becomes fully active (350/day)
3. **Limit enforcement** — system won't let a ramping number exceed its daily cap
4. **Number rotation** — during campaigns, the system automatically picks the best available number considering warm-up limits

**What YOU need to do manually:**

1. **Enable ramp-up** in Settings → System (one-time toggle)
2. **When adding a new number** — check the "Enable Ramp-Up" checkbox in the Add Number form. This starts it at Day 1.
3. **Monitor delivery rates** — check the Numbers page daily to make sure warming numbers maintain healthy delivery (>80%)
4. **Decide when to add more numbers** — the system won't auto-purchase or auto-add numbers. You decide the batching schedule.

**In short:** You turn it on, add numbers with ramp-up enabled, and the system handles the rest. Your job is monitoring and deciding when to add the next batch.

---

## CAMPAIGNS & SENDING

---

### Q: So if I sent a campaign it will send 30 messages per minute instead of 4 messages per minute? I am confused.

**A:** The sending speed is **per campaign**, and you set it when creating or editing a campaign.

**How it works:**

- Default speed: **60 messages per minute**
- You can set any speed from **1 to 600 messages per minute**
- The system sends messages with a calculated delay between each:
  - 60/min = ~1 second between messages
  - 30/min = ~2 seconds between messages
  - 4/min = ~15 seconds between messages

**Why you might see "4 per minute":** If you have only 1 number in warm-up Day 1, and the daily limit is 50 messages, the system spreads those 50 messages across the day. Even though the campaign speed is set to 30/min, the number can only send 50 total per day — so the effective rate is much lower.

**Key point:** Campaign speed is the max **throughput**. Actual speed is limited by:

1. Campaign speed setting (what you chose)
2. Number daily limits (each number has a cap)
3. Available numbers (how many are active)
4. Global hard cap: 300 messages/minute (system limit)

**Example with 5 active numbers at full capacity (350/day each):**

- Total daily capacity = 5 × 350 = 1,750 messages/day
- At 60/min speed → all 1,750 messages sent in ~29 minutes
- At 30/min speed → ~58 minutes
- At 4/min speed → ~7 hours

---

### Q: What is the circuit breaker? Why did my campaign auto-pause?

**A:** The circuit breaker is a safety mechanism that **automatically pauses a campaign** if too many messages are failing.

**How it works:**

- The system checks the **last 50 messages** of the campaign
- If **30% or more** are FAILED or BLOCKED → campaign is auto-paused
- Status changes from SENDING → PAUSED
- You'll see it on the campaign detail page

**Why this exists:** If messages are failing at a high rate, continuing to send wastes money and damages your number reputation. The system pauses to protect you.

**What to do when paused:**

1. Check the campaign stats — look at Failed and Blocked counts
2. Check which error codes appear (visible in campaign detail)
3. Fix the issue (bad numbers, content, number health)
4. Resume the campaign manually

**Common triggers:**

- Sending to a list with many invalid numbers
- All your numbers went into cooling
- Carrier blocked your content
- Twilio rate limit hit

---

### Q: What do the campaign statuses mean?

**A:**

| Status        | Meaning                                             | Available Actions   |
| ------------- | --------------------------------------------------- | ------------------- |
| **Draft**     | Created but not started. Can still edit everything. | Start, Edit, Delete |
| **Scheduled** | Set to start at a future date/time                  | Cancel, Edit        |
| **Sending**   | Actively processing and sending messages            | Pause, Cancel       |
| **Paused**    | Temporarily stopped (manual or circuit breaker)     | Resume, Cancel      |
| **Completed** | All messages have been processed                    | Delete              |
| **Cancelled** | Stopped before all messages sent                    | Delete              |

---

### Q: What happens to messages during quiet hours?

**A:** The system enforces **quiet hours** — a time window when NO messages are sent.

**Default settings:**

- Quiet hours: **8:00 PM to 9:00 AM** (Eastern Time)
- Configurable in Settings → System

**What happens:**

- If a campaign is sending and quiet hours begin → remaining messages queue up
- Messages wait in the queue until quiet hours end (9:00 AM next day)
- Campaign status stays as SENDING — it doesn't pause, just waits
- Automations also respect quiet hours — follow-up sequences delay until the window opens

**Why:** TCPA compliance requires not sending commercial text messages outside business hours. Violating this can result in fines.

---

### Q: How does number rotation work during campaigns?

**A:** When a campaign sends, the system uses **round-robin rotation** across all your active numbers:

1. Message 1 → Number A
2. Message 2 → Number B
3. Message 3 → Number C
4. Message 4 → Number A (cycles back)
5. ...and so on

**Smart selection priority:**

- Numbers with **fewer messages sent today** are preferred (balances load)
- Numbers with **higher delivery rates** are preferred (better chances)
- Numbers with **error streaks** are deprioritized
- Numbers at daily limit are **skipped**
- Cooling/Suspended/Retired numbers are **excluded**

**This means:** Your campaign automatically distributes load across all available numbers, favoring the healthiest ones. You don't need to manually assign numbers to campaigns.

---

## LEADS & LIST MANAGEMENT

---

### Q: How do I import leads? What format?

**A:** Go to **Leads page** → click **Import CSV**.

**Required columns:**

- `phone` — Phone number (any format: 5551234567, +15551234567, (555) 123-4567)
- `firstName` — First name

**Optional columns:**

- `lastName` — Last name
- `email` — Email address
- `company` — Company name
- `state` — State code (e.g., CA, TX)

**The system automatically:**

- Normalizes all phone numbers to E.164 format (+1XXXXXXXXXX)
- Removes duplicates (by phone number) within the file
- Skips numbers that already exist in your database
- Skips numbers on the suppression/DNC list
- Reports: imported count, duplicates skipped, errors

**Batch size:** Processes 500 leads per batch. You can import thousands in one CSV.

---

### Q: What happens when someone texts STOP?

**A:** The system handles STOP keywords automatically and immediately:

1. **Lead marked as opted out** → `optedOut = true`, status → DNC
2. **Added to suppression list** → permanently blocked from all future campaigns
3. **All active automations paused** for that lead
4. **Confirmation reply sent** automatically: the configured opt-out message
5. **Future campaigns skip** this lead entirely

**All opt-out keywords recognized:** STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT

**To re-subscribe:** The person must text **START**, **UNSTOP**, or **SUBSCRIBE**. This removes them from suppression and re-enables sending.

**Important:** This is legally required by TCPA and CTIA guidelines. The opt-out process is instant and cannot be overridden.

---

### Q: What do the lead statuses mean?

**A:**

| Status             | Meaning                                       |
| ------------------ | --------------------------------------------- |
| **New**            | Just imported, never contacted                |
| **Contacted**      | At least one message sent                     |
| **Replied**        | Lead has texted back                          |
| **Interested**     | Manually marked as interested by rep          |
| **Docs Requested** | Documents sent/requested                      |
| **Submitted**      | Documents submitted by lead                   |
| **Funded**         | Deal closed — final status                    |
| **Not Interested** | Declined — can be re-engaged later            |
| **DNC**            | Do Not Contact — opted out (STOP) — permanent |

**Automatic transitions:**

- New → Contacted: When first message is sent
- Any → Replied: When lead texts back
- Any → DNC: When lead texts STOP

**Manual transitions:** Reps can manually change status (e.g., Replied → Interested → Docs Requested → Funded)

---

## ERRORS & TROUBLESHOOTING

---

### Q: I'm seeing a high error rate. What does that mean?

**A:** Error rate = (Failed + Blocked messages) / Total Sent × 100%

**Understanding the numbers:**

| Error Rate | Severity      | What It Means                                          |
| ---------- | ------------- | ------------------------------------------------------ |
| 0-5%       | Normal        | Expected rate. Some numbers are always invalid.        |
| 5-15%      | Attention     | Your list may have quality issues. Clean it.           |
| 15-30%     | Warning       | Campaign will auto-pause at 30%. Check list + numbers. |
| 30%+       | Critical      | Circuit breaker triggers. Campaign pauses.             |
| 900%       | Data artifact | Edge case — e.g., 9 failures from 1 sent (test data)   |

**The 900% error you saw:** This was caused by **3 test phone numbers** that were invalid (+11456654456, +14563211234, +1111111). These generated 9 failure events against only 1 successful send. Those test records should be deleted.

---

### Q: What error codes will I see and what do they mean?

**A:**

| Error Code | Meaning                              | What to Do                                                              |
| ---------- | ------------------------------------ | ----------------------------------------------------------------------- |
| **21211**  | Not a valid phone number             | Remove from lead list — number doesn't exist                            |
| **30007**  | Carrier filtering / message rejected | Carrier is filtering your messages — check content, check number health |
| **30034**  | Carrier rate limit exceeded          | Too many messages too fast — reduce speed, add more numbers             |
| **21610**  | Recipient opted out via carrier      | Lead opted out at carrier level — automatically added to DNC            |
| **21408**  | Permission to send not granted       | A2P registration issue — check Twilio 10DLC registration                |

**Most common:** 21211 (invalid phone) and 30007 (carrier filtering). These are the two you'll see most.

---

### Q: Why are messages showing as "Blocked"?

**A:** "Blocked" means the **carrier** (AT&T, T-Mobile, Verizon) rejected the message. This is different from "Failed" (which is a Twilio-level error).

**Common reasons for carrier blocking:**

1. **Content filtering** — message contains spam-like language (FREE, GUARANTEED, CLICK HERE, shortened URLs)
2. **Sender reputation** — the number has been flagged by carriers due to complaints
3. **Volume spike** — sudden increase in sending volume (number not warmed up)
4. **Recipient complaints** — too many people filing spam complaints
5. **A2P violations** — not properly registered for 10DLC

**How to reduce blocks:**

- Warm up numbers properly (7-day ramp)
- Clean your lead list regularly
- Avoid spam trigger words
- Keep delivery rates above 80%
- Don't exceed daily limits
- Personalize messages (use {firstName}, {company})

---

## AUTOMATION

---

### Q: How do automations work?

**A:** Automations are rules that send messages automatically based on triggers:

**Available triggers:**

- **Lead Created** — Send welcome/intro message when new lead is imported
- **Status Changed** — Send message when lead moves to a specific status
- **No Reply** — Send follow-up if lead hasn't replied in X hours
- **Keyword Received** — React to specific words in replies
- **Manual** — Admin-triggered bulk automation

**Example: Follow-up Sequence**

1. Day 0: Lead created → send intro message
2. Day 1: If no reply → send follow-up #1
3. Day 3: If still no reply → send follow-up #2
4. Day 7: If still no reply → send final follow-up

**Smart behavior:**

- If lead **replies at any point** → entire sequence pauses automatically
- If lead texts **STOP** → sequence paused and lead marked DNC
- Messages respect **quiet hours** (no texts at night)
- Messages respect **business hours** (configurable: default 9 AM – 8 PM)
- Messages respect **number daily limits** (won't exceed warm-up or capacity)

---

### Q: Can automations run on weekends?

**A:** By default, **no**. Each automation rule has a `sendOnWeekends` toggle — default is OFF.

In the automation editor, you can enable it if your business operates weekends. The time window (sendAfterHour – sendBeforeHour, default 9 AM – 8 PM) still applies.

---

## SETTINGS & CONFIGURATION

---

### Q: What settings can I change?

**A:** In Settings → System tab:

| Setting                     | What It Does                            | Default          |
| --------------------------- | --------------------------------------- | ---------------- |
| **SMS Mode**                | Live (real), Twilio Test, Simulation    | Live             |
| **Ramp-Up Enabled**         | Turn warm-up system on/off              | Off              |
| **Max Messages/Number/Day** | Cap per phone number                    | 350              |
| **Global Daily Limit**      | Total messages across ALL numbers       | 20,000           |
| **Default Send Speed**      | Messages per minute for new campaigns   | 60               |
| **Quiet Hours Start**       | When to stop sending (24h format)       | 20 (8 PM)        |
| **Quiet Hours End**         | When to resume sending                  | 9 (9 AM)         |
| **Quiet Hours Timezone**    | Time zone reference                     | America/New_York |
| **Opt-Out Reply**           | Auto-reply text when someone texts STOP | Configurable     |
| **Help Reply**              | Auto-reply text when someone texts HELP | Configurable     |

In Settings → Integrations tab:

- **Twilio Credentials** (Account SID, Auth Token)
- **Twilio Test Credentials** (for test mode)
- **OpenAI Key** (for AI features)

---

### Q: What is "Simulation" mode vs "Live" mode?

**A:**

| Mode               | What Happens                                                              | Use For                          |
| ------------------ | ------------------------------------------------------------------------- | -------------------------------- |
| **🟢 Live**        | Real SMS sent via Twilio. Costs money. Messages delivered to real phones. | Production use                   |
| **🔵 Twilio Test** | Uses Twilio test credentials. API calls made but nothing delivered.       | Testing API integration          |
| **🟡 Simulation**  | No API calls at all. Messages marked as "sent" locally.                   | Testing platform features safely |

**Recommendation:** Use Simulation to test campaigns and automations. Switch to Live only when ready to send real messages.

---

## SCALING & BEST PRACTICES

---

### Q: How many messages can I send per day with current setup?

**A:** The formula:

**Daily Capacity = Number of Active Numbers × Daily Limit per Number**

| Numbers    | Daily Limit Each | Total Capacity |
| ---------- | ---------------- | -------------- |
| 1 number   | 350/day          | 350/day        |
| 5 numbers  | 350/day          | 1,750/day      |
| 10 numbers | 350/day          | 3,500/day      |
| 20 numbers | 350/day          | 7,000/day      |
| 35 numbers | 350/day          | 12,250/day     |

**During warm-up**, capacity is lower:

- 1 number on Day 1 of warm-up: only 50 messages
- 5 numbers on Day 3: 5 × 150 = 750 messages
- 10 numbers fully warmed: 10 × 350 = 3,500 messages

**Global hard cap:** 20,000 messages/day (configurable in Settings)

---

### Q: What's the proper process to scale from 1 number to 35?

**A:**

**Phase 1 — Foundation (Week 1-2)**

1. Start with 1-3 numbers, ramp-up enabled
2. Send small campaigns (50-100 leads) with clean data
3. Monitor delivery rate — must be above 80%
4. Build carrier reputation

**Phase 2 — Gradual Expansion (Week 3-5)**

1. Add 3-5 new numbers per week
2. Each new batch starts ramp-up (Day 1: 50/day)
3. Keep total daily volume growing gradually
4. Continue monitoring delivery rates

**Phase 3 — Full Scale (Week 6-7)**

1. Add remaining numbers
2. Most early numbers are now fully warmed (350/day)
3. New numbers still ramping up
4. Total capacity approaching 12,000+/day

**Think of it like building credit:** You can't get a $100,000 credit line on day 1. You start small, prove reliability, and scale up.

---

### Q: What should I check daily?

**A:** Daily monitoring checklist:

1. **Numbers page** — Check for any numbers in Cooling or Suspended status
2. **Dashboard** — Check delivery rate (should be above 80%)
3. **Active campaigns** — Check progress and error rates
4. **Inbox** — Read and respond to lead replies (fast response = better conversion)
5. **Opt-outs** — Review any new STOP messages (normal is 1-3% of sends)

**Red flags that need immediate attention:**

- Any number with delivery below 50%
- Error rate above 15% on a campaign
- Multiple numbers going into Cooling status
- Campaign auto-paused by circuit breaker
- Sudden spike in opt-outs

---

### Q: How do I know if my A2P 10DLC registration is working properly?

**A:** A2P 10DLC registration is managed in the **Twilio Console**, not in this platform. Here's what to verify:

1. **Brand Registration** — Must be approved (status: "Approved" in Twilio)
2. **Campaign Registration** — Must be approved for your use case
3. **Phone Numbers** — Must be assigned to a Messaging Service linked to the registered campaign
4. **In our platform** — Numbers with a Messaging Service SID are A2P-registered

If registration is rejected:

- Website must have clear business information (company name matching registration)
- Privacy policy and terms of service required
- SMS consent language on opt-in pages
- No URL shorteners or placeholder links

---

### Q: Can I see delivery status for each individual message?

**A:** Yes. There are several places:

1. **Campaign Detail page** → Shows aggregate stats (Sent, Delivered, Failed, Blocked, Replied)
2. **Inbox / Conversations** → Each message shows delivery status
3. **Numbers page** → Per-number delivery rate and daily stats

**Message-level statuses:**
| Status | Icon | Meaning |
|--------|------|---------|
| **Queued** | ⏳ | In queue, waiting to send |
| **Sent** | ✈️ | Sent to Twilio, pending carrier confirmation |
| **Delivered** | ✅ | Confirmed delivered to recipient's phone |
| **Failed** | ❌ | Twilio-level error (bad number, API issue) |
| **Blocked** | 🚫 | Carrier rejected (spam filter, rate limit) |
| **Undelivered** | ⚠️ | Carrier couldn't deliver (phone off, full inbox) |

---

### Q: Who has access to the platform? What are the roles?

**A:** Three roles:

| Role        | Access Level                                                                   |
| ----------- | ------------------------------------------------------------------------------ |
| **Admin**   | Full access to everything — settings, numbers, users, all leads, all campaigns |
| **Manager** | Can see team data — all leads assigned to their team, all campaigns            |
| **Rep**     | Can see only their assigned leads and conversations                            |

All actions are logged in the Activity Log (Settings → Activity Log).
