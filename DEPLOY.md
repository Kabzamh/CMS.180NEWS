# 180news CMS — Vercel + GitHub deployment

## Status
Live probe target: production deploy serves CMS + `/site` news app + `/api/*`.

**Owner:** Kabelo Zwelibuyile Hlongwane  
**Sign-in:** `owner@180news.co.za` / `newsroom180`  
**Contact email:** `zweli@180news.co.za`

## Build (must pass before push)
```bash
npm ci
npm run build    # tsc -b && vite build → dist/
```

## GitHub → Vercel
1. Push this repo to GitHub.
2. Vercel → Add New Project → Import the repo.
3. Framework preset: **Vite**
4. Build command: `npm run build`
5. Output directory: `dist`
6. Root directory: `.` (repo root)
7. Install command: `npm ci`

### Environment variables (Production + Preview + Development)
| Name | Required | Notes |
|------|----------|--------|
| `NEXT_PUBLIC_SUPABASE_URL` | **Yes** | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | **Yes** | Public anon key |
| `VITE_SUPABASE_URL` | **Yes** | Same URL (Vite client) |
| `VITE_SUPABASE_ANON_KEY` | **Yes** | Same anon key (Vite client) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Yes** for admin | Team invite, password reset, elevated API |
| `VITE_GOOGLE_CLIENT_ID` | Optional | Google sign-in |
| `VITE_GOOGLE_AUTH_PROXY` | Optional | OAuth proxy callback |
| `FULLSTACK_PROJECT_REF` | Optional | DB wake/restore |
| `FULLSTACK_RESTORE_API_URL` | Optional | DB wake/restore |

> Outbound SMTP is not required: staff mail + notifications are stored in Supabase (`staff_mail`, `notifications`) and work without a third-party email provider. Add SMTP later if you want external delivery.

See `.env.example` for a local template.

## Supabase schema (verified)
| Area | Tables |
|------|--------|
| Content | `sections`, `articles`, `authors`, `media_assets`, `comments`, `settings` |
| People / directory | `team_members`, `profiles` (email, phone, title, role) |
| Mail / notify | `staff_mail`, `notifications`, `notification_prefs` |
| Ads | `ads`, `ad_rates` (CPC/CPM), `ad_clicks`, `ad_impressions` |
| Analytics | `article_views`, `page_visits` |

## Roles
| Role | Access |
|------|--------|
| `owner` | Full desk, users, settings, ads, layout |
| `editor` | Publish, moderate, ads, layout, library |
| `writer` | Draft/edit own stories, media, account |

## Feature checklist (confirmed)
- [x] Production build (TypeScript + Vite) succeeds  
- [x] SPA rewrites in `vercel.json` (client routes → `index.html`, `/api` intact)  
- [x] Supabase URL + anon key present; service role used when available  
- [x] Auth + owner role (`owner@180news.co.za`)  
- [x] Publish articles; YouTube / short video / audio on stories  
- [x] Homepage layout, ads sizes, analytics (visits, impressions, clicks, CPC)  
- [x] Staff directory + per-profile mail + notification prefs  
- [x] Desktop split-screen: CMS | live `/site` preview  
- [x] Dashboard greeting + clock + 30s auto-refresh  
- [x] `GET /api/health` → readiness JSON  

## Post-deploy smoke test
```bash
curl -s https://YOUR_DOMAIN/api/health | jq .ok
curl -s https://YOUR_DOMAIN/api/public | jq .lead.headline
# Open /login → owner@180news.co.za / newsroom180
# Confirm split preview on desktop and Dashboard greeting
```
