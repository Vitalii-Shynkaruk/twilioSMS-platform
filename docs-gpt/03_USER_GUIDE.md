# SCL SMS Platform — Complete User Guide

> **Version 1.0** · March 2026  
> Comprehensive documentation for the Secure Credit Lines SMS Management Platform

---

## Table of Contents

1. [Getting Started](#1-getting-started)
   - [System Overview](#11-system-overview)
   - [Logging In](#12-logging-in)
   - [Navigation & Interface](#13-navigation--interface)
   - [User Roles & Permissions](#14-user-roles--permissions)
   - [Quick Start Checklist](#15-quick-start-checklist)
2. [Dashboard](#2-dashboard)
   - [SMS Mode Indicator](#21-sms-mode-indicator)
   - [Key Metrics Cards](#22-key-metrics-cards)
   - [Sending Activity](#23-sending-activity)
   - [Charts & Pipeline Snapshot](#24-charts--pipeline-snapshot)
3. [Campaigns](#3-campaigns)
   - [Campaign List](#31-campaign-list)
   - [Creating a Campaign](#32-creating-a-campaign)
   - [Campaign Lifecycle](#33-campaign-lifecycle)
   - [Campaign Detail View](#34-campaign-detail-view)
   - [Template Variables](#35-template-variables)
   - [Sending Speed & Throttling](#36-sending-speed--throttling)
4. [Inbox](#4-inbox)
   - [Conversation List](#41-conversation-list)
   - [Message Thread](#42-message-thread)
   - [Replying to Messages](#43-replying-to-messages)
   - [AI Draft Reply](#44-ai-draft-reply)
   - [Conversation Actions](#45-conversation-actions)
   - [SMS Counter & Segments](#46-sms-counter--segments)
5. [Leads](#5-leads)
   - [Lead List & Filters](#51-lead-list--filters)
   - [Adding Leads](#52-adding-leads)
   - [CSV Import](#53-csv-import)
   - [Lead Statuses](#54-lead-statuses)
   - [Tags & Management](#55-tags--management)
   - [Bulk Actions](#56-bulk-actions)
   - [Lead Detail Drawer](#57-lead-detail-drawer)
6. [Pipeline](#6-pipeline)
   - [Kanban Board](#61-kanban-board)
   - [View Modes](#62-view-modes)
   - [Managing Stages](#63-managing-stages)
   - [Card Management](#64-card-management)
   - [Drag-and-Drop](#65-drag-and-drop)
   - [Filters & Search](#66-filters--search)
7. [Phone Numbers](#7-phone-numbers)
   - [Number Overview](#71-number-overview)
   - [A2P / 10DLC Compliance](#72-a2p--10dlc-compliance)
   - [Adding Numbers](#73-adding-numbers)
   - [Number Statuses](#74-number-statuses)
   - [Ramp-Up Schedule](#75-ramp-up-schedule)
   - [Cooling & Auto-Recovery](#76-cooling--auto-recovery)
   - [Daily Assignments](#77-daily-assignments)
   - [Number Pools](#78-number-pools)
   - [Twilio Sync](#79-twilio-sync)
8. [Automation](#8-automation)
   - [Automation Rules](#81-automation-rules)
   - [Trigger Types](#82-trigger-types)
   - [Template Sequences](#83-template-sequences)
   - [Schedule Constraints](#84-schedule-constraints)
   - [Managing Rules](#85-managing-rules)
9. [Analytics](#9-analytics)
   - [Overview KPIs](#91-overview-kpis)
   - [Lead Funnel](#92-lead-funnel)
   - [Messaging Analytics](#93-messaging-analytics)
   - [Campaign Performance](#94-campaign-performance)
   - [Number Performance](#95-number-performance)
   - [Rep Performance](#96-rep-performance)
   - [Automation Metrics](#97-automation-metrics)
   - [Export](#98-export)
10. [Settings](#10-settings)
    - [Tags](#101-tags)
    - [Users](#102-users)
    - [Suppression List](#103-suppression-list)
    - [Integrations](#104-integrations)
    - [System Configuration](#105-system-configuration)
    - [Activity Log](#106-activity-log)
11. [Twilio Account](#11-twilio-account)
    - [Account Diagnostics](#111-account-diagnostics)
    - [Phone Numbers (Twilio)](#112-phone-numbers-twilio)
    - [Messaging Services](#113-messaging-services)
    - [A2P Brands & Campaigns](#114-a2p-brands--campaigns)
    - [Compliance Bundles](#115-compliance-bundles)
12. [Technical Reference](#12-technical-reference)
    - [SMS Sending Modes](#121-sms-sending-modes)
    - [Sending Engine Architecture](#122-sending-engine-architecture)
    - [Number Rotation Algorithm](#123-number-rotation-algorithm)
    - [Compliance & Quiet Hours](#124-compliance--quiet-hours)
    - [Webhook Configuration](#125-webhook-configuration)
    - [Environment Variables](#126-environment-variables)
    - [Database Schema](#127-database-schema)
    - [API Reference](#128-api-reference)

---

## 1. Getting Started

### 1.1 System Overview

The SCL SMS Platform is a full-featured SMS marketing and conversation management system built on top of Twilio. It provides:

- **Bulk SMS Campaigns** — Send personalized messages to thousands of leads with smart number rotation
- **Two-Way Inbox** — Real-time conversation threads with leads, including AI-assisted drafting
- **Lead Management** — Import, tag, filter, and track leads through their lifecycle
- **Deal Pipeline** — Visual kanban board to manage sales opportunities
- **Phone Number Pool** — Automated number rotation, ramp-up, cooling, and A2P/10DLC compliance
- **Automation** — Multi-step follow-up sequences triggered by events or keywords
- **Analytics** — Comprehensive reporting on messaging, campaigns, reps, and numbers
- **Twilio Integration** — Full account diagnostics, number sync, and real-time webhook processing

**Technology Stack:**

- Frontend: React + TypeScript + Tailwind CSS
- Backend: Node.js + Express + Prisma ORM
- Database: MySQL
- Queue System: BullMQ + Redis
- SMS Provider: Twilio (with A2P/10DLC support)
- AI: OpenAI GPT (optional, for draft replies)

### 1.2 Logging In

1. Navigate to your platform URL (e.g., `https://yourdomain.com`)
2. Enter your **email address** and **password**
3. Click **Sign In**

If you don't have an account, contact your administrator. The platform supports three roles with different permissions (see Section 1.4).

**Security Notes:**

- Sessions expire after 7 days (configurable)
- Passwords are hashed with bcrypt
- All API calls require JWT authentication

### 1.3 Navigation & Interface

The platform uses a collapsible left sidebar for navigation:

| Page           | Icon    | Description                 | Access         |
| -------------- | ------- | --------------------------- | -------------- |
| **Dashboard**  | Grid    | Overview metrics and charts | All users      |
| **Campaigns**  | Send    | SMS campaign management     | All users      |
| **Inbox**      | Message | Two-way conversations       | All users      |
| **Pipeline**   | Kanban  | Visual deal pipeline        | All users      |
| **Leads**      | Users   | Lead database management    | All users      |
| **Numbers**    | Phone   | Phone number pool           | Admin, Manager |
| **Automation** | Bot     | Rule-based automations      | All users      |
| **Analytics**  | Chart   | Performance analytics       | All users      |
| **Twilio**     | Radio   | Twilio account diagnostics  | Admin only     |
| **Settings**   | Gear    | System configuration        | Admin only     |

**Interface Features:**

- **Collapse Sidebar** — Click the collapse button at the bottom of the sidebar to minimize it to icon-only view, giving more space to the main content
- **Dark / Light Mode** — Toggle the theme using the moon/sun icon in the sidebar footer. The setting persists across sessions
- **Command Palette** — Press `Cmd+K` (Mac) or `Ctrl+K` (Windows) to open a quick-search overlay to jump to any page
- **SMS Mode Badge** — The sidebar shows the current sending mode (Live, Test, or Simulation) with a colored indicator
- **Unread Badge** — The Inbox link shows a red badge with the count of unread conversations (updates every 30 seconds)

### 1.4 User Roles & Permissions

| Role        | Dashboard | Campaigns | Inbox | Leads | Pipeline | Numbers | Automation | Analytics | Twilio | Settings |
| ----------- | --------- | --------- | ----- | ----- | -------- | ------- | ---------- | --------- | ------ | -------- |
| **Admin**   | ✅        | ✅        | ✅    | ✅    | ✅       | ✅      | ✅         | ✅        | ✅     | ✅       |
| **Manager** | ✅        | ✅        | ✅    | ✅    | ✅       | ✅      | ✅         | ✅        | ❌     | ❌       |
| **Rep**     | ✅        | ✅        | ✅    | ✅    | ✅       | ❌      | ✅         | ✅        | ❌     | ❌       |

**Admin** — Full access. Can manage users, system settings, Twilio configuration, and phone numbers.  
**Manager** — Can manage phone numbers and daily assignments. Cannot access Twilio diagnostics or system settings.  
**Rep** — Can use campaigns, inbox, leads, pipeline, automation, and analytics. Cannot manage phone numbers or system configuration.

### 1.5 Quick Start Checklist

Follow these steps to get your platform operational:

1. ✅ **Log in** with admin credentials
2. ✅ **Configure Twilio** — Go to Settings → Integrations, enter your Twilio Account SID, Auth Token, and Messaging Service SID
3. ✅ **Set SMS Mode** — Go to Settings → System, select "Live" mode for production sending
4. ✅ **Sync Phone Numbers** — Go to Numbers, click "Sync Twilio" to import your Twilio phone numbers
5. ✅ **Verify A2P/10DLC** — Ensure your numbers show the green "A2P" badge (10DLC registration must be completed in Twilio Console first)
6. ✅ **Import Leads** — Go to Leads, click "Import CSV" to upload your lead database
7. ✅ **Create Tags** — Go to Settings → Tags, create labels to categorize your leads
8. ✅ **Set Up Pipeline** — Go to Pipeline, create stages that match your sales funnel
9. ✅ **Create Users** — Go to Settings → Users, add your sales reps and managers
10. ✅ **Assign Numbers** — Go to Numbers → Daily Assignments, assign phone numbers to reps
11. ✅ **Create First Campaign** — Go to Campaigns, click "New Campaign," select leads, write your template, and start sending
12. ✅ **Set Up Automation** — Go to Automation, create follow-up sequences for no-reply leads

---

## 2. Dashboard

The Dashboard is your command center, providing a real-time overview of platform activity.

### 2.1 SMS Mode Indicator

A prominent banner at the top shows the current SMS sending mode:

| Mode               | Color | Description                                                                            |
| ------------------ | ----- | -------------------------------------------------------------------------------------- |
| 🟢 **Live**        | Green | Production Twilio credentials. Real SMS messages are sent and charged                  |
| 🔵 **Twilio Test** | Cyan  | Test credentials. API calls are made but messages are not delivered. Charges may apply |
| 🟠 **Simulation**  | Amber | No API calls. Messages are simulated locally with fake SIDs. Free, for testing only    |

The banner also shows **System Health** indicators:

- **Database** — Green if connected, red if unavailable
- **Redis** — Green if connected, red if unavailable
- **Twilio** — Green if live and connected, cyan if test mode, amber if simulation, red if error

Click the link to go to Settings → System to change the mode.

### 2.2 Key Metrics Cards

Five stat cards display at-a-glance performance:

| Metric                 | Description                                                                  |
| ---------------------- | ---------------------------------------------------------------------------- |
| **Sent (24h)**         | Total messages sent in the last 24 hours, with delivery rate percentage      |
| **Delivered (24h)**    | Successfully delivered messages. Shows "No failures" or the failure count    |
| **Total Leads**        | Total number of leads in the system                                          |
| **Reply Rate (7d)**    | Percentage of messages that received a reply in the past 7 days              |
| **Active Automations** | Number of currently enabled automation rules, with active phone number count |

### 2.3 Sending Activity

Four activity cards provide real-time sending intelligence:

1. **Velocity** — Current sending rate (messages per hour) and pending queue size
2. **24h Summary** — Breakdown: Sent / Delivered / Failed / Blocked
3. **Error Rate** — Percentage of failed sends with the top 3 Twilio error codes
4. **Numbers** — Active, warming, cooling, and disabled phone number counts with the last-sent timestamp

### 2.4 Charts & Pipeline Snapshot

- **Send Volume (7 Days)** — Area chart showing daily Delivered (filled), Failed (dashed red), and Blocked (dashed yellow) message counts
- **Pipeline Snapshot** — List of all pipeline stages with card counts. Click "View →" to go to the Pipeline page

**Auto-refresh:** All dashboard data refreshes automatically every 30 seconds.

---

## 3. Campaigns

### 3.1 Campaign List

The Campaigns page displays all SMS campaigns with filtering and search:

**Filters:**

- **Search** — Filter by campaign name
- **Status Badges** — Click to filter: All, Draft, Scheduled, Sending, Paused, Completed, Cancelled

**Table Columns:**
| Column | Description |
|--------|-------------|
| Campaign | Name and lead count |
| Status | Current lifecycle state |
| Sent | Total messages sent |
| Delivered | Successfully delivered count |
| Failed | Failed delivery count |
| Blocked | Compliance-blocked count |
| Replied | Leads who replied back |
| Rate | Delivery rate percentage |
| Created | Creation date |
| Actions | Context-sensitive action buttons |

**Available Actions** (vary by status):

- ▶ **Start** — Begin sending (Draft, Scheduled, Paused)
- ⏸ **Pause** — Pause active sending
- ✖ **Cancel** — Stop campaign permanently
- 🗑 **Delete** — Remove campaign (Draft, Completed, Cancelled only)

**Right-click** any row for additional options: View Details, Duplicate, Edit, Start/Pause/Cancel.

### 3.2 Creating a Campaign

1. Click **"New Campaign"** in the header
2. Fill in the campaign form:
   - **Name** — Descriptive campaign name
   - **Description** — Optional notes about the campaign
   - **Message Template** — The SMS text. Use template variables (see Section 3.5)
   - **Lead Selection** — Choose leads by status, tag, or import list
   - **Number Pool** — Select which phone number pool to send from (optional)
   - **Sending Speed** — Messages per minute (10–300 range)
   - **Scheduled Time** — Set a future date/time or leave empty to start manually
   - **Daily Limit** — Maximum messages to send per day (optional cap)
3. Click **Create Campaign** — Campaign starts in **Draft** status
4. Review the campaign details, then click **Start** to begin sending

### 3.3 Campaign Lifecycle

```
DRAFT → SCHEDULED → SENDING → COMPLETED
         ↓           ↓ ↑
         └───────── PAUSED
                      ↓
                   CANCELLED
```

| Status        | Description                                   |
| ------------- | --------------------------------------------- |
| **Draft**     | Created but not started. Can be edited freely |
| **Scheduled** | Set to auto-start at a future date/time       |
| **Sending**   | Actively processing and sending messages      |
| **Paused**    | Temporarily halted. Can be resumed            |
| **Completed** | All messages processed                        |
| **Cancelled** | Permanently stopped. Cannot be resumed        |

### 3.4 Campaign Detail View

Click any campaign to see its full detail page:

- **Progress Bar** — Real-time percentage with "X / Total leads" counter (updates every 5s while sending)
- **Stats Grid** — 8 cards: Total Leads, Sent, Delivered, Failed, Blocked, Replied, Delivery Rate, Reply Rate
- **Campaign Info** — Created date, started date, sending speed, number pool, schedule
- **Message Template** — Preview of the template text with variable placeholders
- **Lead Status Breakdown** — Expandable section showing count per status (Pending, Sent, Delivered, Failed, etc.)
- **Leads Table** — Full list of campaign leads with their send status and timestamp

### 3.5 Template Variables

Message templates support dynamic variable substitution:

| Variable        | Replaced With       | Example      |
| --------------- | ------------------- | ------------ |
| `{{firstName}}` | Lead's first name   | John         |
| `{{lastName}}`  | Lead's last name    | Smith        |
| `{{company}}`   | Lead's company      | Acme Corp    |
| `{{phone}}`     | Lead's phone number | +12125551234 |
| `{{city}}`      | Lead's city         | Miami        |
| `{{state}}`     | Lead's state        | FL           |

**Example Template:**

```
Hi {{firstName}}, this is Sarah from SCL.
We noticed {{company}} might benefit from our credit lines.
Are you interested in learning more? Reply to continue.
```

**Spintax Support** (if enabled in Settings → System):

```
{Hi|Hey|Hello} {{firstName}}, {interested in|looking for} a credit line?
```

This randomly selects one option from each `{option1|option2}` group per recipient, helping avoid carrier filtering.

### 3.6 Sending Speed & Throttling

The platform applies multiple layers of sending controls:

| Control                    | Description                                                   | Default                       |
| -------------------------- | ------------------------------------------------------------- | ----------------------------- |
| **Sending Speed**          | Messages per minute per campaign                              | 60/min                        |
| **Per-Number Daily Limit** | Maximum messages a single phone number can send per day       | 350                           |
| **Ramp-Up**                | Gradual daily limit increase for new numbers (7-day schedule) | Day 1: 50 → Day 7: 350 (full) |
| **Jitter**                 | Random ±40% variation in send delays to appear natural        | 40%                           |
| **Time Distribution**      | Spread messages evenly across the hour                        | Enabled                       |
| **Circuit Breaker**        | Auto-pause campaign if error rate exceeds threshold           | 30%                           |
| **Delivery Throttle**      | Numbers with <80% delivery rate are capped at 50% capacity    | 80%                           |

---

## 4. Inbox

### 4.1 Conversation List

The Inbox has a two-panel layout:

- **Left panel** (380px) — Conversation list with search and pagination
- **Right panel** — Selected conversation thread

**Conversation List Features:**

- **Search** — Real-time search across lead names and phone numbers (300ms debounce)
- **Unread Filter** — Click the "Unread" badge to show only conversations with unread messages
- **Conversation Items** show:
  - Lead avatar (initials)
  - Lead name
  - Last message preview
  - Time since last message ("2h ago")
  - First 2 lead tags (color-coded)
  - Unread count badge (red)
- **Pagination** — 50 conversations per page with Prev/Next navigation

**Right-click** any conversation for quick actions: Open Thread, Copy Phone, View Lead.

### 4.2 Message Thread

When you select a conversation, the right panel shows the full message history:

- **Outbound messages** (you sent) appear on the right with an indigo background
- **Inbound messages** (lead replied) appear on the left with a dark border
- Each message shows:
  - Sender prefix ("You" for outbound)
  - Message body
  - Timestamp (h:mm AM/PM format)
  - Delivery status icon (✓ sent, ✓✓ delivered)
- The thread auto-scrolls to the newest message

### 4.3 Replying to Messages

1. Type your reply in the text area at the bottom of the thread
2. The **SMS Counter** below the textarea shows: `X/160 · 1 SMS` (see Section 4.6)
3. Press **Enter** to send, or **Shift+Enter** for a new line
4. The reply button is disabled if the textarea is empty

**Opt-Out Warning:** If a lead has opted out (sent STOP), a red banner appears above the textarea: "Cannot send messages — this lead has opted out." The reply input is disabled.

### 4.4 AI Draft Reply

If OpenAI is configured (Settings → Integrations):

1. Click the **✨ AI Draft** button (purple) above the textarea
2. The system sends the conversation context to OpenAI
3. A draft reply is generated and inserted into the textarea
4. Review, edit if needed, and send

The AI considers the conversation history, lead information, and context when generating replies.

### 4.5 Conversation Actions

The thread header provides several actions:

| Action                  | Description                                                                   |
| ----------------------- | ----------------------------------------------------------------------------- |
| **Mark Read / Unread**  | Toggle the read status of the conversation                                    |
| **Reassign**            | Transfer the conversation to another rep (dropdown of all users)              |
| **Mark Interested**     | Update the lead status to INTERESTED                                          |
| **Mark Not Interested** | Update the lead status to NOT_INTERESTED                                      |
| **Mark DNC**            | Mark lead as Do-Not-Contact (red, with warning). Prevents all future messages |

### 4.6 SMS Counter & Segments

The SMS Counter component appears in all message composition areas (Inbox, Campaigns, Automation):

**Display:** `X/160 · 1 SMS`

**How it works:**

- Standard SMS (GSM-7 encoding): 160 characters per segment
- Multipart SMS: 153 characters per segment (7 chars used for concatenation header)
- Unicode messages (emoji, non-Latin): 70 characters per segment (67 multipart)

**Color coding:**

- **Gray** — 1 SMS segment (normal)
- **Yellow** — 2 SMS segments (caution)
- **Red** — 3+ SMS segments (warning — higher cost)

If Unicode characters are detected, the counter shows a "· Unicode" indicator.

---

## 5. Leads

### 5.1 Lead List & Filters

The Leads page displays your full lead database with filtering:

**Header:** Lead count, "Import CSV" button, "Add Lead" button

**Filters:**

- **Search** — Filter by name, phone number, or email (real-time with debounce)
- **Status Dropdown** — Filter by: All, New, Contacted, Replied, Interested, Docs Requested, Submitted, Funded, Not Interested, DNC

**Table Columns:**
| Column | Description |
|--------|-------------|
| ☐ | Select checkbox (for bulk actions) |
| Name | Avatar + first/last name + email |
| Phone | E.164 format (monospace) |
| Status | Color-coded badge |
| Source | Lead source/origin |
| Tags | Colored tag badges (click to manage) |
| Added | Date added |
| Actions | Context menu (⋮ vertical dots) |

### 5.2 Adding Leads

**Single Lead:**

1. Click **"Add Lead"**
2. Fill in: First Name, Last Name, Phone, Email, Company, Source
3. Click **Create**

The phone number must be in E.164 format (+1XXXXXXXXXX). Duplicate phone numbers are rejected.

### 5.3 CSV Import

1. Click **"Import CSV"**
2. Drag and drop a CSV file or click to browse
3. Map columns to lead fields (firstName, lastName, phone, email, company, source)
4. Preview the first rows to verify mapping
5. Click **Import**

**CSV Requirements:**

- Must include a `phone` column
- Phone numbers can be in any format — they'll be cleaned and normalized to E.164
- Duplicate phone numbers are skipped
- UTF-8 encoding recommended

### 5.4 Lead Statuses

| Status             | Color   | Description                                  |
| ------------------ | ------- | -------------------------------------------- |
| **NEW**            | Blue    | Recently imported/created, not yet contacted |
| **CONTACTED**      | Cyan    | First message sent                           |
| **REPLIED**        | Green   | Lead sent a reply                            |
| **INTERESTED**     | Amber   | Lead expressed interest                      |
| **DOCS_REQUESTED** | Purple  | Documentation requested from lead            |
| **SUBMITTED**      | Indigo  | Application submitted                        |
| **FUNDED**         | Emerald | Deal funded/closed                           |
| **NOT_INTERESTED** | Gray    | Lead declined                                |
| **DNC**            | Red     | Do-Not-Contact — all messaging blocked       |

Statuses can be changed individually or in bulk. The system auto-updates status to CONTACTED when the first message is sent, and to REPLIED when an inbound message is received.

### 5.5 Tags & Management

Tags provide flexible categorization for your leads:

**Inline Tag Management (on the Leads table):**

- Existing tags appear as colored badges next to each lead
- Hover over a tag and click **×** to remove it
- Click **+** to add a tag — a dropdown appears with available tags
- Tags are created in Settings → Tags (see Section 10.1)

Each tag has a custom color, making it easy to visually identify categories at a glance.

### 5.6 Bulk Actions

1. Select leads using the checkboxes (or use the header checkbox to select all visible)
2. A blue action bar appears at the top with the selected count
3. Available bulk actions:
   - **Change Status** — Set all selected leads to a new status
   - **Start Automation** — Trigger an automation sequence for selected leads
   - **Suppress** — Mark selected leads as suppressed (stops messaging)
   - **Delete** — Permanently remove selected leads (requires confirmation)
   - **Clear** — Deselect all

### 5.7 Lead Detail Drawer

Click **"View Details"** from the lead's action menu to open a slide-out drawer with:

- Full lead information (all fields, editable)
- Conversation history with the lead
- Tag management
- Notes field
- Custom fields (JSON)
- Assignment to a rep
- Compliance status (opted out, suppressed, DNC)

---

## 6. Pipeline

### 6.1 Kanban Board

The Pipeline page provides a visual deal pipeline with drag-and-drop functionality:

- **Columns** represent pipeline stages (e.g., New Lead, Qualified, Proposal, Negotiation, Closed Won)
- **Cards** represent leads/deals in each stage
- Drag cards between stages to update their progress
- Stages can be reordered by dragging the columns themselves

### 6.2 View Modes

Three view modes are available (persisted to localStorage):

| Mode                  | Description                     |
| --------------------- | ------------------------------- |
| **Columns** (default) | Kanban-style horizontal columns |
| **Grid**              | Card grid layout                |
| **List**              | Traditional table/list view     |

### 6.3 Managing Stages

**Creating a Stage:**

1. Click the **"+ Add Stage"** button
2. Enter: Stage name, color (color picker), and optional status mapping
3. Click **Create**

**Status Mapping:** You can link a pipeline stage to a lead status. When a card moves to that stage, the lead's status auto-updates. For example, mapping "Funded" stage to `FUNDED` status.

**Editing/Deleting:** Click the ⋮ menu on any stage header for Edit or Delete options. Deleting a stage removes all cards from it (leads remain in the system).

### 6.4 Card Management

Each pipeline card shows:

- Lead avatar and name
- Phone number
- Current lead status badge
- Company (if present)
- First 2 tags (with "+X more" indicator)
- Assigned rep
- Last activity timestamp

**Right-click a card** for quick actions:

- View Lead Details (opens detail drawer)
- Assign Rep (user selection list)
- Add Note (text modal, max 500 chars)
- Mark DNC
- Delete from Pipeline

### 6.5 Drag-and-Drop

The pipeline supports two types of drag-and-drop:

1. **Cards between stages** — Drag a card and drop it into a different stage column. The card's position and stage are updated instantly.
2. **Stage reordering** — Drag a stage column header to change the order of stages.

Both operations are saved to the server immediately with optimistic UI updates.

### 6.6 Filters & Search

Filter the pipeline view using the toolbar:

- **Search** — Filter cards by lead name, phone, or company
- **Tag Filter** — Show only cards with a specific tag
- **Rep Filter** — Show only cards assigned to a specific rep

Filters apply in real-time across all view modes.

---

## 7. Phone Numbers

> **Access:** Admin and Manager roles only

### 7.1 Number Overview

The Numbers page has two tabs: **Numbers** and **Daily Assignments**.

**Stats Cards (Numbers tab):**
| Card | Description |
|------|-------------|
| Active | Numbers currently available for sending |
| Warming | Numbers in ramp-up phase |
| Cooling | Numbers temporarily paused |
| Suspended | Numbers flagged for issues |
| Avg Health | Average delivery rate across all numbers |
| Sent Today | Total messages sent across all numbers today |

**Header displays:** Total number count and today's capacity usage (e.g., "36/200 today").

### 7.2 A2P / 10DLC Compliance

The platform supports A2P 10DLC (Application-to-Person 10-Digit Long Code) registration:

- Numbers registered with a Twilio Messaging Service show a green **"A2P"** badge next to the phone number
- In the expanded row details, you'll see the **Messaging Service SID** and **"10DLC Approved"** label
- When sending, the system **prioritizes A2P-approved numbers** over non-registered ones
- If at least one A2P-approved number is available, non-approved numbers are excluded from the sending pool

**How to set up A2P/10DLC:**

1. Complete Brand registration in the Twilio Console
2. Submit a Campaign Use Case under the brand
3. Add phone numbers to a Messaging Service
4. Set `TWILIO_MESSAGING_SERVICE_SID` in the platform's `.env` file
5. Run **"Sync Twilio"** on the Numbers page — the platform queries the Messaging Service and populates A2P status

### 7.3 Adding Numbers

**Single Number:**

1. Click **"Add Number"**
2. Enter the phone number in E.164 format (+1XXXXXXXXXX)
3. Optionally set: Friendly Name, Daily Limit, Enable Ramping
4. Click **Add Number**

**Bulk Import:**

1. Click **"Add Number"** → Switch to **"Bulk Import"** tab
2. Paste phone numbers (one per line)
3. Set common Daily Limit and Ramping preferences
4. Click **Import X Numbers**

**From Twilio:**

1. Click **"Sync Twilio"** to automatically import all numbers from your Twilio account
2. Numbers are matched by SID or phone number — existing numbers are updated, new ones are created
3. Numbers removed from Twilio are marked as RETIRED

### 7.4 Number Statuses

| Status        | Badge     | Description                                                               |
| ------------- | --------- | ------------------------------------------------------------------------- |
| **ACTIVE**    | 🟢 Green  | Available for sending. Messages can be routed to this number              |
| **WARMING**   | 🟡 Yellow | In ramp-up phase. Daily limit is gradually increasing                     |
| **COOLING**   | 🔵 Blue   | Temporarily paused (usually due to error streak). Auto-recovers after 24h |
| **SUSPENDED** | 🔴 Red    | Manually flagged. Requires admin intervention to reactivate               |
| **RETIRED**   | ⚫ Gray   | Permanently removed from rotation. No messages sent                       |

**Manual Actions:**

- **Cool** (❄ snowflake icon) — Temporarily pause an ACTIVE number for 24 hours
- **Activate** (▶ play icon) — Reactivate a COOLING, WARMING, or SUSPENDED number
- **Edit** (✏ pencil icon) — Change friendly name, daily limit, ramping, or status
- **Delete** (🗑 trash icon) — Permanently remove (with confirmation)

### 7.5 Ramp-Up Schedule

New phone numbers should increase sending volume gradually to build carrier reputation and avoid being flagged as spam.

When **Ramping** is enabled for a number:

- The daily limit follows a progressive schedule instead of using the flat daily limit
- Default 7-day schedule: Day 1 = 50, Day 2 = 100, Day 3 = 150, Day 4 = 200, Day 5 = 250, Day 6 = 300, Day 7 = 350 (full)
- The schedule is configurable via environment variables (RAMP_DAY_1_LIMIT through RAMP_DAY_7_LIMIT)
- The "Ramp" column in the table shows `Day X` while ramping, or `Done` when complete

The ramp day advances automatically at midnight, and numbers that complete the schedule graduate to full capacity.

### 7.6 Cooling & Auto-Recovery

The platform protects your phone number reputation with automatic cooling:

**Auto-Cooling Trigger:**

- If a number reaches **5 consecutive errors** (error streak), it's automatically set to COOLING status
- The `coolingUntil` timestamp is set to 24 hours from the cooling event
- The reason is logged (e.g., "High error streak")

**Recovery:**

- At midnight, the daily reset job checks all cooled numbers
- Numbers whose `coolingUntil` has passed are automatically reactivated with `status = ACTIVE` and `errorStreak = 0`
- Alternatively, an admin can manually activate a number at any time

**Proactive Throttling:**

- Numbers with a delivery rate below 80% (configurable) are automatically throttled to 50% of their daily capacity
- This prevents underperforming numbers from degrading the overall sending reputation

### 7.7 Daily Assignments

The **Daily Assignments** tab lets you assign specific phone numbers to sales reps for the day:

**Summary Cards:**

- Reps with Numbers — Count of reps who have assignments
- Assigned Today — Total number→rep assignments active
- Unassigned Active — Active numbers not assigned to any rep

**Assigning Numbers:**

1. Click **"Assign Numbers"**
2. Select a **Sales Rep** from the dropdown
3. Check the phone numbers to assign (with search/filter)
4. View capacity summary (e.g., "3 numbers · 600 msgs/day")
5. Click **Assign**

**Rep Cards:** Each rep shows an expandable card with:

- Rep name and avatar
- Number count and usage bar (percentage of daily capacity used)
- Expandable list of assigned numbers with their status and sent/limit counts
- **Unassign All** button to remove all assignments for a rep

Assignments are **date-based** — they apply to the current day and new assignments should be made each day. When a rep sends a message, the system prefers their assigned number(s) for that lead.

### 7.8 Number Pools

Number pools allow you to group phone numbers for campaign-specific sending:

- Create pools in the Numbers page (shown as cards above the table)
- Each pool has a name, optional description, and active/inactive status
- Assign numbers to pools for reputation segregation
- When creating a campaign, select a number pool to send from
- Only numbers within that pool will be used for the campaign

### 7.9 Twilio Sync

The **"Sync Twilio"** button performs a comprehensive sync with your Twilio account:

1. Fetches all incoming phone numbers from Twilio
2. Queries the configured Messaging Service to check which numbers are registered for A2P/10DLC
3. For each number:
   - If exists locally by SID → Updates capabilities, name, and A2P status
   - If exists locally by phone number → Updates SID and metadata
   - If new → Creates with default settings (Active, ramping, 200/day limit)
4. Numbers in the local database that no longer exist in Twilio are marked as **RETIRED**
5. Cache is invalidated after sync

---

## 8. Automation

### 8.1 Automation Rules

The Automation page manages rule-based messaging workflows:

**Stats Cards:**
| Card | Description |
|------|-------------|
| Active Rules | Count of enabled rules out of total |
| Total Steps | Sum of all template steps across all rules |
| Active Runs | Count of currently running automation sequences |

Each rule is displayed as an expandable card showing:

- **Enable/Disable toggle** — Immediately activate or deactivate the rule
- **Rule name** and **type badge** (color-coded by trigger type)
- **Summary metadata:** step count, run count, send window hours, weekend status
- **First template preview** with delay indicator

### 8.2 Trigger Types

| Trigger                | Badge Color | Description                                                        |
| ---------------------- | ----------- | ------------------------------------------------------------------ |
| **LEAD_CREATED**       | Blue        | Fires when a new lead is added to the system                       |
| **STATUS_CHANGED**     | Yellow      | Fires when a lead's status changes (configurable: to which status) |
| **KEYWORD_RECEIVED**   | Purple      | Fires when an inbound message contains specific keyword(s)         |
| **NO_REPLY**           | Orange      | Fires when a lead hasn't replied after X days                      |
| **MANUAL**             | Dark/Gray   | Only triggered manually by a user (via Leads → Bulk Actions)       |
| **TAG_RULE**           | Emerald     | Fires when a specific tag is applied to a lead                     |
| **FOLLOW_UP_SEQUENCE** | Cyan        | Multi-step follow-up sequence with configurable delays             |

### 8.3 Template Sequences

Each automation rule can have multiple **template steps** sent in sequence:

```
Step 1 (Day 0) → "Hi {{firstName}}, are you interested in..."
    ↓ wait 2 days
Step 2 (Day 2) → "Hey {{firstName}}, just following up..."
    ↓ wait 3 days
Step 3 (Day 5) → "Last chance {{firstName}}! Our offer expires..."
```

Each step has:

- **Sequence Order** — Step number (1, 2, 3...)
- **Delay Days** — How many days to wait before sending this step
- **Message Template** — The SMS body text (supports all template variables)

**Auto-pause on reply:** When a lead replies during an automation sequence, the run can be configured to pause automatically, preventing further follow-ups from being sent.

### 8.4 Schedule Constraints

Every automation rule has sending window controls:

| Setting              | Default  | Description                        |
| -------------------- | -------- | ---------------------------------- |
| **Send After Hour**  | 9:00 AM  | Earliest time messages can be sent |
| **Send Before Hour** | 8:00 PM  | Latest time messages can be sent   |
| **Send on Weekends** | Disabled | Whether to send on Saturday/Sunday |

Messages scheduled outside these windows are held and sent when the window opens.

### 8.5 Managing Rules

**Creating a Rule:**

1. Click **"New Rule"**
2. Configure: Name, trigger type, trigger settings, send window
3. Add one or more template steps with delays
4. Save as active or inactive

**Rule Actions:**

- **Toggle** — Enable/disable with the switch
- **Expand** — View all steps and configuration details
- **Duplicate** — Create a copy of the rule with a new name
- **Edit** — Modify all rule settings and templates
- **Delete** — Permanently remove the rule (with confirmation)

---

## 9. Analytics

### 9.1 Overview KPIs

Six KPI cards at the top of the Analytics page:

| KPI                    | Description                                       | Trend                       |
| ---------------------- | ------------------------------------------------- | --------------------------- |
| **Total Leads**        | All leads in the system                           | % change vs previous period |
| **New This Week**      | Leads added in the last 7 days                    | % change                    |
| **Messages Sent (7d)** | Messages sent in the past 7 days                  | % change                    |
| **Delivery Rate**      | Percentage of sent messages that were delivered   | Static                      |
| **Reply Rate**         | Percentage of sent messages that received replies | % change                    |
| **Opt-Outs (7d)**      | Leads who sent STOP in the past 7 days            | Static                      |

Green arrow = positive trend, Red arrow = negative trend.

### 9.2 Lead Funnel

**Status Distribution** — Pie chart showing the count of leads in each status (New, Contacted, Replied, Interested, etc.)

**Pipeline Funnel** — Horizontal bar chart showing card counts per pipeline stage, color-coded by stage color.

### 9.3 Messaging Analytics

**Date Range:** Selectable filter for 7, 14, or 30 days.

**Charts:**

- **Daily Message Volume** — Area chart with Outbound, Inbound, Delivered, and Failed lines
- **Hourly Pattern** — Bar chart showing message volume by hour of day (outbound vs inbound)
- **Weekday Pattern** — Bar chart showing volume by day of week
- **Response Time** — Average, minimum, and maximum response times

**Error Codes:** Table of the most common Twilio error codes with counts.

### 9.4 Campaign Performance

Performance metrics for all campaigns:

- Delivery rates per campaign
- Reply rates per campaign
- Top-performing campaigns ranked by effectiveness
- Campaign conversion funnel analysis

### 9.5 Number Performance

Phone number health analytics:

- Active numbers with delivery rates
- Health indicator bars per number
- Ramp-up progress tracking
- Error streaks and cooling history

### 9.6 Rep Performance

Individual sales rep metrics:

| Metric                  | Description                                 |
| ----------------------- | ------------------------------------------- |
| **Total Leads**         | Leads assigned to the rep                   |
| **Total Conversations** | Active conversations                        |
| **Messages Sent**       | Total outbound messages in the last 30 days |
| **Delivered**           | Messages delivered                          |
| **Failed**              | Messages that failed                        |
| **Replies**             | Inbound replies received                    |
| **Delivery Rate**       | % of sent that were delivered               |
| **Reply Rate**          | % of sent that received replies             |

### 9.7 Automation Metrics

Automation performance data:

- Active rules and their run counts
- Trigger frequency by type
- Success rate of automated messages
- Step completion rates

### 9.8 Export

Click **"Export Leads"** in the Analytics header to download a CSV file containing all leads with their current status, tags, and basic information.

---

## 10. Settings

> **Access:** Admin role only

### 10.1 Tags

Manage lead categorization tags:

**Creating Tags:**

1. Enter a tag name in the input field
2. Select a color from the color picker
3. Click **Create**

**Tag List:** Shows all tags with:

- Color dot indicator
- Tag name
- Count of leads using this tag
- Delete button (shows warning if in use)

Tags can be applied to leads from the Leads page or Lead Detail Drawer.

### 10.2 Users

Manage platform user accounts:

**Creating Users:**

1. Click **"Add User"**
2. Fill in: Email, First Name, Last Name, Role (Admin/Manager/Rep), Password
3. Click **Create**

**User Management:**

- Change user role
- Reset password
- Activate/deactivate account
- View last login timestamp
- Delete user (with confirmation)

### 10.3 Suppression List

Manage phone numbers that should never receive messages:

**Adding Numbers:**

- **Manual:** Enter phone numbers manually with a reason
- **CSV Upload:** Upload a CSV with phone numbers (one per line)
- **Reason Options:** STOP, Manual, Bounce, Complaint

**Suppression List Table:**

- Phone number
- Reason
- Date added
- Source
- Remove button

Suppressed numbers are checked at sending time — any message to a suppressed number is automatically blocked.

### 10.4 Integrations

Configure external service connections:

**Twilio:**
| Field | Description |
|-------|-------------|
| Account SID | Your Twilio Account SID (ACxxxxxxxx) |
| Auth Token | Your Twilio Auth Token (masked) |
| Messaging Service SID | A2P 10DLC Messaging Service (MGxxxxxxxx) |
| Test Connection | Verifies credentials are valid |

**OpenAI (Optional):**
| Field | Description |
|-------|-------------|
| API Key | Your OpenAI API key (masked) |
| Model | GPT-4, GPT-3.5-turbo |
| Test Connection | Verifies API key is valid |

**Webhook URLs:**
Configure these URLs in your Twilio Console:

- **Status Callback:** `https://yourdomain.com/api/webhooks/twilio/status`
- **Inbound Messages:** `https://yourdomain.com/api/webhooks/twilio/inbound`

Click the 📋 copy button to copy each URL to your clipboard.

### 10.5 System Configuration

**SMS Mode:**
| Mode | Description |
|------|-------------|
| 🟢 **Live** | Production sending. Real messages delivered and charged |
| 🔵 **Twilio Test** | API calls made but not delivered. Useful for integration testing |
| 🟠 **Simulation** | No API calls at all. Generates fake SIDs locally. For development/demo |

**Sending Configuration:**
| Setting | Default | Description |
|---------|---------|-------------|
| Max Messages Per Minute | 300 | Global rate limiter |
| Max Messages Per Number Per Day | 350 | Per-number daily cap |
| Jitter Percent | 40% | Random variation in send delays |
| Spintax Enabled | Yes | Enable `{option1|option2}` syntax |
| Time Distribution | Enabled | Spread messages across the sending hour |
| Circuit Breaker Threshold | 30% | Auto-pause if error rate exceeds this |
| Delivery Rate Throttle | 80% | Numbers below this are capped at 50% capacity |

**Compliance:**
| Setting | Default | Description |
|---------|---------|-------------|
| Quiet Hours Start | 8:00 PM | No messages sent after this time |
| Quiet Hours End | 9:00 AM | No messages sent before this time |
| Timezone | America/New_York | Timezone for quiet hours calculation |
| Support Phone | (786) 648-7512 | Number shown in compliance messages |

**Ramp-Up Schedule:**
| Setting | Description |
|---------|-------------|
| Enable/Disable | Master toggle for ramp-up system |
| Day 1–7 Schedule | Configurable daily limit per ramp day (default: 50, 100, 150, 200, 250, 300, 350) |
| Graduation | After Day 7, number automatically switches to full daily limit (default 350) |

### 10.6 Activity Log

A complete audit trail of all platform actions:

**Columns:**

- User who performed the action
- Action type (lead.created, message.sent, campaign.started, etc.)
- Entity type and ID
- Timestamp (relative + absolute on hover)
- IP address
- Metadata (expandable JSON)

**Filters:**

- Action type
- User
- Date range
- Entity type
- Text search

**Auto-refresh:** Updates every 30 seconds. Export available as CSV.

---

## 11. Twilio Account

> **Access:** Admin role only

### 11.1 Account Diagnostics

Comprehensive view of your Twilio account health:

**Top Cards:**
| Card | Description |
|------|-------------|
| **Balance** | Current account balance in USD |
| **Account Status** | Account name, status (Active/Suspended), and type |
| **SMS Mode** | Current sending mode and configured SID |
| **Today Volume** | Messages sent today and error rate |

If Twilio is not configured, a warning card appears with instructions to configure credentials in Settings → Integrations.

### 11.2 Phone Numbers (Twilio)

Expandable section showing all phone numbers in your Twilio account:

- Phone number and friendly name
- Twilio SID
- Type (local, toll-free, short-code, mobile)
- SMS / MMS / Voice capability indicators
- Status badge

### 11.3 Messaging Services

List of Twilio Messaging Services associated with your account:

- Service name and SID
- Number of phone numbers assigned
- A2P brand association status

### 11.4 A2P Brands & Campaigns

**A2P Brands:**

- Brand name and SID
- Registration status (Pending, Approved, Rejected)
- Created date

**A2P Campaigns:**

- Campaign name and SID
- Status and use case
- Associated phone numbers

### 11.5 Compliance Bundles

Additional Twilio compliance information:

- Toll-Free Verifications — Status and expiration
- Compliance Bundles — Bundle name, SID, status
- Trust Hub Profiles — Profile details and verification status
- Sub-Accounts — Child account listing

---

## 12. Technical Reference

### 12.1 SMS Sending Modes

The platform supports three sending modes, configurable in Settings → System:

| Mode            | Config Value  | Twilio API        | Delivery          | Cost           | Use Case            |
| --------------- | ------------- | ----------------- | ----------------- | -------------- | ------------------- |
| **Live**        | `live`        | Production client | Real delivery     | Charged        | Production use      |
| **Twilio Test** | `twilio_test` | Test client       | No delivery       | May be charged | Integration testing |
| **Simulation**  | `simulation`  | None              | Simulated locally | Free           | Development/Demo    |

**Simulation Mode Details:**

- Generates fake Twilio SIDs (format: `SM_SIM_xxxxxxx`)
- Simulates a 50–150ms sending delay
- Message marked as SENT immediately
- Useful for testing the full campaign flow without any Twilio interaction

### 12.2 Sending Engine Architecture

The platform uses a queue-based architecture for reliable message sending:

```
Campaign Start / Inbox Reply / Automation Trigger
    ↓
SendingEngine.queueMessage() or queueBulkSend()
    ↓
[Compliance Check] → Skip if STOP/DNC/Suppressed/Opted-out
    ↓
[Find Best Number] → Round-robin rotation, A2P preference, ramp-up limits
    ↓
[Create Message Record] → Status: QUEUED
    ↓
[Add to BullMQ Queue] → Redis-backed, with priority
    ↓
Worker picks up job
    ↓
SendingEngine.sendViaTwilio()
    ↓
[Twilio API call] → Using Messaging Service SID (A2P)
    ↓
[Update Message] → Status: SENT, SID stored
    ↓
[Twilio Webhook callback] → Status: DELIVERED or FAILED
```

**Bulk Optimization:** For campaigns with thousands of leads, the engine batches operations:

- Single compliance check (fetch all STOP numbers once)
- Batch conversation creation
- Batch message record insertion
- Bulk queue addition
- Result: ~10 database queries for 10,000 messages (vs ~50,000 without batching)

### 12.3 Number Rotation Algorithm

The system uses intelligent number rotation to distribute load and protect reputation:

1. **A2P Priority** — If any numbers have `messagingServiceSid` set (A2P-approved), only those are used
2. **Daily Limit Check** — Numbers at their daily limit (accounting for ramp-up) are excluded
3. **Delivery Rate Throttling** — Numbers with <80% delivery rate are throttled to 50% capacity
4. **Round-Robin Selection** — From the remaining eligible numbers, selection rotates evenly
5. **Sticky Sender** — For reply conversations, the same number is used for continuity
6. **Rep Assignment** — If a rep has numbers assigned, their messages prefer those numbers

### 12.4 Compliance & Quiet Hours

The platform enforces multiple compliance layers:

| Layer                | Description                                                 |
| -------------------- | ----------------------------------------------------------- |
| **STOP List**        | Numbers that sent "STOP" — automatically opted out          |
| **DNC Status**       | Leads marked as Do-Not-Contact — all messages blocked       |
| **Suppression List** | Manually uploaded phone numbers — all messages blocked      |
| **Opted Out**        | Leads who explicitly opted out — all messages blocked       |
| **Quiet Hours**      | No messages sent between configured hours (default 8PM–9AM) |
| **Business Hours**   | Optional additional window for automation only              |

All compliance checks happen **before** a message enters the sending queue. Blocked messages are recorded but never sent.

### 12.5 Webhook Configuration

Configure these webhook URLs in your Twilio Console for each phone number or Messaging Service:

**Message Status Callback:**

```
https://yourdomain.com/api/webhooks/twilio/status
```

Method: POST  
Purpose: Receives delivery status updates (sent → delivered, failed, undelivered)

**Inbound Message Webhook:**

```
https://yourdomain.com/api/webhooks/twilio/inbound
```

Method: POST  
Purpose: Receives incoming SMS messages from leads

**Important:** Both webhooks must be publicly accessible. The platform processes these callbacks to:

- Update message delivery status in real-time
- Create inbound message records
- Update conversation timestamps and unread counts
- Trigger automation rules (keyword-based)
- Update phone number delivery statistics

### 12.6 Environment Variables

All configuration is managed via environment variables (`.env` file):

**Server:**
| Variable | Default | Description |
|----------|---------|-------------|
| `NODE_ENV` | development | Environment: development, production, test |
| `PORT` | 3001 | Server port |
| `CLIENT_URL` | — | Frontend URL for CORS |

**Database:**
| Variable | Default | Description |
|----------|---------|-------------|
| `DATABASE_URL` | — | MySQL connection string (required) |
| `REDIS_URL` | localhost:6379 | Redis connection URL |

**Authentication:**
| Variable | Default | Description |
|----------|---------|-------------|
| `JWT_SECRET` | — | JWT signing key (required) |
| `JWT_EXPIRES_IN` | 7d | Token expiry duration |
| `JWT_REFRESH_SECRET` | — | Refresh token signing key (required) |
| `JWT_REFRESH_EXPIRES_IN` | 30d | Refresh token expiry |

**Twilio:**
| Variable | Default | Description |
|----------|---------|-------------|
| `TWILIO_ACCOUNT_SID` | — | Twilio Account SID |
| `TWILIO_AUTH_TOKEN` | — | Twilio Auth Token |
| `TWILIO_MESSAGING_SERVICE_SID` | — | Messaging Service SID for A2P/10DLC |

**SMS Configuration:**
| Variable | Default | Description |
|----------|---------|-------------|
| `MAX_DAILY_MESSAGES_PER_NUMBER` | 350 | Per-number daily sending limit |
| `MAX_MESSAGES_PER_MINUTE` | 300 | Global messages per minute cap |
| `RAMP_UP_ENABLED` | false | Enable gradual volume increase for new numbers |
| `SMS_JITTER_PERCENT` | 40 | % randomness in send timing (0–100) |
| `SPINTAX_ENABLED` | true | Enable `{opt1\|opt2}` text randomization |
| `CIRCUIT_BREAKER_THRESHOLD` | 30 | % error rate that triggers auto-pause |
| `DELIVERY_RATE_THROTTLE_AT` | 80 | Numbers below this % get 50% capacity |
| `TIME_DISTRIBUTION_ENABLED` | true | Spread campaign messages across the hour |

**Compliance:**
| Variable | Default | Description |
|----------|---------|-------------|
| `COMPLIANCE_QUIET_HOURS_START` | 20 | No sending after this hour (24h format) |
| `COMPLIANCE_QUIET_HOURS_END` | 9 | No sending before this hour |
| `COMPLIANCE_TIMEZONE` | America/New_York | Timezone for quiet hours |
| `SUPPORT_PHONE` | (786) 648-7512 | Shown in compliance/STOP messages |
| `BUSINESS_HOURS_START` | 9 | Business hours start (automation window) |
| `BUSINESS_HOURS_END` | 18 | Business hours end |

**Webhook:**
| Variable | Default | Description |
|----------|---------|-------------|
| `WEBHOOK_BASE_URL` | http://localhost:3001 | Base URL for Twilio webhook callbacks |

### 12.7 Database Schema

The platform uses MySQL with Prisma ORM. Key models:

**Core Entities:**
| Model | Purpose | Key Fields |
|-------|---------|------------|
| `User` | Platform users | email, role (ADMIN/MANAGER/REP), name |
| `Lead` | Contact database | phone (unique, E.164), status, tags, assignedRep |
| `Conversation` | Message threads | leadId (1:1 with lead), stickyNumberId, unreadCount |
| `Message` | Individual SMS | direction, status, fromNumber, toNumber, body |
| `PhoneNumber` | Sender pool | phoneNumber, status, messagingServiceSid, dailyLimit |
| `Campaign` | SMS campaigns | name, status, template, sendingSpeed, stats |
| `CampaignLead` | Campaign→Lead link | campaignId, leadId, sendStatus |

**Pipeline:**
| Model | Purpose | Key Fields |
|-------|---------|------------|
| `PipelineStage` | Board columns | name, order, color, mappedStatus |
| `PipelineCard` | Board items | leadId, stageId, position |

**Automation:**
| Model | Purpose | Key Fields |
|-------|---------|------------|
| `AutomationRule` | Rule definitions | type, triggerConfig, isActive, sendWindow |
| `AutomationTemplate` | Sequence steps | sequenceOrder, delayDays, messageTemplate |
| `AutomationRun` | Active sequences | leadId, currentStep, nextRunAt, isPaused |

**Supporting:**
| Model | Purpose | Key Fields |
|-------|---------|------------|
| `Tag` | Lead categories | name, color |
| `SuppressionEntry` | Blocked numbers | phone, reason |
| `NumberPool` | Number groups | name, dailyLimit, isActive |
| `NumberAssignment` | Rep→Number link | userId, phoneNumberId, assignedDate |
| `ActivityLog` | Audit trail | action, entityType, entityId, metadata |

### 12.8 API Reference

**Authentication:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/auth/login` | Authenticate (email + password) |
| GET | `/api/auth/users` | List all users |
| POST | `/api/auth/users` | Create user |
| PUT | `/api/auth/users/:id` | Update user |
| DELETE | `/api/auth/users/:id` | Delete user |

**Dashboard:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/dashboard/stats` | Main dashboard metrics |
| GET | `/api/dashboard/diagnostics` | SMS mode, health, 24h/7d stats |
| GET | `/api/dashboard/twilio-diagnostics` | Twilio account health (admin) |

**Campaigns:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/campaigns` | List campaigns (paginated, filterable) |
| POST | `/api/campaigns` | Create campaign |
| GET | `/api/campaigns/:id` | Get campaign details |
| PUT | `/api/campaigns/:id` | Update campaign |
| DELETE | `/api/campaigns/:id` | Delete campaign |
| POST | `/api/campaigns/:id/start` | Start sending |
| POST | `/api/campaigns/:id/pause` | Pause sending |
| POST | `/api/campaigns/:id/cancel` | Cancel campaign |
| GET | `/api/campaigns/:id/analytics` | Campaign analytics |

**Inbox:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/inbox` | List conversations (paginated) |
| GET | `/api/inbox/:id` | Get conversation with messages |
| POST | `/api/inbox/:id/reply` | Send reply |
| POST | `/api/inbox/:id/read` | Mark as read |
| PUT | `/api/inbox/:id/assign` | Reassign to rep |

**Leads:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/leads` | List leads (paginated, filterable) |
| POST | `/api/leads` | Create single lead |
| PUT | `/api/leads/:id` | Update lead |
| DELETE | `/api/leads/:id` | Delete lead |
| POST | `/api/leads/bulk` | Bulk action (status, suppress, delete) |
| POST | `/api/leads/:id/tags` | Add tag to lead |
| DELETE | `/api/leads/:id/tags/:tagId` | Remove tag |
| GET | `/api/leads/export` | Export all leads as CSV |

**Pipeline:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/pipeline/stages` | Get all stages with cards |
| POST | `/api/pipeline/stages` | Create stage |
| PUT | `/api/pipeline/stages/:id` | Update stage |
| DELETE | `/api/pipeline/stages/:id` | Delete stage |
| PUT | `/api/pipeline/stages/reorder` | Reorder stages |
| PUT | `/api/pipeline/cards/:id/move` | Move card to stage |

**Phone Numbers:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/numbers` | List all numbers with health metrics |
| POST | `/api/numbers` | Add number manually |
| PUT | `/api/numbers/:id` | Update number |
| DELETE | `/api/numbers/:id` | Delete number |
| POST | `/api/numbers/:id/cool` | Cool for 24h |
| POST | `/api/numbers/:id/activate` | Reactivate number |
| POST | `/api/numbers/sync-twilio` | Full sync from Twilio |
| GET | `/api/numbers/pools` | List number pools |
| POST | `/api/numbers/pools` | Create pool |
| POST | `/api/numbers/assign` | Assign numbers to rep |
| GET | `/api/numbers/assignments` | List rep assignments |
| DELETE | `/api/numbers/assignments/:repId` | Unassign from rep |

**Automation:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/automation/rules` | List all rules |
| POST | `/api/automation/rules` | Create rule |
| PUT | `/api/automation/rules/:id` | Update rule |
| DELETE | `/api/automation/rules/:id` | Delete rule |

**Analytics:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/analytics/overview` | KPI metrics |
| GET | `/api/analytics/lead-funnel` | Status distribution + pipeline funnel |
| GET | `/api/analytics/messaging?days=N` | Messaging trends (7/14/30 days) |
| GET | `/api/analytics/campaigns` | Campaign performance |
| GET | `/api/analytics/numbers` | Number health stats |
| GET | `/api/analytics/rep-performance` | Rep metrics |
| GET | `/api/analytics/automation` | Automation metrics |

**Settings:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/settings/tags` | List tags |
| POST | `/api/settings/tags` | Create tag |
| PUT | `/api/settings/tags/:id` | Update tag |
| DELETE | `/api/settings/tags/:id` | Delete tag |
| GET | `/api/settings/suppression` | List suppressed numbers |
| POST | `/api/settings/suppression/upload` | Upload suppression CSV |
| DELETE | `/api/settings/suppression/:id` | Remove suppression |
| PUT | `/api/settings/integrations` | Update integration config |
| GET | `/api/settings/system` | Get system config |
| PUT | `/api/settings/system` | Update system config |
| GET | `/api/settings/activity-log` | Activity log (paginated) |

**AI:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/ai/draft-reply` | Generate AI reply draft |

**Webhooks:**
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/webhooks/twilio/status` | Twilio message status callback |
| POST | `/api/webhooks/twilio/inbound` | Twilio incoming message callback |

---

## Appendix A: Keyboard Shortcuts

| Shortcut           | Action                                  |
| ------------------ | --------------------------------------- |
| `Cmd+K` / `Ctrl+K` | Open command palette (quick navigation) |
| `Enter`            | Send message (in Inbox)                 |
| `Shift+Enter`      | New line in message (in Inbox)          |

## Appendix B: Twilio Error Codes

Common Twilio error codes you may see in Analytics or Campaign details:

| Code  | Meaning                     | Action                                   |
| ----- | --------------------------- | ---------------------------------------- |
| 21211 | Invalid 'To' phone number   | Verify the lead's phone number is valid  |
| 21408 | Permission denied           | Check Twilio account permissions         |
| 21610 | Message filtered (carrier)  | Number may be flagged — consider cooling |
| 21614 | Invalid mobile number       | Number cannot receive SMS                |
| 30003 | Unreachable destination     | Carrier issue — retry later              |
| 30004 | Message blocked             | Carrier blocked the message              |
| 30005 | Unknown destination handset | Number doesn't exist                     |
| 30006 | Landline/unreachable        | Cannot send SMS to landlines             |
| 30007 | Carrier violation           | Content or sending pattern flagged       |
| 30008 | Unknown error               | Twilio internal error — retry            |

## Appendix C: Glossary

| Term                  | Definition                                                                        |
| --------------------- | --------------------------------------------------------------------------------- | -------------------------------------------------------- |
| **A2P**               | Application-to-Person — programmatic messaging from business to consumer          |
| **10DLC**             | 10-Digit Long Code — standard phone numbers registered for A2P messaging          |
| **BullMQ**            | Redis-backed queue system used for reliable message processing                    |
| **Circuit Breaker**   | Safety mechanism that pauses sending when error rate gets too high                |
| **Cooling**           | Temporarily pausing a phone number to protect its reputation                      |
| **DNC**               | Do-Not-Contact — legal compliance status preventing all messaging                 |
| **E.164**             | International phone number format: +[country code][number] (e.g., +12125551234)   |
| **GSM-7**             | Standard SMS character encoding (160 chars/segment)                               |
| **Jitter**            | Random variation added to sending delays to avoid carrier pattern detection       |
| **Messaging Service** | Twilio service that manages A2P number pools and compliance                       |
| **Ramp-up**           | Gradual increase of sending volume on new numbers to build reputation             |
| **Round-Robin**       | Even distribution of messages across available phone numbers                      |
| **Spintax**           | Text syntax `{option1                                                             | option2}` that randomly selects variations per recipient |
| **Sticky Sender**     | Keeping the same phone number for all messages in a conversation                  |
| **STOP**              | Industry-standard opt-out keyword — leads who send this are automatically blocked |
| **Suppression**       | A list of phone numbers blocked from receiving any messages                       |

---

_© 2026 Secure Credit Lines. All rights reserved._
