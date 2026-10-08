-- =====================================================================
-- Confiance — DATOS DE PRUEBA (SOLO DESARROLLO, nunca producción)
-- Requiere haber aplicado todas las migraciones (los catálogos ya están cargados).
-- Ejecutar desde la raíz del repo:
--   docker compose exec -T postgres psql -U confiance -d confiance -v ON_ERROR_STOP=1 < database/seeds/dev_seed.sql
--
-- Va en una sola transacción: el perfil activo de cada usuario se valida al final
-- (el usuario se crea antes que su perfil). Las contrataciones nacen en SOLICITADO y
-- avanzan por el ciclo como en la app; las fechas caen en la disponibilidad del
-- prestador (bloques en hora de Bogotá).
-- =====================================================================

BEGIN;

-- Avanza una contratación al estado indicado (los triggers validan la transición).
CREATE FUNCTION pg_temp.set_status(p_request bigint, p_status text) RETURNS void AS $$
    UPDATE service_requests
    SET status_id = (SELECT request_status_id FROM request_statuses WHERE status_name = p_status)
    WHERE service_request_id = p_request;
$$ LANGUAGE sql;

-- Lunes de esta semana a las 00:00, hora de Bogotá; las fechas se calculan desde aquí.
CREATE FUNCTION pg_temp.week_start() RETURNS timestamp AS $$
    SELECT date_trunc('week', now() AT TIME ZONE 'America/Bogota');
$$ LANGUAGE sql;

CREATE FUNCTION pg_temp.bogota(p_local timestamp) RETURNS timestamptz AS $$
    SELECT p_local AT TIME ZONE 'America/Bogota';
$$ LANGUAGE sql;

-- =====================================================================
-- 2. UBICACIÓN Y CATEGORÍAS
-- =====================================================================

INSERT INTO communes (commune_id, commune_name) VALUES (1, 'Comuna 1'), (2, 'Comuna 2');

INSERT INTO neighborhoods (neighborhood_id, commune_id, neighborhood_name) VALUES
    (1, 1, 'Barrio Centro'),
    (2, 1, 'Barrio Norte'),
    (3, 2, 'Barrio Sur');

-- Jerarquía de 2 niveles (HU-11): parent_category_id NULL = raíz.
INSERT INTO categories (category_id, parent_category_id, category_name) VALUES
    (1, NULL, 'Plomería'),
    (2, 1,    'Reparación de fugas'),
    (3, NULL, 'Electricidad'),
    (4, 3,    'Instalaciones eléctricas'),
    (5, NULL, 'Limpieza');

-- =====================================================================
-- 3. USUARIOS (demuestra el switch cliente/prestador)
-- =====================================================================

-- Ana: solo cliente.
INSERT INTO users (user_id, first_name, last_name, phone, email, id_number, password_hash,
                    is_admin, active_profile_id, status_id, email_verified)
VALUES (1, 'Ana', 'Gómez', '3001234567', 'ana@example.com', '1000000001', 'hash_ana',
        FALSE, (SELECT active_profile_id FROM active_profiles WHERE profile_name = 'client'),
        (SELECT status_id FROM account_statuses WHERE status_name = 'active'), TRUE);

-- Carlos: solo prestador, con NIT.
INSERT INTO users (user_id, first_name, last_name, phone, email, id_number, password_hash,
                    is_admin, active_profile_id, status_id, email_verified)
VALUES (2, 'Carlos', 'Pérez', '3007654321', 'carlos@example.com', '1000000002', 'hash_carlos',
        FALSE, (SELECT active_profile_id FROM active_profiles WHERE profile_name = 'provider'),
        (SELECT status_id FROM account_statuses WHERE status_name = 'active'), TRUE);

-- Laura: se registró como prestadora y luego activó también el perfil de
-- cliente (HU-66) — su "switch" quedó en cliente.
INSERT INTO users (user_id, first_name, last_name, phone, email, id_number, password_hash,
                    is_admin, active_profile_id, status_id, email_verified)
VALUES (3, 'Laura', 'Ruiz', '3009988776', 'laura@example.com', '1000000003', 'hash_laura',
        FALSE, (SELECT active_profile_id FROM active_profiles WHERE profile_name = 'client'),
        (SELECT status_id FROM account_statuses WHERE status_name = 'active'), TRUE);

INSERT INTO client_profiles (client_profile_id, user_id, reference_neighborhood_id, reference_address, description) VALUES
    (1, 1, 1, 'Calle 10 # 5-20', 'Prefiere atención en las mañanas'),
    (2, 3, 3, 'Carrera 8 # 12-40', NULL);

INSERT INTO provider_profiles (provider_profile_id, user_id, nit, bio) VALUES
    (1, 2, '900123456-1', 'Plomero con 8 años de experiencia en el sector.'),
    (2, 3, NULL, 'Electricista certificada, atención residencial y comercial.');

INSERT INTO provider_categories (provider_profile_id, category_id) VALUES
    (1, 1), (1, 2),   -- Carlos: Plomería + Reparación de fugas
    (2, 4);            -- Laura: Instalaciones eléctricas

INSERT INTO provider_service_areas (provider_profile_id, neighborhood_id) VALUES
    (1, 1), (1, 2),    -- Carlos: Centro y Norte
    (2, 3);            -- Laura: Sur

INSERT INTO provider_availability (provider_profile_id, day_of_week_id, time_block_id) VALUES
    (1, (SELECT day_of_week_id FROM days_of_week WHERE day_name = 'monday'),
        (SELECT time_block_id FROM time_blocks WHERE block_name = 'morning')),
    (1, (SELECT day_of_week_id FROM days_of_week WHERE day_name = 'wednesday'),
        (SELECT time_block_id FROM time_blocks WHERE block_name = 'afternoon')),
    (2, (SELECT day_of_week_id FROM days_of_week WHERE day_name = 'tuesday'),
        (SELECT time_block_id FROM time_blocks WHERE block_name = 'evening'));

INSERT INTO provider_bank_accounts (provider_profile_id, bank_name, account_type_id, account_number) VALUES
    (1, 'Bancolombia', (SELECT account_type_id FROM bank_account_types WHERE type_name = 'savings'), '000-111222-33');

INSERT INTO work_evidence (work_evidence_id, provider_profile_id, description, status_id) VALUES
    (1, 1, 'Reparación de fuga en cocina', (SELECT evidence_status_id FROM evidence_statuses WHERE status_name = 'approved'));

-- Los archivos se guardan por clave en el almacenamiento privado, sin URL pública (RNF-014).
INSERT INTO work_evidence_photos (work_evidence_id, photo_url) VALUES
    (1, 'evidence/1-a.webp');

INSERT INTO identity_verifications (identity_verification_id, provider_profile_id, document_type_id,
                                     document_number, status_id) VALUES
    (1, 1, (SELECT document_type_id FROM document_types WHERE type_name = 'cedula'),
        '1000000002', (SELECT verification_status_id FROM verification_statuses WHERE status_name = 'approved'));

INSERT INTO identity_verification_photos (identity_verification_id, photo_url) VALUES
    (1, 'identity/1-front.webp'),
    (1, 'identity/1-back.webp');

-- =====================================================================
-- 4. PUBLICACIONES
-- =====================================================================

INSERT INTO service_listings (service_listing_id, provider_profile_id, category_id, title, description,
                               min_price, max_price, status_id) VALUES
    (1, 1, 2, 'Reparación de fugas de agua', 'Diagnóstico y reparación de fugas visibles o bajo lavaplatos.',
        50000, 150000, (SELECT listing_status_id FROM listing_statuses WHERE status_name = 'active'));

INSERT INTO service_listing_photos (service_listing_id, photo_url) VALUES
    (1, 'listings/1-a.webp');

-- Necesidad de Ana para el martes de la próxima semana a las 7 p. m. (bloque de noche de Laura).
INSERT INTO needs (need_id, client_id, title, description, category_id, neighborhood_id, exact_address,
                    preferred_datetime, budget_min, budget_max, status_id) VALUES
    (1, 1, 'Necesito electricista urgente', 'Cambio de breaker que se quemó anoche.', 4, 3, 'Calle 10 # 5-20',
        pg_temp.bogota(pg_temp.week_start() + INTERVAL '8 days 19 hours'),
        40000, 90000, (SELECT need_status_id FROM need_statuses WHERE status_name = 'open'));

INSERT INTO need_interests (need_interest_id, need_id, provider_profile_id, message, proposed_price, status_id) VALUES
    (1, 1, 2, 'Puedo ir ese día en la noche.', 70000,
        (SELECT interest_status_id FROM interest_statuses WHERE status_name = 'pending'));

-- Ana selecciona a Laura (HU-27).
UPDATE need_interests SET status_id = (SELECT interest_status_id FROM interest_statuses WHERE status_name = 'selected')
WHERE need_interest_id = 1;
UPDATE needs SET status_id = (SELECT need_status_id FROM need_statuses WHERE status_name = 'provider_selected')
WHERE need_id = 1;

-- =====================================================================
-- 5. CONTRATACIÓN, AGENDA Y EJECUCIÓN
-- =====================================================================

-- Contratación 1: Ana contrata a Carlos desde su publicación para el próximo lunes
-- a las 9 a. m.; queda CONFIRMADA y la cita se crea sola (HU-36).
INSERT INTO service_requests (service_request_id, client_id, provider_profile_id,
                               source_service_listing_id, proposed_datetime, neighborhood_id,
                               agreed_price, status_id) VALUES
    (1, 1, 1, 1, pg_temp.bogota(pg_temp.week_start() + INTERVAL '7 days 9 hours'), 1, 120000,
        (SELECT request_status_id FROM request_statuses WHERE status_name = 'solicitado'));

SELECT pg_temp.set_status(1, 'aceptado');
SELECT pg_temp.set_status(1, 'confirmado');

INSERT INTO chat_messages (service_request_id, sender_id, message_text) VALUES
    (1, 1, 'Hola Carlos, ¿puedes confirmar la hora exacta?'),
    (1, 2, 'Claro, llego a las 9am.');

-- Contratación 2: el lunes pasado; recorre el ciclo completo hasta COMPLETADO
-- para poder probar calificaciones y promedios.
INSERT INTO service_requests (service_request_id, client_id, provider_profile_id,
                               source_service_listing_id, proposed_datetime, neighborhood_id,
                               agreed_price, status_id) VALUES
    (2, 1, 1, 1, pg_temp.bogota(pg_temp.week_start() - INTERVAL '7 days' + INTERVAL '9 hours'), 1, 100000,
        (SELECT request_status_id FROM request_statuses WHERE status_name = 'solicitado'));

SELECT pg_temp.set_status(2, 'aceptado');
SELECT pg_temp.set_status(2, 'confirmado');
SELECT pg_temp.set_status(2, 'en_curso');
SELECT pg_temp.set_status(2, 'finalizado');

INSERT INTO completion_confirmations (service_request_id, confirmed_by, is_automatic) VALUES
    (2, 1, FALSE), (2, 2, FALSE);

SELECT pg_temp.set_status(2, 'completado');

INSERT INTO ratings (service_request_id, rated_by, rated_user_id, score, comment) VALUES
    (2, 1, 2, 5, 'Excelente trabajo, muy puntual.'),
    (2, 2, 1, 5, 'Cliente claro con lo que necesitaba.');

-- Contratación 3: nace de la necesidad 1 con Laura, se acepta y Ana la cancela por
-- fuerza mayor (pendiente de evaluación). Registrar la cancelación la pasa a CANCELADO.
INSERT INTO service_requests (service_request_id, client_id, provider_profile_id,
                               source_need_id, proposed_datetime, neighborhood_id, exact_address, status_id)
VALUES (3, 1, 2, 1, (SELECT preferred_datetime FROM needs WHERE need_id = 1), 3, 'Calle 10 # 5-20',
        (SELECT request_status_id FROM request_statuses WHERE status_name = 'solicitado'));

SELECT pg_temp.set_status(3, 'aceptado');

INSERT INTO cancellations (service_request_id, cancelled_by, reason, is_force_majeure,
                            force_majeure_status_id) VALUES
    (3, 1, 'Tuve una emergencia familiar y debo viajar.', TRUE,
        (SELECT force_majeure_status_id FROM force_majeure_statuses WHERE status_name = 'pending'));

-- Reclamo de ejemplo sobre la contratación 2.
INSERT INTO claims (service_request_id, filed_by, filed_against, reason_id, description, status_id) VALUES
    (2, 1, 2, (SELECT claim_reason_id FROM claim_reasons WHERE reason_name = 'Cobro indebido'),
        'Se cobró más de lo acordado inicialmente.',
        (SELECT claim_status_id FROM claim_statuses WHERE status_name = 'abierto'));

INSERT INTO notifications (user_id, notification_type_id, message, related_service_request_id) VALUES
    (1, (SELECT notification_type_id FROM notification_types WHERE type_name = 'request_accepted'),
        'Tu solicitud fue aceptada.', 1);

-- =====================================================================
-- 7. Reajustar secuencias (este seed inserta IDs explícitos)
-- Sin esto, el primer INSERT normal de la app falla con "duplicate key".
-- =====================================================================
DO $$
DECLARE r RECORD;
BEGIN
    FOR r IN
        SELECT c.table_name, c.column_name,
               pg_get_serial_sequence(format('%I.%I', c.table_schema, c.table_name), c.column_name) AS seq
        FROM information_schema.columns c
        WHERE c.table_schema = 'public' AND c.column_default LIKE 'nextval%'
    LOOP
        EXECUTE format('SELECT setval(%L, COALESCE((SELECT MAX(%I) FROM %I), 0) + 1, false)',
                       r.seq, r.column_name, r.table_name);
    END LOOP;
END $$;

COMMIT;
