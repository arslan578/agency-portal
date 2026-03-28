--
-- PostgreSQL database dump
--

-- Dumped from database version 15.14 (Homebrew)
-- Dumped by pg_dump version 17.6 (Homebrew)
-- Cleaned for Render deployment

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: agencyrole; Type: TYPE; Schema: public; Owner: deeptanshusankhwar
--

CREATE TYPE public.agencyrole AS ENUM (
    'ADMIN',
    'MEMBER',
    'VIEWER'
);


ALTER TYPE public.agencyrole OWNER TO deeptanshusankhwar;

--
-- Name: campaignstatus; Type: TYPE; Schema: public; Owner: deeptanshusankhwar
--

CREATE TYPE public.campaignstatus AS ENUM (
    'DRAFT',
    'ACTIVE',
    'PAUSED',
    'DISABLED',
    'COMPLETED',
    'ERROR'
);


ALTER TYPE public.campaignstatus OWNER TO deeptanshusankhwar;

--
-- Name: clientrole; Type: TYPE; Schema: public; Owner: deeptanshusankhwar
--

CREATE TYPE public.clientrole AS ENUM (
    'OPERATOR',
    'VIEWER'
);


ALTER TYPE public.clientrole OWNER TO deeptanshusankhwar;

--
-- Name: invoicestatus; Type: TYPE; Schema: public; Owner: deeptanshusankhwar
--

CREATE TYPE public.invoicestatus AS ENUM (
    'DRAFT',
    'SENT',
    'PAID',
    'OVERDUE'
);


ALTER TYPE public.invoicestatus OWNER TO deeptanshusankhwar;

--
-- Name: planstatus; Type: TYPE; Schema: public; Owner: deeptanshusankhwar
--

CREATE TYPE public.planstatus AS ENUM (
    'DRAFT',
    'CONVERTED'
);


ALTER TYPE public.planstatus OWNER TO deeptanshusankhwar;

--
-- Name: plantier; Type: TYPE; Schema: public; Owner: deeptanshusankhwar
--

CREATE TYPE public.plantier AS ENUM (
    'FREE',
    'STARTER',
    'GROWTH',
    'SCALE',
    'ENTERPRISE'
);


ALTER TYPE public.plantier OWNER TO deeptanshusankhwar;

SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: agencies; Type: TABLE; Schema: public; Owner: deeptanshusankhwar
--

CREATE TABLE public.agencies (
    id integer NOT NULL,
    name character varying NOT NULL,
    stripe_customer_id character varying,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    current_plan public.plantier
);


ALTER TABLE public.agencies OWNER TO deeptanshusankhwar;

--
-- Name: agencies_id_seq; Type: SEQUENCE; Schema: public; Owner: deeptanshusankhwar
--

CREATE SEQUENCE public.agencies_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.agencies_id_seq OWNER TO deeptanshusankhwar;

--
-- Name: agencies_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: deeptanshusankhwar
--

ALTER SEQUENCE public.agencies_id_seq OWNED BY public.agencies.id;


--
-- Name: agency_memberships; Type: TABLE; Schema: public; Owner: deeptanshusankhwar
--

CREATE TABLE public.agency_memberships (
    id integer NOT NULL,
    user_id integer NOT NULL,
    agency_id integer NOT NULL,
    role public.agencyrole
);


ALTER TABLE public.agency_memberships OWNER TO deeptanshusankhwar;

--
-- Name: agency_memberships_id_seq; Type: SEQUENCE; Schema: public; Owner: deeptanshusankhwar
--

CREATE SEQUENCE public.agency_memberships_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.agency_memberships_id_seq OWNER TO deeptanshusankhwar;

--
-- Name: agency_memberships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: deeptanshusankhwar
--

ALTER SEQUENCE public.agency_memberships_id_seq OWNED BY public.agency_memberships.id;


--
-- Name: alembic_version; Type: TABLE; Schema: public; Owner: deeptanshusankhwar
--

CREATE TABLE public.alembic_version (
    version_num character varying(32) NOT NULL
);


ALTER TABLE public.alembic_version OWNER TO deeptanshusankhwar;

--
-- Name: audiences; Type: TABLE; Schema: public; Owner: deeptanshusankhwar
--

CREATE TABLE public.audiences (
    id integer NOT NULL,
    client_id integer NOT NULL,
    account_id integer,
    name character varying NOT NULL,
    description character varying,
    file_url character varying,
    is_uploaded boolean,
    definition_json json,
    platform_audience_ids_json json,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.audiences OWNER TO deeptanshusankhwar;

--
-- Name: audiences_id_seq; Type: SEQUENCE; Schema: public; Owner: deeptanshusankhwar
--

CREATE SEQUENCE public.audiences_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.audiences_id_seq OWNER TO deeptanshusankhwar;

--
-- Name: audiences_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: deeptanshusankhwar
--

ALTER SEQUENCE public.audiences_id_seq OWNED BY public.audiences.id;


--
-- Name: campaigns; Type: TABLE; Schema: public; Owner: deeptanshusankhwar
--

CREATE TABLE public.campaigns (
    id integer NOT NULL,
    client_id integer,
    audience_id integer,
    plan_id integer,
    account_id integer,
    name character varying NOT NULL,
    goal character varying NOT NULL,
    total_budget_cents integer NOT NULL,
    start_date timestamp with time zone,
    end_date timestamp with time zone,
    status public.campaignstatus,
    platform_allocations json,
    platform_campaign_ids json,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone
);


ALTER TABLE public.campaigns OWNER TO deeptanshusankhwar;

--
-- Name: campaigns_id_seq; Type: SEQUENCE; Schema: public; Owner: deeptanshusankhwar
--

CREATE SEQUENCE public.campaigns_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.campaigns_id_seq OWNER TO deeptanshusankhwar;

--
-- Name: campaigns_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: deeptanshusankhwar
--

ALTER SEQUENCE public.campaigns_id_seq OWNED BY public.campaigns.id;


--
-- Name: client_memberships; Type: TABLE; Schema: public; Owner: deeptanshusankhwar
--

CREATE TABLE public.client_memberships (
    id integer NOT NULL,
    user_id integer NOT NULL,
    client_id integer NOT NULL,
    role public.clientrole
);


ALTER TABLE public.client_memberships OWNER TO deeptanshusankhwar;

--
-- Name: client_memberships_id_seq; Type: SEQUENCE; Schema: public; Owner: deeptanshusankhwar
--

CREATE SEQUENCE public.client_memberships_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.client_memberships_id_seq OWNER TO deeptanshusankhwar;

--
-- Name: client_memberships_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: deeptanshusankhwar
--

ALTER SEQUENCE public.client_memberships_id_seq OWNED BY public.client_memberships.id;


--
-- Name: client_user_permissions; Type: TABLE; Schema: public; Owner: deeptanshusankhwar
--

CREATE TABLE public.client_user_permissions (
    id integer NOT NULL,
    client_id integer,
    user_id integer,
    role character varying
);


ALTER TABLE public.client_user_permissions OWNER TO deeptanshusankhwar;

--
-- Name: client_user_permissions_id_seq; Type: SEQUENCE; Schema: public; Owner: deeptanshusankhwar
--

CREATE SEQUENCE public.client_user_permissions_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.client_user_permissions_id_seq OWNER TO deeptanshusankhwar;

--
-- Name: client_user_permissions_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: deeptanshusankhwar
--

ALTER SEQUENCE public.client_user_permissions_id_seq OWNED BY public.client_user_permissions.id;


--
-- Name: clients; Type: TABLE; Schema: public; Owner: deeptanshusankhwar
--

CREATE TABLE public.clients (
    id integer NOT NULL,
    agency_id integer NOT NULL,
    name character varying NOT NULL,
    industry character varying,
    website character varying,
    markup_percent numeric(10,4),
    is_active boolean,
    account_mode character varying(20) DEFAULT 'kaivo_managed',
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.clients OWNER TO deeptanshusankhwar;

--
-- Name: clients_id_seq; Type: SEQUENCE; Schema: public; Owner: deeptanshusankhwar
--

CREATE SEQUENCE public.clients_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.clients_id_seq OWNER TO deeptanshusankhwar;

--
-- Name: clients_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: deeptanshusankhwar
--

ALTER SEQUENCE public.clients_id_seq OWNED BY public.clients.id;


--
-- Name: invoices; Type: TABLE; Schema: public; Owner: deeptanshusankhwar
--

CREATE TABLE public.invoices (
    id integer NOT NULL,
    agency_id integer NOT NULL,
    client_id integer NOT NULL,
    period_start timestamp with time zone NOT NULL,
    period_end timestamp with time zone NOT NULL,
    plan_id character varying,
    platform_fees_total numeric(12,2),
    kaivo_fees_total numeric(12,2),
    agency_markup_total numeric(12,2),
    grand_total numeric(12,2),
    status public.invoicestatus,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP
);


ALTER TABLE public.invoices OWNER TO deeptanshusankhwar;

--
-- Name: invoices_id_seq; Type: SEQUENCE; Schema: public; Owner: deeptanshusankhwar
--

CREATE SEQUENCE public.invoices_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.invoices_id_seq OWNER TO deeptanshusankhwar;

--
-- Name: invoices_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: deeptanshusankhwar
--

ALTER SEQUENCE public.invoices_id_seq OWNED BY public.invoices.id;


--
-- Name: plans; Type: TABLE; Schema: public; Owner: deeptanshusankhwar
--

CREATE TABLE public.plans (
    id integer NOT NULL,
    account_id integer,
    name character varying,
    goal character varying,
    total_budget_cents integer,
    audience_id integer,
    platform_allocations_json json,
    status public.planstatus
);


ALTER TABLE public.plans OWNER TO deeptanshusankhwar;

--
-- Name: plans_id_seq; Type: SEQUENCE; Schema: public; Owner: deeptanshusankhwar
--

CREATE SEQUENCE public.plans_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.plans_id_seq OWNER TO deeptanshusankhwar;

--
-- Name: plans_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: deeptanshusankhwar
--

ALTER SEQUENCE public.plans_id_seq OWNED BY public.plans.id;


--
-- Name: platform_accounts; Type: TABLE; Schema: public; Owner: deeptanshusankhwar
--

CREATE TABLE public.platform_accounts (
    id integer NOT NULL,
    client_id integer NOT NULL,
    platform character varying NOT NULL,
    account_id character varying NOT NULL,
    access_token character varying,
    refresh_token character varying
);


ALTER TABLE public.platform_accounts OWNER TO deeptanshusankhwar;

--
-- Name: platform_accounts_id_seq; Type: SEQUENCE; Schema: public; Owner: deeptanshusankhwar
--

CREATE SEQUENCE public.platform_accounts_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.platform_accounts_id_seq OWNER TO deeptanshusankhwar;

--
-- Name: platform_accounts_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: deeptanshusankhwar
--

ALTER SEQUENCE public.platform_accounts_id_seq OWNED BY public.platform_accounts.id;


--
-- Name: usage_records; Type: TABLE; Schema: public; Owner: deeptanshusankhwar
--

CREATE TABLE public.usage_records (
    id integer NOT NULL,
    campaign_id integer NOT NULL,
    date timestamp with time zone NOT NULL,
    platform character varying NOT NULL,
    impressions integer,
    clicks integer,
    spend_base numeric(12,4),
    spend_kaivo numeric(12,4),
    spend_agency numeric(12,4)
);


ALTER TABLE public.usage_records OWNER TO deeptanshusankhwar;

--
-- Name: usage_records_id_seq; Type: SEQUENCE; Schema: public; Owner: deeptanshusankhwar
--

CREATE SEQUENCE public.usage_records_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.usage_records_id_seq OWNER TO deeptanshusankhwar;

--
-- Name: usage_records_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: deeptanshusankhwar
--

ALTER SEQUENCE public.usage_records_id_seq OWNED BY public.usage_records.id;


--
-- Name: users; Type: TABLE; Schema: public; Owner: deeptanshusankhwar
--

CREATE TABLE public.users (
    id integer NOT NULL,
    email character varying NOT NULL,
    hashed_password character varying,
    full_name character varying,
    avatar_url character varying,
    is_active boolean,
    is_superuser boolean,
    created_at timestamp with time zone DEFAULT CURRENT_TIMESTAMP,
    updated_at timestamp with time zone,
    phone_number character varying,
    company_name character varying,
    google_id character varying
);


ALTER TABLE public.users OWNER TO deeptanshusankhwar;

--
-- Name: users_id_seq; Type: SEQUENCE; Schema: public; Owner: deeptanshusankhwar
--

CREATE SEQUENCE public.users_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


ALTER SEQUENCE public.users_id_seq OWNER TO deeptanshusankhwar;

--
-- Name: users_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: deeptanshusankhwar
--

ALTER SEQUENCE public.users_id_seq OWNED BY public.users.id;


--
-- Name: agencies id; Type: DEFAULT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.agencies ALTER COLUMN id SET DEFAULT nextval('public.agencies_id_seq'::regclass);


--
-- Name: agency_memberships id; Type: DEFAULT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.agency_memberships ALTER COLUMN id SET DEFAULT nextval('public.agency_memberships_id_seq'::regclass);


--
-- Name: audiences id; Type: DEFAULT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.audiences ALTER COLUMN id SET DEFAULT nextval('public.audiences_id_seq'::regclass);


--
-- Name: campaigns id; Type: DEFAULT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.campaigns ALTER COLUMN id SET DEFAULT nextval('public.campaigns_id_seq'::regclass);


--
-- Name: client_memberships id; Type: DEFAULT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.client_memberships ALTER COLUMN id SET DEFAULT nextval('public.client_memberships_id_seq'::regclass);


--
-- Name: client_user_permissions id; Type: DEFAULT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.client_user_permissions ALTER COLUMN id SET DEFAULT nextval('public.client_user_permissions_id_seq'::regclass);


--
-- Name: clients id; Type: DEFAULT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.clients ALTER COLUMN id SET DEFAULT nextval('public.clients_id_seq'::regclass);


--
-- Name: invoices id; Type: DEFAULT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.invoices ALTER COLUMN id SET DEFAULT nextval('public.invoices_id_seq'::regclass);


--
-- Name: plans id; Type: DEFAULT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.plans ALTER COLUMN id SET DEFAULT nextval('public.plans_id_seq'::regclass);


--
-- Name: platform_accounts id; Type: DEFAULT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.platform_accounts ALTER COLUMN id SET DEFAULT nextval('public.platform_accounts_id_seq'::regclass);


--
-- Name: usage_records id; Type: DEFAULT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.usage_records ALTER COLUMN id SET DEFAULT nextval('public.usage_records_id_seq'::regclass);


--
-- Name: users id; Type: DEFAULT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.users ALTER COLUMN id SET DEFAULT nextval('public.users_id_seq'::regclass);


--
-- Name: agencies agencies_pkey; Type: CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.agencies
    ADD CONSTRAINT agencies_pkey PRIMARY KEY (id);


--
-- Name: agency_memberships agency_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.agency_memberships
    ADD CONSTRAINT agency_memberships_pkey PRIMARY KEY (id);


--
-- Name: alembic_version alembic_version_pkc; Type: CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.alembic_version
    ADD CONSTRAINT alembic_version_pkc PRIMARY KEY (version_num);


--
-- Name: audiences audiences_pkey; Type: CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.audiences
    ADD CONSTRAINT audiences_pkey PRIMARY KEY (id);


--
-- Name: campaigns campaigns_pkey; Type: CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_pkey PRIMARY KEY (id);


--
-- Name: client_memberships client_memberships_pkey; Type: CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.client_memberships
    ADD CONSTRAINT client_memberships_pkey PRIMARY KEY (id);


--
-- Name: client_user_permissions client_user_permissions_pkey; Type: CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.client_user_permissions
    ADD CONSTRAINT client_user_permissions_pkey PRIMARY KEY (id);


--
-- Name: clients clients_pkey; Type: CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_pkey PRIMARY KEY (id);


--
-- Name: invoices invoices_pkey; Type: CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_pkey PRIMARY KEY (id);


--
-- Name: plans plans_pkey; Type: CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.plans
    ADD CONSTRAINT plans_pkey PRIMARY KEY (id);


--
-- Name: platform_accounts platform_accounts_pkey; Type: CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.platform_accounts
    ADD CONSTRAINT platform_accounts_pkey PRIMARY KEY (id);


--
-- Name: usage_records usage_records_pkey; Type: CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.usage_records
    ADD CONSTRAINT usage_records_pkey PRIMARY KEY (id);


--
-- Name: users users_pkey; Type: CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.users
    ADD CONSTRAINT users_pkey PRIMARY KEY (id);


--
-- Name: ix_agencies_id; Type: INDEX; Schema: public; Owner: deeptanshusankhwar
--

CREATE INDEX ix_agencies_id ON public.agencies USING btree (id);


--
-- Name: ix_agencies_name; Type: INDEX; Schema: public; Owner: deeptanshusankhwar
--

CREATE INDEX ix_agencies_name ON public.agencies USING btree (name);


--
-- Name: ix_agency_memberships_id; Type: INDEX; Schema: public; Owner: deeptanshusankhwar
--

CREATE INDEX ix_agency_memberships_id ON public.agency_memberships USING btree (id);


--
-- Name: ix_audiences_account_id; Type: INDEX; Schema: public; Owner: deeptanshusankhwar
--

CREATE INDEX ix_audiences_account_id ON public.audiences USING btree (account_id);


--
-- Name: ix_audiences_id; Type: INDEX; Schema: public; Owner: deeptanshusankhwar
--

CREATE INDEX ix_audiences_id ON public.audiences USING btree (id);


--
-- Name: ix_campaigns_account_id; Type: INDEX; Schema: public; Owner: deeptanshusankhwar
--

CREATE INDEX ix_campaigns_account_id ON public.campaigns USING btree (account_id);


--
-- Name: ix_campaigns_id; Type: INDEX; Schema: public; Owner: deeptanshusankhwar
--

CREATE INDEX ix_campaigns_id ON public.campaigns USING btree (id);


--
-- Name: ix_client_memberships_id; Type: INDEX; Schema: public; Owner: deeptanshusankhwar
--

CREATE INDEX ix_client_memberships_id ON public.client_memberships USING btree (id);


--
-- Name: ix_client_user_permissions_id; Type: INDEX; Schema: public; Owner: deeptanshusankhwar
--

CREATE INDEX ix_client_user_permissions_id ON public.client_user_permissions USING btree (id);


--
-- Name: ix_client_user_permissions_user_id; Type: INDEX; Schema: public; Owner: deeptanshusankhwar
--

CREATE INDEX ix_client_user_permissions_user_id ON public.client_user_permissions USING btree (user_id);


--
-- Name: ix_clients_id; Type: INDEX; Schema: public; Owner: deeptanshusankhwar
--

CREATE INDEX ix_clients_id ON public.clients USING btree (id);


--
-- Name: ix_clients_name; Type: INDEX; Schema: public; Owner: deeptanshusankhwar
--

CREATE INDEX ix_clients_name ON public.clients USING btree (name);


--
-- Name: ix_invoices_id; Type: INDEX; Schema: public; Owner: deeptanshusankhwar
--

CREATE INDEX ix_invoices_id ON public.invoices USING btree (id);


--
-- Name: ix_plans_account_id; Type: INDEX; Schema: public; Owner: deeptanshusankhwar
--

CREATE INDEX ix_plans_account_id ON public.plans USING btree (account_id);


--
-- Name: ix_plans_id; Type: INDEX; Schema: public; Owner: deeptanshusankhwar
--

CREATE INDEX ix_plans_id ON public.plans USING btree (id);


--
-- Name: ix_platform_accounts_id; Type: INDEX; Schema: public; Owner: deeptanshusankhwar
--

CREATE INDEX ix_platform_accounts_id ON public.platform_accounts USING btree (id);


--
-- Name: ix_usage_records_id; Type: INDEX; Schema: public; Owner: deeptanshusankhwar
--

CREATE INDEX ix_usage_records_id ON public.usage_records USING btree (id);


--
-- Name: ix_users_email; Type: INDEX; Schema: public; Owner: deeptanshusankhwar
--

CREATE UNIQUE INDEX ix_users_email ON public.users USING btree (email);


--
-- Name: ix_users_google_id; Type: INDEX; Schema: public; Owner: deeptanshusankhwar
--

CREATE UNIQUE INDEX ix_users_google_id ON public.users USING btree (google_id);


--
-- Name: ix_users_id; Type: INDEX; Schema: public; Owner: deeptanshusankhwar
--

CREATE INDEX ix_users_id ON public.users USING btree (id);


--
-- Name: agency_memberships agency_memberships_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.agency_memberships
    ADD CONSTRAINT agency_memberships_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id);


--
-- Name: agency_memberships agency_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.agency_memberships
    ADD CONSTRAINT agency_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: audiences audiences_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.audiences
    ADD CONSTRAINT audiences_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: campaigns campaigns_audience_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_audience_id_fkey FOREIGN KEY (audience_id) REFERENCES public.audiences(id);


--
-- Name: campaigns campaigns_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: campaigns campaigns_plan_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.campaigns
    ADD CONSTRAINT campaigns_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.plans(id);


--
-- Name: client_memberships client_memberships_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.client_memberships
    ADD CONSTRAINT client_memberships_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: client_memberships client_memberships_user_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.client_memberships
    ADD CONSTRAINT client_memberships_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.users(id);


--
-- Name: client_user_permissions client_user_permissions_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.client_user_permissions
    ADD CONSTRAINT client_user_permissions_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: clients clients_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.clients
    ADD CONSTRAINT clients_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id);


--
-- Name: invoices invoices_agency_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_agency_id_fkey FOREIGN KEY (agency_id) REFERENCES public.agencies(id);


--
-- Name: invoices invoices_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.invoices
    ADD CONSTRAINT invoices_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: platform_accounts platform_accounts_client_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.platform_accounts
    ADD CONSTRAINT platform_accounts_client_id_fkey FOREIGN KEY (client_id) REFERENCES public.clients(id);


--
-- Name: usage_records usage_records_campaign_id_fkey; Type: FK CONSTRAINT; Schema: public; Owner: deeptanshusankhwar
--

ALTER TABLE ONLY public.usage_records
    ADD CONSTRAINT usage_records_campaign_id_fkey FOREIGN KEY (campaign_id) REFERENCES public.campaigns(id);


--
-- Name: saved_variants; Type: TABLE; Schema: public
--

CREATE TABLE IF NOT EXISTS public.saved_variants (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES public.users(id),
    brand_id INTEGER,
    brief TEXT NOT NULL,
    objective VARCHAR(50),
    target_lang VARCHAR(10) DEFAULT 'en',
    variants_json JSONB NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_saved_variants_user_id ON public.saved_variants(user_id);

--
-- PostgreSQL database dump complete
--

