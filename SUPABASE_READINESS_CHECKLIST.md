# Supabase deployment-readiness checklist — 180news CMS ↔ news app

**Checked:** 2026-11-18 (automated probe)  
**Project:** `https://jqlxtgueyporvqtrscne.supabase.co`  
**Result: READY** — no blockers. CMS can serve the public news app via `/api/public` and desk APIs.

Machine-readable copy: `SUPABASE_READINESS_CHECKLIST.json`

---

## 1. Environment variables

| Variable | Required | Status |
|----------|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | Yes | ✅ set |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Yes | ✅ set |
| `VITE_SUPABASE_URL` | Yes | ✅ set |
| `VITE_SUPABASE_ANON_KEY` | Yes | ✅ set |
| `SUPABASE_SERVICE_ROLE_KEY` | Recommended (admin/team) | ⚠️ not in local `.env`; Vercel runtime may inject (see `/api/health` → `hasServiceKey`) |
| `VITE_GOOGLE_CLIENT_ID` | Optional | ✅ set |
| `VITE_GOOGLE_AUTH_PROXY` | Optional | ✅ set |

Also mirrored in `vercel.json` → `env` for Vercel/GitHub deploys. Template: `.env.example`.

---

## 2. Tables + seed data (all present)

| Table | Rows (approx) | Purpose | Status |
|-------|---------------|---------|--------|
| `sections` | 10 | Categories (CMS + site) | ✅ |
| `articles` | 11 (8 published) | Stories for news app | ✅ |
| `authors` | 6 | Bylines | ✅ |
| `profiles` | 6 | Staff directory (email/phone/title) | ✅ |
| `team_members` | 1 | CMS roles | ✅ |
| `media_assets` | 0 | Media library (bucket ready) | ✅ empty OK |
| `comments` | 3 | Reader comments | ✅ |
| `settings` | 10 keys | crawl, contact, ads, site_link… | ✅ |
| `ads` | 6 slots | Banner positions + sizes | ✅ |
| `ad_rates` | 6 | CPC/CPM (ZAR) | ✅ |
| `ad_clicks` | 16+ | Per-click analytics | ✅ |
| `ad_impressions` | 73+ | Impression analytics | ✅ |
| `page_visits` | 46+ | Page analytics | ✅ |
| `article_views` | 120+ | Story reads | ✅ |
| `staff_mail` | 1+ | Per-profile inbox | ✅ |
| `notifications` | 1+ | Desk alerts | ✅ |
| `notification_prefs` | 3 | Email prefs | ✅ |

**Ad slots seeded:** `top`, `bottom`, `mid`, `sidebar`, `inarticle`, `mobile`  
**Settings keys:** crawl, notice, elections_update, contact, comments, ads_enabled, live_updates, homepage, site_link, email_notifications

---

## 3. Relationships (FK embeds verified)

| Relationship | Status |
|--------------|--------|
| `comments.article_id` → `articles` | ✅ |
| `ad_clicks.ad_id` → `ads` | ✅ |
| `ad_impressions.ad_id` → `ads` | ✅ |
| `ad_rates.ad_id` → `ads` | ✅ |
| `article_views.article_id` → `articles` | ✅ |

---

## 4. RLS policies (applied + anon verified)

Public **SELECT** (news app / anon key): `articles`, `sections`, `profiles`, `ads`, `settings`, `authors`  
Public **INSERT** (tracking): `page_visits`, `ad_clicks`, `ad_impressions`  

Anon read smoke: all content tables readable with anon key.

---

## 5. Storage

| Bucket | Public | Status |
|--------|--------|--------|
| `news-media` | yes | ✅ reachable (`storage.from('news-media').list`) |

Used by CMS media uploads (images / short video / audio).

---

## 6. Auth + admin seed

| Check | Status |
|-------|--------|
| Login `owner@180news.co.za` / `newsroom180` | ✅ |
| `team_members` role `owner` | ✅ Kabelo Zwelibuyile Hlongwane |
| Contact email on profile | ✅ `zweli@180news.co.za` |

Roles supported in app: `owner` · `editor` · `writer`.

---

## 7. CMS ↔ news app connection path

| Endpoint | Role |
|----------|------|
| `GET /api/public` | Homepage feed (lead, headlines, sections, ads, crawl) |
| `GET /api/public?resource=articles\|article\|sections\|directory\|ads\|settings\|config` | Public resources |
| `POST /api/track` | page / ad_click / ad_impression |
| Desk `/api/articles`, `/api/ads`, `/api/dashboard`, `/api/mail`, … | Authenticated CMS |

Live preview split-screen loads `/site`, which consumes the same public APIs.

---

## 8. How to re-run this checklist

```bash
node --input-type=module <<'JS'
// or: curl -s https://YOUR_DEPLOY/api/health | jq .
JS
curl -s https://YOUR_DEPLOY/api/health
curl -s https://YOUR_DEPLOY/api/public | head
```

**Verdict:** Supabase tables, seed/admin data, relationships, RLS, storage bucket, and required env vars are in place for Vercel/GitHub deployment and for the CMS to connect to the news app.
