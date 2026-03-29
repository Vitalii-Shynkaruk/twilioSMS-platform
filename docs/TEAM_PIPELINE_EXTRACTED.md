# Team Pipeline View — Extracted CSS, JS & HTML

> Source: `https://papaya-swan-76d714.netlify.app/pipeline.html`

---

## 1. CSS VARIABLES (Root)

```css
:root{
  --bg:#0B0F16;--bg2:#111720;--bg3:#161D28;--bg4:#1C2535;--bg5:#212D3F;
  --border:rgba(255,255,255,0.07);--border2:rgba(255,255,255,0.13);
  --text:#E2E8F0;--text2:#8B95A5;--text3:#536070;--text4:#3A4A5C;
  --urgent:#E24B4A;--urgent-bg:rgba(226,75,74,0.1);--urgent-b:rgba(226,75,74,0.28);
  --attn:#D06828;--attn-bg:rgba(208,104,40,0.1);--attn-b:rgba(208,104,40,0.28);
  --watch:#D4A940;--watch-bg:rgba(212,169,64,0.1);--watch-b:rgba(212,169,64,0.26);
  --good:#3AB97A;--good-bg:rgba(58,185,122,0.1);--good-b:rgba(58,185,122,0.25);
  --info:#4A9EE8;--info-bg:rgba(74,158,232,0.1);--info-b:rgba(74,158,232,0.24);
  --hot:#FF5722;--hot-bg:rgba(255,87,34,0.12);--hot-b:rgba(255,87,34,0.35);
  --hot-glow:0 0 8px rgba(255,87,34,0.4),0 0 2px rgba(255,87,34,0.6);
  --gold:#C9952A;--gold-bg:rgba(201,149,42,0.12);--gold-b:rgba(201,149,42,0.28);
  --purple:#9B72E8;--purple-bg:rgba(155,114,232,0.1);
  --r:8px;
}
```

---

## 2. REP COLORS (JS Constants)

```js
const REPS = {
  JB:{name:'Jonathan Baker',color:'#C9952A',bg:'rgba(201,149,42,0.18)'},
  HA:{name:'Hassan Anadu',color:'#4A9EE8',bg:'rgba(74,158,232,0.16)'},
  NU:{name:'Nkem Udeh',color:'#9B72E8',bg:'rgba(155,114,232,0.16)'}
};
```

---

## 3. PRODUCT TYPE DEFINITIONS

```js
const PRODUCTS = {
  MCA:    {label:'MCA',   color:'#C9952A', bg:'rgba(201,149,42,0.15)',  badge:'⚡', note:'Fast cycle',  reviewDaysFlag:2,  commitDays:3,  icon:'⚡'},
  LOC:    {label:'LOC',   color:'#4A9EE8', bg:'rgba(74,158,232,0.15)',  badge:'💳', note:'Fast cycle',  reviewDaysFlag:2,  commitDays:3,  icon:'💳'},
  HELOC:  {label:'HELOC', color:'#9B72E8', bg:'rgba(155,114,232,0.15)', badge:'🏠', note:'30–45 days',  reviewDaysFlag:30, commitDays:14, icon:'🏠'},
  Equipment:{label:'Equipment',color:'#3AB97A',bg:'rgba(58,185,122,0.15)',badge:'🔧',note:'5–14 days', reviewDaysFlag:5,  commitDays:7,  icon:'🔧'},
  SBA:    {label:'SBA',   color:'#3AB97A', bg:'rgba(58,185,122,0.15)', badge:'🏛', note:'60–90 days',  reviewDaysFlag:60, commitDays:30, icon:'🏛'},
  CRE:    {label:'CRE',   color:'#D06828', bg:'rgba(208,104,40,0.15)', badge:'🏢', note:'60–120 days', reviewDaysFlag:60, commitDays:30, icon:'🏢'},
};
```

---

## 4. GOALS DATA

```js
let goals = {
  team: { monthlyGoal: 5800000, annualGoal: 70000000 },
  JB:   { monthlyGoal: 2500000, annualGoal: 30000000 },
  HA:   { monthlyGoal: 2000000, annualGoal: 24000000 },
  NU:   { monthlyGoal: 1300000, annualGoal: 16000000 },
};
```

---

## 5. STAGE DEFINITIONS

```js
const STAGES = [
  {key:'New Lead',               color:'#4A9EE8', op:.28, dim:true},
  {key:'Engaged / Interested',   color:'#9B72E8', op:.38, dim:true},
  {key:'Qualified',              color:'#C9952A', op:.45, dim:true},
  {key:'Submitted (In Review)',  color:'#4A9EE8', op:.55, review:true},
  {key:'Approved / Offers',      color:'#FF8C00', op:.85, pipe:true,   hot:true},
  {key:'Committed (Funding)',    color:'#3AB97A', op:.95, commit:true, pipe:true},
  {key:'Funded',                 color:'#3AB97A', op:1,   funded:true},
  {key:'Nurture',                color:'#4A9EE8', op:.3,  nurture:true},
  {key:'Closed',                 color:'#536070', op:.28, closed:true},
];

const PIPELINE_STAGES = ['Approved / Offers','Committed (Funding)'];
```

---

## 6. ALL TEAM VIEW CSS

### Team View Container & Cards

```css
/* TEAM VIEW */
.team-view{flex:1;padding:12px 16px;overflow-y:auto;}
.team-stats{display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-bottom:16px;}
.stat-card{background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:10px 12px;}
.stat-label{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3);font-weight:600;margin-bottom:4px;}
.stat-val{font-size:18px;font-weight:700;font-variant-numeric:tabular-nums;}
.stat-sub{font-size:9px;color:var(--text3);margin-top:2px;}
.team-cards{display:flex;gap:8px;flex-wrap:wrap;}

/* Deal tiles (used in team view) */
.deal-tile{background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:10px 12px;width:196px;}
.deal-tile.funded-tile{border-left:2px solid var(--good);border-radius:0 var(--r) var(--r) 0;}
.deal-tile.nb-tile{border-left:2px solid var(--info);border-radius:0 var(--r) var(--r) 0;}
.deal-tile.top-tile{border-color:var(--gold-b);}
.dt-biz{font-size:12px;font-weight:600;margin-bottom:4px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}
.dt-offer{font-size:17px;font-weight:700;color:var(--good);font-variant-numeric:tabular-nums;margin-bottom:4px;}
.dt-meta{display:flex;gap:3px;flex-wrap:wrap;margin-bottom:5px;}
.dt-rep{font-size:10px;color:var(--text2);}
.dt-fd{font-size:9px;color:var(--text3);margin-top:3px;}

/* Team tile rep attribution */
.dt-reps{display:flex;align-items:center;gap:5px;margin-top:4px;flex-wrap:wrap;}
.dt-rep-primary{font-size:10px;font-weight:600;color:var(--text);}
.dt-rep-co{font-size:10px;color:var(--text3);}
.dt-co-badge{font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(139,148,158,0.12);color:var(--text3);font-weight:500;}

/* Team view tab button active state */
.vs.team-act{background:var(--good-bg);color:var(--good);border-color:var(--good-b);}
```

### Goal Progress Bar

```css
/* ── GOAL PROGRESS ── */
.goal-bar-wrap{margin-top:4px;}
.goal-bar-track{height:4px;border-radius:2px;background:rgba(255,255,255,0.08);overflow:hidden;}
.goal-bar-fill{height:100%;border-radius:2px;transition:width .4s ease;}
.goal-pct{font-size:9px;color:var(--text3);margin-top:2px;font-variant-numeric:tabular-nums;}
.goal-pct.on-track{color:var(--good);}
.goal-pct.at-risk{color:var(--watch);}
.goal-pct.behind{color:var(--urgent);}

/* Funded MTD block special */
.sb2.goal-block{background:rgba(58,185,122,0.04);border-right-color:var(--good-b);}
```

### Goal Edit Modal

```css
/* GOAL EDIT MODAL */
.goal-modal{width:520px;}
.goal-rep-row{display:flex;align-items:center;gap:10px;padding:10px 0;border-bottom:1px solid var(--border);}
.goal-rep-row:last-child{border-bottom:none;}
.goal-rep-name{font-size:12px;font-weight:500;width:130px;flex-shrink:0;}
.goal-inp{width:100%;background:var(--bg4);border:1px solid var(--border2);border-radius:6px;padding:5px 8px;color:var(--text);font-size:12px;font-family:inherit;outline:none;text-align:right;}
.goal-inp:focus{border-color:var(--gold-b);}
.goal-inp-label{font-size:9px;color:var(--text3);margin-bottom:2px;text-align:right;}

/* GOALS button in topbar */
.goal-btn{padding:4px 10px;border-radius:6px;border:1px solid var(--gold-b);background:var(--gold-bg);color:var(--gold);font-size:11px;font-weight:500;cursor:pointer;font-family:inherit;white-space:nowrap;flex-shrink:0;}
.goal-btn:hover{background:rgba(201,149,42,0.2);}
```

### Offer Block (Money Zone)

```css
/* ── OFFER BLOCK — the money zone ── */
.offer-block{margin:4px 0 5px;padding:6px 8px;border-radius:6px;background:var(--bg4);border:1px solid var(--border);}
.offer-block.ob-strong{border-color:rgba(58,185,122,.35);background:rgba(58,185,122,.06);}
.offer-block.ob-mid{border-color:rgba(212,169,64,.3);background:rgba(212,169,64,.05);}
.offer-block.ob-weak{border-color:rgba(208,104,40,.3);background:rgba(208,104,40,.05);}
.ob-main{display:flex;align-items:baseline;justify-content:space-between;gap:4px;}
.ob-amount{font-size:16px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;line-height:1;}
.ob-strong .ob-amount{color:var(--good);}
.ob-mid .ob-amount{color:var(--watch);}
.ob-weak .ob-amount{color:var(--attn);}
.ob-range-amount{font-size:14px;font-weight:800;letter-spacing:-.02em;font-variant-numeric:tabular-nums;}
.ob-strong .ob-range-amount{color:var(--good);}
.ob-mid .ob-range-amount{color:var(--watch);}
.ob-weak .ob-range-amount{color:var(--attn);}
.ob-tags{display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-top:4px;}
.ob-lender{font-size:10px;color:var(--text3);}
.ob-best{font-size:9px;padding:1px 5px;border-radius:3px;background:rgba(201,149,42,.15);color:var(--gold);border:1px solid rgba(201,149,42,.3);font-weight:700;}
.ob-expiry{font-size:9px;padding:1px 5px;border-radius:3px;font-weight:600;}
.ob-exp-ok{background:rgba(58,185,122,.12);color:var(--good);border:1px solid rgba(58,185,122,.25);}
.ob-exp-soon{background:rgba(212,169,64,.12);color:var(--watch);border:1px solid rgba(212,169,64,.28);}
.ob-exp-urgent{background:rgba(226,75,74,.12);color:var(--urgent);border:1px solid rgba(226,75,74,.28);}
.ob-multi-row{font-size:10px;display:flex;align-items:center;justify-content:space-between;padding:2px 0;border-bottom:1px solid rgba(255,255,255,.04);}
.ob-multi-row:last-child{border-bottom:none;}
.ob-ml{font-weight:500;color:var(--text2);}
.ob-ma{font-weight:700;font-variant-numeric:tabular-nums;}
.ob-ma.g{color:var(--good);}
.ob-ma.w{color:var(--watch);}
.ob-ma.u{color:var(--attn);}
```

### Funded Block

```css
/* Funded block */
.funded-block{margin:4px 0 5px;padding:6px 8px;border-radius:6px;background:rgba(58,185,122,.07);border:1px solid rgba(58,185,122,.3);}
.fb-amount{font-size:16px;font-weight:800;color:var(--good);font-variant-numeric:tabular-nums;letter-spacing:-.02em;}
.fb-meta{font-size:10px;color:var(--text3);margin-top:2px;}

/* ── FUNDED COLUMN EXTRAS ── */
.funded-meta{display:flex;align-items:center;gap:6px;flex-wrap:wrap;padding:2px 6px 4px;font-size:9px;color:var(--text3);}
.funded-cycle{background:rgba(58,185,122,.12);color:var(--good);border:1px solid rgba(58,185,122,.2);padding:1px 5px;border-radius:3px;font-size:9px;font-weight:600;}
.funded-dr{font-size:9px;color:var(--text3);padding:1px 6px 3px;display:flex;justify-content:space-between;}
.fd-ago{color:var(--good);font-weight:500;}
```

### Nurture Block & Tags

```css
/* Nurture prev block */
.prev-block{margin:4px 0 5px;padding:5px 8px;border-radius:6px;background:rgba(139,148,158,.07);border:1px solid rgba(139,148,158,.15);}
.pb-amount{font-size:13px;font-weight:700;color:var(--text2);font-variant-numeric:tabular-nums;}
.pb-label{font-size:9px;color:var(--text3);margin-top:1px;}

/* Nurture decay pill */
.nd-pill{display:inline-flex;align-items:center;gap:4px;padding:2px 7px;border-radius:3px;font-size:9px;font-weight:600;margin-top:3px;}
.nd-30{background:var(--watch-bg);color:var(--watch);border:1px solid var(--watch-b);}
.nd-60{background:var(--attn-bg);color:var(--attn);border:1px solid var(--attn-b);}
.nd-90{background:var(--urgent-bg);color:var(--urgent);border:1px solid var(--urgent-b);}

/* ── NURTURE TAGS ── */
.n-tag{display:inline-flex;align-items:center;gap:3px;padding:2px 6px;border-radius:3px;font-size:9px;font-weight:600;margin:1px;}
.nt-seasonal{background:rgba(155,114,232,.15);color:var(--purple);border:1px solid rgba(155,114,232,.3);}
.nt-low-credit{background:rgba(226,75,74,.1);color:var(--urgent);border:1px solid rgba(226,75,74,.22);}
.nt-re-engage{background:rgba(58,185,122,.1);color:var(--good);border:1px solid rgba(58,185,122,.25);}
.nt-waiting-docs{background:rgba(212,169,64,.12);color:var(--watch);border:1px solid rgba(212,169,64,.28);}
.nt-timing{background:rgba(139,148,158,.12);color:var(--text2);border:1px solid rgba(139,148,158,.22);}
.nt-competitor{background:rgba(208,104,40,.1);color:var(--attn);border:1px solid rgba(208,104,40,.25);}
```

### Rep Ownership / Avatar

```css
/* ── REP OWNERSHIP ROW ── */
.rep-ownership{display:flex;align-items:center;gap:5px;padding:3px 6px;border-radius:5px;background:var(--bg4);margin-bottom:3px;flex-wrap:wrap;}
.rep-primary-block{display:flex;align-items:center;gap:4px;}
.rep-primary-name{font-size:11px;font-weight:600;color:var(--text);}
.rep-primary-label{font-size:9px;color:var(--text3);}
.rep-assist-list{display:flex;align-items:center;gap:3px;margin-left:4px;padding-left:6px;border-left:1px solid var(--border2);}
.rep-assist-av{width:15px;height:15px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:7px;font-weight:700;flex-shrink:0;font-family:'DM Mono';}
.rep-row{display:flex;align-items:center;gap:5px;padding:3px 6px;border-radius:5px;background:var(--bg4);margin-bottom:3px;}
.av{width:18px;height:18px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:8px;font-weight:700;flex-shrink:0;font-family:'DM Mono';}
.rn{font-size:11px;font-weight:500;color:var(--text);}

/* Shared deal indicator on card */
.shared-badge{display:inline-flex;align-items:center;gap:3px;font-size:9px;padding:1px 6px;border-radius:3px;font-weight:600;background:rgba(74,158,232,.1);color:var(--info);border:1px solid rgba(74,158,232,.22);}
.assist-badge{display:inline-flex;align-items:center;gap:3px;font-size:9px;padding:1px 6px;border-radius:3px;font-weight:600;background:rgba(155,114,232,.1);color:#9B72E8;border:1px solid rgba(155,114,232,.22);}
```

### Offers Section (Deal Panel)

```css
/* OFFERS section inside deal tab */
.offer-list{display:flex;flex-direction:column;gap:5px;margin-bottom:6px;}
.offer-item{display:flex;align-items:center;justify-content:space-between;padding:6px 9px;background:var(--bg4);border:1px solid var(--border);border-radius:6px;}
.offer-item.selected-offer{border-color:var(--good-b);background:var(--good-bg);}
.oi-left{display:flex;flex-direction:column;gap:1px;}
.oi-lender{font-size:11px;font-weight:500;color:var(--text);}
.oi-detail{font-size:10px;color:var(--text3);}
.oi-amount{font-size:13px;font-weight:700;color:var(--good);}
.oi-actions{display:flex;gap:4px;}
.oi-btn{padding:2px 7px;border-radius:4px;border:1px solid var(--border2);background:transparent;color:var(--text2);font-size:10px;cursor:pointer;font-family:inherit;}
.oi-btn.select-btn{border-color:var(--good-b);color:var(--good);}
.oi-btn.del-btn{border-color:var(--urgent-b);color:var(--urgent);}
.add-offer-btn{width:100%;padding:6px 10px;border-radius:6px;border:1px solid var(--good-b);background:var(--good-bg);color:var(--good);font-size:11px;font-weight:500;cursor:pointer;font-family:inherit;}
.act-funded{background:var(--good-bg);border-color:var(--good-b);color:var(--good);}
```

### Product Badge & Tags

```css
/* Product badge */
.prod-badge{display:inline-flex;align-items:center;gap:4px;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:600;}

/* Tags row */
.tags{display:flex;gap:3px;margin:3px 0;flex-wrap:wrap;}
.t{font-size:9px;padding:1px 5px;border-radius:3px;font-weight:500;}
.t-mca{background:var(--gold-bg);color:var(--gold);}
.t-sba{background:var(--good-bg);color:var(--good);}
.t-hel{background:var(--info-bg);color:var(--info);}
.t-eq{background:var(--purple-bg);color:var(--purple);}
.t-con{background:var(--watch-bg);color:var(--watch);}
.t-offer{background:var(--good-bg);color:var(--good);font-weight:700;}
.t-funded-amt{background:rgba(58,185,122,.2);color:var(--good);font-weight:700;}
.t-prev{background:rgba(139,148,158,.12);color:var(--text2);}
```

### Progress Track (Commit Sub-status)

```css
/* Progress track inside block */
.csub-progress{display:flex;align-items:center;padding:5px 9px 6px;gap:0;}
.csub-step{display:flex;flex-direction:column;align-items:center;flex:1;}
.csub-step-dot{width:10px;height:10px;border-radius:50%;border:2px solid var(--border2);background:var(--bg4);}
.csub-step-dot.done{background:var(--good);border-color:var(--good);}
.csub-step-dot.active{background:var(--watch);border-color:var(--watch);box-shadow:0 0 0 3px rgba(212,169,64,.2);}
.csub-step-label{font-size:8px;color:var(--text3);margin-top:3px;text-align:center;white-space:nowrap;}
.csub-step-label.done{color:var(--good);}
.csub-step-label.active{color:var(--watch);font-weight:600;}
.csub-connector{height:2px;flex:1;background:var(--border);margin-bottom:13px;}
.csub-connector.done{background:var(--good);}
```

### Staleness Bar

```css
.sbar{height:3px;border-radius:2px 2px 0 0;}
.sb-fresh{background:var(--good);}
.sb-warm{background:var(--watch);}
.sb-stale{background:var(--attn);}
.sb-dead{background:var(--urgent);}
```

### Bottom Stat Bar (sum-bar)

```css
.sum-bar{display:flex;border-top:2px solid rgba(201,149,42,0.25);background:var(--bg);flex-shrink:0;box-shadow:0 -2px 20px rgba(0,0,0,.4);}
.sb2{flex:1;padding:8px 12px;border-right:1px solid var(--border2);}
.sb2:last-child{border-right:none;}
.sl{font-size:9px;text-transform:uppercase;letter-spacing:.07em;color:var(--text3);font-weight:700;margin-bottom:3px;}
.sv{font-size:18px;font-weight:800;font-variant-numeric:tabular-nums;letter-spacing:-.02em;}
.ss{font-size:9px;color:var(--text3);margin-top:1px;}
.sb2.goal-block{background:rgba(58,185,122,0.04);border-right-color:var(--good-b);}
```

### Manager Bar (mgr-bar)

```css
.mgr-bar{display:flex;border-top:1px solid var(--border);background:var(--bg2);flex-shrink:0;}
.mc{flex:1;padding:5px 10px;border-right:1px solid var(--border);}
.mc:last-child{border-right:none;}
.ml{font-size:9px;text-transform:uppercase;letter-spacing:.06em;color:var(--text3);font-weight:600;margin-bottom:3px;}
.mr2{display:flex;flex-direction:column;gap:3px;}
.mri{display:flex;align-items:center;gap:5px;font-size:11px;}
.mgr-val{font-size:12px;font-weight:600;}
```

### Simple/Execution Mode Overrides

```css
/* Execution mode shows everything */
body.execution-view .rep-ownership{display:flex;}
body.execution-view .tags{display:flex;}
body.execution-view .sbar{display:block;}

/* Simple mode hides clutter */
body.simple-view .funded-meta{display:none;}
body.simple-view .rep-primary-label{display:none;}
body.simple-view .rep-assist-list{display:none;}
body.simple-view .rep-ownership{padding:2px 6px;background:transparent;}
body.simple-view .tags{display:none;}
body.simple-view .n-tag{display:none;}
body.simple-view .mgr-bar{display:none !important;}
body.simple-view .sum-bar{display:none !important;}
```

---

## 7. ALL TEAM VIEW JAVASCRIPT

### Helper Functions

```js
function fmt$(n){return n>=1000000?`$${(n/1e6).toFixed(2)}M`:n>=1000?`$${(n/1000).toFixed(0)}k`:'$0';}

function tCls(t){return{MCA:'t-mca',SBA:'t-sba',HELOC:'t-hel',Equipment:'t-eq',Conventional:'t-con'}[t]||'t-mca';}

function getProduct(deal) {
  const t = (deal.types||[])[0];
  return PRODUCTS[t] || PRODUCTS.MCA;
}

function goalProgress(funded, goal) {
  if (!goal || goal <= 0) return null;
  const pct = Math.min(Math.round((funded / goal) * 100), 100);
  const raw = (funded / goal) * 100;
  const cls = raw >= 80 ? 'on-track' : raw >= 50 ? 'at-risk' : 'behind';
  const barColor = raw >= 80 ? 'var(--good)' : raw >= 50 ? 'var(--watch)' : 'var(--urgent)';
  return {pct, cls, barColor, raw};
}
```

### Nurture Tags Config & Builder

```js
const NURTURE_TAG_CONFIG = {
  seasonal:     {label:'Seasonal',   icon:'🌊', cls:'nt-seasonal'},
  'low-credit': {label:'Low Credit', icon:'⚠',  cls:'nt-low-credit'},
  're engage':  {label:'Re-Engage',  icon:'↩',  cls:'nt-re-engage'},
  're-engage':  {label:'Re-Engage',  icon:'↩',  cls:'nt-re-engage'},
  'waiting-docs':{label:'Waiting Docs',icon:'📋',cls:'nt-waiting-docs'},
  timing:       {label:'Timing',     icon:'⏰', cls:'nt-timing'},
  competitor:   {label:'Competitor', icon:'⚔',  cls:'nt-competitor'},
};

function nurtureTags(deal) {
  if (deal.stage !== 'Nurture' || !deal.nurtureTag) return '';
  const cfg = NURTURE_TAG_CONFIG[deal.nurtureTag];
  if (!cfg) return '';
  return `<div style="margin-bottom:3px;"><span class="n-tag ${cfg.cls}">${cfg.icon} ${cfg.label}</span></div>`;
}
```

### Funded Meta Builder

```js
function fundedMeta(deal) {
  if (deal.stage !== 'Funded') return '';
  const fe = deal.fundingEventId ? getFE(deal.fundingEventId) : null;
  const cycleHtml = deal.cycleTime ? `<span class="funded-cycle">⚡ ${deal.cycleTime}d cycle</span>` : '';
  const funder = fe ? fe.funder : '';
  const fdate = fe ? fe.fundedDate : '';
  return `<div class="funded-meta">${fdate?`<span>${fdate}</span>`:''}${funder?`<span>· ${funder}</span>`:''}${cycleHtml}</div>`;
}
```

### Offer Block Builder

```js
function offerTier(amount) {
  if (amount >= 300000) return 'strong';
  if (amount >= 100000) return 'mid';
  return 'weak';
}
function offerTierClass(amount) { return 'ob-' + offerTier(amount); }

function expiryLabel(days) {
  if (days === null || days === undefined) return '';
  if (days <= 1) return `<span class="ob-expiry ob-exp-urgent">⏳ Expires tomorrow</span>`;
  if (days <= 3) return `<span class="ob-expiry ob-exp-soon">⏳ ${days}d left</span>`;
  return `<span class="ob-expiry ob-exp-ok">✓ ${days}d left</span>`;
}

function amtColor(amount) {
  const t=offerTier(amount); return t==='strong'?'g':t==='mid'?'w':'u';
}

function buildOfferBlock(deal) {
  const s = deal.stage;
  const isNB = s === 'Approved / Offers' || s === 'Committed (Funding)';
  const isNurture = s === 'Nurture';
  const isFunded = s === 'Funded';
  if (!isNB && !isNurture && !isFunded) return '';

  if (isFunded && deal.offer) {
    const fe = deal.fundingEventId ? getFE(deal.fundingEventId) : null;
    return `<div class="funded-block"><div class="fb-amount">💰 ${fmt$(deal.offer)}</div>${fe?`<div class="fb-meta">Funded ${fe.fundedDate} · ${fe.funder}</div>`:''}</div>`;
  }

  if (isNurture) {
    const stale = deal.stale || 0;
    let decayCls = '', decayLabel = '';
    if (stale >= 90) { decayCls='nd-90'; decayLabel=`🔴 ${stale}d since last touch`; }
    else if (stale >= 60) { decayCls='nd-60'; decayLabel=`🟠 ${stale}d since last touch`; }
    else if (stale >= 30) { decayCls='nd-30'; decayLabel=`🟡 ${stale}d since last touch`; }
    const decayHtml = decayCls ? `<div><span class="nd-pill ${decayCls}">${decayLabel}</span></div>` : '';
    if (deal.prevOffer) {
      return `<div class="prev-block">
        <div class="pb-amount">💰 ${fmt$(deal.prevOffer)} prev offer</div>
        <div class="pb-label">Re-engage to requalify</div>
        ${decayHtml}
      </div>`;
    }
    return decayHtml;
  }

  const offers = deal.offers || [];
  if (!offers.length) return '';
  const sorted = [...offers].sort((a,b)=>b.amount-a.amount);
  const best = sorted[0], worst = sorted[sorted.length-1];
  const topTier = offerTierClass(best.amount);

  if (offers.length === 1) {
    const o = offers[0];
    return `<div class="offer-block ${topTier}"><div class="ob-main"><span class="ob-amount">💰 ${fmt$(o.amount)}</span>${expiryLabel(o.expiryDays)}</div><div class="ob-tags"><span class="ob-lender">${o.lender} · ${o.term}mo · ${o.rate}</span></div></div>`;
  }

  const rangeStr = best.amount !== worst.amount ? `${fmt$(worst.amount)} – ${fmt$(best.amount)}` : fmt$(best.amount);
  const offerRows = sorted.map(o=>{
    const isBest=o.id===best.id;
    return `<div class="ob-multi-row"><span class="ob-ml">${isBest?'⭐ ':''}${o.lender}</span><div style="display:flex;align-items:center;gap:5px;"><span class="ob-ma ${amtColor(o.amount)}">${fmt$(o.amount)}</span>${expiryLabel(o.expiryDays)}</div></div>`;
  }).join('');
  return `<div class="offer-block ${topTier}"><div class="ob-main"><span class="ob-range-amount">💰 ${rangeStr}</span><span style="font-size:9px;color:var(--text3);">${offers.length} offers</span></div><div style="margin-top:5px;border-top:1px solid rgba(255,255,255,.05);padding-top:4px;">${offerRows}</div></div>`;
}
```

### Main renderTeam() Function (Full)

```js
function renderTeam() {
  // ── DATA ──
  const allDeals = deals;
  const nb = allDeals.filter(d=>PIPELINE_STAGES.includes(d.stage)).sort((a,b)=>{
    const ao=(a.offers||[])[0]?.amount||0, bo=(b.offers||[])[0]?.amount||0;
    return bo-ao;
  });
  const fn = allDeals.filter(d=>d.stage==='Funded').sort((a,b)=>(b.offer||0)-(a.offer||0));
  const nurture = allDeals.filter(d=>d.stage==='Nurture').sort((a,b)=>(b.prevOffer||0)-(a.prevOffer||0));

  const pipe = nb.reduce((a,d)=>a+((d.offers||[])[0]?.amount||0),0);
  const ftotal = fn.reduce((a,d)=>a+(d.offer||0),0);
  const nurtureTotal = nurture.reduce((a,d)=>a+(d.prevOffer||0),0);

  // Active = all non-Funded, non-Closed, non-Nurture
  const activeCt = allDeals.filter(d=>!['Funded','Closed','Nurture'].includes(d.stage)).length;

  const teamGoal = goals.team.monthlyGoal;
  const teamGP = goalProgress(ftotal, teamGoal);

  // Per-rep stats
  const repFunded = {}, repActive = {}, repNurture = {};
  ['JB','HA','NU'].forEach(r => {
    repFunded[r]  = fn.filter(d=>d.rep===r).reduce((a,d)=>a+(d.offer||0),0);
    repActive[r]  = allDeals.filter(d=>d.rep===r&&!['Funded','Closed','Nurture'].includes(d.stage)).length;
    repNurture[r] = allDeals.filter(d=>d.rep===r&&d.stage==='Nurture').length;
  });

  // ── TILE BUILDER ──
  const tile = (d, extra='', mode='nb') => {
    const primaryRep = REPS[d.rep]||REPS.JB;
    const fe = d.fundingEventId ? getFE(d.fundingEventId) : null;
    const offerAmt = d.stage==='Funded' ? d.offer : ((d.offers||[])[0]?.amount||0);
    const offerCount = (d.offers||[]).length;
    const coReps = (d.coReps||[]).map(r=>REPS[r]).filter(Boolean);
    const coRepHtml = coReps.length ? `<span class="dt-co-badge">+ ${coReps.map(r=>r.name.split(' ')[0]).join(', ')}</span>` : '';
    const repSection = `<div class="dt-reps"><span class="dt-rep-primary" style="color:${primaryRep.color};">${primaryRep.name}</span>${coRepHtml}</div>`;

    if (mode === 'nurture') {
      const p = getProduct(d);
      return `<div class="deal-tile" style="border-left:2px solid var(--info-b);border-radius:0 var(--r) var(--r) 0;">
<div class="dt-biz">${d.biz||d.name}</div>
<div style="font-size:14px;font-weight:700;color:var(--text2);font-variant-numeric:tabular-nums;">${d.prevOffer?fmt$(d.prevOffer)+' prev':'No offer'}</div>
<div class="dt-meta"><span class="prod-badge" style="background:${p.bg};color:${p.color};font-size:9px;">${p.icon} ${p.label}</span></div>
${d.lostReason?`<div style="font-size:9px;color:var(--attn);margin-top:3px;">${d.lostReason}</div>`:''}
${repSection}
</div>`;
    }

    return `<div class="deal-tile${d.stage==='Funded'?' funded-tile':' nb-tile'}${extra}">
<div class="dt-biz">${d.biz||d.name}</div>
<div class="dt-offer">${fmt$(offerAmt)}</div>
<div class="dt-meta">${(d.types||[]).map(t=>`<span class="t ${tCls(t)}">${t}</span>`).join('')}${offerCount>1?`<span class="t" style="background:var(--good-bg);color:var(--good);">${offerCount} offers</span>`:''}</div>
${repSection}
${fe?`<div class="dt-fd">Funded ${fe.fundedDate} · ${fe.funder}</div>`:''}
</div>`;
  };

  // ── REP SCOREBOARD ROWS ──
  const repScoreboard = ['JB','HA','NU'].map(rk => {
    const rp = REPS[rk];
    const rFunded = repFunded[rk];
    const rGoal = goals[rk]?.monthlyGoal || 0;
    const rgp = goalProgress(rFunded, rGoal);
    const barHtml = rgp ? `<div class="goal-bar-track" style="margin-top:5px;"><div class="goal-bar-fill" style="width:${rgp.pct}%;background:${rgp.barColor}"></div></div>` : '';
    return `<div style="flex:1;padding:10px 12px;border-right:1px solid var(--border);min-width:0;">
  <div style="display:flex;align-items:center;gap:6px;margin-bottom:6px;">
    <div class="av" style="background:${rp.bg};color:${rp.color};width:20px;height:20px;font-size:9px;">${rk}</div>
    <span style="font-size:11px;font-weight:600;">${rp.name}</span>
  </div>
  <div style="display:grid;grid-template-columns:1fr 1fr 1fr;gap:6px;margin-bottom:5px;">
    <div>
      <div style="font-size:9px;color:var(--text3);margin-bottom:1px;">Funded MTD</div>
      <div style="font-size:14px;font-weight:800;color:var(--good);font-variant-numeric:tabular-nums;">${fmt$(rFunded)}</div>
    </div>
    <div>
      <div style="font-size:9px;color:var(--text3);margin-bottom:1px;">Active</div>
      <div style="font-size:14px;font-weight:800;color:var(--info);">${repActive[rk]}</div>
    </div>
    <div>
      <div style="font-size:9px;color:var(--text3);margin-bottom:1px;">Nurture</div>
      <div style="font-size:14px;font-weight:800;color:var(--text2);">${repNurture[rk]}</div>
    </div>
  </div>
  <div style="font-size:9px;color:var(--text3);">Goal: ${fmt$(rGoal)}${rgp?` · <span style="color:${rgp.barColor};font-weight:600;">${rgp.pct}%</span>`:''}</div>
  ${barHtml}
</div>`;
  }).join('');

  // ── GOAL BAR ──
  const teamGoalBar = teamGP ? `<div class="goal-bar-wrap" style="margin-top:8px;">
    <div class="goal-bar-track"><div class="goal-bar-fill" style="width:${teamGP.pct}%;background:${teamGP.barColor}"></div></div>
    <div class="goal-pct ${teamGP.cls}">${teamGP.pct}% of ${fmt$(teamGoal)} monthly team goal</div>
  </div>` : '';

  // ── CONVERSION ──
  const totalDeployed = ftotal + pipe;
  const convEfficiency = totalDeployed > 0 ? Math.round((ftotal / totalDeployed) * 100) : 0;
  const convColor = convEfficiency >= 60 ? 'var(--good)' : convEfficiency >= 40 ? 'var(--watch)' : 'var(--urgent)';

  // ── STAT CARD HELPER ──
  const statCard = (label, value, sub, color) => `<div style="background:var(--bg4);border-radius:8px;padding:10px 14px;flex:1;min-width:0;">
  <div style="font-size:9px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px;">${label}</div>
  <div style="font-size:20px;font-weight:800;color:${color};font-variant-numeric:tabular-nums;">${value}</div>
  ${sub?`<div style="font-size:9px;color:var(--text3);margin-top:2px;">${sub}</div>`:''}
</div>`;

  document.getElementById('teamWrap').innerHTML = `
<div style="margin-bottom:14px;">
  <div style="font-size:16px;font-weight:700;margin-bottom:2px;">SCL Team Pipeline</div>
  <div style="font-size:11px;color:var(--text2);">All stages · no contact info</div>
</div>

<!-- TOP STATS ROW -->
<div style="display:flex;gap:8px;margin-bottom:12px;flex-wrap:wrap;">
  ${statCard('Funded MTD', fmt$(ftotal), `Goal: ${fmt$(teamGoal)}`, 'var(--good)')}
  ${statCard('Active Pipeline $', fmt$(pipe), 'Approved + Committed', 'var(--gold)')}
  ${statCard('Active Deals', activeCt, 'All stages excl. funded', 'var(--info)')}
  ${statCard('Nurture Pool', fmt$(nurtureTotal), `${nurture.length} deals · prev offer totals`, 'var(--text2)')}
  ${statCard('Deals Funded', fn.length, 'This month', 'var(--good)')}
  ${statCard('Conversion', convEfficiency+'%', 'Funded / deployed', convColor)}
</div>

<!-- GOAL BAR -->
<div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);padding:10px 16px;margin-bottom:12px;">
  ${teamGoalBar}
</div>

<!-- REP SCOREBOARD -->
<div style="background:var(--bg3);border:1px solid var(--border);border-radius:var(--r);margin-bottom:14px;overflow:hidden;">
  <div style="padding:8px 12px;border-bottom:1px solid var(--border);font-size:9px;font-weight:700;text-transform:uppercase;letter-spacing:.05em;color:var(--text3);">Rep Scoreboard</div>
  <div style="display:flex;">
    ${repScoreboard}
  </div>
</div>

<!-- ACTIVE OFFERS -->
${nb.length?`<div style="margin-bottom:14px;">
  <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text3);margin-bottom:7px;">Active Offers — ${fmt$(pipe)} in play · ${nb.length} deals</div>
  <div class="team-cards">${nb.map((d,i)=>tile(d,i===0?' top-tile':'')).join('')}</div>
</div>`:''}

<!-- FUNDED DEALS -->
${fn.length?`<div style="margin-bottom:14px;">
  <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text3);margin-bottom:7px;">Funded This Month — originating rep shown bold</div>
  <div class="team-cards">${fn.map(d=>tile(d)).join('')}</div>
</div>`:''}

<!-- NURTURE POOL -->
${nurture.length?`<div>
  <div style="font-size:11px;font-weight:600;text-transform:uppercase;letter-spacing:.05em;color:var(--text3);margin-bottom:7px;">Nurture Pool — ${nurture.length} deals · ${fmt$(nurtureTotal)} prev offer value</div>
  <div class="team-cards">${nurture.map(d=>tile(d,'','nurture')).join('')}</div>
</div>`:''}`;
}
```

### Bottom Stat Bar (renderSum)

```js
function renderSum() {
  if (currentViewMode === 'simple') { document.getElementById('sumBar').style.display='none'; return; }
  document.getElementById('sumBar').style.display='flex';
  const my = visibleDeals();
  const pipe = my.filter(d=>PIPELINE_STAGES.includes(d.stage)).reduce((a,d)=>a+((d.offers||[])[0]?.amount||d.offer||0),0);
  const funded = my.filter(d=>d.stage==='Funded').reduce((a,d)=>a+(d.offer||0),0);
  const od = my.filter(d=>d.duePri==='od').length;
  const hot = my.filter(d=>isHot(d)).length;
  const renew = my.filter(d=>d.duePri==='renew'||(d.badges||[]).includes('RENEW')).length;
  const mna = my.filter(d=>d.duePri==='missing').length;
  const lifetime = clients.reduce((a,c)=>a+c.totalFunded,0);

  const repKey = currentRole==='rep' ? 'JB' : currentRole==='rep2' ? 'HA' : null;
  const goalKey = repKey || 'team';
  const monthGoal = goals[goalKey]?.monthlyGoal || 0;
  const gp = goalProgress(funded, monthGoal);
  const goalBarHtml = gp ? `<div class="goal-bar-wrap">
    <div class="goal-bar-track"><div class="goal-bar-fill" style="width:${gp.pct}%;background:${gp.barColor}"></div></div>
    <div class="goal-pct ${gp.cls}">${gp.pct}% of ${fmt$(monthGoal)} monthly goal</div>
  </div>` : '';

  const fundedBlock = `<div class="sb2 goal-block">
    <div class="sl">Funded MTD</div>
    <div class="sv" style="color:var(--good)">${fmt$(funded)}</div>
    <div class="ss">Goal: ${fmt$(monthGoal)}</div>
    ${goalBarHtml}
  </div>`;

  const atRisk = my.filter(d=>PIPELINE_STAGES.includes(d.stage)&&(d.duePri==='od'||d.duePri==='missing'||d.stale>=5));
  const atRiskAmt = atRisk.reduce((a,d)=>a+((d.offers||[])[0]?.amount||0),0);

  const blocks = [
    {l:'Active Pipeline',v:fmt$(pipe),s:'Approved + Committed',c:'var(--good)'},
    null, // funded block handled separately
    {l:'Lifetime Funded',v:fmt$(lifetime),s:'All clients',c:'var(--gold)'},
    {l:'⚠ At Risk',v:fmt$(atRiskAmt),s:'Overdue / stale / no action',c:atRiskAmt>0?'var(--urgent)':'var(--text3)'},
    {l:'🔥 Hot',v:hot,s:'Offer / replied / engaged',c:'var(--hot)'},
    {l:'No Next Action',v:mna,s:'Blocking progress',c:'var(--urgent)'},
    {l:'Renewals Due',v:renew,s:'Re-engage funded',c:'var(--good)'},
    {l:'🔁 Queue Today',v:(()=>{const q=visibleDeals().filter(d=>d.followUpDate&&daysFromToday(d.followUpDate)<=0);return q.length;})(),s:'Scheduled follow-ups due',c:'var(--info)'},
  ];

  document.getElementById('sumBar').innerHTML = blocks.map((b,i)=> {
    if (i===1) return fundedBlock;
    return `<div class="sb2"><div class="sl">${b.l}</div><div class="sv" style="color:${b.c}">${b.v}</div><div class="ss">${b.s}</div></div>`;
  }).join('');
}
```

### Manager Bar (renderMgr)

```js
function renderMgr() {
  if (currentView==='team' || currentViewMode==='simple') { document.getElementById('mgrBar').style.display='none'; return; }
  document.getElementById('mgrBar').style.display='flex';
  if (currentRole!=='admin') { document.getElementById('mgrBar').innerHTML=''; return; }
  const reps = ['JB','HA','NU'];
  let h = `<div class="mc"><div class="ml">Rep</div><div class="mr2">${reps.map(r=>{const rp=REPS[r];return`<div class="mri"><div class="av" style="width:15px;height:15px;background:${rp.bg};color:${rp.color};font-size:7px;">${r}</div>${rp.name}</div>`;}).join('')}</div></div>`;
  [{l:'Active',fn:r=>deals.filter(d=>d.rep===r&&!['Funded','Closed'].includes(d.stage)).length,c:'var(--text)'},
   {l:'Overdue',fn:r=>deals.filter(d=>d.rep===r&&(d.duePri==='od'||d.duePri==='renew')).length,c:'var(--urgent)'},
   {l:'🔥 Hot',fn:r=>deals.filter(d=>d.rep===r&&isHot(d)).length,c:'var(--hot)'},
   {l:'Pipeline $',fn:r=>{const t=deals.filter(d=>d.rep===r&&PIPELINE_STAGES.includes(d.stage)).reduce((a,d)=>a+((d.offers||[])[0]?.amount||0),0);return t?fmt$(t):'$0';},c:'var(--good)'},
   {l:'Funded MTD',fn:r=>{const t=deals.filter(d=>d.rep===r&&d.stage==='Funded').reduce((a,d)=>a+(d.offer||0),0);return t?fmt$(t):'$0';},c:'var(--good)'},
   {l:'Shared',fn:r=>deals.filter(d=>(d.coReps||[]).includes(r)&&d.rep!==r).length,c:'var(--info)'},
  ].forEach(col => {
    h += `<div class="mc"><div class="ml">${col.l}</div><div class="mr2">${reps.map(r=>{const v=col.fn(r);const dim=v==='$0'||v===0;return`<div class="mri"><span class="mgr-val" style="color:${dim?'var(--text3)':col.c}">${v}</span></div>`;}).join('')}</div></div>`;
  });
  // Goal progress column
  h += `<div class="mc"><div class="ml">MTD Goal %</div><div class="mr2">${reps.map(r=>{
    const funded=deals.filter(d=>d.rep===r&&d.stage==='Funded').reduce((a,d)=>a+(d.offer||0),0);
    const g=goals[r]?.monthlyGoal||0;
    const gp=goalProgress(funded,g);
    if(!gp)return`<div class="mri"><span class="mgr-val" style="color:var(--text3)">—</span></div>`;
    return`<div class="mri" style="flex-direction:column;align-items:flex-start;gap:2px;">
      <span class="mgr-val" style="color:${gp.barColor}">${gp.pct}%</span>
      <div style="width:60px;"><div class="goal-bar-track"><div class="goal-bar-fill" style="width:${gp.pct}%;background:${gp.barColor}"></div></div></div>
    </div>`;
  }).join('')}</div></div>`;
  document.getElementById('mgrBar').innerHTML = h;
}
```

### Goal Modal Functions

```js
function openGoals() {
  document.getElementById('g-team-mo').value = fmt$(goals.team.monthlyGoal);
  document.getElementById('g-team-yr').value = fmt$(goals.team.annualGoal);
  const rows = ['JB','HA','NU'].map(rk => {
    const rp = REPS[rk];
    return `<div class="goal-rep-row">
      <div class="goal-rep-name" style="color:${rp.color};">${rp.name}</div>
      <div style="flex:1;">
        <div class="goal-inp-label">Monthly Target</div>
        <input class="goal-inp" id="g-${rk}-mo" type="text" value="${fmt$(goals[rk]?.monthlyGoal||0)}">
      </div>
      <div style="flex:1;margin-left:8px;">
        <div class="goal-inp-label">Annual Target</div>
        <input class="goal-inp" id="g-${rk}-yr" type="text" value="${fmt$(goals[rk]?.annualGoal||0)}">
      </div>
    </div>`;
  }).join('');
  document.getElementById('goalRepRows').innerHTML = rows;
  document.getElementById('goalsMod').classList.add('open');
}

function closeGoals(){document.getElementById('goalsMod').classList.remove('open');}

function parseGoalAmt(str){
  const s=str.replace(/[$,\s]/g,'').toLowerCase();
  if(s.endsWith('m'))return Math.round(parseFloat(s)*1000000);
  if(s.endsWith('k'))return Math.round(parseFloat(s)*1000);
  return Math.round(parseFloat(s))||0;
}

function saveGoals(){
  goals.team.monthlyGoal=parseGoalAmt(document.getElementById('g-team-mo').value);
  goals.team.annualGoal=parseGoalAmt(document.getElementById('g-team-yr').value);
  ['JB','HA','NU'].forEach(rk=>{
    goals[rk].monthlyGoal=parseGoalAmt(document.getElementById('g-'+rk+'-mo').value);
    goals[rk].annualGoal=parseGoalAmt(document.getElementById('g-'+rk+'-yr').value);
  });
  closeGoals();render();toast('Goals updated');
}
```

### View Toggle & Render

```js
function setView(v){
  currentView=v;
  activeFilter='all';
  document.getElementById('queueBtn').classList.toggle('act', v==='queue');
  render();
  if (v==='queue') updateQueueBadge();
}

function renderViewSw() {
  document.getElementById('viewSw').innerHTML = `
<button class="vs${currentView==='pipeline'?' act':''}" onclick="setView('pipeline')">My Pipeline</button>
<button class="vs${currentView==='team'?' act team-act':''}" onclick="setView('team')">Team Pipeline</button>
${currentRole==='admin'?`<button class="vs${currentView==='all'?' act':''}" onclick="setView('all')">All Deals</button>`:''}`;
}

function renderBanner() {
  // ... (truncated - see banner logic above)
  document.getElementById('banner').innerHTML = currentView==='team'
    ? `<span class="vb" style="background:var(--good-bg);color:var(--good);border:1px solid var(--good-b);">Team Pipeline</span><span class="btext">Shared view · Approved/Offers + Committed + Funded only · no contact info</span>`
    : `<span class="vb" style="${b.style}">${b.badge}</span><span class="btext">${b.text}${filterNote}</span>`;
}

function render() {
  renderBanner(); renderViewSw(); renderFilters();
  const isQueue = currentView==='queue';
  const isTeam  = currentView==='team';
  document.getElementById('boardWrap').style.display  = (!isTeam&&!isQueue)?'block':'none';
  document.getElementById('teamWrap').style.display   = isTeam?'block':'none';
  document.getElementById('queueWrap').style.display  = isQueue?'block':'none';
  document.getElementById('addBtn').style.display     = (isTeam||isQueue)?'none':'';
  if (isTeam)  { renderTeam(); }
  else if (isQueue) { renderQueue(); }
  else { renderBoard(); }
  renderMgr(); renderSum();
  updateQueueBadge();
}
```

---

## 8. HTML STRUCTURE

### Team View Container

```html
<div id="teamWrap" class="team-view" style="display:none;"></div>
```

### Bottom Bars

```html
<div class="mgr-bar" id="mgrBar"></div>
<div class="sum-bar" id="sumBar"></div>
```

### Goals Modal

```html
<div class="modal-ov" id="goalsMod">
  <div class="modal goal-modal">
    <div class="modal-title">⚡ Team Goals — Admin Only <button class="modal-close" onclick="closeGoals()">×</button></div>
    <div style="font-size:11px;color:var(--text2);margin-bottom:14px;">Set monthly funded targets for each rep and the team. Only you can edit these — reps see their own goal and progress.</div>
    <div style="font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin-bottom:8px;">Team Goal</div>
    <div class="goal-rep-row">
      <div class="goal-rep-name" style="color:var(--gold);">🏆 Full Team</div>
      <div style="flex:1;">
        <div class="goal-inp-label">Monthly Target</div>
        <input class="goal-inp" id="g-team-mo" type="text" placeholder="$5,800,000">
      </div>
      <div style="flex:1;margin-left:8px;">
        <div class="goal-inp-label">Annual Target</div>
        <input class="goal-inp" id="g-team-yr" type="text" placeholder="$70,000,000">
      </div>
    </div>
    <div style="font-size:10px;color:var(--text3);font-weight:600;text-transform:uppercase;letter-spacing:.05em;margin:12px 0 8px;">Rep Goals</div>
    <div id="goalRepRows"></div>
    <div class="mfoot"><button class="btn-c" onclick="closeGoals()">Cancel</button><button class="btn-s" onclick="saveGoals()">Save Goals</button></div>
  </div>
</div>
```

---

## 9. COLOR REFERENCE (Quick Lookup)

| Element | Color | Hex/Var |
|---------|-------|---------|
| Rep JB (Jonathan Baker) | Gold | `#C9952A` / `rgba(201,149,42,0.18)` |
| Rep HA (Hassan Anadu) | Blue | `#4A9EE8` / `rgba(74,158,232,0.16)` |
| Rep NU (Nkem Udeh) | Purple | `#9B72E8` / `rgba(155,114,232,0.16)` |
| Funded / Good | Green | `#3AB97A` / `var(--good)` |
| Hot | Orange-Red | `#FF5722` / `var(--hot)` |
| Gold / Primary | Gold | `#C9952A` / `var(--gold)` |
| Info / Active | Blue | `#4A9EE8` / `var(--info)` |
| Watch / Warning | Amber | `#D4A940` / `var(--watch)` |
| Attention | Orange | `#D06828` / `var(--attn)` |
| Urgent / Overdue | Red | `#E24B4A` / `var(--urgent)` |
| Purple | Purple | `#9B72E8` / `var(--purple)` |
| Goal on-track | `var(--good)` | ≥80% |
| Goal at-risk | `var(--watch)` | 50-79% |
| Goal behind | `var(--urgent)` | <50% |
| Offer strong | Green border | `≥$300k` |
| Offer mid | Gold border | `$100k-$299k` |
| Offer weak | Orange border | `<$100k` |
