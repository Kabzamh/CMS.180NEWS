-- ==============================================================================
-- SUPABASE POSTGRESQL COMPLETE DATABASE SCHEMA
-- Comprehensive schema for modern publishing, newsroom, magazine & media CMS.
-- Includes: settings, sections, articles, comments, team, authors, media, ads, 
-- analytics, newsletter, tags, revisions, bookmarks, reactions, navigation, 
-- redirects, audit logs, RLS policies, views, triggers, and seed data.
-- ==============================================================================

-- ------------------------------------------------------------------------------
-- 1. EXTENSIONS
-- ------------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pg_trgm";
CREATE EXTENSION IF NOT EXISTS "unaccent";

-- ------------------------------------------------------------------------------
-- 2. CUSTOM TYPES & ENUMS
-- ------------------------------------------------------------------------------
DO $$ BEGIN
    CREATE TYPE user_role AS ENUM (
        'superadmin', 
        'admin', 
        'editor', 
        'author', 
        'contributor', 
        'moderator', 
        'subscriber'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE article_status AS ENUM (
        'draft', 
        'in_review', 
        'scheduled', 
        'published', 
        'archived'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE comment_status AS ENUM (
        'pending', 
        'approved', 
        'flagged', 
        'spam', 
        'rejected'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE media_type AS ENUM (
        'image', 
        'video', 
        'audio', 
        'document', 
        'embed', 
        'archive', 
        'other'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE ad_type AS ENUM (
        'banner', 
        'sidebar', 
        'in_article', 
        'sponsored_post', 
        'popup_modal', 
        'native_card', 
        'video'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE ad_placement AS ENUM (
        'header_top', 
        'header_bottom', 
        'sidebar_top', 
        'sidebar_middle', 
        'sidebar_sticky', 
        'in_article_top', 
        'in_article_middle', 
        'in_article_bottom', 
        'footer_banner', 
        'interstitial'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE ad_status AS ENUM (
        'draft', 
        'active', 
        'paused', 
        'completed', 
        'archived'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE reaction_type AS ENUM (
        'like', 
        'love', 
        'insightful', 
        'fire', 
        'clap', 
        'mindblown'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

DO $$ BEGIN
    CREATE TYPE newsletter_frequency AS ENUM (
        'daily', 
        'weekly', 
        'monthly', 
        'breaking_alerts'
    );
EXCEPTION WHEN duplicate_object THEN null; END $$;

-- ------------------------------------------------------------------------------
-- 3. CORE TRIGGER FUNCTION: auto-update updated_at timestamp
-- ------------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION trigger_set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ------------------------------------------------------------------------------
-- 4. TABLE DEFINITIONS
-- ------------------------------------------------------------------------------

-- 4.1. SITE SETTINGS & CONFIGURATION
CREATE TABLE IF NOT EXISTS settings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    key TEXT UNIQUE NOT NULL,
    value JSONB NOT NULL DEFAULT '{}'::jsonb,
    "group" TEXT NOT NULL DEFAULT 'general',
    description TEXT,
    is_public BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.2. USER PROFILES (Synchronized with Supabase Auth users)
CREATE TABLE IF NOT EXISTS profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT UNIQUE NOT NULL,
    full_name TEXT NOT NULL,
    username TEXT UNIQUE,
    avatar_url TEXT,
    bio TEXT,
    role user_role NOT NULL DEFAULT 'subscriber',
    is_verified BOOLEAN NOT NULL DEFAULT FALSE,
    phone TEXT,
    website TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.3. AUTHORS & CONTRIBUTORS
CREATE TABLE IF NOT EXISTS authors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID UNIQUE REFERENCES profiles(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    avatar_url TEXT,
    banner_url TEXT,
    bio TEXT,
    short_bio VARCHAR(280),
    email TEXT,
    website TEXT,
    twitter_handle TEXT,
    facebook_url TEXT,
    linkedin_url TEXT,
    instagram_handle TEXT,
    github_handle TEXT,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    article_count INTEGER NOT NULL DEFAULT 0,
    total_views BIGINT NOT NULL DEFAULT 0,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.4. TEAM & EDITORIAL BOARD
CREATE TABLE IF NOT EXISTS team (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    author_id UUID REFERENCES authors(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    role_title TEXT NOT NULL,
    department TEXT NOT NULL DEFAULT 'Editorial',
    bio TEXT,
    avatar_url TEXT,
    email TEXT,
    social_links JSONB NOT NULL DEFAULT '{}'::jsonb,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_board_member BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    joined_date DATE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.5. SECTIONS / CATEGORIES / TAXONOMY
CREATE TABLE IF NOT EXISTS sections (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    parent_id UUID REFERENCES sections(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    color_code VARCHAR(10) NOT NULL DEFAULT '#2563EB',
    icon TEXT,
    banner_image_url TEXT,
    sort_order INTEGER NOT NULL DEFAULT 0,
    is_in_navigation BOOLEAN NOT NULL DEFAULT TRUE,
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    seo_title TEXT,
    seo_description TEXT,
    seo_keywords TEXT[],
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.6. TAGS
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT UNIQUE NOT NULL,
    slug TEXT UNIQUE NOT NULL,
    description TEXT,
    is_trending BOOLEAN NOT NULL DEFAULT FALSE,
    usage_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.7. ARTICLES / POSTS
CREATE TABLE IF NOT EXISTS articles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title TEXT NOT NULL,
    subtitle TEXT,
    slug TEXT UNIQUE NOT NULL,
    excerpt TEXT,
    content TEXT NOT NULL,
    content_json JSONB,
    featured_image_url TEXT,
    featured_image_caption TEXT,
    featured_image_alt TEXT,
    section_id UUID REFERENCES sections(id) ON DELETE RESTRICT,
    primary_author_id UUID REFERENCES authors(id) ON DELETE SET NULL,
    status article_status NOT NULL DEFAULT 'draft',
    is_featured BOOLEAN NOT NULL DEFAULT FALSE,
    is_breaking BOOLEAN NOT NULL DEFAULT FALSE,
    is_editor_pick BOOLEAN NOT NULL DEFAULT FALSE,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    is_premium BOOLEAN NOT NULL DEFAULT FALSE,
    allow_comments BOOLEAN NOT NULL DEFAULT TRUE,
    reading_time_minutes INTEGER NOT NULL DEFAULT 1,
    view_count BIGINT NOT NULL DEFAULT 0,
    like_count INTEGER NOT NULL DEFAULT 0,
    comment_count INTEGER NOT NULL DEFAULT 0,
    share_count INTEGER NOT NULL DEFAULT 0,
    published_at TIMESTAMPTZ,
    scheduled_for TIMESTAMPTZ,
    seo_title TEXT,
    seo_description TEXT,
    seo_keywords TEXT[],
    canonical_url TEXT,
    meta_og_image TEXT,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    search_vector TSVECTOR GENERATED ALWAYS AS (
        to_tsvector('english', 
            coalesce(title, '') || ' ' || 
            coalesce(subtitle, '') || ' ' || 
            coalesce(excerpt, '')
        )
    ) STORED,
    created_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    updated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.8. ARTICLE AUTHORS (Many-to-Many co-authorship)
CREATE TABLE IF NOT EXISTS article_authors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    author_id UUID NOT NULL REFERENCES authors(id) ON DELETE CASCADE,
    role TEXT NOT NULL DEFAULT 'Co-Author',
    display_order INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(article_id, author_id)
);

-- 4.9. ARTICLE TAGS (Many-to-Many junction)
CREATE TABLE IF NOT EXISTS article_tags (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    tag_id UUID NOT NULL REFERENCES tags(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(article_id, tag_id)
);

-- 4.10. ARTICLE REVISIONS & EDITORIAL HISTORY
CREATE TABLE IF NOT EXISTS article_revisions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    author_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    title TEXT NOT NULL,
    subtitle TEXT,
    excerpt TEXT,
    content TEXT NOT NULL,
    content_json JSONB,
    change_summary TEXT,
    revision_number INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.11. COMMENTS & DISCUSSIONS
CREATE TABLE IF NOT EXISTS comments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    parent_id UUID REFERENCES comments(id) ON DELETE CASCADE,
    content TEXT NOT NULL,
    status comment_status NOT NULL DEFAULT 'approved',
    guest_name TEXT,
    guest_email TEXT,
    ip_address INET,
    user_agent TEXT,
    upvotes INTEGER NOT NULL DEFAULT 0,
    downvotes INTEGER NOT NULL DEFAULT 0,
    is_pinned BOOLEAN NOT NULL DEFAULT FALSE,
    is_edited BOOLEAN NOT NULL DEFAULT FALSE,
    moderation_note TEXT,
    moderated_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    moderated_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.12. COMMENT REACTIONS (Upvotes / Downvotes)
CREATE TABLE IF NOT EXISTS comment_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    comment_id UUID NOT NULL REFERENCES comments(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    is_upvote BOOLEAN NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(comment_id, user_id)
);

-- 4.13. ARTICLE REACTIONS (Likes, Loves, Claps)
CREATE TABLE IF NOT EXISTS article_reactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    reaction_type reaction_type NOT NULL DEFAULT 'like',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(article_id, user_id, reaction_type)
);

-- 4.14. BOOKMARKS & READING LIST
CREATE TABLE IF NOT EXISTS bookmarks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    collection_name TEXT NOT NULL DEFAULT 'Reading List',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(user_id, article_id)
);

-- 4.15. MEDIA FOLDERS
CREATE TABLE IF NOT EXISTS media_folders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    slug TEXT NOT NULL,
    parent_id UUID REFERENCES media_folders(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.16. MEDIA LIBRARY & ASSET ASSETS
CREATE TABLE IF NOT EXISTS media (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    folder_id UUID REFERENCES media_folders(id) ON DELETE SET NULL,
    file_name TEXT NOT NULL,
    file_path TEXT NOT NULL,
    file_url TEXT NOT NULL,
    bucket_name TEXT NOT NULL DEFAULT 'media',
    media_type media_type NOT NULL DEFAULT 'image',
    mime_type TEXT NOT NULL,
    file_size_bytes BIGINT NOT NULL,
    width INTEGER,
    height INTEGER,
    duration_seconds NUMERIC(10, 2),
    alt_text TEXT,
    title TEXT,
    caption TEXT,
    credits TEXT,
    tags TEXT[],
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    uploaded_by UUID REFERENCES profiles(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.17. AD CAMPAIGNS & SPONSORSHIPS
CREATE TABLE IF NOT EXISTS ad_campaigns (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    advertiser_name TEXT NOT NULL,
    advertiser_email TEXT,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    budget NUMERIC(12, 2),
    status ad_status NOT NULL DEFAULT 'active',
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.18. ADS & MONETIZATION SLOTS
CREATE TABLE IF NOT EXISTS ads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    campaign_id UUID REFERENCES ad_campaigns(id) ON DELETE SET NULL,
    name TEXT NOT NULL,
    ad_type ad_type NOT NULL DEFAULT 'banner',
    placement ad_placement NOT NULL,
    image_url TEXT,
    target_url TEXT NOT NULL,
    html_code TEXT,
    script_url TEXT,
    target_sections UUID[],
    target_devices TEXT[] DEFAULT ARRAY['desktop', 'mobile', 'tablet']::TEXT[],
    priority INTEGER NOT NULL DEFAULT 1,
    weight INTEGER NOT NULL DEFAULT 100,
    status ad_status NOT NULL DEFAULT 'active',
    max_impressions BIGINT,
    max_clicks BIGINT,
    current_impressions BIGINT NOT NULL DEFAULT 0,
    current_clicks BIGINT NOT NULL DEFAULT 0,
    start_date TIMESTAMPTZ,
    end_date TIMESTAMPTZ,
    metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.19. AD IMPRESSIONS TELEMETRY
CREATE TABLE IF NOT EXISTS ad_impressions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_id UUID NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
    article_id UUID REFERENCES articles(id) ON DELETE SET NULL,
    visitor_id TEXT,
    ip_hash TEXT,
    user_agent TEXT,
    device_type TEXT,
    referrer TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.20. AD CLICKS TELEMETRY
CREATE TABLE IF NOT EXISTS ad_clicks (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    ad_id UUID NOT NULL REFERENCES ads(id) ON DELETE CASCADE,
    article_id UUID REFERENCES articles(id) ON DELETE SET NULL,
    visitor_id TEXT,
    ip_hash TEXT,
    user_agent TEXT,
    referrer TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.21. ANALYTICS: PAGEVIEWS & WEB TRAFFIC
CREATE TABLE IF NOT EXISTS analytics_pageviews (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID REFERENCES articles(id) ON DELETE SET NULL,
    path TEXT NOT NULL,
    visitor_id TEXT,
    session_id TEXT,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    referrer TEXT,
    referrer_domain TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_term TEXT,
    utm_content TEXT,
    country_code VARCHAR(3),
    city TEXT,
    device_type TEXT,
    browser TEXT,
    os TEXT,
    ip_hash TEXT,
    time_on_page_seconds INTEGER NOT NULL DEFAULT 0,
    scroll_depth_percent INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.22. ANALYTICS: CUSTOM EVENTS
CREATE TABLE IF NOT EXISTS analytics_events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_name TEXT NOT NULL,
    event_category TEXT,
    article_id UUID REFERENCES articles(id) ON DELETE SET NULL,
    visitor_id TEXT,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    properties JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.23. ANALYTICS: DAILY ARTICLE ROLLUP METRICS
CREATE TABLE IF NOT EXISTS daily_article_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    article_id UUID NOT NULL REFERENCES articles(id) ON DELETE CASCADE,
    date DATE NOT NULL,
    views INTEGER NOT NULL DEFAULT 0,
    unique_visitors INTEGER NOT NULL DEFAULT 0,
    avg_time_spent_seconds INTEGER NOT NULL DEFAULT 0,
    shares INTEGER NOT NULL DEFAULT 0,
    comments_count INTEGER NOT NULL DEFAULT 0,
    reactions_count INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE(article_id, date)
);

-- 4.24. NEWSLETTER SUBSCRIBERS
CREATE TABLE IF NOT EXISTS newsletter_subscribers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    email TEXT UNIQUE NOT NULL,
    first_name TEXT,
    last_name TEXT,
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    status TEXT NOT NULL DEFAULT 'active',
    frequency newsletter_frequency NOT NULL DEFAULT 'weekly',
    subscribed_sections UUID[],
    token TEXT UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
    confirmed_at TIMESTAMPTZ,
    unsubscribed_at TIMESTAMPTZ,
    source TEXT NOT NULL DEFAULT 'website',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.25. NAVIGATION MENUS
CREATE TABLE IF NOT EXISTS navigation_menus (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    location TEXT UNIQUE NOT NULL,
    title TEXT NOT NULL,
    items JSONB NOT NULL DEFAULT '[]'::jsonb,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.26. SEO REDIRECTS (301 / 302)
CREATE TABLE IF NOT EXISTS redirects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_path TEXT UNIQUE NOT NULL,
    target_path TEXT NOT NULL,
    status_code INTEGER NOT NULL DEFAULT 301,
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    hit_count BIGINT NOT NULL DEFAULT 0,
    last_hit_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 4.27. AUDIT LOGS & ACTIVITY TRAIL
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES profiles(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    entity_type TEXT NOT NULL,
    entity_id UUID,
    old_values JSONB,
    new_values JSONB,
    ip_address INET,
    user_agent TEXT,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ------------------------------------------------------------------------------
-- 5. INDEXES FOR HIGH-PERFORMANCE QUERYING
-- ------------------------------------------------------------------------------

-- Settings
CREATE INDEX IF NOT EXISTS idx_settings_group ON settings("group");
CREATE INDEX IF NOT EXISTS idx_settings_public ON settings(is_public) WHERE is_public = TRUE;

-- Profiles
CREATE INDEX IF NOT EXISTS idx_profiles_role ON profiles(role);
CREATE INDEX IF NOT EXISTS idx_profiles_username ON profiles(username);

-- Authors
CREATE INDEX IF NOT EXISTS idx_authors_slug ON authors(slug);
CREATE INDEX IF NOT EXISTS idx_authors_featured ON authors(is_featured) WHERE is_featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_authors_active ON authors(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_authors_name_trgm ON authors USING gin (name gin_trgm_ops);

-- Team
CREATE INDEX IF NOT EXISTS idx_team_slug ON team(slug);
CREATE INDEX IF NOT EXISTS idx_team_sort_order ON team(sort_order);
CREATE INDEX IF NOT EXISTS idx_team_active ON team(is_active) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_team_department ON team(department);

-- Sections
CREATE INDEX IF NOT EXISTS idx_sections_slug ON sections(slug);
CREATE INDEX IF NOT EXISTS idx_sections_parent ON sections(parent_id);
CREATE INDEX IF NOT EXISTS idx_sections_navigation ON sections(is_in_navigation) WHERE is_in_navigation = TRUE;
CREATE INDEX IF NOT EXISTS idx_sections_sort_order ON sections(sort_order);
CREATE INDEX IF NOT EXISTS idx_sections_name_trgm ON sections USING gin (name gin_trgm_ops);

-- Tags
CREATE INDEX IF NOT EXISTS idx_tags_slug ON tags(slug);
CREATE INDEX IF NOT EXISTS idx_tags_trending ON tags(is_trending) WHERE is_trending = TRUE;
CREATE INDEX IF NOT EXISTS idx_tags_usage ON tags(usage_count DESC);
CREATE INDEX IF NOT EXISTS idx_tags_name_trgm ON tags USING gin (name gin_trgm_ops);

-- Articles
CREATE INDEX IF NOT EXISTS idx_articles_slug ON articles(slug);
CREATE INDEX IF NOT EXISTS idx_articles_status ON articles(status);
CREATE INDEX IF NOT EXISTS idx_articles_section ON articles(section_id);
CREATE INDEX IF NOT EXISTS idx_articles_primary_author ON articles(primary_author_id);
CREATE INDEX IF NOT EXISTS idx_articles_published_at ON articles(published_at DESC);
CREATE INDEX IF NOT EXISTS idx_articles_featured ON articles(is_featured) WHERE is_featured = TRUE;
CREATE INDEX IF NOT EXISTS idx_articles_breaking ON articles(is_breaking) WHERE is_breaking = TRUE;
CREATE INDEX IF NOT EXISTS idx_articles_editor_pick ON articles(is_editor_pick) WHERE is_editor_pick = TRUE;
CREATE INDEX IF NOT EXISTS idx_articles_search_vector ON articles USING gin(search_vector);
CREATE INDEX IF NOT EXISTS idx_articles_title_trgm ON articles USING gin (title gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_articles_published_feed ON articles(status, published_at DESC) WHERE status = 'published';

-- Article Authors & Tags Junction
CREATE INDEX IF NOT EXISTS idx_article_authors_article ON article_authors(article_id);
CREATE INDEX IF NOT EXISTS idx_article_authors_author ON article_authors(author_id);
CREATE INDEX IF NOT EXISTS idx_article_tags_article ON article_tags(article_id);
CREATE INDEX IF NOT EXISTS idx_article_tags_tag ON article_tags(tag_id);

-- Article Revisions
CREATE INDEX IF NOT EXISTS idx_article_revisions_article ON article_revisions(article_id, revision_number DESC);

-- Comments
CREATE INDEX IF NOT EXISTS idx_comments_article ON comments(article_id);
CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
CREATE INDEX IF NOT EXISTS idx_comments_user ON comments(user_id);
CREATE INDEX IF NOT EXISTS idx_comments_status ON comments(status);
CREATE INDEX IF NOT EXISTS idx_comments_approved ON comments(article_id, created_at DESC) WHERE status = 'approved';

-- Reactions & Bookmarks
CREATE INDEX IF NOT EXISTS idx_comment_reactions_comment ON comment_reactions(comment_id);
CREATE INDEX IF NOT EXISTS idx_article_reactions_article ON article_reactions(article_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_user ON bookmarks(user_id);
CREATE INDEX IF NOT EXISTS idx_bookmarks_article ON bookmarks(article_id);

-- Media
CREATE INDEX IF NOT EXISTS idx_media_folder ON media(folder_id);
CREATE INDEX IF NOT EXISTS idx_media_type ON media(media_type);
CREATE INDEX IF NOT EXISTS idx_media_uploaded_by ON media(uploaded_by);
CREATE INDEX IF NOT EXISTS idx_media_created_at ON media(created_at DESC);

-- Ads
CREATE INDEX IF NOT EXISTS idx_ads_campaign ON ads(campaign_id);
CREATE INDEX IF NOT EXISTS idx_ads_placement ON ads(placement);
CREATE INDEX IF NOT EXISTS idx_ads_status ON ads(status);
CREATE INDEX IF NOT EXISTS idx_ads_active_delivery ON ads(placement, status, priority DESC) WHERE status = 'active';

-- Ad Telemetry
CREATE INDEX IF NOT EXISTS idx_ad_impressions_ad ON ad_impressions(ad_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ad_clicks_ad ON ad_clicks(ad_id, created_at DESC);

-- Analytics
CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_article ON analytics_pageviews(article_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_path ON analytics_pageviews(path);
CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_visitor ON analytics_pageviews(visitor_id);
CREATE INDEX IF NOT EXISTS idx_analytics_pageviews_created_at ON analytics_pageviews(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_events_name ON analytics_events(event_name, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_daily_metrics_article_date ON daily_article_metrics(article_id, date DESC);

-- Newsletters & Redirects & Audit
CREATE INDEX IF NOT EXISTS idx_newsletter_email ON newsletter_subscribers(email);
CREATE INDEX IF NOT EXISTS idx_newsletter_status ON newsletter_subscribers(status);
CREATE INDEX IF NOT EXISTS idx_redirects_source ON redirects(source_path) WHERE is_active = TRUE;
CREATE INDEX IF NOT EXISTS idx_audit_logs_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_created_at ON audit_logs(created_at DESC);

-- ------------------------------------------------------------------------------
-- 6. AUTOMATIC UPDATED_AT TRIGGERS
-- ------------------------------------------------------------------------------
CREATE OR REPLACE TRIGGER set_updated_at_settings BEFORE UPDATE ON settings FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_profiles BEFORE UPDATE ON profiles FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_authors BEFORE UPDATE ON authors FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_team BEFORE UPDATE ON team FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_sections BEFORE UPDATE ON sections FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_tags BEFORE UPDATE ON tags FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_articles BEFORE UPDATE ON articles FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_comments BEFORE UPDATE ON comments FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_media_folders BEFORE UPDATE ON media_folders FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_media BEFORE UPDATE ON media FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_ad_campaigns BEFORE UPDATE ON ad_campaigns FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_ads BEFORE UPDATE ON ads FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_newsletter BEFORE UPDATE ON newsletter_subscribers FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_navigation BEFORE UPDATE ON navigation_menus FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();
CREATE OR REPLACE TRIGGER set_updated_at_redirects BEFORE UPDATE ON redirects FOR EACH ROW EXECUTE FUNCTION trigger_set_updated_at();

-- ------------------------------------------------------------------------------
-- 7. DATABASE FUNCTIONS & TRIGGERS FOR BUSINESS LOGIC
-- ------------------------------------------------------------------------------

-- 7.1. Automatically create a public profile on new auth.users signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url, role)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.raw_user_meta_data->>'name', split_part(NEW.email, '@', 1)),
        NEW.raw_user_meta_data->>'avatar_url',
        'subscriber'
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger to hook auth.users signup
CREATE OR REPLACE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 7.2. Sync Tag Usage Count
CREATE OR REPLACE FUNCTION public.sync_tag_usage()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE tags SET usage_count = usage_count + 1 WHERE id = NEW.tag_id;
        RETURN NEW;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE tags SET usage_count = GREATEST(usage_count - 1, 0) WHERE id = OLD.tag_id;
        RETURN OLD;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_sync_tag_usage
    AFTER INSERT OR DELETE ON article_tags
    FOR EACH ROW EXECUTE FUNCTION public.sync_tag_usage();

-- 7.3. Sync Author Article Count
CREATE OR REPLACE FUNCTION public.sync_author_article_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'published' THEN
        IF NEW.primary_author_id IS NOT NULL THEN
            UPDATE authors SET article_count = article_count + 1 WHERE id = NEW.primary_author_id;
        END IF;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status != 'published' AND NEW.status = 'published' THEN
            IF NEW.primary_author_id IS NOT NULL THEN
                UPDATE authors SET article_count = article_count + 1 WHERE id = NEW.primary_author_id;
            END IF;
        ELSIF OLD.status = 'published' AND NEW.status != 'published' THEN
            IF OLD.primary_author_id IS NOT NULL THEN
                UPDATE authors SET article_count = GREATEST(article_count - 1, 0) WHERE id = OLD.primary_author_id;
            END IF;
        ELSIF OLD.status = 'published' AND NEW.status = 'published' AND OLD.primary_author_id IS DISTINCT FROM NEW.primary_author_id THEN
            IF OLD.primary_author_id IS NOT NULL THEN
                UPDATE authors SET article_count = GREATEST(article_count - 1, 0) WHERE id = OLD.primary_author_id;
            END IF;
            IF NEW.primary_author_id IS NOT NULL THEN
                UPDATE authors SET article_count = article_count + 1 WHERE id = NEW.primary_author_id;
            END IF;
        END IF;
    ELSIF TG_OP = 'DELETE' AND OLD.status = 'published' THEN
        IF OLD.primary_author_id IS NOT NULL THEN
            UPDATE authors SET article_count = GREATEST(article_count - 1, 0) WHERE id = OLD.primary_author_id;
        END IF;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_sync_author_article_count
    AFTER INSERT OR UPDATE OR DELETE ON articles
    FOR EACH ROW EXECUTE FUNCTION public.sync_author_article_count();

-- 7.4. Sync Article Comment Count
CREATE OR REPLACE FUNCTION public.sync_article_comment_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' AND NEW.status = 'approved' THEN
        UPDATE articles SET comment_count = comment_count + 1 WHERE id = NEW.article_id;
    ELSIF TG_OP = 'UPDATE' THEN
        IF OLD.status != 'approved' AND NEW.status = 'approved' THEN
            UPDATE articles SET comment_count = comment_count + 1 WHERE id = NEW.article_id;
        ELSIF OLD.status = 'approved' AND NEW.status != 'approved' THEN
            UPDATE articles SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = NEW.article_id;
        END IF;
    ELSIF TG_OP = 'DELETE' AND OLD.status = 'approved' THEN
        UPDATE articles SET comment_count = GREATEST(comment_count - 1, 0) WHERE id = OLD.article_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_sync_article_comment_count
    AFTER INSERT OR UPDATE OR DELETE ON comments
    FOR EACH ROW EXECUTE FUNCTION public.sync_article_comment_count();

-- 7.5. Sync Article Like Count
CREATE OR REPLACE FUNCTION public.sync_article_like_count()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'INSERT' THEN
        UPDATE articles SET like_count = like_count + 1 WHERE id = NEW.article_id;
    ELSIF TG_OP = 'DELETE' THEN
        UPDATE articles SET like_count = GREATEST(like_count - 1, 0) WHERE id = OLD.article_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE TRIGGER trigger_sync_article_like_count
    AFTER INSERT OR DELETE ON article_reactions
    FOR EACH ROW EXECUTE FUNCTION public.sync_article_like_count();

-- 7.6. Atomic Increment Article Views RPC
CREATE OR REPLACE FUNCTION increment_article_views(p_article_id UUID)
RETURNS VOID AS $$
BEGIN
    UPDATE articles
    SET view_count = view_count + 1
    WHERE id = p_article_id;

    -- Also increment total views for the primary author
    UPDATE authors
    SET total_views = total_views + 1
    WHERE id = (SELECT primary_author_id FROM articles WHERE id = p_article_id);
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7.7. Atomic Ad Impression Tracker RPC
CREATE OR REPLACE FUNCTION track_ad_impression(
    p_ad_id UUID,
    p_article_id UUID DEFAULT NULL,
    p_visitor_id TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_device_type TEXT DEFAULT 'desktop',
    p_referrer TEXT DEFAULT NULL,
    p_ip_hash TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO ad_impressions (ad_id, article_id, visitor_id, user_agent, device_type, referrer, ip_hash)
    VALUES (p_ad_id, p_article_id, p_visitor_id, p_user_agent, p_device_type, p_referrer, p_ip_hash);

    UPDATE ads
    SET current_impressions = current_impressions + 1
    WHERE id = p_ad_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7.8. Atomic Ad Click Tracker RPC
CREATE OR REPLACE FUNCTION track_ad_click(
    p_ad_id UUID,
    p_article_id UUID DEFAULT NULL,
    p_visitor_id TEXT DEFAULT NULL,
    p_user_agent TEXT DEFAULT NULL,
    p_referrer TEXT DEFAULT NULL,
    p_ip_hash TEXT DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    INSERT INTO ad_clicks (ad_id, article_id, visitor_id, user_agent, referrer, ip_hash)
    VALUES (p_ad_id, p_article_id, p_visitor_id, p_user_agent, p_referrer, p_ip_hash);

    UPDATE ads
    SET current_clicks = current_clicks + 1
    WHERE id = p_ad_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 7.9. Advanced Full-Text Search RPC Function
CREATE OR REPLACE FUNCTION search_articles(
    search_query TEXT,
    p_section_slug TEXT DEFAULT NULL,
    tag_slug TEXT DEFAULT NULL,
    limit_val INTEGER DEFAULT 20,
    offset_val INTEGER DEFAULT 0
)
RETURNS TABLE (
    id UUID,
    title TEXT,
    subtitle TEXT,
    slug TEXT,
    excerpt TEXT,
    featured_image_url TEXT,
    published_at TIMESTAMPTZ,
    reading_time_minutes INTEGER,
    view_count BIGINT,
    like_count INTEGER,
    section_name TEXT,
    section_slug TEXT,
    author_name TEXT,
    author_avatar_url TEXT,
    rank REAL
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        a.id,
        a.title,
        a.subtitle,
        a.slug,
        a.excerpt,
        a.featured_image_url,
        a.published_at,
        a.reading_time_minutes,
        a.view_count,
        a.like_count,
        s.name AS section_name,
        s.slug AS section_slug,
        auth.name AS author_name,
        auth.avatar_url AS author_avatar_url,
        ts_rank(a.search_vector, websearch_to_tsquery('english', search_query)) AS rank
    FROM articles a
    JOIN sections s ON a.section_id = s.id
    LEFT JOIN authors auth ON a.primary_author_id = auth.id
    WHERE a.status = 'published'
      AND (
          search_query IS NULL 
          OR search_query = '' 
          OR a.search_vector @@ websearch_to_tsquery('english', search_query)
          OR a.title ILIKE '%' || search_query || '%'
      )
      AND (p_section_slug IS NULL OR s.slug = p_section_slug)
      AND (
          tag_slug IS NULL 
          OR EXISTS (
              SELECT 1 FROM article_tags at_map
              JOIN tags t ON at_map.tag_id = t.id
              WHERE at_map.article_id = a.id AND t.slug = tag_slug
          )
      )
    ORDER BY rank DESC, a.published_at DESC
    LIMIT limit_val OFFSET offset_val;
END;
$$ LANGUAGE plpgsql STABLE;

-- ------------------------------------------------------------------------------
-- 8. DATABASE VIEWS FOR RAPID CMS CONSUMPTION
-- ------------------------------------------------------------------------------

-- 8.1. Published Articles with Nested Section, Author, and Tags
CREATE OR REPLACE VIEW view_published_articles AS
SELECT 
    a.id,
    a.title,
    a.subtitle,
    a.slug,
    a.excerpt,
    a.content,
    a.featured_image_url,
    a.featured_image_caption,
    a.featured_image_alt,
    a.status,
    a.is_featured,
    a.is_breaking,
    a.is_editor_pick,
    a.is_pinned,
    a.is_premium,
    a.allow_comments,
    a.reading_time_minutes,
    a.view_count,
    a.like_count,
    a.comment_count,
    a.share_count,
    a.published_at,
    a.seo_title,
    a.seo_description,
    a.canonical_url,
    -- Section Object
    jsonb_build_object(
        'id', s.id,
        'name', s.name,
        'slug', s.slug,
        'color_code', s.color_code,
        'icon', s.icon
    ) AS section,
    -- Primary Author Object
    jsonb_build_object(
        'id', p_auth.id,
        'name', p_auth.name,
        'slug', p_auth.slug,
        'avatar_url', p_auth.avatar_url,
        'short_bio', p_auth.short_bio
    ) AS primary_author,
    -- All Authors Array
    COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', auth_sub.id,
                    'name', auth_sub.name,
                    'slug', auth_sub.slug,
                    'avatar_url', auth_sub.avatar_url,
                    'role', aa.role
                ) ORDER BY aa.display_order ASC
            )
            FROM article_authors aa
            JOIN authors auth_sub ON aa.author_id = auth_sub.id
            WHERE aa.article_id = a.id
        ),
        '[]'::jsonb
    ) AS co_authors,
    -- Tags Array
    COALESCE(
        (
            SELECT jsonb_agg(
                jsonb_build_object(
                    'id', t.id,
                    'name', t.name,
                    'slug', t.slug
                )
            )
            FROM article_tags at_map
            JOIN tags t ON at_map.tag_id = t.id
            WHERE at_map.article_id = a.id
        ),
        '[]'::jsonb
    ) AS tags
FROM articles a
JOIN sections s ON a.section_id = s.id
LEFT JOIN authors p_auth ON a.primary_author_id = p_auth.id
WHERE a.status = 'published';

-- 8.2. Trending Articles (Popularity Algorithm)
CREATE OR REPLACE VIEW view_trending_articles AS
SELECT 
    a.id,
    a.title,
    a.slug,
    a.excerpt,
    a.featured_image_url,
    a.published_at,
    a.view_count,
    a.like_count,
    a.comment_count,
    s.name AS section_name,
    s.slug AS section_slug,
    s.color_code AS section_color,
    auth.name AS author_name,
    auth.avatar_url AS author_avatar_url,
    (
        (a.view_count * 1) + 
        (a.like_count * 5) + 
        (a.comment_count * 10)
    ) / POWER(EXTRACT(EPOCH FROM (NOW() - a.published_at)) / 3600 + 2, 1.5) AS trend_score
FROM articles a
JOIN sections s ON a.section_id = s.id
LEFT JOIN authors auth ON a.primary_author_id = auth.id
WHERE a.status = 'published'
  AND a.published_at > (NOW() - INTERVAL '30 days')
ORDER BY trend_score DESC;

-- 8.3. Section Overview with Article Counts
CREATE OR REPLACE VIEW view_section_overview AS
SELECT 
    s.id,
    s.name,
    s.slug,
    s.description,
    s.color_code,
    s.icon,
    s.banner_image_url,
    s.sort_order,
    s.is_in_navigation,
    s.is_featured,
    COUNT(a.id) FILTER (WHERE a.status = 'published') AS published_articles_count,
    MAX(a.published_at) AS latest_published_at
FROM sections s
LEFT JOIN articles a ON s.id = a.section_id
WHERE s.is_active = TRUE
GROUP BY s.id
ORDER BY s.sort_order ASC, s.name ASC;

-- ------------------------------------------------------------------------------
-- 9. ROW LEVEL SECURITY (RLS) POLICIES
-- ------------------------------------------------------------------------------

-- Reset RLS policies before recreating them (makes this schema script re-runnable)
DO $$
DECLARE
    policy_record RECORD;
BEGIN
    FOR policy_record IN
        SELECT schemaname, tablename, policyname
        FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN (
              'settings', 'profiles', 'authors', 'team', 'sections', 'tags', 'articles',
              'article_authors', 'article_tags', 'article_revisions', 'comments',
              'comment_reactions', 'article_reactions', 'bookmarks', 'media_folders',
              'media', 'ad_campaigns', 'ads', 'ad_impressions', 'ad_clicks',
              'analytics_pageviews', 'analytics_events', 'daily_article_metrics',
              'newsletter_subscribers', 'navigation_menus', 'redirects', 'audit_logs'
          )
    LOOP
        EXECUTE format(
            'DROP POLICY IF EXISTS %I ON %I.%I',
            policy_record.policyname,
            policy_record.schemaname,
            policy_record.tablename
        );
    END LOOP;
END
$$;

-- ------------------------------------------------------------------------------
-- Helper security functions
CREATE OR REPLACE FUNCTION public.get_current_user_role()
RETURNS user_role AS $$
    SELECT role FROM public.profiles WHERE id = auth.uid();
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_admin_or_editor()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
          AND role IN ('superadmin', 'admin', 'editor')
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

CREATE OR REPLACE FUNCTION public.is_staff()
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.profiles 
        WHERE id = auth.uid() 
          AND role IN ('superadmin', 'admin', 'editor', 'author', 'moderator')
    );
$$ LANGUAGE sql STABLE SECURITY DEFINER;

-- Enable RLS on all tables
ALTER TABLE settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE team ENABLE ROW LEVEL SECURITY;
ALTER TABLE sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE articles ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_authors ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_tags ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_revisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE comments ENABLE ROW LEVEL SECURITY;
ALTER TABLE comment_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE article_reactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE bookmarks ENABLE ROW LEVEL SECURITY;
ALTER TABLE media_folders ENABLE ROW LEVEL SECURITY;
ALTER TABLE media ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE ads ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_impressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE ad_clicks ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_pageviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE analytics_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE daily_article_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE newsletter_subscribers ENABLE ROW LEVEL SECURITY;
ALTER TABLE navigation_menus ENABLE ROW LEVEL SECURITY;
ALTER TABLE redirects ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;

-- 9.1. SETTINGS POLICIES
CREATE POLICY "Public can view public settings" ON settings
    FOR SELECT USING (is_public = TRUE OR public.is_admin_or_editor());
CREATE POLICY "Admin/Editors can manage settings" ON settings
    FOR ALL USING (public.is_admin_or_editor());

-- 9.2. PROFILES POLICIES
CREATE POLICY "Public can view basic profiles" ON profiles
    FOR SELECT USING (TRUE);
CREATE POLICY "Users can update own profile" ON profiles
    FOR UPDATE USING (auth.uid() = id);
CREATE POLICY "Superadmins can manage all profiles" ON profiles
    FOR ALL USING (public.get_current_user_role() IN ('superadmin', 'admin'));

-- 9.3. AUTHORS POLICIES
CREATE POLICY "Public can view active authors" ON authors
    FOR SELECT USING (is_active = TRUE OR public.is_staff());
CREATE POLICY "Authors can update their own author profile" ON authors
    FOR UPDATE USING (user_id = auth.uid() OR public.is_admin_or_editor());
CREATE POLICY "Admin/Editors can manage authors" ON authors
    FOR ALL USING (public.is_admin_or_editor());

-- 9.4. TEAM POLICIES
CREATE POLICY "Public can view active team members" ON team
    FOR SELECT USING (is_active = TRUE OR public.is_staff());
CREATE POLICY "Admin/Editors can manage team members" ON team
    FOR ALL USING (public.is_admin_or_editor());

-- 9.5. SECTIONS POLICIES
CREATE POLICY "Public can view active sections" ON sections
    FOR SELECT USING (is_active = TRUE OR public.is_staff());
CREATE POLICY "Admin/Editors can manage sections" ON sections
    FOR ALL USING (public.is_admin_or_editor());

-- 9.6. TAGS POLICIES
CREATE POLICY "Public can view tags" ON tags
    FOR SELECT USING (TRUE);
CREATE POLICY "Staff can manage tags" ON tags
    FOR ALL USING (public.is_staff());

-- 9.7. ARTICLES POLICIES
CREATE POLICY "Public can view published articles" ON articles
    FOR SELECT USING (
        status = 'published' 
        OR (auth.uid() IS NOT NULL AND (created_by = auth.uid() OR public.is_staff()))
    );
CREATE POLICY "Staff can insert articles" ON articles
    FOR INSERT WITH CHECK (public.is_staff());
CREATE POLICY "Staff can update own articles or editor update all" ON articles
    FOR UPDATE USING (
        created_by = auth.uid() 
        OR public.is_admin_or_editor()
    );
CREATE POLICY "Admin/Editors can delete articles" ON articles
    FOR DELETE USING (public.is_admin_or_editor());

-- 9.8. ARTICLE AUTHORS & TAGS POLICIES
CREATE POLICY "Public can view article author mappings" ON article_authors FOR SELECT USING (TRUE);
CREATE POLICY "Staff can manage article author mappings" ON article_authors FOR ALL USING (public.is_staff());

CREATE POLICY "Public can view article tags" ON article_tags FOR SELECT USING (TRUE);
CREATE POLICY "Staff can manage article tags" ON article_tags FOR ALL USING (public.is_staff());

-- 9.9. ARTICLE REVISIONS POLICIES
CREATE POLICY "Staff can view article revisions" ON article_revisions FOR SELECT USING (public.is_staff());
CREATE POLICY "Staff can create revisions" ON article_revisions FOR INSERT WITH CHECK (public.is_staff());

-- 9.10. COMMENTS POLICIES
CREATE POLICY "Public can view approved comments" ON comments
    FOR SELECT USING (status = 'approved' OR user_id = auth.uid() OR public.is_staff());
CREATE POLICY "Authenticated users or guests can insert comments" ON comments
    FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Users can update own comments" ON comments
    FOR UPDATE USING (user_id = auth.uid() OR public.is_staff());
CREATE POLICY "Moderators/Editors can delete comments" ON comments
    FOR DELETE USING (public.is_staff());

-- 9.11. REACTIONS & BOOKMARKS POLICIES
CREATE POLICY "Public can view comment reactions" ON comment_reactions FOR SELECT USING (TRUE);
CREATE POLICY "Users can manage their own comment reactions" ON comment_reactions
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Public can view article reactions" ON article_reactions FOR SELECT USING (TRUE);
CREATE POLICY "Users can manage their own article reactions" ON article_reactions
    FOR ALL USING (auth.uid() = user_id);

CREATE POLICY "Users can view and manage own bookmarks" ON bookmarks
    FOR ALL USING (auth.uid() = user_id);

-- 9.12. MEDIA POLICIES
CREATE POLICY "Public can view media" ON media FOR SELECT USING (TRUE);
CREATE POLICY "Staff can upload and manage media" ON media FOR ALL USING (public.is_staff());

CREATE POLICY "Public can view media folders" ON media_folders FOR SELECT USING (TRUE);
CREATE POLICY "Staff can manage media folders" ON media_folders FOR ALL USING (public.is_staff());

-- 9.13. ADS & CAMPAIGNS POLICIES
CREATE POLICY "Public can view active ads" ON ads
    FOR SELECT USING (status = 'active' OR public.is_staff());
CREATE POLICY "Admin/Editors can manage ads" ON ads
    FOR ALL USING (public.is_admin_or_editor());

CREATE POLICY "Admin/Editors can manage ad campaigns" ON ad_campaigns
    FOR ALL USING (public.is_admin_or_editor());

CREATE POLICY "Anyone can record ad impressions" ON ad_impressions FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Staff can view ad impressions" ON ad_impressions FOR SELECT USING (public.is_staff());

CREATE POLICY "Anyone can record ad clicks" ON ad_clicks FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Staff can view ad clicks" ON ad_clicks FOR SELECT USING (public.is_staff());

-- 9.14. ANALYTICS POLICIES
CREATE POLICY "Anyone can log pageviews" ON analytics_pageviews FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Staff can view pageview analytics" ON analytics_pageviews FOR SELECT USING (public.is_staff());

CREATE POLICY "Anyone can log analytics events" ON analytics_events FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Staff can view analytics events" ON analytics_events FOR SELECT USING (public.is_staff());

CREATE POLICY "Staff can view daily article metrics" ON daily_article_metrics FOR SELECT USING (public.is_staff());
CREATE POLICY "Staff can manage daily article metrics" ON daily_article_metrics FOR ALL USING (public.is_staff());

-- 9.15. NEWSLETTER SUBSCRIBERS POLICIES
CREATE POLICY "Anyone can subscribe to newsletter" ON newsletter_subscribers FOR INSERT WITH CHECK (TRUE);
CREATE POLICY "Subscribers can view/update own subscription" ON newsletter_subscribers
    FOR ALL USING (auth.uid() = user_id OR email = current_setting('request.jwt.claims', true)::json->>'email' OR public.is_staff());

-- 9.16. NAVIGATION, REDIRECTS, AUDIT POLICIES
CREATE POLICY "Public can view active navigation menus" ON navigation_menus FOR SELECT USING (is_active = TRUE OR public.is_admin_or_editor());
CREATE POLICY "Admin/Editors can manage navigation menus" ON navigation_menus FOR ALL USING (public.is_admin_or_editor());

CREATE POLICY "Public can view active redirects" ON redirects FOR SELECT USING (is_active = TRUE OR public.is_admin_or_editor());
CREATE POLICY "Admin/Editors can manage redirects" ON redirects FOR ALL USING (public.is_admin_or_editor());

CREATE POLICY "Staff can view audit logs" ON audit_logs FOR SELECT USING (public.is_staff());
CREATE POLICY "Staff can insert audit logs" ON audit_logs FOR INSERT WITH CHECK (public.is_staff());

-- ------------------------------------------------------------------------------
-- 10. DEFAULT SEED DATA (INITIAL CONFIGURATION & ESSENTIALS)
-- ------------------------------------------------------------------------------

-- 10.1. Essential Site Settings
INSERT INTO settings (key, value, "group", description, is_public) VALUES
('site_info', '{
    "name": "The Editorial Chronicle",
    "tagline": "Insightful Journalism, In-Depth Tech Analysis & Cultural Perspectives",
    "description": "A premier digital publication delivering modern news, deep investigative journalism, and thought leadership.",
    "url": "https://example.com",
    "logo_url": "/assets/logo.svg",
    "logo_dark_url": "/assets/logo-dark.svg",
    "favicon_url": "/assets/favicon.ico",
    "default_og_image": "/assets/og-default.jpg",
    "language": "en",
    "timezone": "UTC"
}'::jsonb, 'branding', 'Main site identity and metadata', TRUE),

('seo_defaults', '{
    "meta_title_template": "%s | The Editorial Chronicle",
    "meta_description": "Award-winning reporting, breaking news, analysis, and culture from world-class writers.",
    "keywords": ["journalism", "tech news", "business analysis", "culture", "design", "investigative"],
    "twitter_handle": "@EditorialChronicle",
    "facebook_page": "https://facebook.com/editorialchronicle"
}'::jsonb, 'seo', 'Default SEO meta tags and social card settings', TRUE),

('feature_flags', '{
    "enable_comments": true,
    "enable_guest_comments": false,
    "enable_paywall": false,
    "enable_newsletter_popup": true,
    "enable_ad_placements": true,
    "enable_dark_mode": true,
    "enable_reading_time": true,
    "enable_article_reactions": true
}'::jsonb, 'features', 'Global feature toggles', TRUE),

('social_links', '{
    "twitter": "https://twitter.com/editorial",
    "linkedin": "https://linkedin.com/company/editorial",
    "github": "https://github.com/editorial",
    "youtube": "https://youtube.com/@editorial",
    "instagram": "https://instagram.com/editorial",
    "rss": "/feed.xml"
}'::jsonb, 'social', 'Official social media links', TRUE),

('monetization', '{
    "stripe_public_key": "pk_test_sample",
    "membership_enabled": true,
    "monthly_price_usd": 9.99,
    "annual_price_usd": 99.00,
    "free_articles_per_month": 5
}'::jsonb, 'monetization', 'Subscription and paywall configuration', FALSE)
ON CONFLICT (key) DO NOTHING;

-- 10.2. Core Publication Sections
INSERT INTO sections (id, name, slug, description, color_code, icon, sort_order, is_in_navigation, is_featured) VALUES
('11111111-1111-1111-1111-111111111101', 'Technology', 'technology', 'Frontier engineering, artificial intelligence, software design, and digital privacy.', '#2563EB', 'Cpu', 1, TRUE, TRUE),
('11111111-1111-1111-1111-111111111102', 'Business & Markets', 'business', 'Macroeconomics, venture capital, high-growth startups, and corporate leadership.', '#059669', 'TrendingUp', 2, TRUE, TRUE),
('11111111-1111-1111-1111-111111111103', 'Culture & Society', 'culture', 'Essays on modern civilization, literature, contemporary arts, and societal shifts.', '#D97706', 'Compass', 3, TRUE, TRUE),
('11111111-1111-1111-1111-111111111104', 'Science & Space', 'science', 'Cosmology, biotech breakthroughs, climate physics, and fundamental discoveries.', '#7C3AED', 'Atom', 4, TRUE, TRUE),
('11111111-1111-1111-1111-111111111105', 'Design & UI/UX', 'design', 'Craft, ergonomics, digital interfaces, typography, and industrial innovation.', '#EC4899', 'Layers', 5, TRUE, TRUE),
('11111111-1111-1111-1111-111111111106', 'Opinion & Essays', 'opinion', 'Provocative perspectives, editorial critiques, and diverse global commentaries.', '#64748B', 'MessageSquare', 6, TRUE, FALSE)
ON CONFLICT (slug) DO NOTHING;

-- 10.3. Core Editorial Tags
INSERT INTO tags (name, slug, description, is_trending) VALUES
('Artificial Intelligence', 'artificial-intelligence', 'Machine learning models, neural networks, LLMs, and robotics.', TRUE),
('Startups', 'startups', 'Early-stage venture creation, product-market fit, and fundraising.', TRUE),
('Web Development', 'web-development', 'Next.js, TypeScript, PostgreSQL, UI engineering, and web standards.', TRUE),
('Climate & Energy', 'climate-energy', 'Decarbonization technologies, fusion, solar grid systems, and policy.', TRUE),
('Cybersecurity', 'cybersecurity', 'Zero trust architecture, cryptography, data protection, and resilience.', FALSE),
('Design Systems', 'design-systems', 'Component architecture, accessibility, micro-interactions, and visual tokens.', FALSE),
('Product Strategy', 'product-strategy', 'Building impactful consumer and enterprise software products.', FALSE)
ON CONFLICT (slug) DO NOTHING;

-- 10.4. Default Navigation Menus
INSERT INTO navigation_menus (location, title, items, is_active) VALUES
('header_main', 'Primary Header Navigation', '[
    {"label": "Technology", "path": "/section/technology", "type": "section"},
    {"label": "Business", "path": "/section/business", "type": "section"},
    {"label": "Culture", "path": "/section/culture", "type": "section"},
    {"label": "Science", "path": "/section/science", "type": "section"},
    {"label": "Design", "path": "/section/design", "type": "section"},
    {"label": "Opinion", "path": "/section/opinion", "type": "section"},
    {"label": "About", "path": "/about", "type": "page"}
]'::jsonb, TRUE),

('footer_primary', 'Footer Navigation Links', '[
    {"title": "Editorial", "links": [
        {"label": "Our Masthead", "path": "/team"},
        {"label": "Authors Directory", "path": "/authors"},
        {"label": "Editorial Guidelines", "path": "/guidelines"},
        {"label": "Fact-Checking Policy", "path": "/fact-checking"}
    ]},
    {"title": "Explore", "links": [
        {"label": "Archive", "path": "/archive"},
        {"label": "Trending Stories", "path": "/trending"},
        {"label": "Newsletter", "path": "/newsletter"},
        {"label": "RSS Feeds", "path": "/feed.xml"}
    ]},
    {"title": "Company", "links": [
        {"label": "About Us", "path": "/about"},
        {"label": "Careers", "path": "/careers"},
        {"label": "Advertising & Media Kit", "path": "/advertise"},
        {"label": "Contact", "path": "/contact"}
    ]},
    {"title": "Legal", "links": [
        {"label": "Privacy Policy", "path": "/privacy"},
        {"label": "Terms of Service", "path": "/terms"},
        {"label": "Cookie Settings", "path": "/cookies"}
    ]}
]'::jsonb, TRUE)
ON CONFLICT (location) DO NOTHING;

-- ==============================================================================
-- END OF SUPABASE SCHEMA SCRIPT
-- ==============================================================================
