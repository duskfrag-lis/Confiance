-- =====================================================================
-- Migración 6: REGLAS DE NEGOCIO (correcciones tras revisar HU V5 y la especificación v3.1)
--
--   0. Catálogos: horas de los bloques (mañana 6-12, tarde 12-18, noche 18-22),
--      cita cancelada, notificaciones de HU-44/HU-69, pagos solo por transferencia.
--   1. Reagendamiento (HU-50): ligado a la contratación, máx. 2 solicitudes, una
--      pendiente a la vez, solo las partes, dentro de la disponibilidad y sin choque.
--   2. Cancelación (HU-48, HU-49): ordinaria en SOLICITADO/ACEPTADO/CONFIRMADO y hasta
--      24 h antes; fuerza mayor exenta de las 24 h y de EN_CURSO (hasta FINALIZADO).
--      Registrar la cancelación pasa la contratación a CANCELADO.
--   3. Calificaciones por perfil (RN-001) y vistas públicas sin cuentas deshabilitadas;
--      el perfil público incluye la disponibilidad (HU-17).
--   4. Sesiones por dispositivo para refresh tokens (HU-03).
--   5. Zonas y categorías desactivables (HU-59, HU-60).
--   6. Necesidad (HU-23 V5): dirección, fecha preferida y presupuesto obligatorios.
--   7. Ciclo de la contratación (HU-31, HU-34): se crea en SOLICITADO, solo transiciones
--      válidas, cita automática al CONFIRMAR (HU-36), plazo de 24 h al FINALIZAR (HU-45),
--      bloqueo de horario desde ACEPTADO (HU-35) y trazabilidad automática (HU-64).
--   8. Coherencia: partes de la solicitud, calificaciones solo en COMPLETADO (HU-47),
--      reporte de problemas desde FINALIZADO (HU-46), límites de oficios y fotos,
--      retiro de publicaciones (HU-21), perfil activo existente (HU-66).
--   9. Autocompletado: no aplica si el cliente reportó un problema (RF-068).
--
-- Zona horaria de los bloques: America/Bogota (ciudad piloto).
-- =====================================================================


-- =====================================================================
-- 0. CATÁLOGOS
-- =====================================================================

ALTER TABLE time_blocks
    ADD COLUMN start_time TIME,
    ADD COLUMN end_time   TIME;

UPDATE time_blocks SET start_time = '06:00', end_time = '12:00' WHERE block_name = 'morning';
UPDATE time_blocks SET start_time = '12:00', end_time = '18:00' WHERE block_name = 'afternoon';
UPDATE time_blocks SET start_time = '18:00', end_time = '22:00' WHERE block_name = 'evening';

ALTER TABLE time_blocks
    ALTER COLUMN start_time SET NOT NULL,
    ALTER COLUMN end_time   SET NOT NULL,
    ADD CONSTRAINT chk_time_blocks_range CHECK (end_time > start_time);

-- La cita de una contratación cancelada no puede quedar como "próxima".
INSERT INTO appointment_statuses (status_name) VALUES ('cancelled');

-- HU-69 (confirmación por ambas partes) y HU-44 (recordatorio de inicio).
INSERT INTO notification_types (type_name) VALUES ('request_confirmed'), ('service_start_reminder');

-- Pagos simulados solo por transferencia (sin tarjeta ni pasarela).
DELETE FROM payment_methods WHERE method_name = 'gateway_simulated';


-- =====================================================================
-- AUXILIARES: bloques horarios, disponibilidad y partes de la contratación
-- =====================================================================

CREATE FUNCTION fn_local_block(p_ts TIMESTAMPTZ)
RETURNS SMALLINT AS $$
    SELECT time_block_id FROM time_blocks
    WHERE (p_ts AT TIME ZONE 'America/Bogota')::time >= start_time
      AND (p_ts AT TIME ZONE 'America/Bogota')::time <  end_time;
$$ LANGUAGE sql STABLE;

CREATE FUNCTION fn_local_day(p_ts TIMESTAMPTZ)
RETURNS SMALLINT AS $$
    SELECT day_of_week_id FROM days_of_week
    WHERE day_name = to_char(p_ts AT TIME ZONE 'America/Bogota', 'FMday');
$$ LANGUAGE sql STABLE;

-- HU-35: el horario debe caer en un día y bloque configurados por el prestador.
CREATE FUNCTION fn_check_provider_availability(p_provider BIGINT, p_ts TIMESTAMPTZ)
RETURNS VOID AS $$
BEGIN
    IF fn_local_block(p_ts) IS NULL THEN
        RAISE EXCEPTION 'La hora % está fuera de los bloques horarios (mañana, tarde, noche)', p_ts;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM provider_availability
        WHERE provider_profile_id = p_provider
          AND day_of_week_id = fn_local_day(p_ts)
          AND time_block_id = fn_local_block(p_ts)
    ) THEN
        RAISE EXCEPTION 'El horario % está fuera de la disponibilidad del prestador (provider_profile_id = %)', p_ts, p_provider;
    END IF;
END;
$$ LANGUAGE plpgsql;

-- HU-35 / RN-027: desde ACEPTADO el día y bloque quedan ocupados (también en
-- CONFIRMADO y EN_CURSO). En SOLICITADO no se bloquea.
CREATE FUNCTION fn_provider_slot_taken(p_provider BIGINT, p_ts TIMESTAMPTZ, p_exclude_request BIGINT)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1
        FROM service_requests sr
        JOIN request_statuses rs ON rs.request_status_id = sr.status_id
        LEFT JOIN appointments a ON a.service_request_id = sr.service_request_id
        WHERE sr.provider_profile_id = p_provider
          AND sr.service_request_id IS DISTINCT FROM p_exclude_request
          AND rs.status_name IN ('aceptado', 'confirmado', 'en_curso')
          AND (COALESCE(a.scheduled_datetime, sr.proposed_datetime) AT TIME ZONE 'America/Bogota')::date
              = (p_ts AT TIME ZONE 'America/Bogota')::date
          AND fn_local_block(COALESCE(a.scheduled_datetime, sr.proposed_datetime)) = fn_local_block(p_ts)
    );
$$ LANGUAGE sql STABLE;

CREATE FUNCTION fn_check_provider_slot_free(p_provider BIGINT, p_ts TIMESTAMPTZ, p_exclude_request BIGINT)
RETURNS VOID AS $$
BEGIN
    -- Serializa por prestador: dos aceptaciones simultáneas no toman el mismo bloque.
    PERFORM 1 FROM provider_profiles WHERE provider_profile_id = p_provider FOR UPDATE;

    IF fn_provider_slot_taken(p_provider, p_ts, p_exclude_request) THEN
        RAISE EXCEPTION 'El prestador ya tiene una contratación aceptada en ese día y bloque horario (provider_profile_id = %)', p_provider;
    END IF;
END;
$$ LANGUAGE plpgsql;

CREATE FUNCTION fn_request_parties(p_request BIGINT,
                                   OUT client_id BIGINT, OUT provider_user_id BIGINT, OUT status_name VARCHAR)
AS $$
    SELECT sr.client_id, pp.user_id, rs.status_name
    FROM service_requests sr
    JOIN provider_profiles pp ON pp.provider_profile_id = sr.provider_profile_id
    JOIN request_statuses rs ON rs.request_status_id = sr.status_id
    WHERE sr.service_request_id = p_request;
$$ LANGUAGE sql STABLE;


-- =====================================================================
-- 1. REAGENDAMIENTO
-- =====================================================================

ALTER TABLE appointment_reschedule_requests
    ADD COLUMN service_request_id BIGINT REFERENCES service_requests(service_request_id);

-- Filas previas (si las hay) heredan la contratación de su cita.
UPDATE appointment_reschedule_requests r
SET service_request_id = a.service_request_id
FROM appointments a
WHERE a.appointment_id = r.appointment_id;

ALTER TABLE appointment_reschedule_requests
    ALTER COLUMN service_request_id SET NOT NULL,
    ALTER COLUMN appointment_id DROP NOT NULL,  -- en ACEPTADO todavía no hay cita (HU-36)
    ADD CONSTRAINT chk_reschedule_changes_datetime CHECK (new_datetime <> previous_datetime);

CREATE INDEX idx_reschedule_requests_service_request
    ON appointment_reschedule_requests(service_request_id);

-- Reemplaza la versión anterior, que contaba en cada INSERT (también las rechazadas)
-- y exigía una cita. El trigger trg_check_reschedule_limit sigue apuntando aquí.
CREATE OR REPLACE FUNCTION fn_check_reschedule_limit()
RETURNS TRIGGER AS $$
DECLARE
    v_status_name     VARCHAR(30);
    v_proposed        TIMESTAMPTZ;
    v_provider        BIGINT;
    v_client          BIGINT;
    v_provider_user   BIGINT;
    v_appointment_id  BIGINT;
    v_scheduled       TIMESTAMPTZ;
    v_requests        INTEGER;
    v_pending_id      SMALLINT;
BEGIN
    -- Compatibilidad: si solo llega la cita, se deduce la contratación.
    IF NEW.service_request_id IS NULL AND NEW.appointment_id IS NOT NULL THEN
        SELECT service_request_id INTO NEW.service_request_id
        FROM appointments WHERE appointment_id = NEW.appointment_id;
    END IF;

    -- FOR UPDATE: dos solicitudes simultáneas sobre la misma contratación se serializan.
    SELECT rs.status_name, sr.proposed_datetime, sr.provider_profile_id, sr.client_id, pp.user_id
    INTO v_status_name, v_proposed, v_provider, v_client, v_provider_user
    FROM service_requests sr
    JOIN request_statuses rs ON rs.request_status_id = sr.status_id
    JOIN provider_profiles pp ON pp.provider_profile_id = sr.provider_profile_id
    WHERE sr.service_request_id = NEW.service_request_id
    FOR UPDATE OF sr;

    IF v_status_name IS NULL OR v_status_name NOT IN ('aceptado', 'confirmado') THEN
        RAISE EXCEPTION 'Solo se puede reagendar una contratación ACEPTADA o CONFIRMADA (service_request_id = %, estado = %)',
            NEW.service_request_id, v_status_name;
    END IF;

    IF NEW.requested_by NOT IN (v_client, v_provider_user) THEN
        RAISE EXCEPTION 'Solo el cliente o el prestador de la contratación pueden reagendarla (service_request_id = %)', NEW.service_request_id;
    END IF;

    SELECT appointment_id, scheduled_datetime INTO v_appointment_id, v_scheduled
    FROM appointments WHERE service_request_id = NEW.service_request_id;

    IF NEW.appointment_id IS NOT NULL AND NEW.appointment_id IS DISTINCT FROM v_appointment_id THEN
        RAISE EXCEPTION 'La cita % no pertenece a la contratación %', NEW.appointment_id, NEW.service_request_id;
    END IF;

    -- La cita y la fecha anterior se toman siempre de la fuente real, no del cliente.
    NEW.appointment_id := v_appointment_id;
    NEW.previous_datetime := COALESCE(v_scheduled, v_proposed);

    SELECT reschedule_status_id INTO v_pending_id
    FROM reschedule_statuses WHERE status_name = 'pending';

    IF NEW.status_id IS DISTINCT FROM v_pending_id THEN
        RAISE EXCEPTION 'Una solicitud de reagendamiento debe crearse en estado pending';
    END IF;

    IF EXISTS (
        SELECT 1 FROM appointment_reschedule_requests
        WHERE service_request_id = NEW.service_request_id AND status_id = v_pending_id
    ) THEN
        RAISE EXCEPTION 'Ya hay una solicitud de reagendamiento pendiente (service_request_id = %)', NEW.service_request_id;
    END IF;

    SELECT count(*) INTO v_requests
    FROM appointment_reschedule_requests
    WHERE service_request_id = NEW.service_request_id;

    IF v_requests >= 2 THEN
        RAISE EXCEPTION 'Máximo de 2 solicitudes de reagendamiento alcanzado (service_request_id = %)', NEW.service_request_id;
    END IF;

    PERFORM fn_check_provider_availability(v_provider, NEW.new_datetime);
    PERFORM fn_check_provider_slot_free(v_provider, NEW.new_datetime, NEW.service_request_id);

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Al responder una solicitud: solo desde pending, y si se acepta se aplica la nueva
-- fecha (a la cita o, sin cita, a la fecha propuesta) y se suma a reschedule_count.
CREATE FUNCTION fn_apply_reschedule_response()
RETURNS TRIGGER AS $$
DECLARE
    v_old_status   VARCHAR(20);
    v_new_status   VARCHAR(20);
    v_req_status   VARCHAR(30);
    v_accepted     SMALLINT;
    v_provider     BIGINT;
BEGIN
    IF NEW.status_id = OLD.status_id THEN
        RETURN NEW;
    END IF;

    SELECT status_name INTO v_old_status FROM reschedule_statuses WHERE reschedule_status_id = OLD.status_id;
    SELECT status_name INTO v_new_status FROM reschedule_statuses WHERE reschedule_status_id = NEW.status_id;

    IF v_old_status <> 'pending' THEN
        RAISE EXCEPTION 'La solicitud de reagendamiento % ya fue respondida (%)', OLD.reschedule_request_id, v_old_status;
    END IF;

    IF v_new_status = 'accepted' THEN
        SELECT rs.status_name, sr.reschedule_count, sr.provider_profile_id
        INTO v_req_status, v_accepted, v_provider
        FROM service_requests sr
        JOIN request_statuses rs ON rs.request_status_id = sr.status_id
        WHERE sr.service_request_id = NEW.service_request_id
        FOR UPDATE OF sr;

        IF v_req_status NOT IN ('aceptado', 'confirmado') THEN
            RAISE EXCEPTION 'La contratación % ya no admite reagendamiento (estado = %)', NEW.service_request_id, v_req_status;
        END IF;

        IF v_accepted >= 2 THEN
            RAISE EXCEPTION 'Máximo de 2 reagendamientos aceptados alcanzado (service_request_id = %)', NEW.service_request_id;
        END IF;

        -- El bloque pudo ocuparse mientras la solicitud estaba pendiente.
        PERFORM fn_check_provider_slot_free(v_provider, NEW.new_datetime, NEW.service_request_id);

        IF NEW.appointment_id IS NOT NULL THEN
            UPDATE appointments SET scheduled_datetime = NEW.new_datetime
            WHERE appointment_id = NEW.appointment_id;
        ELSE
            UPDATE service_requests SET proposed_datetime = NEW.new_datetime
            WHERE service_request_id = NEW.service_request_id;
        END IF;

        UPDATE service_requests SET reschedule_count = reschedule_count + 1
        WHERE service_request_id = NEW.service_request_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_apply_reschedule_response
    BEFORE UPDATE OF status_id ON appointment_reschedule_requests
    FOR EACH ROW EXECUTE FUNCTION fn_apply_reschedule_response();

COMMENT ON COLUMN service_requests.reschedule_count IS
    'Reagendamientos ACEPTADOS. Las solicitudes (máx. 2) se cuentan en appointment_reschedule_requests.';


-- =====================================================================
-- 2. CANCELACIÓN
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_prevent_late_cancellation()
RETURNS TRIGGER AS $$
DECLARE
    v_status_name   VARCHAR(30);
    v_reference     TIMESTAMPTZ;
    v_client        BIGINT;
    v_provider_user BIGINT;
BEGIN
    SELECT rs.status_name, COALESCE(a.scheduled_datetime, sr.proposed_datetime), sr.client_id, pp.user_id
    INTO v_status_name, v_reference, v_client, v_provider_user
    FROM service_requests sr
    JOIN request_statuses rs ON rs.request_status_id = sr.status_id
    JOIN provider_profiles pp ON pp.provider_profile_id = sr.provider_profile_id
    LEFT JOIN appointments a ON a.service_request_id = sr.service_request_id
    WHERE sr.service_request_id = NEW.service_request_id
    FOR UPDATE OF sr;

    IF NEW.cancelled_by NOT IN (v_client, v_provider_user) THEN
        RAISE EXCEPTION 'Solo el cliente o el prestador de la contratación pueden cancelarla (service_request_id = %)', NEW.service_request_id;
    END IF;

    -- HU-49: la fuerza mayor no está sujeta a las 24 h ni a la restricción de EN_CURSO,
    -- y queda sujeta a evaluación. Se permite hasta FINALIZADO; COMPLETADO ya está cerrada.
    IF NEW.is_force_majeure THEN
        IF v_status_name IS NULL OR v_status_name NOT IN ('solicitado', 'aceptado', 'confirmado', 'en_curso', 'finalizado') THEN
            RAISE EXCEPTION 'Solo se puede cancelar por fuerza mayor hasta el estado FINALIZADO (service_request_id = %, estado = %)',
                NEW.service_request_id, v_status_name;
        END IF;
        RETURN NEW;
    END IF;

    -- HU-48: la ordinaria solo en SOLICITADO, ACEPTADO o CONFIRMADO.
    IF v_status_name IS NULL OR v_status_name NOT IN ('solicitado', 'aceptado', 'confirmado') THEN
        RAISE EXCEPTION 'Solo se puede cancelar una contratación SOLICITADA, ACEPTADA o CONFIRMADA (service_request_id = %, estado = %)',
            NEW.service_request_id, v_status_name;
    END IF;

    IF v_reference - now() < INTERVAL '24 hours' THEN
        RAISE EXCEPTION 'La cancelación ordinaria solo se permite hasta 24h antes de la fecha programada; dentro de ese plazo solo se puede reagendar (service_request_id = %)',
            NEW.service_request_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Registrar la cancelación es lo que pasa la contratación a CANCELADO.
CREATE FUNCTION fn_apply_cancellation()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE service_requests
    SET status_id = (SELECT request_status_id FROM request_statuses WHERE status_name = 'cancelado')
    WHERE service_request_id = NEW.service_request_id;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_apply_cancellation
    AFTER INSERT ON cancellations
    FOR EACH ROW EXECUTE FUNCTION fn_apply_cancellation();


-- =====================================================================
-- 3. CALIFICACIONES POR PERFIL Y VISTAS PÚBLICAS
-- Una cuenta con los dos perfiles recibe calificaciones como cliente y como
-- prestador; el rol se deduce de su papel en la contratación calificada.
-- Las vistas públicas no muestran cuentas deshabilitadas (HU-07).
-- =====================================================================

DROP VIEW v_service_listing_catalog;
DROP VIEW v_provider_rating_summary;

CREATE VIEW v_provider_rating_summary AS
SELECT
    sr.provider_profile_id,
    r.rated_user_id AS user_id,
    AVG(r.score)::numeric(3,2) AS avg_rating,
    COUNT(*) AS rating_count
FROM ratings r
JOIN service_requests sr ON sr.service_request_id = r.service_request_id
JOIN provider_profiles pp ON pp.provider_profile_id = sr.provider_profile_id
WHERE r.rated_user_id = pp.user_id
GROUP BY sr.provider_profile_id, r.rated_user_id;

CREATE VIEW v_client_rating_summary AS
SELECT
    r.rated_user_id AS user_id,
    AVG(r.score)::numeric(3,2) AS avg_rating,
    COUNT(*) AS rating_count
FROM ratings r
JOIN service_requests sr ON sr.service_request_id = r.service_request_id
WHERE r.rated_user_id = sr.client_id
GROUP BY r.rated_user_id;

-- HU-24: mismo contenido que antes; el promedio ahora es solo como prestador.
CREATE VIEW v_service_listing_catalog AS
SELECT
    sl.service_listing_id,
    sl.title,
    sl.description,
    sl.min_price,
    sl.max_price,
    c.category_name,
    sl.provider_profile_id,
    u.first_name AS provider_first_name,
    u.last_name AS provider_last_name,
    rt.avg_rating AS provider_avg_rating,
    sl.created_at
FROM service_listings sl
JOIN categories c ON c.category_id = sl.category_id
JOIN provider_profiles pp ON pp.provider_profile_id = sl.provider_profile_id
JOIN users u ON u.user_id = pp.user_id
JOIN account_statuses ast ON ast.status_id = u.status_id
JOIN listing_statuses ls ON ls.listing_status_id = sl.status_id
LEFT JOIN v_provider_rating_summary rt ON rt.provider_profile_id = sl.provider_profile_id
WHERE ls.status_name = 'active'
  AND ast.status_name <> 'disabled';

-- HU-25: mismas columnas; sin necesidades de cuentas deshabilitadas.
CREATE OR REPLACE VIEW v_need_catalog AS
SELECT
    n.need_id,
    n.title,
    n.description,
    n.budget_min,
    n.budget_max,
    c.category_name,
    nh.neighborhood_name,
    n.client_id,
    n.preferred_datetime,
    n.created_at
FROM needs n
JOIN categories c ON c.category_id = n.category_id
JOIN neighborhoods nh ON nh.neighborhood_id = n.neighborhood_id
JOIN need_statuses ns ON ns.need_status_id = n.status_id
JOIN users u ON u.user_id = n.client_id
JOIN account_statuses ast ON ast.status_id = u.status_id
WHERE ns.status_name = 'open'
  AND ast.status_name <> 'disabled';

-- HU-17: mismas columnas que antes + completed_services y availability al final.
CREATE OR REPLACE VIEW v_provider_public_profile AS
SELECT
    pp.provider_profile_id,
    u.first_name,
    u.last_name,
    u.profile_photo_url,
    pp.bio,
    COALESCE(cat.categories, ARRAY[]::text[])      AS categories,
    COALESCE(area.neighborhoods, ARRAY[]::text[])   AS service_areas,
    COALESCE(rt.avg_rating, 0)                       AS avg_rating,
    COALESCE(rt.rating_count, 0)                     AS rating_count,
    COALESCE(vs.status_name = 'approved', FALSE)     AS identity_verified,
    COALESCE(done.completed_services, 0)             AS completed_services,
    COALESCE(av.slots, ARRAY[]::text[])              AS availability  -- 'monday morning', ...
FROM provider_profiles pp
JOIN users u ON u.user_id = pp.user_id
JOIN account_statuses ast ON ast.status_id = u.status_id
LEFT JOIN LATERAL (
    SELECT array_agg(c.category_name ORDER BY c.category_name) AS categories
    FROM provider_categories pc
    JOIN categories c ON c.category_id = pc.category_id
    WHERE pc.provider_profile_id = pp.provider_profile_id
) cat ON true
LEFT JOIN LATERAL (
    SELECT array_agg(n.neighborhood_name ORDER BY n.neighborhood_name) AS neighborhoods
    FROM provider_service_areas psa
    JOIN neighborhoods n ON n.neighborhood_id = psa.neighborhood_id
    WHERE psa.provider_profile_id = pp.provider_profile_id
) area ON true
LEFT JOIN v_provider_rating_summary rt ON rt.provider_profile_id = pp.provider_profile_id
LEFT JOIN LATERAL (
    SELECT iv2.status_id
    FROM identity_verifications iv2
    WHERE iv2.provider_profile_id = pp.provider_profile_id
    ORDER BY iv2.created_at DESC
    LIMIT 1
) iv_latest ON true
LEFT JOIN verification_statuses vs ON vs.verification_status_id = iv_latest.status_id
LEFT JOIN LATERAL (
    SELECT COUNT(*) AS completed_services
    FROM service_requests sr
    JOIN request_statuses rs ON rs.request_status_id = sr.status_id
    WHERE sr.provider_profile_id = pp.provider_profile_id
      AND rs.status_name = 'completado'
) done ON true
LEFT JOIN LATERAL (
    SELECT array_agg(d.day_name || ' ' || tb.block_name ORDER BY d.day_of_week_id, tb.time_block_id) AS slots
    FROM provider_availability pa
    JOIN days_of_week d ON d.day_of_week_id = pa.day_of_week_id
    JOIN time_blocks tb ON tb.time_block_id = pa.time_block_id
    WHERE pa.provider_profile_id = pp.provider_profile_id
) av ON true
WHERE ast.status_name <> 'disabled';


-- =====================================================================
-- 4. SESIONES POR DISPOSITIVO (refresh tokens, HU-03)
-- Una fila por dispositivo; al refrescar se rota refresh_token_hash y al cerrar
-- sesión se marca revoked_at solo en esa fila.
-- =====================================================================

CREATE TABLE user_sessions (
    session_id          BIGSERIAL PRIMARY KEY,
    user_id             BIGINT NOT NULL REFERENCES users(user_id),
    refresh_token_hash  VARCHAR(255) NOT NULL UNIQUE,
    user_agent          VARCHAR(255),
    ip_address          VARCHAR(45),
    created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_used_at        TIMESTAMPTZ,
    expires_at          TIMESTAMPTZ NOT NULL,
    revoked_at          TIMESTAMPTZ
);

CREATE INDEX idx_user_sessions_user ON user_sessions(user_id);


-- =====================================================================
-- 5. CATÁLOGOS DESACTIVABLES (solo los que administra el admin)
-- Los catálogos de estados/tipos NO: el backend los busca por nombre.
-- =====================================================================

ALTER TABLE communes      ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE neighborhoods ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE categories    ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;


-- =====================================================================
-- 6. NECESIDAD (HU-23 V5): campos obligatorios
-- Estados: open → provider_selected → closed (sin estados extra; para retirar una
-- necesidad basta con cerrarla).
-- =====================================================================

ALTER TABLE needs
    ALTER COLUMN exact_address      SET NOT NULL,
    ALTER COLUMN preferred_datetime SET NOT NULL,
    ALTER COLUMN budget_min         SET NOT NULL,
    ALTER COLUMN budget_max         SET NOT NULL;

-- Solo las cuentas con perfil de cliente publican necesidades (RN-006).
CREATE FUNCTION fn_check_need_client()
RETURNS TRIGGER AS $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM client_profiles WHERE user_id = NEW.client_id) THEN
        RAISE EXCEPTION 'El usuario % no tiene perfil de cliente', NEW.client_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_need_client
    BEFORE INSERT ON needs
    FOR EACH ROW EXECUTE FUNCTION fn_check_need_client();

ALTER TABLE need_interests
    ADD CONSTRAINT chk_need_interests_price CHECK (proposed_price IS NULL OR proposed_price >= 0);


-- =====================================================================
-- 7. CICLO DE LA CONTRATACIÓN
-- SOLICITADO → ACEPTADO → CONFIRMADO → EN_CURSO → FINALIZADO → COMPLETADO
-- RECHAZADO solo desde SOLICITADO. CANCELADO solo registrando una cancelación
-- (las reglas de cuándo se puede están en fn_prevent_late_cancellation).
-- =====================================================================

-- Trazabilidad (HU-64): el estado o acción realizada. El backend indica el actor con
--   SELECT set_config('app.user_id', '<user_id>', true);  dentro de la transacción.
ALTER TABLE audit_events
    ADD COLUMN previous_state VARCHAR(30),
    ADD COLUMN new_state      VARCHAR(30);

CREATE FUNCTION fn_service_request_before_write()
RETURNS TRIGGER AS $$
DECLARE
    v_old            VARCHAR(30);
    v_new            VARCHAR(30);
    v_provider_user  BIGINT;
    v_listing_owner  BIGINT;
    v_listing_status VARCHAR(20);
    v_need_client    BIGINT;
BEGIN
    SELECT status_name INTO v_new FROM request_statuses WHERE request_status_id = NEW.status_id;

    IF TG_OP = 'INSERT' THEN
        -- HU-31: toda solicitud nace en SOLICITADO.
        IF v_new <> 'solicitado' THEN
            RAISE EXCEPTION 'Una contratación se crea en estado SOLICITADO (se recibió %)', v_new;
        END IF;
        NEW.reschedule_count := 0;
        NEW.completion_requested_at := NULL;

        SELECT user_id INTO v_provider_user FROM provider_profiles WHERE provider_profile_id = NEW.provider_profile_id;
        IF v_provider_user = NEW.client_id THEN
            RAISE EXCEPTION 'Un usuario no puede contratarse a sí mismo (user_id = %)', NEW.client_id;
        END IF;

        IF NOT EXISTS (SELECT 1 FROM client_profiles WHERE user_id = NEW.client_id) THEN
            RAISE EXCEPTION 'El usuario % no tiene perfil de cliente', NEW.client_id;
        END IF;

        IF NEW.source_service_listing_id IS NOT NULL THEN
            SELECT sl.provider_profile_id, ls.status_name INTO v_listing_owner, v_listing_status
            FROM service_listings sl
            JOIN listing_statuses ls ON ls.listing_status_id = sl.status_id
            WHERE sl.service_listing_id = NEW.source_service_listing_id;

            IF v_listing_owner <> NEW.provider_profile_id THEN
                RAISE EXCEPTION 'La publicación % no pertenece al prestador %', NEW.source_service_listing_id, NEW.provider_profile_id;
            END IF;
            IF v_listing_status <> 'active' THEN
                RAISE EXCEPTION 'La publicación % no está activa (estado = %)', NEW.source_service_listing_id, v_listing_status;
            END IF;

            -- HU-35: el cliente elige dentro de la disponibilidad del prestador.
            PERFORM fn_check_provider_availability(NEW.provider_profile_id, NEW.proposed_datetime);
        ELSE
            -- HU-27: desde una necesidad, solo con el prestador seleccionado por su cliente.
            -- (La fecha es la preferida por el cliente, que el prestador vio al postularse.)
            SELECT client_id INTO v_need_client FROM needs WHERE need_id = NEW.source_need_id;
            IF v_need_client <> NEW.client_id THEN
                RAISE EXCEPTION 'La necesidad % no pertenece al cliente %', NEW.source_need_id, NEW.client_id;
            END IF;
            IF NOT EXISTS (
                SELECT 1 FROM need_interests ni
                JOIN interest_statuses ist ON ist.interest_status_id = ni.status_id
                WHERE ni.need_id = NEW.source_need_id
                  AND ni.provider_profile_id = NEW.provider_profile_id
                  AND ist.status_name = 'selected'
            ) THEN
                RAISE EXCEPTION 'El prestador % no fue seleccionado en la necesidad %', NEW.provider_profile_id, NEW.source_need_id;
            END IF;
        END IF;

        RETURN NEW;
    END IF;

    -- UPDATE
    IF (NEW.client_id, NEW.provider_profile_id, NEW.source_service_listing_id, NEW.source_need_id)
       IS DISTINCT FROM (OLD.client_id, OLD.provider_profile_id, OLD.source_service_listing_id, OLD.source_need_id) THEN
        RAISE EXCEPTION 'No se puede cambiar el cliente, el prestador ni el origen de una contratación (service_request_id = %)', OLD.service_request_id;
    END IF;

    IF NEW.status_id = OLD.status_id THEN
        RETURN NEW;
    END IF;

    SELECT status_name INTO v_old FROM request_statuses WHERE request_status_id = OLD.status_id;

    IF NOT (
           (v_old = 'solicitado' AND v_new IN ('aceptado', 'rechazado', 'cancelado'))
        OR (v_old = 'aceptado'   AND v_new IN ('confirmado', 'cancelado'))
        OR (v_old = 'confirmado' AND v_new IN ('en_curso', 'cancelado'))
        OR (v_old = 'en_curso'   AND v_new IN ('finalizado', 'cancelado'))
        OR (v_old = 'finalizado' AND v_new IN ('completado', 'cancelado'))
    ) THEN
        RAISE EXCEPTION 'Transición de estado no permitida: % → % (service_request_id = %)', v_old, v_new, OLD.service_request_id;
    END IF;

    CASE v_new
        WHEN 'cancelado' THEN
            IF NOT EXISTS (SELECT 1 FROM cancellations WHERE service_request_id = NEW.service_request_id) THEN
                RAISE EXCEPTION 'Para cancelar hay que registrar la cancelación con su motivo (service_request_id = %)', NEW.service_request_id;
            END IF;
        WHEN 'aceptado' THEN
            PERFORM fn_check_provider_slot_free(NEW.provider_profile_id, NEW.proposed_datetime, NEW.service_request_id);
        WHEN 'finalizado' THEN
            NEW.completion_requested_at := now();  -- HU-45: inicio del plazo de 24 h
        WHEN 'completado' THEN
            IF NOT EXISTS (
                SELECT 1 FROM completion_confirmations
                WHERE service_request_id = NEW.service_request_id AND confirmed_by = NEW.client_id
            ) THEN
                RAISE EXCEPTION 'Para completar se necesita la confirmación del cliente, manual o automática (service_request_id = %)', NEW.service_request_id;
            END IF;
        ELSE
            NULL;
    END CASE;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_service_request_before_write
    BEFORE INSERT OR UPDATE ON service_requests
    FOR EACH ROW EXECUTE FUNCTION fn_service_request_before_write();

-- Efectos de cada cambio de estado: trazabilidad y cita.
CREATE FUNCTION fn_service_request_after_write()
RETURNS TRIGGER AS $$
DECLARE
    v_actor BIGINT := NULLIF(current_setting('app.user_id', true), '')::BIGINT;
    v_old   VARCHAR(30);
    v_new   VARCHAR(30);
    v_appt  VARCHAR(20);
BEGIN
    SELECT status_name INTO v_new FROM request_statuses WHERE request_status_id = NEW.status_id;

    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_events (actor_id, event_type, entity_type, entity_id, new_state)
        VALUES (v_actor, 'request_created', 'service_request', NEW.service_request_id, v_new);
        RETURN NULL;
    END IF;

    IF NEW.status_id = OLD.status_id THEN
        RETURN NULL;
    END IF;

    SELECT status_name INTO v_old FROM request_statuses WHERE request_status_id = OLD.status_id;

    INSERT INTO audit_events (actor_id, event_type, entity_type, entity_id, previous_state, new_state)
    VALUES (v_actor, 'request_status_changed', 'service_request', NEW.service_request_id, v_old, v_new);

    -- HU-36: la cita nace al CONFIRMAR y acompaña el resto del ciclo.
    IF v_new = 'confirmado' THEN
        INSERT INTO appointments (service_request_id, scheduled_datetime, status_id)
        VALUES (NEW.service_request_id, NEW.proposed_datetime,
                (SELECT appointment_status_id FROM appointment_statuses WHERE status_name = 'upcoming'))
        ON CONFLICT (service_request_id) DO NOTHING;
        RETURN NULL;
    END IF;

    v_appt := CASE v_new
                  WHEN 'en_curso'   THEN 'in_progress'
                  WHEN 'finalizado' THEN 'completed'
                  WHEN 'cancelado'  THEN 'cancelled'
              END;

    IF v_appt IS NOT NULL THEN
        UPDATE appointments
        SET status_id = (SELECT appointment_status_id FROM appointment_statuses WHERE status_name = v_appt)
        WHERE service_request_id = NEW.service_request_id;
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_service_request_after_write
    AFTER INSERT OR UPDATE ON service_requests
    FOR EACH ROW EXECUTE FUNCTION fn_service_request_after_write();

-- La cita solo existe desde CONFIRMADO (la crea el trigger anterior).
CREATE FUNCTION fn_check_appointment_request()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT status_name FROM fn_request_parties(NEW.service_request_id)) <> 'confirmado' THEN
        RAISE EXCEPTION 'La cita solo se crea cuando la contratación está CONFIRMADA (service_request_id = %)', NEW.service_request_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_appointment_request
    BEFORE INSERT ON appointments
    FOR EACH ROW EXECUTE FUNCTION fn_check_appointment_request();

-- RNF-007: la trazabilidad no se modifica ni se borra.
CREATE FUNCTION fn_audit_events_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'Los eventos de auditoría no se pueden modificar ni eliminar';
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_audit_events_immutable
    BEFORE UPDATE OR DELETE ON audit_events
    FOR EACH ROW EXECUTE FUNCTION fn_audit_events_immutable();


-- =====================================================================
-- 8. COHERENCIA DE LAS PARTES Y LÍMITES
-- =====================================================================

-- HU-47: solo en COMPLETADO, entre las dos partes de la contratación.
CREATE FUNCTION fn_check_rating()
RETURNS TRIGGER AS $$
DECLARE v RECORD;
BEGIN
    SELECT * INTO v FROM fn_request_parties(NEW.service_request_id);

    IF v.status_name <> 'completado' THEN
        RAISE EXCEPTION 'Solo se puede calificar una contratación COMPLETADA (service_request_id = %, estado = %)',
            NEW.service_request_id, v.status_name;
    END IF;

    IF NOT ((NEW.rated_by = v.client_id AND NEW.rated_user_id = v.provider_user_id)
         OR (NEW.rated_by = v.provider_user_id AND NEW.rated_user_id = v.client_id)) THEN
        RAISE EXCEPTION 'Solo se califica a la otra parte de la contratación (service_request_id = %)', NEW.service_request_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_rating
    BEFORE INSERT ON ratings
    FOR EACH ROW EXECUTE FUNCTION fn_check_rating();

-- HU-45: las confirmaciones de finalización son de las partes y en FINALIZADO.
CREATE FUNCTION fn_check_completion_confirmation()
RETURNS TRIGGER AS $$
DECLARE v RECORD;
BEGIN
    SELECT * INTO v FROM fn_request_parties(NEW.service_request_id);

    IF v.status_name <> 'finalizado' THEN
        RAISE EXCEPTION 'Solo se confirma la finalización de una contratación FINALIZADA (service_request_id = %, estado = %)',
            NEW.service_request_id, v.status_name;
    END IF;
    IF NEW.confirmed_by NOT IN (v.client_id, v.provider_user_id) THEN
        RAISE EXCEPTION 'Solo las partes de la contratación pueden confirmar su finalización (service_request_id = %)', NEW.service_request_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_completion_confirmation
    BEFORE INSERT ON completion_confirmations
    FOR EACH ROW EXECUTE FUNCTION fn_check_completion_confirmation();

-- HU-46: el reporte de problemas va desde FINALIZADO (el "cierre definitivo" sigue
-- pendiente, B-10, así que también se admite en COMPLETADO).
CREATE FUNCTION fn_check_issue_report()
RETURNS TRIGGER AS $$
DECLARE v RECORD;
BEGIN
    SELECT * INTO v FROM fn_request_parties(NEW.service_request_id);

    IF v.status_name NOT IN ('finalizado', 'completado') THEN
        RAISE EXCEPTION 'Solo se reporta un problema desde FINALIZADO (service_request_id = %, estado = %)',
            NEW.service_request_id, v.status_name;
    END IF;
    IF NEW.reported_by NOT IN (v.client_id, v.provider_user_id) THEN
        RAISE EXCEPTION 'Solo las partes de la contratación pueden reportar un problema (service_request_id = %)', NEW.service_request_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_issue_report
    BEFORE INSERT ON issue_reports
    FOR EACH ROW EXECUTE FUNCTION fn_check_issue_report();

-- HU-51: lo inicia una parte, contra la otra.
CREATE FUNCTION fn_check_claim_parties()
RETURNS TRIGGER AS $$
DECLARE v RECORD;
BEGIN
    SELECT * INTO v FROM fn_request_parties(NEW.service_request_id);

    IF NOT ((NEW.filed_by = v.client_id AND NEW.filed_against = v.provider_user_id)
         OR (NEW.filed_by = v.provider_user_id AND NEW.filed_against = v.client_id)) THEN
        RAISE EXCEPTION 'El reclamo debe ser de una parte de la contratación contra la otra (service_request_id = %)', NEW.service_request_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_claim_parties
    BEFORE INSERT ON claims
    FOR EACH ROW EXECUTE FUNCTION fn_check_claim_parties();

-- Límites de cantidad: TG_ARGV = (columna padre, máximo, descripción).
-- HU-11 (máx. 3 oficios), HU-18 (máx. 5 fotos), HU-23 (máx. 5 fotos), HU-51 (máx. 5 fotos).
-- Los mínimos (1 oficio, 1 foto) los valida el backend al crear el registro.
CREATE FUNCTION fn_check_max_children()
RETURNS TRIGGER AS $$
DECLARE
    v_parent BIGINT := (to_jsonb(NEW) ->> TG_ARGV[0])::BIGINT;
    v_count  INTEGER;
BEGIN
    EXECUTE format('SELECT count(*) FROM %I WHERE %I = $1', TG_TABLE_NAME, TG_ARGV[0])
    INTO v_count USING v_parent;

    IF v_count >= TG_ARGV[1]::INTEGER THEN
        RAISE EXCEPTION 'Máximo de % % alcanzado (% = %)', TG_ARGV[1], TG_ARGV[2], TG_ARGV[0], v_parent;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_max_provider_categories
    BEFORE INSERT ON provider_categories
    FOR EACH ROW EXECUTE FUNCTION fn_check_max_children('provider_profile_id', '3', 'oficios');

CREATE TRIGGER trg_max_service_listing_photos
    BEFORE INSERT ON service_listing_photos
    FOR EACH ROW EXECUTE FUNCTION fn_check_max_children('service_listing_id', '5', 'fotos');

CREATE TRIGGER trg_max_need_photos
    BEFORE INSERT ON need_photos
    FOR EACH ROW EXECUTE FUNCTION fn_check_max_children('need_id', '5', 'fotos');

CREATE TRIGGER trg_max_claim_photos
    BEFORE INSERT ON claim_photos
    FOR EACH ROW EXECUTE FUNCTION fn_check_max_children('claim_id', '5', 'fotos');

-- HU-21: retirar solo sin contrataciones activas; "retirado" es definitivo.
CREATE FUNCTION fn_check_listing_status()
RETURNS TRIGGER AS $$
DECLARE
    v_old VARCHAR(20);
    v_new VARCHAR(20);
BEGIN
    IF NEW.status_id = OLD.status_id THEN
        RETURN NEW;
    END IF;

    SELECT status_name INTO v_old FROM listing_statuses WHERE listing_status_id = OLD.status_id;
    SELECT status_name INTO v_new FROM listing_statuses WHERE listing_status_id = NEW.status_id;

    IF v_old = 'withdrawn' THEN
        RAISE EXCEPTION 'Una publicación retirada no cambia de estado (service_listing_id = %)', OLD.service_listing_id;
    END IF;

    IF v_new = 'withdrawn' AND EXISTS (
        SELECT 1 FROM service_requests sr
        JOIN request_statuses rs ON rs.request_status_id = sr.status_id
        WHERE sr.source_service_listing_id = NEW.service_listing_id
          AND rs.status_name NOT IN ('completado', 'cancelado', 'rechazado')
    ) THEN
        RAISE EXCEPTION 'No se puede retirar una publicación con contrataciones activas (service_listing_id = %)', NEW.service_listing_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_listing_status
    BEFORE UPDATE OF status_id ON service_listings
    FOR EACH ROW EXECUTE FUNCTION fn_check_listing_status();

-- HU-66: el perfil activo debe existir. Se revisa al final de la transacción, porque
-- al registrarse se crea primero el usuario y después su perfil.
CREATE FUNCTION fn_check_active_profile_exists()
RETURNS TRIGGER AS $$
DECLARE v_profile VARCHAR(20);
BEGIN
    SELECT profile_name INTO v_profile FROM active_profiles WHERE active_profile_id = NEW.active_profile_id;

    IF (v_profile = 'client'   AND NOT EXISTS (SELECT 1 FROM client_profiles   WHERE user_id = NEW.user_id))
    OR (v_profile = 'provider' AND NOT EXISTS (SELECT 1 FROM provider_profiles WHERE user_id = NEW.user_id)) THEN
        RAISE EXCEPTION 'El perfil activo (%) no existe para el usuario %', v_profile, NEW.user_id;
    END IF;
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE CONSTRAINT TRIGGER trg_check_active_profile_exists
    AFTER INSERT OR UPDATE OF active_profile_id ON users
    DEFERRABLE INITIALLY DEFERRED
    FOR EACH ROW EXECUTE FUNCTION fn_check_active_profile_exists();


-- =====================================================================
-- 9. AUTOCOMPLETADO (HU-45): si el cliente reportó un problema no hubo silencio,
-- así que no se completa sola (RF-068 distingue "reporta un problema" de "ninguno
-- responde"). Queda en FINALIZADO hasta que se resuelva.
-- =====================================================================

CREATE OR REPLACE FUNCTION fn_auto_complete_service_requests()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_request RECORD;
    v_completado_id SMALLINT;
    v_inserted INTEGER;
BEGIN
    SELECT request_status_id INTO v_completado_id
    FROM request_statuses WHERE status_name = 'completado';

    -- SKIP LOCKED: dos ejecuciones simultáneas del cron no se pisan.
    FOR v_request IN
        SELECT sr.service_request_id, sr.client_id
        FROM service_requests sr
        JOIN request_statuses rs ON rs.request_status_id = sr.status_id
        WHERE rs.status_name = 'finalizado'
          AND sr.completion_requested_at IS NOT NULL
          AND sr.completion_requested_at <= now() - INTERVAL '24 hours'
          AND NOT EXISTS (
              SELECT 1 FROM completion_confirmations cc
              WHERE cc.service_request_id = sr.service_request_id
                AND cc.confirmed_by = sr.client_id
          )
          AND NOT EXISTS (
              SELECT 1 FROM issue_reports ir
              WHERE ir.service_request_id = sr.service_request_id
                AND ir.reported_by = sr.client_id
          )
        FOR UPDATE OF sr SKIP LOCKED
    LOOP
        INSERT INTO completion_confirmations (service_request_id, confirmed_by, is_automatic)
        VALUES (v_request.service_request_id, v_request.client_id, TRUE)
        ON CONFLICT (service_request_id, confirmed_by) DO NOTHING;
        GET DIAGNOSTICS v_inserted = ROW_COUNT;

        IF v_inserted > 0 THEN
            UPDATE service_requests
            SET status_id = v_completado_id
            WHERE service_request_id = v_request.service_request_id;

            v_count := v_count + 1;
        END IF;
    END LOOP;

    RETURN v_count;
END;
$$ LANGUAGE plpgsql;
