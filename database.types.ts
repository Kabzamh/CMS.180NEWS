export type Json =
  | string
  | number
  | boolean
  | null
  | { [key: string]: Json | undefined }
  | Json[];

export type UserRole =
  | 'superadmin'
  | 'admin'
  | 'editor'
  | 'author'
  | 'contributor'
  | 'moderator'
  | 'subscriber';

export type ArticleStatus =
  | 'draft'
  | 'in_review'
  | 'scheduled'
  | 'published'
  | 'archived';

export type CommentStatus =
  | 'pending'
  | 'approved'
  | 'flagged'
  | 'spam'
  | 'rejected';

export type MediaType =
  | 'image'
  | 'video'
  | 'audio'
  | 'document'
  | 'embed'
  | 'archive'
  | 'other';

export type AdType =
  | 'banner'
  | 'sidebar'
  | 'in_article'
  | 'sponsored_post'
  | 'popup_modal'
  | 'native_card'
  | 'video';

export type AdPlacement =
  | 'header_top'
  | 'header_bottom'
  | 'sidebar_top'
  | 'sidebar_middle'
  | 'sidebar_sticky'
  | 'in_article_top'
  | 'in_article_middle'
  | 'in_article_bottom'
  | 'footer_banner'
  | 'interstitial';

export type AdStatus = 'draft' | 'active' | 'paused' | 'completed' | 'archived';

export type ReactionType =
  | 'like'
  | 'love'
  | 'insightful'
  | 'fire'
  | 'clap'
  | 'mindblown';

export type NewsletterFrequency =
  | 'daily'
  | 'weekly'
  | 'monthly'
  | 'breaking_alerts';

export interface Database {
  public: {
    Tables: {
      settings: {
        Row: {
          id: string;
          key: string;
          value: Json;
          group: string;
          description: string | null;
          is_public: boolean;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          key: string;
          value?: Json;
          group?: string;
          description?: string | null;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          key?: string;
          value?: Json;
          group?: string;
          description?: string | null;
          is_public?: boolean;
          created_at?: string;
          updated_at?: string;
        };
      };
      profiles: {
        Row: {
          id: string;
          email: string;
          full_name: string;
          username: string | null;
          avatar_url: string | null;
          bio: string | null;
          role: UserRole;
          is_verified: boolean;
          phone: string | null;
          website: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id: string;
          email: string;
          full_name: string;
          username?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          role?: UserRole;
          is_verified?: boolean;
          phone?: string | null;
          website?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          full_name?: string;
          username?: string | null;
          avatar_url?: string | null;
          bio?: string | null;
          role?: UserRole;
          is_verified?: boolean;
          phone?: string | null;
          website?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      authors: {
        Row: {
          id: string;
          user_id: string | null;
          name: string;
          slug: string;
          avatar_url: string | null;
          banner_url: string | null;
          bio: string | null;
          short_bio: string | null;
          email: string | null;
          website: string | null;
          twitter_handle: string | null;
          facebook_url: string | null;
          linkedin_url: string | null;
          instagram_handle: string | null;
          github_handle: string | null;
          is_featured: boolean;
          is_active: boolean;
          article_count: number;
          total_views: number;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          name: string;
          slug: string;
          avatar_url?: string | null;
          banner_url?: string | null;
          bio?: string | null;
          short_bio?: string | null;
          email?: string | null;
          website?: string | null;
          twitter_handle?: string | null;
          facebook_url?: string | null;
          linkedin_url?: string | null;
          instagram_handle?: string | null;
          github_handle?: string | null;
          is_featured?: boolean;
          is_active?: boolean;
          article_count?: number;
          total_views?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          name?: string;
          slug?: string;
          avatar_url?: string | null;
          banner_url?: string | null;
          bio?: string | null;
          short_bio?: string | null;
          email?: string | null;
          website?: string | null;
          twitter_handle?: string | null;
          facebook_url?: string | null;
          linkedin_url?: string | null;
          instagram_handle?: string | null;
          github_handle?: string | null;
          is_featured?: boolean;
          is_active?: boolean;
          article_count?: number;
          total_views?: number;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      team: {
        Row: {
          id: string;
          user_id: string | null;
          author_id: string | null;
          name: string;
          slug: string;
          role_title: string;
          department: string;
          bio: string | null;
          avatar_url: string | null;
          email: string | null;
          social_links: Json;
          sort_order: number;
          is_board_member: boolean;
          is_active: boolean;
          joined_date: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          user_id?: string | null;
          author_id?: string | null;
          name: string;
          slug: string;
          role_title: string;
          department?: string;
          bio?: string | null;
          avatar_url?: string | null;
          email?: string | null;
          social_links?: Json;
          sort_order?: number;
          is_board_member?: boolean;
          is_active?: boolean;
          joined_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          user_id?: string | null;
          author_id?: string | null;
          name?: string;
          slug?: string;
          role_title?: string;
          department?: string;
          bio?: string | null;
          avatar_url?: string | null;
          email?: string | null;
          social_links?: Json;
          sort_order?: number;
          is_board_member?: boolean;
          is_active?: boolean;
          joined_date?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      sections: {
        Row: {
          id: string;
          parent_id: string | null;
          name: string;
          slug: string;
          description: string | null;
          color_code: string;
          icon: string | null;
          banner_image_url: string | null;
          sort_order: number;
          is_in_navigation: boolean;
          is_featured: boolean;
          is_active: boolean;
          seo_title: string | null;
          seo_description: string | null;
          seo_keywords: string[] | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          parent_id?: string | null;
          name: string;
          slug: string;
          description?: string | null;
          color_code?: string;
          icon?: string | null;
          banner_image_url?: string | null;
          sort_order?: number;
          is_in_navigation?: boolean;
          is_featured?: boolean;
          is_active?: boolean;
          seo_title?: string | null;
          seo_description?: string | null;
          seo_keywords?: string[] | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          parent_id?: string | null;
          name?: string;
          slug?: string;
          description?: string | null;
          color_code?: string;
          icon?: string | null;
          banner_image_url?: string | null;
          sort_order?: number;
          is_in_navigation?: boolean;
          is_featured?: boolean;
          is_active?: boolean;
          seo_title?: string | null;
          seo_description?: string | null;
          seo_keywords?: string[] | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      tags: {
        Row: {
          id: string;
          name: string;
          slug: string;
          description: string | null;
          is_trending: boolean;
          usage_count: number;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          name: string;
          slug: string;
          description?: string | null;
          is_trending?: boolean;
          usage_count?: number;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          name?: string;
          slug?: string;
          description?: string | null;
          is_trending?: boolean;
          usage_count?: number;
          created_at?: string;
          updated_at?: string;
        };
      };
      articles: {
        Row: {
          id: string;
          title: string;
          subtitle: string | null;
          slug: string;
          excerpt: string | null;
          content: string;
          content_json: Json | null;
          featured_image_url: string | null;
          featured_image_caption: string | null;
          featured_image_alt: string | null;
          section_id: string | null;
          primary_author_id: string | null;
          status: ArticleStatus;
          is_featured: boolean;
          is_breaking: boolean;
          is_editor_pick: boolean;
          is_pinned: boolean;
          is_premium: boolean;
          allow_comments: boolean;
          reading_time_minutes: number;
          view_count: number;
          like_count: number;
          comment_count: number;
          share_count: number;
          published_at: string | null;
          scheduled_for: string | null;
          seo_title: string | null;
          seo_description: string | null;
          seo_keywords: string[] | null;
          canonical_url: string | null;
          meta_og_image: string | null;
          metadata: Json;
          created_by: string | null;
          updated_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          title: string;
          subtitle?: string | null;
          slug: string;
          excerpt?: string | null;
          content: string;
          content_json?: Json | null;
          featured_image_url?: string | null;
          featured_image_caption?: string | null;
          featured_image_alt?: string | null;
          section_id?: string | null;
          primary_author_id?: string | null;
          status?: ArticleStatus;
          is_featured?: boolean;
          is_breaking?: boolean;
          is_editor_pick?: boolean;
          is_pinned?: boolean;
          is_premium?: boolean;
          allow_comments?: boolean;
          reading_time_minutes?: number;
          view_count?: number;
          like_count?: number;
          comment_count?: number;
          share_count?: number;
          published_at?: string | null;
          scheduled_for?: string | null;
          seo_title?: string | null;
          seo_description?: string | null;
          seo_keywords?: string[] | null;
          canonical_url?: string | null;
          meta_og_image?: string | null;
          metadata?: Json;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          title?: string;
          subtitle?: string | null;
          slug?: string;
          excerpt?: string | null;
          content?: string;
          content_json?: Json | null;
          featured_image_url?: string | null;
          featured_image_caption?: string | null;
          featured_image_alt?: string | null;
          section_id?: string | null;
          primary_author_id?: string | null;
          status?: ArticleStatus;
          is_featured?: boolean;
          is_breaking?: boolean;
          is_editor_pick?: boolean;
          is_pinned?: boolean;
          is_premium?: boolean;
          allow_comments?: boolean;
          reading_time_minutes?: number;
          view_count?: number;
          like_count?: number;
          comment_count?: number;
          share_count?: number;
          published_at?: string | null;
          scheduled_for?: string | null;
          seo_title?: string | null;
          seo_description?: string | null;
          seo_keywords?: string[] | null;
          canonical_url?: string | null;
          meta_og_image?: string | null;
          metadata?: Json;
          created_by?: string | null;
          updated_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      comments: {
        Row: {
          id: string;
          article_id: string;
          user_id: string | null;
          parent_id: string | null;
          content: string;
          status: CommentStatus;
          guest_name: string | null;
          guest_email: string | null;
          upvotes: number;
          downvotes: number;
          is_pinned: boolean;
          is_edited: boolean;
          moderation_note: string | null;
          moderated_by: string | null;
          moderated_at: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          article_id: string;
          user_id?: string | null;
          parent_id?: string | null;
          content: string;
          status?: CommentStatus;
          guest_name?: string | null;
          guest_email?: string | null;
          upvotes?: number;
          downvotes?: number;
          is_pinned?: boolean;
          is_edited?: boolean;
          moderation_note?: string | null;
          moderated_by?: string | null;
          moderated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          article_id?: string;
          user_id?: string | null;
          parent_id?: string | null;
          content?: string;
          status?: CommentStatus;
          guest_name?: string | null;
          guest_email?: string | null;
          upvotes?: number;
          downvotes?: number;
          is_pinned?: boolean;
          is_edited?: boolean;
          moderation_note?: string | null;
          moderated_by?: string | null;
          moderated_at?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      media: {
        Row: {
          id: string;
          folder_id: string | null;
          file_name: string;
          file_path: string;
          file_url: string;
          bucket_name: string;
          media_type: MediaType;
          mime_type: string;
          file_size_bytes: number;
          width: number | null;
          height: number | null;
          duration_seconds: number | null;
          alt_text: string | null;
          title: string | null;
          caption: string | null;
          credits: string | null;
          tags: string[] | null;
          metadata: Json;
          uploaded_by: string | null;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          folder_id?: string | null;
          file_name: string;
          file_path: string;
          file_url: string;
          bucket_name?: string;
          media_type?: MediaType;
          mime_type: string;
          file_size_bytes: number;
          width?: number | null;
          height?: number | null;
          duration_seconds?: number | null;
          alt_text?: string | null;
          title?: string | null;
          caption?: string | null;
          credits?: string | null;
          tags?: string[] | null;
          metadata?: Json;
          uploaded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          folder_id?: string | null;
          file_name?: string;
          file_path?: string;
          file_url?: string;
          bucket_name?: string;
          media_type?: MediaType;
          mime_type?: string;
          file_size_bytes?: number;
          width?: number | null;
          height?: number | null;
          duration_seconds?: number | null;
          alt_text?: string | null;
          title?: string | null;
          caption?: string | null;
          credits?: string | null;
          tags?: string[] | null;
          metadata?: Json;
          uploaded_by?: string | null;
          created_at?: string;
          updated_at?: string;
        };
      };
      ads: {
        Row: {
          id: string;
          campaign_id: string | null;
          name: string;
          ad_type: AdType;
          placement: AdPlacement;
          image_url: string | null;
          target_url: string;
          html_code: string | null;
          script_url: string | null;
          target_sections: string[] | null;
          target_devices: string[] | null;
          priority: number;
          weight: number;
          status: AdStatus;
          max_impressions: number | null;
          max_clicks: number | null;
          current_impressions: number;
          current_clicks: number;
          start_date: string | null;
          end_date: string | null;
          metadata: Json;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          campaign_id?: string | null;
          name: string;
          ad_type?: AdType;
          placement: AdPlacement;
          image_url?: string | null;
          target_url: string;
          html_code?: string | null;
          script_url?: string | null;
          target_sections?: string[] | null;
          target_devices?: string[] | null;
          priority?: number;
          weight?: number;
          status?: AdStatus;
          max_impressions?: number | null;
          max_clicks?: number | null;
          current_impressions?: number;
          current_clicks?: number;
          start_date?: string | null;
          end_date?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          campaign_id?: string | null;
          name?: string;
          ad_type?: AdType;
          placement?: AdPlacement;
          image_url?: string | null;
          target_url?: string;
          html_code?: string | null;
          script_url?: string | null;
          target_sections?: string[] | null;
          target_devices?: string[] | null;
          priority?: number;
          weight?: number;
          status?: AdStatus;
          max_impressions?: number | null;
          max_clicks?: number | null;
          current_impressions?: number;
          current_clicks?: number;
          start_date?: string | null;
          end_date?: string | null;
          metadata?: Json;
          created_at?: string;
          updated_at?: string;
        };
      };
      analytics_pageviews: {
        Row: {
          id: string;
          article_id: string | null;
          path: string;
          visitor_id: string | null;
          session_id: string | null;
          user_id: string | null;
          referrer: string | null;
          referrer_domain: string | null;
          utm_source: string | null;
          utm_medium: string | null;
          utm_campaign: string | null;
          utm_term: string | null;
          utm_content: string | null;
          country_code: string | null;
          city: string | null;
          device_type: string | null;
          browser: string | null;
          os: string | null;
          ip_hash: string | null;
          time_on_page_seconds: number;
          scroll_depth_percent: number;
          created_at: string;
        };
        Insert: {
          id?: string;
          article_id?: string | null;
          path: string;
          visitor_id?: string | null;
          session_id?: string | null;
          user_id?: string | null;
          referrer?: string | null;
          referrer_domain?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          utm_term?: string | null;
          utm_content?: string | null;
          country_code?: string | null;
          city?: string | null;
          device_type?: string | null;
          browser?: string | null;
          os?: string | null;
          ip_hash?: string | null;
          time_on_page_seconds?: number;
          scroll_depth_percent?: number;
          created_at?: string;
        };
        Update: {
          id?: string;
          article_id?: string | null;
          path?: string;
          visitor_id?: string | null;
          session_id?: string | null;
          user_id?: string | null;
          referrer?: string | null;
          referrer_domain?: string | null;
          utm_source?: string | null;
          utm_medium?: string | null;
          utm_campaign?: string | null;
          utm_term?: string | null;
          utm_content?: string | null;
          country_code?: string | null;
          city?: string | null;
          device_type?: string | null;
          browser?: string | null;
          os?: string | null;
          ip_hash?: string | null;
          time_on_page_seconds?: number;
          scroll_depth_percent?: number;
          created_at?: string;
        };
      };
      newsletter_subscribers: {
        Row: {
          id: string;
          email: string;
          first_name: string | null;
          last_name: string | null;
          user_id: string | null;
          status: string;
          frequency: NewsletterFrequency;
          subscribed_sections: string[] | null;
          token: string | null;
          confirmed_at: string | null;
          unsubscribed_at: string | null;
          source: string;
          created_at: string;
          updated_at: string;
        };
        Insert: {
          id?: string;
          email: string;
          first_name?: string | null;
          last_name?: string | null;
          user_id?: string | null;
          status?: string;
          frequency?: NewsletterFrequency;
          subscribed_sections?: string[] | null;
          token?: string | null;
          confirmed_at?: string | null;
          unsubscribed_at?: string | null;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
        Update: {
          id?: string;
          email?: string;
          first_name?: string | null;
          last_name?: string | null;
          user_id?: string | null;
          status?: string;
          frequency?: NewsletterFrequency;
          subscribed_sections?: string[] | null;
          token?: string | null;
          confirmed_at?: string | null;
          unsubscribed_at?: string | null;
          source?: string;
          created_at?: string;
          updated_at?: string;
        };
      };
    };
    Functions: {
      increment_article_views: {
        Args: { p_article_id: string };
        Returns: void;
      };
      track_ad_impression: {
        Args: {
          p_ad_id: string;
          p_article_id?: string | null;
          p_visitor_id?: string | null;
          p_user_agent?: string | null;
          p_device_type?: string | null;
          p_referrer?: string | null;
          p_ip_hash?: string | null;
        };
        Returns: void;
      };
      track_ad_click: {
        Args: {
          p_ad_id: string;
          p_article_id?: string | null;
          p_visitor_id?: string | null;
          p_user_agent?: string | null;
          p_referrer?: string | null;
          p_ip_hash?: string | null;
        };
        Returns: void;
      };
      search_articles: {
        Args: {
          search_query: string;
          section_slug?: string | null;
          tag_slug?: string | null;
          limit_val?: number;
          offset_val?: number;
        };
        Returns: {
          id: string;
          title: string;
          subtitle: string | null;
          slug: string;
          excerpt: string | null;
          featured_image_url: string | null;
          published_at: string | null;
          reading_time_minutes: number;
          view_count: number;
          like_count: number;
          section_name: string;
          section_slug: string;
          author_name: string | null;
          author_avatar_url: string | null;
          rank: number;
        }[];
      };
    };
  };
}
