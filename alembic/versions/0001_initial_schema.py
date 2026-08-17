"""initial_schema

Schema de depart pour le depot watchdeck, capture par pg_dump --schema-only
depuis la base plex-rss (Postgres 15) apres application complete de son
historique de 133 migrations Alembic (0001 -> f364147d0334). Verifie par
diff : appliquer cette migration seule sur une base vide produit un schema
identique (table par table, colonne par colonne, index, contraintes,
sequences) a celui obtenu en rejouant l'integralite de l'ancien historique.

Revision ID: 0001_initial_schema
Revises:
Create Date: 2026-08-16
"""
from alembic import op

revision = "0001_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


SCHEMA_SQL = r"""
--
-- PostgreSQL database dump
--


-- Dumped from database version 15.19
-- Dumped by pg_dump version 15.19

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: download_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.download_history (
    id integer NOT NULL,
    title character varying NOT NULL,
    year integer,
    media_type character varying NOT NULL,
    source character varying NOT NULL,
    instance_name character varying,
    poster_url character varying,
    request_id integer,
    completed_at timestamp without time zone NOT NULL,
    arr_instance_id integer,
    arr_history_id integer,
    processing_mode character varying
);


--
-- Name: _alembic_tmp_download_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public._alembic_tmp_download_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: _alembic_tmp_download_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public._alembic_tmp_download_history_id_seq OWNED BY public.download_history.id;


--
-- Name: admin_action_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.admin_action_logs (
    id integer NOT NULL,
    created_at timestamp without time zone NOT NULL,
    action character varying NOT NULL,
    actor_user_id integer,
    actor_name character varying,
    summary character varying NOT NULL,
    target_count integer DEFAULT 0 NOT NULL,
    details text
);


--
-- Name: admin_action_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.admin_action_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: admin_action_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.admin_action_logs_id_seq OWNED BY public.admin_action_logs.id;


--
-- Name: arr_instances; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.arr_instances (
    id integer NOT NULL,
    name character varying NOT NULL,
    arr_type character varying NOT NULL,
    url character varying NOT NULL,
    api_key character varying NOT NULL,
    quality_profile_id integer,
    root_folder character varying,
    minimum_availability character varying DEFAULT 'released'::character varying NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    is_default boolean DEFAULT false NOT NULL,
    indexer_ids character varying
);


--
-- Name: arr_instances_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.arr_instances_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: arr_instances_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.arr_instances_id_seq OWNED BY public.arr_instances.id;


--
-- Name: deleted_media_log; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.deleted_media_log (
    id integer NOT NULL,
    media_type character varying NOT NULL,
    tmdb_id character varying,
    tvdb_id character varying,
    imdb_id character varying,
    title character varying NOT NULL,
    deleted_at timestamp without time zone NOT NULL,
    deleted_by character varying,
    blocked boolean DEFAULT false NOT NULL
);


--
-- Name: deleted_media_log_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.deleted_media_log_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: deleted_media_log_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.deleted_media_log_id_seq OWNED BY public.deleted_media_log.id;


--
-- Name: diagnostic_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.diagnostic_events (
    id integer NOT NULL,
    created_at timestamp without time zone NOT NULL,
    request_id integer,
    correlation_id character varying,
    category character varying NOT NULL,
    action character varying NOT NULL,
    status character varying DEFAULT 'success'::character varying NOT NULL,
    title character varying,
    media_type character varying,
    source character varying,
    message text DEFAULT ''::text NOT NULL,
    details text
);


--
-- Name: diagnostic_events_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.diagnostic_events_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: diagnostic_events_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.diagnostic_events_id_seq OWNED BY public.diagnostic_events.id;


--
-- Name: download_clients; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.download_clients (
    id integer NOT NULL,
    name character varying NOT NULL,
    client_type character varying NOT NULL,
    url character varying NOT NULL,
    username character varying,
    password character varying,
    category character varying,
    tags character varying,
    is_default boolean NOT NULL,
    enabled boolean NOT NULL
);


--
-- Name: download_clients_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.download_clients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: download_clients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.download_clients_id_seq OWNED BY public.download_clients.id;


--
-- Name: email_branding; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_branding (
    settings_id integer NOT NULL,
    header_brand character varying,
    header_subtitle character varying,
    footer_template text,
    templates_backup text,
    show_poster boolean,
    show_genres boolean,
    show_requester boolean,
    requester_label character varying,
    brand_color character varying,
    show_header_subtitle boolean,
    poster_width integer,
    media_layout character varying,
    bg_color character varying,
    card_bg_color character varying,
    font_family character varying,
    card_width integer,
    card_border_radius integer,
    synopsis_font_size character varying,
    show_tmdb_link boolean,
    show_plex_button boolean
);


--
-- Name: email_providers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_providers (
    id integer NOT NULL,
    name character varying NOT NULL,
    provider_type character varying NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    smtp_host character varying,
    smtp_port integer DEFAULT 587 NOT NULL,
    smtp_tls boolean DEFAULT true NOT NULL,
    smtp_user character varying,
    smtp_password text,
    oauth_tenant character varying DEFAULT 'consumers'::character varying NOT NULL,
    oauth_client_id character varying,
    oauth_client_secret text,
    oauth_mailbox character varying,
    oauth_refresh_token text,
    oauth_access_token text,
    oauth_token_expires_at timestamp without time zone,
    brevo_api_key text
);


--
-- Name: email_providers_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_providers_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_providers_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_providers_id_seq OWNED BY public.email_providers.id;


--
-- Name: email_templates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.email_templates (
    id integer NOT NULL,
    settings_id integer NOT NULL,
    event character varying NOT NULL,
    template text,
    subject character varying,
    accent_color character varying,
    badge_text character varying,
    headline_text character varying,
    show_synopsis boolean
);


--
-- Name: email_templates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.email_templates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: email_templates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.email_templates_id_seq OWNED BY public.email_templates.id;


--
-- Name: episode_availability; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.episode_availability (
    id integer NOT NULL,
    source_type character varying NOT NULL,
    source_id integer NOT NULL,
    season_number integer NOT NULL,
    episode_number integer NOT NULL,
    has_file boolean DEFAULT false NOT NULL,
    air_date_utc character varying,
    checked_at timestamp without time zone
);


--
-- Name: episode_availability_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.episode_availability_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: episode_availability_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.episode_availability_id_seq OWNED BY public.episode_availability.id;


--
-- Name: episode_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.episode_metadata (
    id integer NOT NULL,
    source_type character varying NOT NULL,
    source_id integer NOT NULL,
    season_number integer NOT NULL,
    episode_number integer NOT NULL,
    title character varying,
    overview text,
    still_url character varying,
    air_date character varying,
    updated_at timestamp without time zone,
    audio_tracks text,
    subtitles text
);


--
-- Name: episode_metadata_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.episode_metadata_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: episode_metadata_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.episode_metadata_id_seq OWNED BY public.episode_metadata.id;


--
-- Name: job_run_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.job_run_logs (
    id integer NOT NULL,
    job character varying NOT NULL,
    started_at timestamp without time zone NOT NULL,
    duration_ms integer,
    status character varying NOT NULL,
    error text
);


--
-- Name: job_run_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.job_run_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: job_run_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.job_run_logs_id_seq OWNED BY public.job_run_logs.id;


--
-- Name: library_analytics_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.library_analytics_snapshots (
    id integer NOT NULL,
    payload_json text NOT NULL,
    item_count integer DEFAULT 0 NOT NULL,
    generated_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL
);


--
-- Name: library_analytics_snapshots_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.library_analytics_snapshots_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: library_analytics_snapshots_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.library_analytics_snapshots_id_seq OWNED BY public.library_analytics_snapshots.id;


--
-- Name: library_items; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.library_items (
    id integer NOT NULL,
    title character varying NOT NULL,
    year integer,
    media_type character varying NOT NULL,
    tmdb_id character varying,
    tvdb_id character varying,
    imdb_id character varying,
    plex_guid character varying,
    poster_url character varying,
    overview text,
    added_at timestamp without time zone,
    arr_instance_id integer,
    arr_id integer,
    arr_slug character varying,
    has_vf boolean,
    vf_category character varying,
    vf_checked_at timestamp without time zone,
    vf_available_at timestamp without time zone,
    created_at timestamp without time zone,
    updated_at timestamp without time zone,
    vf_granularity character varying,
    audio_codec character varying,
    audio_bitrate integer,
    audio_sample_rate integer,
    audio_channels integer,
    duration_ms integer,
    fr_is_default boolean,
    genres text,
    art_url text,
    sub_fr_status character varying,
    forced_fr_status character varying
);


--
-- Name: library_items_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.library_items_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: library_items_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.library_items_id_seq OWNED BY public.library_items.id;


--
-- Name: login_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.login_attempts (
    id integer NOT NULL,
    ip_address character varying NOT NULL,
    username character varying,
    attempted_at timestamp without time zone NOT NULL,
    success boolean DEFAULT false NOT NULL,
    reason character varying
);


--
-- Name: login_attempts_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.login_attempts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: login_attempts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.login_attempts_id_seq OWNED BY public.login_attempts.id;


--
-- Name: media_issues; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_issues (
    id integer NOT NULL,
    created_at timestamp without time zone NOT NULL,
    updated_at timestamp without time zone NOT NULL,
    status character varying DEFAULT 'open'::character varying NOT NULL,
    issue_type character varying NOT NULL,
    message text,
    reporter_plex_user_id character varying,
    reporter_name character varying,
    library_item_id integer,
    request_id integer,
    title character varying NOT NULL,
    media_type character varying NOT NULL,
    tmdb_id character varying,
    tvdb_id character varying,
    imdb_id character varying,
    admin_note text
);


--
-- Name: media_issues_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.media_issues_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: media_issues_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.media_issues_id_seq OWNED BY public.media_issues.id;


--
-- Name: media_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.media_requests (
    id integer NOT NULL,
    plex_user_id character varying NOT NULL,
    plex_user character varying,
    title character varying NOT NULL,
    year integer,
    media_type character varying NOT NULL,
    tmdb_id character varying,
    tvdb_id character varying,
    imdb_id character varying,
    plex_guid character varying,
    status character varying,
    source character varying,
    arr_id integer,
    request_mail_sent boolean,
    available_mail_sent boolean,
    requested_at timestamp without time zone,
    available_at timestamp without time zone,
    poster_url character varying,
    overview text,
    arr_slug character varying,
    extra_requesters text,
    next_release_at timestamp without time zone,
    next_release_label character varying,
    arr_instance_id integer,
    download_client_id integer,
    torrent_hash character varying,
    has_vf boolean,
    vf_category character varying,
    vf_checked_at timestamp without time zone,
    vf_available_at timestamp without time zone,
    vf_available_mail_sent boolean DEFAULT false NOT NULL,
    vo_only_mail_sent boolean DEFAULT false NOT NULL,
    library_item_id integer,
    episodes_available_count integer,
    episodes_aired_count integer,
    episodes_total_count integer,
    partial_available_mail_sent boolean DEFAULT false NOT NULL,
    last_notified_episode_count integer,
    vf_granularity character varying,
    approved_by character varying,
    approved_at timestamp without time zone,
    rejected_reason character varying,
    is_downloading boolean DEFAULT false NOT NULL,
    failure_mail_sent boolean DEFAULT false NOT NULL,
    arr_processed_at timestamp without time zone,
    notify_suppressed boolean DEFAULT false NOT NULL,
    vf_tracking_disabled boolean DEFAULT false NOT NULL,
    diagnostic_context text,
    fulfillment_status character varying DEFAULT 'not_submitted'::character varying NOT NULL,
    fulfillment_updated_at timestamp without time zone,
    fulfillment_error text,
    torrent_name character varying,
    torrent_content_path text,
    torrent_completed_at timestamp without time zone,
    torrent_import_verified_at timestamp without time zone,
    fr_is_default boolean
);


--
-- Name: media_requests_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.media_requests_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: media_requests_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.media_requests_id_seq OWNED BY public.media_requests.id;


--
-- Name: notification_logs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_logs (
    id integer NOT NULL,
    sent_at timestamp without time zone NOT NULL,
    event character varying NOT NULL,
    recipient character varying NOT NULL,
    is_admin boolean DEFAULT false NOT NULL,
    media_title character varying,
    media_type character varying,
    success boolean DEFAULT true NOT NULL,
    error_msg character varying,
    req_id integer,
    scope character varying,
    language character varying,
    is_upgrade boolean DEFAULT false NOT NULL,
    season_number integer,
    episode_number integer,
    channel character varying DEFAULT 'email'::character varying NOT NULL,
    triggered_by character varying DEFAULT 'auto'::character varying NOT NULL
);


--
-- Name: notification_logs_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_logs_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_logs_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_logs_id_seq OWNED BY public.notification_logs.id;


--
-- Name: notification_milestones; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.notification_milestones (
    id integer NOT NULL,
    created_at timestamp without time zone NOT NULL,
    req_id integer NOT NULL,
    plex_user_id character varying NOT NULL,
    direction character varying NOT NULL,
    milestone_type character varying NOT NULL,
    season_number integer,
    episode_number integer,
    language character varying,
    is_upgrade boolean DEFAULT false NOT NULL
);


--
-- Name: notification_milestones_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.notification_milestones_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: notification_milestones_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.notification_milestones_id_seq OWNED BY public.notification_milestones.id;


--
-- Name: passkey_credentials; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.passkey_credentials (
    id integer NOT NULL,
    user_id integer NOT NULL,
    credential_id character varying NOT NULL,
    public_key text NOT NULL,
    sign_count integer DEFAULT 0 NOT NULL,
    name character varying DEFAULT 'Passkey'::character varying NOT NULL,
    created_at timestamp without time zone NOT NULL
);


--
-- Name: passkey_credentials_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.passkey_credentials_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: passkey_credentials_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.passkey_credentials_id_seq OWNED BY public.passkey_credentials.id;


--
-- Name: pending_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.pending_notifications (
    id integer NOT NULL,
    created_at timestamp without time zone NOT NULL,
    event character varying NOT NULL,
    req_id integer NOT NULL,
    recipients character varying NOT NULL,
    reason character varying DEFAULT ''::character varying NOT NULL
);


--
-- Name: pending_notifications_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.pending_notifications_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: pending_notifications_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.pending_notifications_id_seq OWNED BY public.pending_notifications.id;


--
-- Name: playback_daily_aggregates; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playback_daily_aggregates (
    id integer NOT NULL,
    day date NOT NULL,
    user_name character varying DEFAULT ''::character varying NOT NULL,
    media_type character varying DEFAULT ''::character varying NOT NULL,
    media_label character varying DEFAULT ''::character varying NOT NULL,
    playback_method character varying DEFAULT 'unknown'::character varying NOT NULL,
    sessions integer DEFAULT 0 NOT NULL,
    watch_ms bigint DEFAULT '0'::bigint NOT NULL,
    transcodes integer DEFAULT 0 NOT NULL
);


--
-- Name: playback_daily_aggregates_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.playback_daily_aggregates_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: playback_daily_aggregates_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.playback_daily_aggregates_id_seq OWNED BY public.playback_daily_aggregates.id;


--
-- Name: playback_ip_locations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playback_ip_locations (
    id integer NOT NULL,
    address_hash character varying NOT NULL,
    geo_status character varying NOT NULL,
    geo_city character varying,
    geo_region character varying,
    geo_country character varying,
    geo_country_code character varying,
    geo_lat double precision,
    geo_lon double precision,
    created_at timestamp without time zone NOT NULL,
    last_used_at timestamp without time zone NOT NULL,
    geo_isp character varying,
    geo_organization character varying,
    geo_asn character varying
);


--
-- Name: playback_ip_locations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.playback_ip_locations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: playback_ip_locations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.playback_ip_locations_id_seq OWNED BY public.playback_ip_locations.id;


--
-- Name: playback_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playback_sessions (
    id integer NOT NULL,
    source character varying DEFAULT 'plex'::character varying NOT NULL,
    source_session_id character varying NOT NULL,
    user_name character varying,
    plex_user_id character varying,
    media_type character varying,
    title character varying NOT NULL,
    grandparent_title character varying,
    parent_title character varying,
    year integer,
    rating_key character varying,
    library_section_title character varying,
    thumb_url character varying,
    player_title character varying,
    platform character varying,
    product character varying,
    player_address character varying,
    state character varying,
    playback_method character varying,
    video_decision character varying,
    audio_decision character varying,
    quality character varying,
    video_codec character varying,
    audio_codec character varying,
    bandwidth_kbps integer,
    progress_ms bigint,
    duration_ms bigint,
    watched_ms bigint DEFAULT 0 NOT NULL,
    started_at timestamp without time zone NOT NULL,
    last_seen_at timestamp without time zone NOT NULL,
    ended_at timestamp without time zone,
    media_request_id integer,
    container character varying,
    subtitle_decision character varying,
    stream_location character varying,
    media_size_bytes bigint,
    progress_percent double precision,
    watched_status double precision,
    group_count integer DEFAULT 1 NOT NULL,
    source_group_ids text,
    session_key bigint,
    geo_status character varying,
    geo_city character varying,
    geo_region character varying,
    geo_country character varying,
    geo_country_code character varying,
    geo_lat double precision,
    geo_lon double precision,
    reference_id integer,
    initial_progress_ms bigint DEFAULT '0'::bigint NOT NULL,
    force_stopped boolean DEFAULT false NOT NULL,
    geo_isp character varying,
    geo_organization character varying,
    geo_asn character varying
);


--
-- Name: playback_sessions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.playback_sessions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: playback_sessions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.playback_sessions_id_seq OWNED BY public.playback_sessions.id;


--
-- Name: plex_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.plex_users (
    id integer NOT NULL,
    plex_user_id character varying NOT NULL,
    display_name character varying,
    plex_email character varying,
    notification_email character varying,
    enabled boolean,
    created_at timestamp without time zone,
    notify_admin boolean DEFAULT true NOT NULL,
    seer_active boolean,
    seer_user_id integer,
    custom_name character varying,
    source character varying,
    notify_on_request boolean DEFAULT true,
    notify_on_available boolean DEFAULT true,
    notify_digest boolean DEFAULT false,
    discord_webhook_url character varying,
    telegram_chat_id character varying,
    sonarr_instance_id integer,
    radarr_instance_id integer,
    notify_vf_movie boolean DEFAULT true,
    notify_vf_series boolean DEFAULT true,
    role character varying DEFAULT 'user'::character varying NOT NULL,
    can_login boolean DEFAULT true NOT NULL,
    plex_account_uuid character varying,
    avatar_url character varying,
    last_login_at timestamp without time zone,
    auto_approve boolean DEFAULT false NOT NULL,
    locale character varying,
    password_hash character varying,
    totp_secret character varying,
    totp_enabled boolean DEFAULT false NOT NULL,
    movie_notify_language boolean,
    series_notify_language boolean,
    series_notify_granularity character varying
);


--
-- Name: plex_users_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.plex_users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: plex_users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.plex_users_id_seq OWNED BY public.plex_users.id;


--
-- Name: poll_history; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.poll_history (
    id integer NOT NULL,
    job character varying NOT NULL,
    started_at timestamp without time zone NOT NULL,
    duration_ms integer,
    items_processed integer DEFAULT 0 NOT NULL,
    new_requests integer DEFAULT 0 NOT NULL,
    newly_available integer DEFAULT 0 NOT NULL,
    errors integer DEFAULT 0 NOT NULL,
    error_detail character varying
);


--
-- Name: poll_history_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.poll_history_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: poll_history_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.poll_history_id_seq OWNED BY public.poll_history.id;


--
-- Name: radarr_queue_observations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.radarr_queue_observations (
    id integer NOT NULL,
    request_id integer,
    arr_instance_id integer NOT NULL,
    queue_id integer NOT NULL,
    arr_media_id integer,
    title character varying,
    state character varying DEFAULT 'queued'::character varying NOT NULL,
    progress double precision DEFAULT '0'::double precision NOT NULL,
    tracked_state character varying,
    tracked_status character varying,
    error_message text,
    consecutive_blocked_checks integer DEFAULT 0 NOT NULL,
    first_seen_at timestamp without time zone NOT NULL,
    last_seen_at timestamp without time zone NOT NULL,
    blocked_at timestamp without time zone,
    admin_alert_queued_at timestamp without time zone,
    resolved_at timestamp without time zone
);


--
-- Name: radarr_queue_observations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.radarr_queue_observations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: radarr_queue_observations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.radarr_queue_observations_id_seq OWNED BY public.radarr_queue_observations.id;


--
-- Name: request_season_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.request_season_status (
    id integer NOT NULL,
    request_id integer NOT NULL,
    season_number integer NOT NULL,
    episodes_available_count integer DEFAULT 0 NOT NULL,
    episodes_total_count integer DEFAULT 0 NOT NULL,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    updated_at timestamp without time zone
);


--
-- Name: request_season_status_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.request_season_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: request_season_status_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.request_season_status_id_seq OWNED BY public.request_season_status.id;


--
-- Name: search_cache; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.search_cache (
    id integer NOT NULL,
    query character varying NOT NULL,
    category character varying,
    results_json text NOT NULL,
    cached_at timestamp without time zone NOT NULL
);


--
-- Name: search_cache_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.search_cache_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: search_cache_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.search_cache_id_seq OWNED BY public.search_cache.id;


--
-- Name: series_acquisition_batches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.series_acquisition_batches (
    id integer NOT NULL,
    request_id integer,
    arr_instance_id integer NOT NULL,
    arr_id integer NOT NULL,
    source character varying,
    expected_scope character varying DEFAULT 'monitored_seasons'::character varying NOT NULL,
    expected_seasons text DEFAULT '[]'::text,
    status character varying DEFAULT 'open'::character varying NOT NULL,
    opened_at timestamp without time zone NOT NULL,
    last_sonarr_activity_at timestamp without time zone,
    last_plex_change_at timestamp without time zone,
    stabilization_started_at timestamp without time zone,
    pending_events text DEFAULT '[]'::text,
    summary_queued_at timestamp without time zone,
    closed_at timestamp without time zone
);


--
-- Name: series_acquisition_batches_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.series_acquisition_batches_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: series_acquisition_batches_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.series_acquisition_batches_id_seq OWNED BY public.series_acquisition_batches.id;


--
-- Name: settings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.settings (
    id integer NOT NULL,
    plex_url character varying,
    plex_token character varying,
    plex_rss_url character varying,
    watchlist_source_priority character varying,
    watchlist_fallback_enabled boolean,
    poll_interval_minutes integer,
    sonarr_url character varying,
    sonarr_api_key character varying,
    sonarr_quality_profile_id integer,
    sonarr_root_folder character varying,
    sonarr_enabled boolean,
    radarr_url character varying,
    radarr_api_key character varying,
    radarr_quality_profile_id integer,
    radarr_root_folder character varying,
    radarr_enabled boolean,
    smtp_from character varying,
    email_on_request boolean,
    email_on_available boolean,
    discord_webhook_url character varying,
    telegram_bot_token character varying,
    telegram_chat_id character varying,
    auth_username character varying,
    auth_password_hash character varying,
    admin_notification_email character varying,
    radarr_minimum_availability character varying DEFAULT 'released'::character varying NOT NULL,
    seer_url character varying,
    seer_api_key character varying,
    seer_enabled boolean DEFAULT false NOT NULL,
    api_token character varying,
    notification_log_retention_days integer,
    digest_enabled boolean DEFAULT false NOT NULL,
    digest_hour integer DEFAULT 8 NOT NULL,
    ntfy_url character varying,
    ntfy_token character varying,
    gotify_url character varying,
    gotify_token character varying,
    poll_history_retention_days integer,
    torrent_required_keywords character varying,
    torrent_forbidden_keywords character varying,
    torrent_min_size_gb double precision,
    torrent_max_size_gb double precision,
    torrent_ratio_limit double precision,
    torrent_seed_time_limit_hours integer,
    torrent_auto_delete_files boolean DEFAULT false NOT NULL,
    seer_send_requests boolean DEFAULT false NOT NULL,
    seer_fallback_arr boolean DEFAULT true NOT NULL,
    vff_enabled boolean DEFAULT false NOT NULL,
    vff_libraries text,
    vff_recheck_interval_minutes integer DEFAULT 360 NOT NULL,
    vff_auto_search boolean DEFAULT false NOT NULL,
    email_on_vf_available boolean DEFAULT true NOT NULL,
    webhook_secret character varying,
    plex_verify_ssl boolean DEFAULT true NOT NULL,
    poll_interval_seconds integer,
    tmdb_api_key character varying,
    email_on_failure boolean DEFAULT true NOT NULL,
    discord_enabled boolean DEFAULT true NOT NULL,
    discord_send_request boolean DEFAULT true NOT NULL,
    discord_send_available boolean DEFAULT true NOT NULL,
    discord_send_failure boolean DEFAULT true NOT NULL,
    telegram_enabled boolean DEFAULT true NOT NULL,
    telegram_send_request boolean DEFAULT true NOT NULL,
    telegram_send_available boolean DEFAULT true NOT NULL,
    telegram_send_failure boolean DEFAULT true NOT NULL,
    ntfy_enabled boolean DEFAULT true NOT NULL,
    ntfy_send_request boolean DEFAULT true NOT NULL,
    ntfy_send_available boolean DEFAULT true NOT NULL,
    ntfy_send_failure boolean DEFAULT true NOT NULL,
    gotify_enabled boolean DEFAULT true NOT NULL,
    gotify_send_request boolean DEFAULT true NOT NULL,
    gotify_send_available boolean DEFAULT true NOT NULL,
    gotify_send_failure boolean DEFAULT true NOT NULL,
    require_approval boolean DEFAULT false NOT NULL,
    api_token_scopes text,
    totp_secret character varying,
    totp_enabled boolean DEFAULT false NOT NULL,
    default_locale character varying DEFAULT 'fr'::character varying NOT NULL,
    movie_notify_language boolean DEFAULT true NOT NULL,
    series_notify_language boolean DEFAULT true NOT NULL,
    series_notify_granularity character varying DEFAULT 'jalons'::character varying NOT NULL,
    email_enabled boolean DEFAULT true,
    tmdb_enabled boolean DEFAULT true NOT NULL,
    seer_suppress_notifications boolean DEFAULT true NOT NULL,
    seer_mode character varying DEFAULT 'observer'::character varying NOT NULL,
    arr_poll_interval_seconds integer DEFAULT 900 NOT NULL,
    plex_recent_sync_last_at timestamp without time zone,
    digest_minute integer DEFAULT 0 NOT NULL,
    plex_sync_interval_hours integer DEFAULT 24 NOT NULL,
    plex_sync_recent_interval_minutes integer DEFAULT 5 NOT NULL,
    public_base_url character varying,
    availability_confirmation_mode character varying DEFAULT 'hybrid'::character varying NOT NULL,
    availability_confirmation_timeout_minutes integer DEFAULT 30 NOT NULL,
    notification_hold_enabled boolean DEFAULT false NOT NULL,
    notify_import_blocked boolean DEFAULT true NOT NULL,
    gdpr_contact_name character varying,
    gdpr_contact_email character varying,
    login_attempt_retention_days integer DEFAULT 90,
    audit_log_retention_days integer,
    live_activity_enabled boolean DEFAULT true NOT NULL,
    activity_retention_days integer DEFAULT 365,
    activity_anonymize_ips boolean DEFAULT true NOT NULL,
    tautulli_enabled boolean DEFAULT false NOT NULL,
    tautulli_url character varying,
    tautulli_api_key text,
    tmdb_region character varying DEFAULT 'FR'::character varying NOT NULL,
    vf_upgrade_enabled boolean DEFAULT true,
    vf_upgrade_include_vo boolean DEFAULT true,
    vf_upgrade_include_mixed boolean DEFAULT true,
    vf_upgrade_include_vf boolean DEFAULT false,
    vf_upgrade_cooldown_hours integer DEFAULT 24,
    vf_upgrade_max_searches_per_run integer DEFAULT 40,
    vf_upgrade_search_concurrency integer DEFAULT 3,
    vf_upgrade_retry_hours integer DEFAULT 6,
    vf_upgrade_priority character varying DEFAULT 'mixed,vo,vf'::character varying,
    vf_upgrade_markers character varying DEFAULT 'truefrench,vff,multi,vfi,vfq'::character varying,
    vf_upgrade_preference character varying DEFAULT 'truefrench,vff,multi,vfi,vfq'::character varying,
    vf_upgrade_accept_secondary boolean DEFAULT true,
    vf_upgrade_require_default boolean DEFAULT false,
    vf_upgrade_min_confidence integer DEFAULT 65,
    vf_upgrade_block_arr_rejected boolean DEFAULT true,
    vf_upgrade_protect_resolution boolean DEFAULT true,
    vf_upgrade_preserve_hdr boolean DEFAULT true,
    vf_upgrade_protect_custom_format_score boolean DEFAULT true,
    vf_upgrade_min_size_gb double precision,
    vf_upgrade_max_size_gb double precision,
    vf_upgrade_allow_technical_downgrade boolean DEFAULT false,
    vf_upgrade_verify_after_import boolean DEFAULT true,
    vf_upgrade_verification_timeout_minutes integer DEFAULT 120,
    vf_upgrade_trigger_plex_scan boolean DEFAULT true,
    vf_upgrade_max_retries integer DEFAULT 3,
    vf_upgrade_blacklist_failed boolean DEFAULT true,
    vf_upgrade_mixed_mode character varying DEFAULT 'episodes'::character varying,
    vf_upgrade_protect_existing_vf boolean DEFAULT true,
    vf_upgrade_notify_found boolean DEFAULT false,
    vf_upgrade_notify_accepted boolean DEFAULT false,
    vf_upgrade_notify_downloading boolean DEFAULT false,
    vf_upgrade_notify_failed boolean DEFAULT true,
    vf_upgrade_notify_verified boolean DEFAULT true,
    vf_upgrade_history_retention_days integer DEFAULT 90
);


--
-- Name: sonarr_queue_observations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.sonarr_queue_observations (
    id integer NOT NULL,
    batch_id integer,
    request_id integer,
    arr_instance_id integer NOT NULL,
    queue_id integer NOT NULL,
    download_id character varying,
    arr_media_id integer,
    season_number integer,
    episode_number integer,
    title character varying,
    state character varying DEFAULT 'queued'::character varying NOT NULL,
    progress double precision DEFAULT '0'::double precision NOT NULL,
    tracked_state character varying,
    tracked_status character varying,
    error_message text,
    status_messages text,
    consecutive_blocked_checks integer DEFAULT 0 NOT NULL,
    first_seen_at timestamp without time zone NOT NULL,
    last_seen_at timestamp without time zone NOT NULL,
    blocked_at timestamp without time zone,
    admin_alert_queued_at timestamp without time zone,
    resolved_at timestamp without time zone
);


--
-- Name: sonarr_queue_observations_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.sonarr_queue_observations_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: sonarr_queue_observations_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.sonarr_queue_observations_id_seq OWNED BY public.sonarr_queue_observations.id;


--
-- Name: tracker_favicons; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.tracker_favicons (
    id integer NOT NULL,
    host character varying NOT NULL,
    source_url character varying,
    content bytea,
    content_type character varying,
    status character varying DEFAULT 'missing'::character varying NOT NULL,
    fetched_at timestamp without time zone NOT NULL,
    expires_at timestamp without time zone NOT NULL
);


--
-- Name: tracker_favicons_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.tracker_favicons_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: tracker_favicons_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.tracker_favicons_id_seq OWNED BY public.tracker_favicons.id;


--
-- Name: vf_episode_status; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vf_episode_status (
    id integer NOT NULL,
    source_type character varying NOT NULL,
    source_id integer NOT NULL,
    season_number integer NOT NULL,
    episode_number integer NOT NULL,
    has_vf boolean DEFAULT false NOT NULL,
    checked_at timestamp without time zone,
    fr_is_default boolean,
    is_known_episode boolean DEFAULT true NOT NULL
);


--
-- Name: vf_episode_status_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vf_episode_status_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vf_episode_status_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vf_episode_status_id_seq OWNED BY public.vf_episode_status.id;


--
-- Name: vf_upgrade_suggestions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.vf_upgrade_suggestions (
    id integer NOT NULL,
    source_type character varying NOT NULL,
    source_id integer NOT NULL,
    scope character varying NOT NULL,
    season_number integer,
    episode_number integer,
    releases_json text,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    grabbed_release_guid character varying,
    scanned_at timestamp without time zone,
    updated_at timestamp without time zone,
    arr_message text,
    accepted_at timestamp without time zone,
    queue_confirmed_at timestamp without time zone,
    completed_at timestamp without time zone,
    failed_at timestamp without time zone,
    retry_count integer DEFAULT 0 NOT NULL,
    current_release_titles_json text,
    origin character varying DEFAULT 'legacy'::character varying NOT NULL,
    target_kind character varying
);


--
-- Name: vf_upgrade_suggestions_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.vf_upgrade_suggestions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: vf_upgrade_suggestions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.vf_upgrade_suggestions_id_seq OWNED BY public.vf_upgrade_suggestions.id;


--
-- Name: admin_action_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_action_logs ALTER COLUMN id SET DEFAULT nextval('public.admin_action_logs_id_seq'::regclass);


--
-- Name: arr_instances id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arr_instances ALTER COLUMN id SET DEFAULT nextval('public.arr_instances_id_seq'::regclass);


--
-- Name: deleted_media_log id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deleted_media_log ALTER COLUMN id SET DEFAULT nextval('public.deleted_media_log_id_seq'::regclass);


--
-- Name: diagnostic_events id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnostic_events ALTER COLUMN id SET DEFAULT nextval('public.diagnostic_events_id_seq'::regclass);


--
-- Name: download_clients id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.download_clients ALTER COLUMN id SET DEFAULT nextval('public.download_clients_id_seq'::regclass);


--
-- Name: download_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.download_history ALTER COLUMN id SET DEFAULT nextval('public._alembic_tmp_download_history_id_seq'::regclass);


--
-- Name: email_providers id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_providers ALTER COLUMN id SET DEFAULT nextval('public.email_providers_id_seq'::regclass);


--
-- Name: email_templates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates ALTER COLUMN id SET DEFAULT nextval('public.email_templates_id_seq'::regclass);


--
-- Name: episode_availability id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.episode_availability ALTER COLUMN id SET DEFAULT nextval('public.episode_availability_id_seq'::regclass);


--
-- Name: episode_metadata id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.episode_metadata ALTER COLUMN id SET DEFAULT nextval('public.episode_metadata_id_seq'::regclass);


--
-- Name: job_run_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_run_logs ALTER COLUMN id SET DEFAULT nextval('public.job_run_logs_id_seq'::regclass);


--
-- Name: library_analytics_snapshots id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_analytics_snapshots ALTER COLUMN id SET DEFAULT nextval('public.library_analytics_snapshots_id_seq'::regclass);


--
-- Name: library_items id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_items ALTER COLUMN id SET DEFAULT nextval('public.library_items_id_seq'::regclass);


--
-- Name: login_attempts id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempts ALTER COLUMN id SET DEFAULT nextval('public.login_attempts_id_seq'::regclass);


--
-- Name: media_issues id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_issues ALTER COLUMN id SET DEFAULT nextval('public.media_issues_id_seq'::regclass);


--
-- Name: media_requests id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_requests ALTER COLUMN id SET DEFAULT nextval('public.media_requests_id_seq'::regclass);


--
-- Name: notification_logs id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_logs ALTER COLUMN id SET DEFAULT nextval('public.notification_logs_id_seq'::regclass);


--
-- Name: notification_milestones id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_milestones ALTER COLUMN id SET DEFAULT nextval('public.notification_milestones_id_seq'::regclass);


--
-- Name: passkey_credentials id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passkey_credentials ALTER COLUMN id SET DEFAULT nextval('public.passkey_credentials_id_seq'::regclass);


--
-- Name: pending_notifications id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_notifications ALTER COLUMN id SET DEFAULT nextval('public.pending_notifications_id_seq'::regclass);


--
-- Name: playback_daily_aggregates id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playback_daily_aggregates ALTER COLUMN id SET DEFAULT nextval('public.playback_daily_aggregates_id_seq'::regclass);


--
-- Name: playback_ip_locations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playback_ip_locations ALTER COLUMN id SET DEFAULT nextval('public.playback_ip_locations_id_seq'::regclass);


--
-- Name: playback_sessions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playback_sessions ALTER COLUMN id SET DEFAULT nextval('public.playback_sessions_id_seq'::regclass);


--
-- Name: plex_users id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plex_users ALTER COLUMN id SET DEFAULT nextval('public.plex_users_id_seq'::regclass);


--
-- Name: poll_history id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.poll_history ALTER COLUMN id SET DEFAULT nextval('public.poll_history_id_seq'::regclass);


--
-- Name: radarr_queue_observations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radarr_queue_observations ALTER COLUMN id SET DEFAULT nextval('public.radarr_queue_observations_id_seq'::regclass);


--
-- Name: request_season_status id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_season_status ALTER COLUMN id SET DEFAULT nextval('public.request_season_status_id_seq'::regclass);


--
-- Name: search_cache id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_cache ALTER COLUMN id SET DEFAULT nextval('public.search_cache_id_seq'::regclass);


--
-- Name: series_acquisition_batches id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.series_acquisition_batches ALTER COLUMN id SET DEFAULT nextval('public.series_acquisition_batches_id_seq'::regclass);


--
-- Name: sonarr_queue_observations id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sonarr_queue_observations ALTER COLUMN id SET DEFAULT nextval('public.sonarr_queue_observations_id_seq'::regclass);


--
-- Name: tracker_favicons id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracker_favicons ALTER COLUMN id SET DEFAULT nextval('public.tracker_favicons_id_seq'::regclass);


--
-- Name: vf_episode_status id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vf_episode_status ALTER COLUMN id SET DEFAULT nextval('public.vf_episode_status_id_seq'::regclass);


--
-- Name: vf_upgrade_suggestions id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vf_upgrade_suggestions ALTER COLUMN id SET DEFAULT nextval('public.vf_upgrade_suggestions_id_seq'::regclass);


--
-- Name: admin_action_logs admin_action_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.admin_action_logs
    ADD CONSTRAINT admin_action_logs_pkey PRIMARY KEY (id);


--
-- Name: arr_instances arr_instances_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.arr_instances
    ADD CONSTRAINT arr_instances_pkey PRIMARY KEY (id);


--
-- Name: deleted_media_log deleted_media_log_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.deleted_media_log
    ADD CONSTRAINT deleted_media_log_pkey PRIMARY KEY (id);


--
-- Name: diagnostic_events diagnostic_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.diagnostic_events
    ADD CONSTRAINT diagnostic_events_pkey PRIMARY KEY (id);


--
-- Name: download_clients download_clients_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.download_clients
    ADD CONSTRAINT download_clients_pkey PRIMARY KEY (id);


--
-- Name: download_history download_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.download_history
    ADD CONSTRAINT download_history_pkey PRIMARY KEY (id);


--
-- Name: email_branding email_branding_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_branding
    ADD CONSTRAINT email_branding_pkey PRIMARY KEY (settings_id);


--
-- Name: email_providers email_providers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_providers
    ADD CONSTRAINT email_providers_pkey PRIMARY KEY (id);


--
-- Name: email_templates email_templates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_pkey PRIMARY KEY (id);


--
-- Name: episode_availability episode_availability_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.episode_availability
    ADD CONSTRAINT episode_availability_pkey PRIMARY KEY (id);


--
-- Name: episode_metadata episode_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.episode_metadata
    ADD CONSTRAINT episode_metadata_pkey PRIMARY KEY (id);


--
-- Name: job_run_logs job_run_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.job_run_logs
    ADD CONSTRAINT job_run_logs_pkey PRIMARY KEY (id);


--
-- Name: library_analytics_snapshots library_analytics_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_analytics_snapshots
    ADD CONSTRAINT library_analytics_snapshots_pkey PRIMARY KEY (id);


--
-- Name: library_items library_items_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.library_items
    ADD CONSTRAINT library_items_pkey PRIMARY KEY (id);


--
-- Name: login_attempts login_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.login_attempts
    ADD CONSTRAINT login_attempts_pkey PRIMARY KEY (id);


--
-- Name: media_issues media_issues_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_issues
    ADD CONSTRAINT media_issues_pkey PRIMARY KEY (id);


--
-- Name: media_requests media_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.media_requests
    ADD CONSTRAINT media_requests_pkey PRIMARY KEY (id);


--
-- Name: notification_logs notification_logs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_logs
    ADD CONSTRAINT notification_logs_pkey PRIMARY KEY (id);


--
-- Name: notification_milestones notification_milestones_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_milestones
    ADD CONSTRAINT notification_milestones_pkey PRIMARY KEY (id);


--
-- Name: passkey_credentials passkey_credentials_credential_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passkey_credentials
    ADD CONSTRAINT passkey_credentials_credential_id_key UNIQUE (credential_id);


--
-- Name: passkey_credentials passkey_credentials_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passkey_credentials
    ADD CONSTRAINT passkey_credentials_pkey PRIMARY KEY (id);


--
-- Name: pending_notifications pending_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.pending_notifications
    ADD CONSTRAINT pending_notifications_pkey PRIMARY KEY (id);


--
-- Name: playback_daily_aggregates playback_daily_aggregates_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playback_daily_aggregates
    ADD CONSTRAINT playback_daily_aggregates_pkey PRIMARY KEY (id);


--
-- Name: playback_ip_locations playback_ip_locations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playback_ip_locations
    ADD CONSTRAINT playback_ip_locations_pkey PRIMARY KEY (id);


--
-- Name: playback_sessions playback_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playback_sessions
    ADD CONSTRAINT playback_sessions_pkey PRIMARY KEY (id);


--
-- Name: plex_users plex_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plex_users
    ADD CONSTRAINT plex_users_pkey PRIMARY KEY (id);


--
-- Name: plex_users plex_users_plex_user_id_key; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.plex_users
    ADD CONSTRAINT plex_users_plex_user_id_key UNIQUE (plex_user_id);


--
-- Name: poll_history poll_history_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.poll_history
    ADD CONSTRAINT poll_history_pkey PRIMARY KEY (id);


--
-- Name: radarr_queue_observations radarr_queue_observations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radarr_queue_observations
    ADD CONSTRAINT radarr_queue_observations_pkey PRIMARY KEY (id);


--
-- Name: request_season_status request_season_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_season_status
    ADD CONSTRAINT request_season_status_pkey PRIMARY KEY (id);


--
-- Name: search_cache search_cache_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.search_cache
    ADD CONSTRAINT search_cache_pkey PRIMARY KEY (id);


--
-- Name: series_acquisition_batches series_acquisition_batches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.series_acquisition_batches
    ADD CONSTRAINT series_acquisition_batches_pkey PRIMARY KEY (id);


--
-- Name: settings settings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.settings
    ADD CONSTRAINT settings_pkey PRIMARY KEY (id);


--
-- Name: sonarr_queue_observations sonarr_queue_observations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sonarr_queue_observations
    ADD CONSTRAINT sonarr_queue_observations_pkey PRIMARY KEY (id);


--
-- Name: tracker_favicons tracker_favicons_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracker_favicons
    ADD CONSTRAINT tracker_favicons_pkey PRIMARY KEY (id);


--
-- Name: download_history uq_download_history_arr_event; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.download_history
    ADD CONSTRAINT uq_download_history_arr_event UNIQUE (arr_instance_id, arr_history_id);


--
-- Name: email_templates uq_email_template_event; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT uq_email_template_event UNIQUE (settings_id, event);


--
-- Name: episode_availability uq_episode_availability; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.episode_availability
    ADD CONSTRAINT uq_episode_availability UNIQUE (source_type, source_id, season_number, episode_number);


--
-- Name: episode_metadata uq_episode_metadata; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.episode_metadata
    ADD CONSTRAINT uq_episode_metadata UNIQUE (source_type, source_id, season_number, episode_number);


--
-- Name: notification_milestones uq_notification_milestone; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.notification_milestones
    ADD CONSTRAINT uq_notification_milestone UNIQUE (req_id, plex_user_id, direction, milestone_type, season_number, episode_number);


--
-- Name: playback_daily_aggregates uq_playback_daily_dimensions; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playback_daily_aggregates
    ADD CONSTRAINT uq_playback_daily_dimensions UNIQUE (day, user_name, media_type, media_label, playback_method);


--
-- Name: radarr_queue_observations uq_radarr_queue_observation; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radarr_queue_observations
    ADD CONSTRAINT uq_radarr_queue_observation UNIQUE (arr_instance_id, queue_id);


--
-- Name: request_season_status uq_request_season; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_season_status
    ADD CONSTRAINT uq_request_season UNIQUE (request_id, season_number);


--
-- Name: sonarr_queue_observations uq_sonarr_queue_observation; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sonarr_queue_observations
    ADD CONSTRAINT uq_sonarr_queue_observation UNIQUE (arr_instance_id, queue_id);


--
-- Name: tracker_favicons uq_tracker_favicons_host; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.tracker_favicons
    ADD CONSTRAINT uq_tracker_favicons_host UNIQUE (host);


--
-- Name: vf_episode_status uq_vf_episode; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vf_episode_status
    ADD CONSTRAINT uq_vf_episode UNIQUE (source_type, source_id, season_number, episode_number);


--
-- Name: vf_upgrade_suggestions uq_vf_upgrade_suggestion; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vf_upgrade_suggestions
    ADD CONSTRAINT uq_vf_upgrade_suggestion UNIQUE (source_type, source_id, scope, season_number, episode_number);


--
-- Name: vf_episode_status vf_episode_status_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vf_episode_status
    ADD CONSTRAINT vf_episode_status_pkey PRIMARY KEY (id);


--
-- Name: vf_upgrade_suggestions vf_upgrade_suggestions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.vf_upgrade_suggestions
    ADD CONSTRAINT vf_upgrade_suggestions_pkey PRIMARY KEY (id);


--
-- Name: ix_admin_action_logs_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_admin_action_logs_action ON public.admin_action_logs USING btree (action);


--
-- Name: ix_admin_action_logs_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_admin_action_logs_created_at ON public.admin_action_logs USING btree (created_at);


--
-- Name: ix_deleted_media_log_imdb_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_deleted_media_log_imdb_id ON public.deleted_media_log USING btree (imdb_id);


--
-- Name: ix_deleted_media_log_tmdb_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_deleted_media_log_tmdb_id ON public.deleted_media_log USING btree (tmdb_id);


--
-- Name: ix_deleted_media_log_tvdb_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_deleted_media_log_tvdb_id ON public.deleted_media_log USING btree (tvdb_id);


--
-- Name: ix_diagnostic_events_category_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_diagnostic_events_category_created ON public.diagnostic_events USING btree (category, created_at);


--
-- Name: ix_diagnostic_events_request_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_diagnostic_events_request_created ON public.diagnostic_events USING btree (request_id, created_at);


--
-- Name: ix_download_history_arr_history_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_download_history_arr_history_id ON public.download_history USING btree (arr_history_id);


--
-- Name: ix_download_history_arr_instance_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_download_history_arr_instance_id ON public.download_history USING btree (arr_instance_id);


--
-- Name: ix_download_history_completed_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_download_history_completed_at ON public.download_history USING btree (completed_at);


--
-- Name: ix_episode_availability_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_episode_availability_source ON public.episode_availability USING btree (source_type, source_id);


--
-- Name: ix_job_run_logs_job_started; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_job_run_logs_job_started ON public.job_run_logs USING btree (job, started_at);


--
-- Name: ix_library_items_added_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_library_items_added_id ON public.library_items USING btree (added_at DESC, title, id);


--
-- Name: ix_library_items_arr_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_library_items_arr_identity ON public.library_items USING btree (arr_instance_id, arr_id);


--
-- Name: ix_library_items_arr_instance_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_library_items_arr_instance_id ON public.library_items USING btree (arr_instance_id);


--
-- Name: ix_library_items_imdb_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_library_items_imdb_id ON public.library_items USING btree (imdb_id);


--
-- Name: ix_library_items_media_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_library_items_media_type ON public.library_items USING btree (media_type);


--
-- Name: ix_library_items_plex_guid; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_library_items_plex_guid ON public.library_items USING btree (plex_guid);


--
-- Name: ix_library_items_tmdb_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_library_items_tmdb_id ON public.library_items USING btree (tmdb_id);


--
-- Name: ix_library_items_tvdb_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_library_items_tvdb_id ON public.library_items USING btree (tvdb_id);


--
-- Name: ix_login_attempts_ip_time; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_login_attempts_ip_time ON public.login_attempts USING btree (ip_address, attempted_at);


--
-- Name: ix_media_issues_status_created; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_media_issues_status_created ON public.media_issues USING btree (status, created_at);


--
-- Name: ix_media_requests_arr_identity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_media_requests_arr_identity ON public.media_requests USING btree (arr_instance_id, arr_id);


--
-- Name: ix_media_requests_arr_instance_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_media_requests_arr_instance_id ON public.media_requests USING btree (arr_instance_id);


--
-- Name: ix_media_requests_fulfillment_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_media_requests_fulfillment_status ON public.media_requests USING btree (fulfillment_status);


--
-- Name: ix_media_requests_has_vf; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_media_requests_has_vf ON public.media_requests USING btree (has_vf);


--
-- Name: ix_media_requests_library_item_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_media_requests_library_item_id ON public.media_requests USING btree (library_item_id);


--
-- Name: ix_media_requests_next_release_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_media_requests_next_release_at ON public.media_requests USING btree (next_release_at) WHERE (next_release_at IS NOT NULL);


--
-- Name: ix_media_requests_plex_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_media_requests_plex_user_id ON public.media_requests USING btree (plex_user_id);


--
-- Name: ix_media_requests_requested_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_media_requests_requested_id ON public.media_requests USING btree (requested_at DESC, id DESC);


--
-- Name: ix_media_requests_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_media_requests_status ON public.media_requests USING btree (status);


--
-- Name: ix_media_requests_status_requested; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_media_requests_status_requested ON public.media_requests USING btree (status, requested_at DESC);


--
-- Name: ix_media_requests_tmdb_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_media_requests_tmdb_id ON public.media_requests USING btree (tmdb_id);


--
-- Name: ix_media_requests_torrent_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_media_requests_torrent_hash ON public.media_requests USING btree (torrent_hash);


--
-- Name: ix_media_requests_tvdb_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_media_requests_tvdb_id ON public.media_requests USING btree (tvdb_id);


--
-- Name: ix_media_requests_type_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_media_requests_type_status ON public.media_requests USING btree (media_type, status);


--
-- Name: ix_notification_logs_event; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notification_logs_event ON public.notification_logs USING btree (event);


--
-- Name: ix_notification_logs_sent_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_notification_logs_sent_at ON public.notification_logs USING btree (sent_at);


--
-- Name: ix_pending_notifications_req_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_pending_notifications_req_id ON public.pending_notifications USING btree (req_id);


--
-- Name: ix_playback_daily_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_playback_daily_day ON public.playback_daily_aggregates USING btree (day);


--
-- Name: ix_playback_daily_user_day; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_playback_daily_user_day ON public.playback_daily_aggregates USING btree (user_name, day);


--
-- Name: ix_playback_ip_locations_address_hash; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX ix_playback_ip_locations_address_hash ON public.playback_ip_locations USING btree (address_hash);


--
-- Name: ix_playback_sessions_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_playback_sessions_active ON public.playback_sessions USING btree (ended_at, last_seen_at);


--
-- Name: ix_playback_sessions_media_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_playback_sessions_media_request_id ON public.playback_sessions USING btree (media_request_id);


--
-- Name: ix_playback_sessions_reference_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_playback_sessions_reference_id ON public.playback_sessions USING btree (reference_id);


--
-- Name: ix_playback_sessions_session_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_playback_sessions_session_key ON public.playback_sessions USING btree (session_key);


--
-- Name: ix_playback_sessions_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_playback_sessions_started_at ON public.playback_sessions USING btree (started_at);


--
-- Name: ix_playback_sessions_user_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_playback_sessions_user_name ON public.playback_sessions USING btree (user_name);


--
-- Name: ix_poll_history_job_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_poll_history_job_started_at ON public.poll_history USING btree (job, started_at DESC);


--
-- Name: ix_poll_history_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_poll_history_started_at ON public.poll_history USING btree (started_at DESC);


--
-- Name: ix_radarr_queue_observation_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_radarr_queue_observation_state ON public.radarr_queue_observations USING btree (state, last_seen_at);


--
-- Name: ix_radarr_queue_observations_arr_instance_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_radarr_queue_observations_arr_instance_id ON public.radarr_queue_observations USING btree (arr_instance_id);


--
-- Name: ix_radarr_queue_observations_arr_media_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_radarr_queue_observations_arr_media_id ON public.radarr_queue_observations USING btree (arr_media_id);


--
-- Name: ix_radarr_queue_observations_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_radarr_queue_observations_request_id ON public.radarr_queue_observations USING btree (request_id);


--
-- Name: ix_request_season_status_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_request_season_status_request_id ON public.request_season_status USING btree (request_id);


--
-- Name: ix_series_acquisition_batch_lookup; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_series_acquisition_batch_lookup ON public.series_acquisition_batches USING btree (arr_instance_id, arr_id, status);


--
-- Name: ix_series_acquisition_batches_arr_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_series_acquisition_batches_arr_id ON public.series_acquisition_batches USING btree (arr_id);


--
-- Name: ix_series_acquisition_batches_arr_instance_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_series_acquisition_batches_arr_instance_id ON public.series_acquisition_batches USING btree (arr_instance_id);


--
-- Name: ix_series_acquisition_batches_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_series_acquisition_batches_request_id ON public.series_acquisition_batches USING btree (request_id);


--
-- Name: ix_series_acquisition_batches_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_series_acquisition_batches_status ON public.series_acquisition_batches USING btree (status);


--
-- Name: ix_sonarr_queue_observation_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sonarr_queue_observation_state ON public.sonarr_queue_observations USING btree (state, last_seen_at);


--
-- Name: ix_sonarr_queue_observations_arr_instance_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sonarr_queue_observations_arr_instance_id ON public.sonarr_queue_observations USING btree (arr_instance_id);


--
-- Name: ix_sonarr_queue_observations_arr_media_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sonarr_queue_observations_arr_media_id ON public.sonarr_queue_observations USING btree (arr_media_id);


--
-- Name: ix_sonarr_queue_observations_batch_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sonarr_queue_observations_batch_id ON public.sonarr_queue_observations USING btree (batch_id);


--
-- Name: ix_sonarr_queue_observations_download_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sonarr_queue_observations_download_id ON public.sonarr_queue_observations USING btree (download_id);


--
-- Name: ix_sonarr_queue_observations_request_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sonarr_queue_observations_request_id ON public.sonarr_queue_observations USING btree (request_id);


--
-- Name: ix_sonarr_queue_observations_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_sonarr_queue_observations_state ON public.sonarr_queue_observations USING btree (state);


--
-- Name: ix_tracker_favicons_host; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_tracker_favicons_host ON public.tracker_favicons USING btree (host);


--
-- Name: ix_vf_episode_status_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_vf_episode_status_source ON public.vf_episode_status USING btree (source_type, source_id);


--
-- Name: ix_vf_upgrade_suggestions_origin; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_vf_upgrade_suggestions_origin ON public.vf_upgrade_suggestions USING btree (origin);


--
-- Name: ix_vf_upgrade_suggestions_source; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_vf_upgrade_suggestions_source ON public.vf_upgrade_suggestions USING btree (source_type, source_id);


--
-- Name: ix_vf_upgrade_suggestions_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX ix_vf_upgrade_suggestions_status ON public.vf_upgrade_suggestions USING btree (status);


--
-- Name: uq_playback_session_source_active; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX uq_playback_session_source_active ON public.playback_sessions USING btree (source, source_session_id) WHERE (ended_at IS NULL);


--
-- Name: email_branding email_branding_settings_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_branding
    ADD CONSTRAINT email_branding_settings_id_fkey FOREIGN KEY (settings_id) REFERENCES public.settings(id) ON DELETE CASCADE;


--
-- Name: email_templates email_templates_settings_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.email_templates
    ADD CONSTRAINT email_templates_settings_id_fkey FOREIGN KEY (settings_id) REFERENCES public.settings(id) ON DELETE CASCADE;


--
-- Name: download_history fk_download_history_arr_instance_id; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.download_history
    ADD CONSTRAINT fk_download_history_arr_instance_id FOREIGN KEY (arr_instance_id) REFERENCES public.arr_instances(id) ON DELETE SET NULL;


--
-- Name: passkey_credentials passkey_credentials_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.passkey_credentials
    ADD CONSTRAINT passkey_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.plex_users(id) ON DELETE CASCADE;


--
-- Name: radarr_queue_observations radarr_queue_observations_arr_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radarr_queue_observations
    ADD CONSTRAINT radarr_queue_observations_arr_instance_id_fkey FOREIGN KEY (arr_instance_id) REFERENCES public.arr_instances(id) ON DELETE CASCADE;


--
-- Name: radarr_queue_observations radarr_queue_observations_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.radarr_queue_observations
    ADD CONSTRAINT radarr_queue_observations_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.media_requests(id) ON DELETE SET NULL;


--
-- Name: request_season_status request_season_status_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.request_season_status
    ADD CONSTRAINT request_season_status_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.media_requests(id) ON DELETE CASCADE;


--
-- Name: series_acquisition_batches series_acquisition_batches_arr_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.series_acquisition_batches
    ADD CONSTRAINT series_acquisition_batches_arr_instance_id_fkey FOREIGN KEY (arr_instance_id) REFERENCES public.arr_instances(id) ON DELETE CASCADE;


--
-- Name: series_acquisition_batches series_acquisition_batches_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.series_acquisition_batches
    ADD CONSTRAINT series_acquisition_batches_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.media_requests(id) ON DELETE SET NULL;


--
-- Name: sonarr_queue_observations sonarr_queue_observations_arr_instance_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sonarr_queue_observations
    ADD CONSTRAINT sonarr_queue_observations_arr_instance_id_fkey FOREIGN KEY (arr_instance_id) REFERENCES public.arr_instances(id) ON DELETE CASCADE;


--
-- Name: sonarr_queue_observations sonarr_queue_observations_batch_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sonarr_queue_observations
    ADD CONSTRAINT sonarr_queue_observations_batch_id_fkey FOREIGN KEY (batch_id) REFERENCES public.series_acquisition_batches(id) ON DELETE SET NULL;


--
-- Name: sonarr_queue_observations sonarr_queue_observations_request_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.sonarr_queue_observations
    ADD CONSTRAINT sonarr_queue_observations_request_id_fkey FOREIGN KEY (request_id) REFERENCES public.media_requests(id) ON DELETE SET NULL;


--
-- PostgreSQL database dump complete
--
"""


def upgrade() -> None:
    op.execute(SCHEMA_SQL)
    # pg_dump vide search_path pour ne dependre que de noms qualifies (public.x) ;
    # on le restaure pour que le reste d'Alembic (INSERT INTO alembic_version) fonctionne.
    op.execute("SET search_path TO public")


def downgrade() -> None:
    op.execute("DROP SCHEMA public CASCADE")
    op.execute("CREATE SCHEMA public")
