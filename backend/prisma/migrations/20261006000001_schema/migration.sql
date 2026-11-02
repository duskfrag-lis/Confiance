-- =====================================================================
-- Migración 1/5: SCHEMA (51 tablas + constraints)
-- Confiance — PostgreSQL 16
--
-- Cambios respecto a Confiance.sql original:
--   * Se eliminan CREATE DATABASE / ALTER DATABASE (la DB la crea docker-compose).
--     La zona horaria se conserva con un ALTER DATABASE dinámico.
--   * cancellations.service_request_id ahora es UNIQUE (1 cancelación por solicitud).
--   * cancellations: CHECK que liga is_force_majeure con force_majeure_status_id.
--   * users.email: CHECK de minúsculas (el backend debe normalizar con toLowerCase()).
--   * categories: sin auto-padre y nombre único también entre categorías raíz.
--   * Precios y presupuestos no pueden ser negativos.
-- Los índices, vistas, funciones/triggers y catálogos van en migraciones aparte.
-- =====================================================================

DO $$
BEGIN
    EXECUTE format('ALTER DATABASE %I SET timezone TO %L', current_database(), 'America/Bogota');
END $$;

-- (*) roles desaparece: admin pasa a ser un booleano independiente en
-- users, y cliente/prestador pasa a ser active_profiles (el switch).

CREATE TABLE account_statuses (
    status_id    SMALLSERIAL PRIMARY KEY,
    status_name  VARCHAR(30) UNIQUE NOT NULL -- 'pending_verification', 'active', 'disabled'
);

-- (*) switch binario: cuál perfil está operativo en este momento.
CREATE TABLE active_profiles (
    active_profile_id  SMALLSERIAL PRIMARY KEY,
    profile_name        VARCHAR(20) UNIQUE NOT NULL  -- 'client', 'provider'
);

CREATE TABLE users (
    user_id            BIGSERIAL PRIMARY KEY,
    first_name         VARCHAR(50) NOT NULL,
    middle_name        VARCHAR(50),
    last_name          VARCHAR(50) NOT NULL,
    second_last_name   VARCHAR(50),
    phone              VARCHAR(10) NOT NULL CHECK (phone ~ '^[0-9]{10}$'),
    email              VARCHAR(150) UNIQUE NOT NULL,
    id_number          VARCHAR(20) UNIQUE NOT NULL,
    password_hash      VARCHAR(255),
    is_admin           BOOLEAN NOT NULL DEFAULT FALSE,              -- (*) admin independiente, no autorregistrable
    active_profile_id  SMALLINT NOT NULL REFERENCES active_profiles(active_profile_id), -- (*) el switch
    status_id          SMALLINT NOT NULL REFERENCES account_statuses(status_id),
    profile_photo_url  VARCHAR(500),
    email_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    disabled_at        TIMESTAMPTZ,
    CONSTRAINT chk_users_email_lowercase CHECK (email = lower(email))
);


CREATE TABLE token_types (
    token_type_id   SMALLSERIAL PRIMARY KEY,
    type_name       VARCHAR(30) UNIQUE NOT NULL -- 'email_verification', 'password_reset'
);

CREATE TABLE auth_tokens (
    auth_token_id   BIGSERIAL PRIMARY KEY,
    user_id         BIGINT NOT NULL REFERENCES users(user_id),
    token_type_id   SMALLINT NOT NULL REFERENCES token_types(token_type_id),
    token_hash      VARCHAR(255) NOT NULL UNIQUE,
    expires_at      TIMESTAMPTZ NOT NULL,
    used_at         TIMESTAMPTZ,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE identity_providers (
    identity_provider_id   SMALLSERIAL PRIMARY KEY,
    provider_name          VARCHAR(20) UNIQUE NOT NULL   --'GOOGLE', 'MICROSOFT'
);

CREATE TABLE user_identities (
    user_identity_id      BIGSERIAL PRIMARY KEY,
    user_id               BIGINT NOT NULL REFERENCES users(user_id),
    identity_provider_id  SMALLINT NOT NULL REFERENCES identity_providers(identity_provider_id),
    provider_user_id      VARCHAR(255) NOT NULL,   -- "sub" de Google / "oid" o "sub" de Microsoft
    created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_login_at         TIMESTAMPTZ,
    UNIQUE (identity_provider_id, provider_user_id),  -- esa cuenta externa solo existe una vez
    UNIQUE (user_id, identity_provider_id)            -- un usuario, una cuenta por proveedor
);


CREATE TABLE communes (
    commune_id      SERIAL PRIMARY KEY,
    commune_name    VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE neighborhoods (
    neighborhood_id     SERIAL PRIMARY KEY,
    commune_id          INT NOT NULL REFERENCES communes(commune_id),
    neighborhood_name   VARCHAR(100) NOT NULL,
    UNIQUE (commune_id, neighborhood_name)
);

CREATE TABLE client_profiles (
    client_profile_id          BIGSERIAL PRIMARY KEY,
    user_id                    BIGINT UNIQUE NOT NULL REFERENCES users(user_id),
    reference_neighborhood_id  INT REFERENCES neighborhoods(neighborhood_id),
    reference_address          VARCHAR(255),
    description                VARCHAR(200),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                   TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE categories (
    category_id          SERIAL PRIMARY KEY,
    parent_category_id   INT REFERENCES categories(category_id),  -- NULL = categoría raíz
    category_name         VARCHAR(100) NOT NULL,
    UNIQUE (parent_category_id, category_name),
    CONSTRAINT chk_categories_not_own_parent CHECK (parent_category_id IS NULL OR parent_category_id <> category_id)
);

-- UNIQUE(parent, name) no protege cuando parent es NULL (los NULL se consideran distintos).
CREATE UNIQUE INDEX uq_categories_root_name ON categories (category_name) WHERE parent_category_id IS NULL;

-- (*) nit ahora UNIQUE (permite múltiples NULL).
CREATE TABLE provider_profiles (
    provider_profile_id    BIGSERIAL PRIMARY KEY,
    user_id                BIGINT UNIQUE NOT NULL REFERENCES users(user_id),
    nit                    VARCHAR(20) UNIQUE,
    bio                    VARCHAR(500),
    created_at             TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE provider_categories (
    provider_profile_id    BIGINT NOT NULL REFERENCES provider_profiles(provider_profile_id),
    category_id            INT NOT NULL REFERENCES categories(category_id),
    PRIMARY KEY (provider_profile_id, category_id)
);

CREATE TABLE provider_service_areas (
    provider_profile_id    BIGINT NOT NULL REFERENCES provider_profiles(provider_profile_id),
    neighborhood_id        INT NOT NULL REFERENCES neighborhoods(neighborhood_id),
    PRIMARY KEY (provider_profile_id, neighborhood_id)
);

-- (*) nueva: reemplaza el day_of_week debido a que con la numeracion podria ser contraproducente
CREATE TABLE days_of_week (
    day_of_week_id  SMALLSERIAL PRIMARY KEY,
    day_name        VARCHAR(10) UNIQUE NOT NULL  -- 'monday', 'tuesday', ..., 'sunday'
);

CREATE TABLE time_blocks (
    time_block_id   SMALLSERIAL PRIMARY KEY,
    block_name      VARCHAR(20) UNIQUE NOT NULL  -- 'morning', 'afternoon', 'evening'
);

-- (*) day_of_week_id en vez de day_of_week SMALLINT.
CREATE TABLE provider_availability (
    provider_availability_id   BIGSERIAL PRIMARY KEY,
    provider_profile_id        BIGINT NOT NULL REFERENCES provider_profiles(provider_profile_id),
    day_of_week_id              SMALLINT NOT NULL REFERENCES days_of_week(day_of_week_id),
    time_block_id               SMALLINT NOT NULL REFERENCES time_blocks(time_block_id),
    UNIQUE (provider_profile_id, day_of_week_id, time_block_id)
);

CREATE TABLE bank_account_types (
    account_type_id     SMALLSERIAL PRIMARY KEY,
    type_name            VARCHAR(20) UNIQUE NOT NULL  -- 'savings', 'checking'
);

CREATE TABLE provider_bank_accounts (
    provider_bank_account_id   BIGSERIAL PRIMARY KEY,
    provider_profile_id        BIGINT UNIQUE NOT NULL REFERENCES provider_profiles(provider_profile_id),
    bank_name                  VARCHAR(100) NOT NULL,
    account_type_id            SMALLINT NOT NULL REFERENCES bank_account_types(account_type_id),
    account_number              VARCHAR(30) NOT NULL,
    created_at                   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE evidence_statuses (
    evidence_status_id     SMALLSERIAL PRIMARY KEY,
    status_name            VARCHAR(30) UNIQUE NOT NULL  -- 'pending_approval', 'approved', 'rejected'
);

CREATE TABLE work_evidence (
    work_evidence_id        BIGSERIAL PRIMARY KEY,
    provider_profile_id     BIGINT NOT NULL REFERENCES provider_profiles(provider_profile_id),
    description               VARCHAR(300) NOT NULL,
    status_id                 SMALLINT NOT NULL REFERENCES evidence_statuses(evidence_status_id),
    reviewed_by                BIGINT REFERENCES users(user_id),
    created_at                  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE work_evidence_photos (
    work_evidence_photo_id   BIGSERIAL PRIMARY KEY,
    work_evidence_id          BIGINT NOT NULL REFERENCES work_evidence(work_evidence_id),
    photo_url                   VARCHAR(255) NOT NULL
);


CREATE TABLE listing_statuses (
    listing_status_id  SMALLSERIAL PRIMARY KEY,
    status_name         VARCHAR(20) UNIQUE NOT NULL  -- 'active', 'paused', 'rejected', 'withdrawn'
);

CREATE TABLE service_listings (
    service_listing_id     BIGSERIAL PRIMARY KEY,
    provider_profile_id    BIGINT NOT NULL REFERENCES provider_profiles(provider_profile_id),
    category_id             INT NOT NULL REFERENCES categories(category_id),
    title                     VARCHAR(150) NOT NULL,
    description                VARCHAR(1000) NOT NULL,
    min_price                   NUMERIC(12,2) NOT NULL CHECK (min_price >= 0),
    max_price                    NUMERIC(12,2) NOT NULL CHECK (max_price >= min_price),
    status_id                     SMALLINT NOT NULL REFERENCES listing_statuses(listing_status_id),
    created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE service_listing_photos (
    service_listing_photo_id   BIGSERIAL PRIMARY KEY,
    service_listing_id          BIGINT NOT NULL REFERENCES service_listings(service_listing_id),
    photo_url                     VARCHAR(255) NOT NULL
);

CREATE TABLE need_statuses (
    need_status_id  SMALLSERIAL PRIMARY KEY,
    status_name      VARCHAR(30) UNIQUE NOT NULL  -- 'open', 'provider_selected', 'closed'
);

CREATE TABLE needs (
    need_id             BIGSERIAL PRIMARY KEY,
    client_id            BIGINT NOT NULL REFERENCES users(user_id),
    title                 VARCHAR(150) NOT NULL,
    description            VARCHAR(1000) NOT NULL,
    category_id             INT NOT NULL REFERENCES categories(category_id),
    neighborhood_id          INT NOT NULL REFERENCES neighborhoods(neighborhood_id),
    exact_address             VARCHAR(255),
    preferred_datetime         TIMESTAMPTZ,
    budget_min                  NUMERIC(12,2) CHECK (budget_min IS NULL OR budget_min >= 0),
    budget_max                   NUMERIC(12,2) CHECK (budget_max IS NULL OR budget_min IS NULL OR budget_max >= budget_min),
    status_id                     SMALLINT NOT NULL REFERENCES need_statuses(need_status_id),
    created_at                     TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE need_photos (
    need_photo_id   BIGSERIAL PRIMARY KEY,
    need_id          BIGINT NOT NULL REFERENCES needs(need_id),
    photo_url          VARCHAR(255) NOT NULL
);

CREATE TABLE interest_statuses (
    interest_status_id  SMALLSERIAL PRIMARY KEY,
    status_name           VARCHAR(20) UNIQUE NOT NULL  -- 'pending', 'selected', 'not_selected'
);

-- La "disponibilidad" de HU-26 se consulta en provider_availability
CREATE TABLE need_interests (
    need_interest_id       BIGSERIAL PRIMARY KEY,
    need_id                  BIGINT NOT NULL REFERENCES needs(need_id),
    provider_profile_id      BIGINT NOT NULL REFERENCES provider_profiles(provider_profile_id),
    message                    VARCHAR(500),
    proposed_price              NUMERIC(12,2),
    status_id                    SMALLINT NOT NULL REFERENCES interest_statuses(interest_status_id),
    created_at                    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (need_id, provider_profile_id)
);

CREATE TABLE request_statuses (
    request_status_id  SMALLSERIAL PRIMARY KEY,
    status_name          VARCHAR(30) UNIQUE NOT NULL
    -- 'solicitado','aceptado','confirmado','en_curso','finalizado','completado','cancelado','rechazado'
);

-- (*) + completion_requested_at: cuándo arranca el plazo de 24h de HU-45.
CREATE TABLE service_requests (
    service_request_id         BIGSERIAL PRIMARY KEY,
    client_id                    BIGINT NOT NULL REFERENCES users(user_id),
    provider_profile_id           BIGINT NOT NULL REFERENCES provider_profiles(provider_profile_id),
    source_service_listing_id      BIGINT REFERENCES service_listings(service_listing_id),
    source_need_id                  BIGINT REFERENCES needs(need_id),
    proposed_datetime                TIMESTAMPTZ NOT NULL,
    neighborhood_id                   INT NOT NULL REFERENCES neighborhoods(neighborhood_id),
    exact_address                      VARCHAR(255),
    agreed_price                        NUMERIC(12,2) CHECK (agreed_price IS NULL OR agreed_price >= 0),
    status_id                            SMALLINT NOT NULL REFERENCES request_statuses(request_status_id),
    rejection_reason                      VARCHAR(300),
    reschedule_count                       SMALLINT NOT NULL DEFAULT 0,
    completion_requested_at                 TIMESTAMPTZ,
    created_at                               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                                TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_service_request_origin CHECK (
        (source_service_listing_id IS NOT NULL AND source_need_id IS NULL)
        OR (source_service_listing_id IS NULL AND source_need_id IS NOT NULL)
    )
);

CREATE TABLE payment_methods (
    payment_method_id  SMALLSERIAL PRIMARY KEY,
    method_name        VARCHAR(30) UNIQUE NOT NULL  -- 'gateway_simulated', 'bank_transfer'
);

CREATE TABLE payment_statuses (
    payment_status_id  SMALLSERIAL PRIMARY KEY,
    status_name        VARCHAR(30) UNIQUE NOT NULL  -- 'pending', 'approved', 'rejected', 'refunded'
);

-- Quien paga siempre es service_requests.client_id, por eso no hay paid_by (evita redundancia).
CREATE TABLE payments (
    payment_id          BIGSERIAL PRIMARY KEY,
    service_request_id  BIGINT NOT NULL REFERENCES service_requests(service_request_id),
    payment_method_id   SMALLINT NOT NULL REFERENCES payment_methods(payment_method_id),
    status_id           SMALLINT NOT NULL REFERENCES payment_statuses(payment_status_id),
    amount              NUMERIC(12,2) NOT NULL CHECK (amount > 0),
    gateway_reference   VARCHAR(100) UNIQUE,   -- id de transacción de la pasarela (o el simulado)
    proof_url           VARCHAR(255),          -- comprobante, si el método es transferencia
    failure_reason      VARCHAR(300),
    paid_at             TIMESTAMPTZ,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE appointment_statuses (
    appointment_status_id  SMALLSERIAL PRIMARY KEY,
    status_name              VARCHAR(20) UNIQUE NOT NULL  
);

CREATE TABLE appointments (
    appointment_id       BIGSERIAL PRIMARY KEY,
    service_request_id    BIGINT UNIQUE NOT NULL REFERENCES service_requests(service_request_id),
    scheduled_datetime      TIMESTAMPTZ NOT NULL,
    status_id                SMALLINT NOT NULL REFERENCES appointment_statuses(appointment_status_id),
    created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE reschedule_statuses (
    reschedule_status_id  SMALLSERIAL PRIMARY KEY,
    status_name              VARCHAR(20) UNIQUE NOT NULL  
);

CREATE TABLE appointment_reschedule_requests (
    reschedule_request_id  BIGSERIAL PRIMARY KEY,
    appointment_id            BIGINT NOT NULL REFERENCES appointments(appointment_id),
    requested_by               BIGINT NOT NULL REFERENCES users(user_id),
    previous_datetime            TIMESTAMPTZ NOT NULL,
    new_datetime                   TIMESTAMPTZ NOT NULL,
    status_id                        SMALLINT NOT NULL REFERENCES reschedule_statuses(reschedule_status_id),
    created_at                         TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- HU-38 sera para una versión futura: sin tabla/columna para esto.

-- Chat (HU-39): se dejara quieto hasta llegar al dilema del chat
CREATE TABLE chat_messages (
    message_id           BIGSERIAL PRIMARY KEY,
    service_request_id     BIGINT NOT NULL REFERENCES service_requests(service_request_id),
    sender_id                BIGINT NOT NULL REFERENCES users(user_id),
    message_text                VARCHAR(2000) NOT NULL,
    sent_at                       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- (*) + is_automatic: distingue confirmación manual de la automática por
-- vencimiento del plazo de 24h (HU-45).
CREATE TABLE completion_confirmations (
    completion_confirmation_id   BIGSERIAL PRIMARY KEY,
    service_request_id              BIGINT NOT NULL REFERENCES service_requests(service_request_id),
    confirmed_by                       BIGINT NOT NULL REFERENCES users(user_id),
    is_automatic                         BOOLEAN NOT NULL DEFAULT FALSE,
    confirmed_at                          TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (service_request_id, confirmed_by)
);

CREATE TABLE issue_reports (
    issue_report_id     BIGSERIAL PRIMARY KEY,
    service_request_id     BIGINT NOT NULL REFERENCES service_requests(service_request_id),
    reported_by               BIGINT NOT NULL REFERENCES users(user_id),
    description                  VARCHAR(1000) NOT NULL,
    created_at                     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE ratings (
    rating_id           BIGSERIAL PRIMARY KEY,
    service_request_id     BIGINT NOT NULL REFERENCES service_requests(service_request_id),
    rated_by                  BIGINT NOT NULL REFERENCES users(user_id),
    rated_user_id                BIGINT NOT NULL REFERENCES users(user_id),
    score                          SMALLINT NOT NULL CHECK (score BETWEEN 1 AND 5),
    comment                          VARCHAR(300),
    created_at                         TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (service_request_id, rated_by)
);

-- HU-49: evaluación administrativa de la fuerza mayor. El perfil de admin
-- (E14) no está construido todavía, pero se deja expresado.
CREATE TABLE force_majeure_statuses (
    force_majeure_status_id  SMALLSERIAL PRIMARY KEY,
    status_name                  VARCHAR(20) UNIQUE NOT NULL  
);

CREATE TABLE cancellations (
    cancellation_id       BIGSERIAL PRIMARY KEY,
    service_request_id       BIGINT NOT NULL UNIQUE REFERENCES service_requests(service_request_id),
    cancelled_by                BIGINT NOT NULL REFERENCES users(user_id),
    reason                         VARCHAR(500) NOT NULL,
    is_force_majeure                  BOOLEAN NOT NULL DEFAULT FALSE,
    evidence_url                         VARCHAR(255),
    force_majeure_status_id              SMALLINT REFERENCES force_majeure_statuses(force_majeure_status_id),  -- (*) nuevo, nullable
    force_majeure_reviewed_by             BIGINT REFERENCES users(user_id),                                     -- (*) nuevo, nullable
    created_at                              TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT chk_cancellation_force_majeure CHECK (
        (is_force_majeure AND force_majeure_status_id IS NOT NULL)
        OR (NOT is_force_majeure AND force_majeure_status_id IS NULL AND force_majeure_reviewed_by IS NULL)
    )
);

CREATE TABLE claim_reasons (
    claim_reason_id   SMALLSERIAL PRIMARY KEY,
    reason_name          VARCHAR(100) UNIQUE NOT NULL
);

CREATE TABLE claim_statuses (
    claim_status_id   SMALLSERIAL PRIMARY KEY,
    status_name           VARCHAR(30) UNIQUE NOT NULL
);

CREATE TABLE claims (
    claim_id           BIGSERIAL PRIMARY KEY,
    service_request_id    BIGINT NOT NULL REFERENCES service_requests(service_request_id),
    filed_by                 BIGINT NOT NULL REFERENCES users(user_id),
    filed_against               BIGINT NOT NULL REFERENCES users(user_id),
    reason_id                     SMALLINT NOT NULL REFERENCES claim_reasons(claim_reason_id),
    description                      VARCHAR(1000) NOT NULL,
    status_id                          SMALLINT NOT NULL REFERENCES claim_statuses(claim_status_id),
    resolution                            VARCHAR(1000),
    created_at                               TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                                 TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE claim_photos (
    claim_photo_id   BIGSERIAL PRIMARY KEY,
    claim_id            BIGINT NOT NULL REFERENCES claims(claim_id),
    photo_url               VARCHAR(255) NOT NULL
);

CREATE TABLE document_types (
    document_type_id   SMALLSERIAL PRIMARY KEY,
    type_name              VARCHAR(30) UNIQUE NOT NULL  
);

CREATE TABLE verification_statuses (
    verification_status_id  SMALLSERIAL PRIMARY KEY,
    status_name                 VARCHAR(30) UNIQUE NOT NULL
);

CREATE TABLE identity_verifications (
    identity_verification_id  BIGSERIAL PRIMARY KEY,
    provider_profile_id          BIGINT NOT NULL REFERENCES provider_profiles(provider_profile_id),
    document_type_id                SMALLINT NOT NULL REFERENCES document_types(document_type_id),
    document_number                    VARCHAR(30) NOT NULL,
    additional_info                       VARCHAR(500),
    status_id                               SMALLINT NOT NULL REFERENCES verification_statuses(verification_status_id),
    reviewed_by                                BIGINT REFERENCES users(user_id),
    review_notes                                  VARCHAR(500),
    created_at                                       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at                                          TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE identity_verification_photos (
    identity_verification_photo_id   BIGSERIAL PRIMARY KEY,
    identity_verification_id            BIGINT NOT NULL REFERENCES identity_verifications(identity_verification_id),
    photo_url                              VARCHAR(255) NOT NULL
);


CREATE TABLE audit_events (
    audit_event_id   BIGSERIAL PRIMARY KEY,
    actor_id             BIGINT REFERENCES users(user_id),
    event_type              VARCHAR(50) NOT NULL,
    entity_type                VARCHAR(50) NOT NULL,
    entity_id                     BIGINT NOT NULL,
    occurred_at                      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE notification_types (
    notification_type_id  SMALLSERIAL PRIMARY KEY,
    type_name                 VARCHAR(50) UNIQUE NOT NULL
);

CREATE TABLE notifications (
    notification_id             BIGSERIAL PRIMARY KEY,
    user_id                         BIGINT NOT NULL REFERENCES users(user_id),
    notification_type_id               SMALLINT NOT NULL REFERENCES notification_types(notification_type_id),
    message                                VARCHAR(300) NOT NULL,
    related_service_request_id                BIGINT REFERENCES service_requests(service_request_id),
    is_read                                       BOOLEAN NOT NULL DEFAULT FALSE,
    created_at                                       TIMESTAMPTZ NOT NULL DEFAULT now()
);
