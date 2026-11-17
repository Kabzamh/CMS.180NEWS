# Supabase PostgreSQL CMS Database Schema

This repository contains the complete PostgreSQL database schema designed for Supabase, powering digital publishing platforms, newsrooms, magazines, blogs, and editorial CMS systems.

## Files Included

1. **`supabase_schema.sql`**: The complete, standalone SQL script with:
   - PostgreSQL Extensions (`pgcrypto`, `uuid-ossp`, `pg_trgm`, `unaccent`)
   - Custom Enums (`user_role`, `article_status`, `comment_status`, `media_type`, `ad_type`, `ad_placement`, `ad_status`, `reaction_type`, `newsletter_frequency`)
   - 27 Fully Typed Tables with Foreign Key Constraints & Default Values
   - Performance Indexes (GIN Trigram fuzzy search, GIN TSVector full-text search, B-Tree indexes)
   - Trigger Functions (automatic `updated_at`, `auth.users` profile synchronization, statistics counters)
   - Stored Procedures / RPC Functions (`increment_article_views`, `track_ad_impression`, `track_ad_click`, `search_articles`)
   - Optimized Views (`view_published_articles`, `view_trending_articles`, `view_section_overview`)
   - Granular Row-Level Security (RLS) policies for anonymous visitors, authenticated subscribers, and staff members
   - Production Seed Data (default settings, standard editorial sections, popular tags, header/footer navigation menus)
2. **`database.types.ts`**: TypeScript definitions matching all tables, views, enums, and RPC functions for use with `@supabase/supabase-js`.

---

## Tables Overview

| Table | Description |
| :--- | :--- |
| `settings` | Key-value store for site info, branding, SEO defaults, social links, monetization, and feature toggles. |
| `profiles` | Extended user profile synchronized automatically with `auth.users`, including role-based access control. |
| `authors` | Dedicated author & contributor profiles with social links, bio, and publication metrics. |
| `team` | Masthead and editorial board members with departmental categorization, titles, and ordering. |
| `sections` | Hierarchical categories/taxonomy with nested `parent_id`, custom color codes, icons, and SEO metadata. |
| `tags` | Editorial tagging taxonomy with trending flag and automatic usage counters. |
| `articles` | Main editorial articles with status lifecycle, reading time, generated tsvector, and rich JSON content. |
| `article_authors` | Junction table supporting multi-author / co-author collaborations with specific editorial roles. |
| `article_tags` | Many-to-many junction table between articles and tags. |
| `article_revisions` | Version history and snapshot logs for editorial auditing and rollbacks. |
| `comments` | Threaded/nested discussions (`parent_id`) with moderation status, guest support, and vote tallies. |
| `comment_reactions` | Comment upvotes and downvotes with unique constraint per user. |
| `article_reactions` | Emoji reactions and likes per article. |
| `bookmarks` | User reading lists and saved articles. |
| `media_folders` | Digital Asset Management (DAM) folder tree. |
| `media` | Media library tracking Supabase Storage uploads, dimensions, captions, and MIME types. |
| `ad_campaigns` | Advertiser campaigns with budgets and date ranges. |
| `ads` | Ad units and creatives with placement slots, device targeting, section targeting, and impression caps. |
| `ad_impressions` | Telemetry logs for ad impressions. |
| `ad_clicks` | Telemetry logs for ad clicks. |
| `analytics_pageviews`| Real-time traffic analytics capturing UTM parameters, geo data, referrers, and dwell time. |
| `analytics_events` | Custom event logging (social shares, newsletter conversions, searches). |
| `daily_article_metrics`| Aggregated daily rollups for analytics dashboards and trending algorithms. |
| `newsletter_subscribers`| Newsletter subscriber management with section topic preferences and confirmation tokens. |
| `navigation_menus` | Dynamic navigation menus (header, footer, drawer) with nested JSON structures. |
| `redirects` | 301 and 302 URL redirection manager with hit count tracking. |
| `audit_logs` | Security and editorial action audit trail. |

---

## How to Apply to Supabase

### Option 1: Supabase Web Dashboard
1. Open your Supabase project dashboard.
2. Navigate to the **SQL Editor** in the left sidebar.
3. Click **New query**, paste the entire content of `supabase_schema.sql`, and click **Run**.

### Option 2: Supabase CLI
```bash
supabase db execute --file supabase_schema.sql
# or via migration:
# supabase migration new init_schema
# copy content into supabase/migrations/..._init_schema.sql
# supabase db reset
```
