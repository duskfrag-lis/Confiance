-- =====================================================================
-- Migración 8: HISTORIAS DE USUARIO V7 (pagos, plazos automáticos y decisiones D-47 a D-55)
--
--   0. Catálogos: pago por PSE, estados del pago de la V7, evidencias publicadas,
--      motivo de reclamo por pago y notificaciones nuevas (HU-62).
--   1. Solicitud (D-49): valor acordado y dirección exacta obligatorios.
--   2. Pagos (HU-43, HU-44, HU-45): solo en FINALIZADO, por el valor acordado,
--      un intento abierto a la vez, un solo pago PAGADO y trazabilidad.
--   3. COMPLETADO exige confirmación del cliente y pago PAGADO, en cualquier orden
--      (HU-47). El autocompletado de 24 h ya no completa sin pago.
--   4. Cancelación: automática por plazo vencido (HU-52) y fuerza mayor solo hasta
--      EN_CURSO (D-48). FINALIZADO ya no se cancela.
--   5. Reglas de las decisiones D-52 a D-55 y de HU-19, HU-29 y HU-55.
--
-- El actor sigue llegando con  SELECT set_config('app.user_id', '<user_id>', true);
-- Sin actor (procesos programados) el evento queda como acción del sistema.
-- =====================================================================


-- =====================================================================
-- 0. CATÁLOGOS
-- =====================================================================

-- HU-43: PSE por Wompi (modo de pruebas). HU-44: transferencia directa.
INSERT INTO payment_methods (method_name) VALUES ('pse');

-- Estados de cada intento de pago. El estado del pago de la contratación se deriva
-- (v_service_request_payment): PAGADO, PENDIENTE DE CONFIRMACIÓN o PENDIENTE.
-- 'refunded' sale porque no hay reembolsos (D-37).
UPDATE payment_statuses SET status_name = 'paid' WHERE status_name = 'approved';
DELETE FROM payment_statuses WHERE status_name = 'refunded';
INSERT INTO payment_statuses (status_name) VALUES ('pending_confirmation');

-- HU-19 (D-42): las evidencias se publican al cargarlas y el prestador puede retirarlas.
-- Los estados de aprobación se conservan para la HU-71 (diferida).
INSERT INTO evidence_statuses (status_name) VALUES ('published'), ('withdrawn');

UPDATE work_evidence
SET status_id = (SELECT evidence_status_id FROM evidence_statuses WHERE status_name = 'published')
WHERE status_id IN (SELECT evidence_status_id FROM evidence_statuses
                    WHERE status_name IN ('pending_approval', 'approved'));

-- HU-54: motivo de reclamo por pago.
INSERT INTO claim_reasons (reason_name) VALUES ('Transferencia no confirmada');

-- HU-62: eventos que no tenían tipo de notificación.
INSERT INTO notification_types (type_name) VALUES
    ('interest_not_selected'),
    ('request_cancelled'),
    ('request_auto_cancelled'),
    ('completion_requested'),
    ('reschedule_requested'),
    ('reschedule_answered'),
    ('payment_pending'),
    ('transfer_marked'),
    ('transfer_confirmed'),
    ('transfer_not_received'),
    ('claim_updated'),
    ('force_majeure_result');


-- =====================================================================
-- 1. SOLICITUD (D-49): valor y dirección obligatorios desde la creación
-- =====================================================================

-- Datos previos de desarrollo: se completan antes de exigirlos.
-- Valor: precio propuesto en el interés, si no el mínimo (o el máximo) de la publicación,
-- si no el presupuesto máximo de la necesidad.
UPDATE service_requests sr
SET agreed_price = COALESCE(
        (SELECT ni.proposed_price FROM need_interests ni
         WHERE ni.need_id = sr.source_need_id AND ni.provider_profile_id = sr.provider_profile_id
           AND ni.proposed_price > 0),
        (SELECT COALESCE(NULLIF(sl.min_price, 0), NULLIF(sl.max_price, 0)) FROM service_listings sl
         WHERE sl.service_listing_id = sr.source_service_listing_id),
        (SELECT NULLIF(n.budget_max, 0) FROM needs n WHERE n.need_id = sr.source_need_id),
        1)
WHERE sr.agreed_price IS NULL OR sr.agreed_price = 0;

UPDATE service_requests sr
SET exact_address = COALESCE(
        (SELECT n.exact_address FROM needs n WHERE n.need_id = sr.source_need_id),
        (SELECT cp.reference_address FROM client_profiles cp WHERE cp.user_id = sr.client_id),
        'Sin dirección registrada')
WHERE sr.exact_address IS NULL;

ALTER TABLE service_requests
    ALTER COLUMN agreed_price  SET NOT NULL,
    ALTER COLUMN exact_address SET NOT NULL,
    ADD CONSTRAINT chk_service_requests_agreed_price_positive CHECK (agreed_price > 0);


-- =====================================================================
-- 2. PAGOS (HU-43, HU-44, HU-45)
-- Una fila por intento. PSE nace en 'pending' y Wompi la pasa a 'paid' o 'rejected'.
-- Transferencia nace en 'pending_confirmation' (el cliente marcó "pagué") y el
-- prestador la pasa a 'paid' (recibida) o 'rejected' (no recibida).
-- =====================================================================

ALTER TABLE payments
    ADD COLUMN gateway_transaction_id VARCHAR(100) UNIQUE;

COMMENT ON COLUMN payments.gateway_reference IS
    'Referencia única del intento que la plataforma envía a Wompi (solo PSE).';
COMMENT ON COLUMN payments.gateway_transaction_id IS
    'Id de la transacción que devuelve Wompi. Un evento repetido no crea otro pago.';

CREATE FUNCTION fn_payment_status_name(p_status SMALLINT)
RETURNS VARCHAR AS $$
    SELECT status_name FROM payment_statuses WHERE payment_status_id = p_status;
$$ LANGUAGE sql STABLE;

-- TRUE si la contratación tiene un pago PAGADO.
CREATE FUNCTION fn_request_is_paid(p_request BIGINT)
RETURNS BOOLEAN AS $$
    SELECT EXISTS (
        SELECT 1 FROM payments p
        JOIN payment_statuses ps ON ps.payment_status_id = p.status_id
        WHERE p.service_request_id = p_request AND ps.status_name = 'paid'
    );
$$ LANGUAGE sql STABLE;

CREATE FUNCTION fn_payment_before_write()
RETURNS TRIGGER AS $$
DECLARE
    v_request_status VARCHAR(30);
    v_agreed         NUMERIC(12,2);
    v_provider       BIGINT;
    v_method         VARCHAR(30);
    v_old            VARCHAR(30);
    v_new            VARCHAR(30);
BEGIN
    v_new := fn_payment_status_name(NEW.status_id);
    SELECT method_name INTO v_method FROM payment_methods WHERE payment_method_id = NEW.payment_method_id;

    -- FOR UPDATE: dos intentos simultáneos sobre la misma contratación se serializan.
    SELECT rs.status_name, sr.agreed_price, sr.provider_profile_id
    INTO v_request_status, v_agreed, v_provider
    FROM service_requests sr
    JOIN request_statuses rs ON rs.request_status_id = sr.status_id
    WHERE sr.service_request_id = NEW.service_request_id
    FOR UPDATE OF sr;

    IF TG_OP = 'INSERT' THEN
        IF v_request_status IS DISTINCT FROM 'finalizado' THEN
            RAISE EXCEPTION 'Solo se paga una contratación FINALIZADA (service_request_id = %, estado = %)',
                NEW.service_request_id, v_request_status;
        END IF;

        IF NEW.amount <> v_agreed THEN
            RAISE EXCEPTION 'El monto del pago (%) debe ser el valor acordado (%) (service_request_id = %)',
                NEW.amount, v_agreed, NEW.service_request_id;
        END IF;

        IF v_method = 'pse' AND v_new <> 'pending' THEN
            RAISE EXCEPTION 'Un pago por PSE se crea en estado pending (se recibió %)', v_new;
        END IF;

        IF v_method = 'bank_transfer' THEN
            IF v_new <> 'pending_confirmation' THEN
                RAISE EXCEPTION 'Una transferencia se crea en estado pending_confirmation (se recibió %)', v_new;
            END IF;
            -- HU-18: sin información bancaria solo se puede pagar por PSE.
            IF NOT EXISTS (SELECT 1 FROM provider_bank_accounts WHERE provider_profile_id = v_provider) THEN
                RAISE EXCEPTION 'El prestador no tiene información bancaria; solo se puede pagar por PSE (service_request_id = %)',
                    NEW.service_request_id;
            END IF;
        END IF;

        IF fn_request_is_paid(NEW.service_request_id) THEN
            RAISE EXCEPTION 'La contratación ya está pagada (service_request_id = %)', NEW.service_request_id;
        END IF;

        IF EXISTS (
            SELECT 1 FROM payments p
            JOIN payment_statuses ps ON ps.payment_status_id = p.status_id
            WHERE p.service_request_id = NEW.service_request_id
              AND ps.status_name IN ('pending', 'pending_confirmation')
        ) THEN
            RAISE EXCEPTION 'Ya hay un pago en curso para esta contratación (service_request_id = %)', NEW.service_request_id;
        END IF;

        NEW.paid_at := NULL;
        RETURN NEW;
    END IF;

    -- UPDATE
    IF (NEW.service_request_id, NEW.payment_method_id, NEW.amount, NEW.gateway_reference)
       IS DISTINCT FROM (OLD.service_request_id, OLD.payment_method_id, OLD.amount, OLD.gateway_reference) THEN
        RAISE EXCEPTION 'No se puede cambiar la contratación, el método, el monto ni la referencia de un pago (payment_id = %)',
            OLD.payment_id;
    END IF;

    IF OLD.gateway_transaction_id IS NOT NULL
       AND NEW.gateway_transaction_id IS DISTINCT FROM OLD.gateway_transaction_id THEN
        RAISE EXCEPTION 'La transacción de la pasarela ya quedó registrada (payment_id = %)', OLD.payment_id;
    END IF;

    -- Un evento repetido de la pasarela no cambia nada.
    IF NEW.status_id = OLD.status_id THEN
        RETURN NEW;
    END IF;

    v_old := fn_payment_status_name(OLD.status_id);

    IF NOT (v_old IN ('pending', 'pending_confirmation') AND v_new IN ('paid', 'rejected')) THEN
        RAISE EXCEPTION 'Cambio de estado de pago no permitido: % → % (payment_id = %)', v_old, v_new, OLD.payment_id;
    END IF;

    IF v_new = 'paid' THEN
        IF v_request_status IS DISTINCT FROM 'finalizado' THEN
            RAISE EXCEPTION 'Solo se paga una contratación FINALIZADA (service_request_id = %, estado = %)',
                NEW.service_request_id, v_request_status;
        END IF;
        IF fn_request_is_paid(NEW.service_request_id) THEN
            RAISE EXCEPTION 'La contratación ya está pagada (service_request_id = %)', NEW.service_request_id;
        END IF;
        NEW.paid_at := now();
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_before_write
    BEFORE INSERT OR UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION fn_payment_before_write();


-- =====================================================================
-- 3. COMPLETADO = confirmación del cliente + pago PAGADO (HU-47)
-- =====================================================================

-- Pasa a COMPLETADO si ya se cumplen las dos condiciones. Devuelve TRUE si la completó.
CREATE FUNCTION fn_try_complete_service_request(p_request BIGINT)
RETURNS BOOLEAN AS $$
DECLARE
    v_status VARCHAR(30);
    v_client BIGINT;
BEGIN
    SELECT rs.status_name, sr.client_id INTO v_status, v_client
    FROM service_requests sr
    JOIN request_statuses rs ON rs.request_status_id = sr.status_id
    WHERE sr.service_request_id = p_request;

    IF v_status IS DISTINCT FROM 'finalizado'
       OR NOT fn_request_is_paid(p_request)
       OR NOT EXISTS (SELECT 1 FROM completion_confirmations
                      WHERE service_request_id = p_request AND confirmed_by = v_client) THEN
        RETURN FALSE;
    END IF;

    UPDATE service_requests
    SET status_id = (SELECT request_status_id FROM request_statuses WHERE status_name = 'completado')
    WHERE service_request_id = p_request;

    RETURN TRUE;
END;
$$ LANGUAGE plpgsql;

-- Trazabilidad de pagos (HU-61) y cierre de la contratación al quedar PAGADO.
CREATE FUNCTION fn_payment_after_write()
RETURNS TRIGGER AS $$
DECLARE
    v_actor BIGINT := NULLIF(current_setting('app.user_id', true), '')::BIGINT;
    v_new   VARCHAR(30) := fn_payment_status_name(NEW.status_id);
BEGIN
    IF TG_OP = 'INSERT' THEN
        INSERT INTO audit_events (actor_id, event_type, entity_type, entity_id, new_state)
        VALUES (v_actor, 'payment_created', 'payment', NEW.payment_id, v_new);
        RETURN NULL;
    END IF;

    IF NEW.status_id = OLD.status_id THEN
        RETURN NULL;
    END IF;

    INSERT INTO audit_events (actor_id, event_type, entity_type, entity_id, previous_state, new_state)
    VALUES (v_actor, 'payment_status_changed', 'payment', NEW.payment_id,
            fn_payment_status_name(OLD.status_id), v_new);

    IF v_new = 'paid' THEN
        PERFORM fn_try_complete_service_request(NEW.service_request_id);
    END IF;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_payment_after_write
    AFTER INSERT OR UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION fn_payment_after_write();

CREATE FUNCTION fn_completion_confirmation_after_insert()
RETURNS TRIGGER AS $$
BEGIN
    PERFORM fn_try_complete_service_request(NEW.service_request_id);
    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_completion_confirmation_after_insert
    AFTER INSERT ON completion_confirmations
    FOR EACH ROW EXECUTE FUNCTION fn_completion_confirmation_after_insert();

-- HU-45: estado del pago de cada contratación desde FINALIZADO.
CREATE VIEW v_service_request_payment AS
SELECT
    sr.service_request_id,
    sr.client_id,
    sr.provider_profile_id,
    sr.agreed_price AS amount,
    CASE
        WHEN paid.payment_id IS NOT NULL THEN 'paid'
        WHEN open_tr.payment_id IS NOT NULL THEN 'pending_confirmation'
        ELSE 'pending'
    END AS payment_status,
    COALESCE(paid.method_name, open_tr.method_name) AS payment_method,
    paid.paid_at
FROM service_requests sr
JOIN request_statuses rs ON rs.request_status_id = sr.status_id
LEFT JOIN LATERAL (
    SELECT p.payment_id, pm.method_name, p.paid_at
    FROM payments p
    JOIN payment_statuses ps ON ps.payment_status_id = p.status_id
    JOIN payment_methods pm ON pm.payment_method_id = p.payment_method_id
    WHERE p.service_request_id = sr.service_request_id AND ps.status_name = 'paid'
    LIMIT 1
) paid ON true
LEFT JOIN LATERAL (
    SELECT p.payment_id, pm.method_name
    FROM payments p
    JOIN payment_statuses ps ON ps.payment_status_id = p.status_id
    JOIN payment_methods pm ON pm.payment_method_id = p.payment_method_id
    WHERE p.service_request_id = sr.service_request_id AND ps.status_name = 'pending_confirmation'
    LIMIT 1
) open_tr ON true
WHERE rs.status_name IN ('finalizado', 'completado');

-- El autocompletado ahora solo registra la confirmación automática del cliente; la
-- contratación pasa a COMPLETADO únicamente si ya está pagada. Cambia el tipo de
-- retorno para que el backend sepa a quién notificar.
DROP FUNCTION fn_auto_complete_service_requests();

CREATE FUNCTION fn_auto_complete_service_requests()
RETURNS TABLE (confirmed_request_id BIGINT, completed BOOLEAN) AS $$
DECLARE
    v_request  RECORD;
    v_inserted INTEGER;
BEGIN
    -- SKIP LOCKED: dos ejecuciones simultáneas del proceso no se pisan.
    FOR v_request IN
        SELECT sr.service_request_id AS id, sr.client_id
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
        VALUES (v_request.id, v_request.client_id, TRUE)
        ON CONFLICT (service_request_id, confirmed_by) DO NOTHING;
        GET DIAGNOSTICS v_inserted = ROW_COUNT;

        IF v_inserted > 0 THEN
            confirmed_request_id := v_request.id;
            completed := EXISTS (
                SELECT 1 FROM service_requests sr
                JOIN request_statuses rs ON rs.request_status_id = sr.status_id
                WHERE sr.service_request_id = v_request.id AND rs.status_name = 'completado'
            );
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;


-- =====================================================================
-- 4. CANCELACIÓN
-- =====================================================================

-- HU-52: la cancelación automática no tiene actor de usuario (la hace el sistema).
ALTER TABLE cancellations
    ADD COLUMN is_automatic BOOLEAN NOT NULL DEFAULT FALSE,
    ALTER COLUMN cancelled_by DROP NOT NULL,
    ADD CONSTRAINT chk_cancellation_actor CHECK (
        (is_automatic AND cancelled_by IS NULL AND NOT is_force_majeure)
        OR (NOT is_automatic AND cancelled_by IS NOT NULL)
    );

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

    -- HU-52: el sistema cancela por plazo vencido solo en SOLICITADO o ACEPTADO,
    -- sin la regla de las 24 h.
    IF NEW.is_automatic THEN
        IF v_status_name IS NULL OR v_status_name NOT IN ('solicitado', 'aceptado') THEN
            RAISE EXCEPTION 'La cancelación automática solo aplica en SOLICITADO o ACEPTADO (service_request_id = %, estado = %)',
                NEW.service_request_id, v_status_name;
        END IF;
        RETURN NEW;
    END IF;

    IF NEW.cancelled_by NOT IN (v_client, v_provider_user) THEN
        RAISE EXCEPTION 'Solo el cliente o el prestador de la contratación pueden cancelarla (service_request_id = %)', NEW.service_request_id;
    END IF;

    -- HU-51 (D-48): fuerza mayor sin la regla de las 24 h ni la de EN_CURSO, pero no
    -- desde FINALIZADO, porque el servicio ya se prestó y falta el pago.
    IF NEW.is_force_majeure THEN
        IF v_status_name IS NULL OR v_status_name NOT IN ('solicitado', 'aceptado', 'confirmado', 'en_curso') THEN
            RAISE EXCEPTION 'Solo se puede cancelar por fuerza mayor hasta el estado EN_CURSO (service_request_id = %, estado = %)',
                NEW.service_request_id, v_status_name;
        END IF;
        RETURN NEW;
    END IF;

    -- HU-50: la ordinaria solo en SOLICITADO, ACEPTADO o CONFIRMADO.
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

-- Ciclo de la contratación. Cambios respecto a la migración 6:
--   * FINALIZADO solo avanza a COMPLETADO (D-48: ya no se cancela).
--   * COMPLETADO exige además el pago PAGADO (HU-47).
CREATE OR REPLACE FUNCTION fn_service_request_before_write()
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
        -- HU-34: toda solicitud nace en SOLICITADO.
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

            -- HU-39: el cliente elige dentro de la disponibilidad del prestador.
            PERFORM fn_check_provider_availability(NEW.provider_profile_id, NEW.proposed_datetime);
        ELSE
            -- HU-30: desde una necesidad, solo con el prestador seleccionado por su cliente.
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
        OR (v_old = 'finalizado' AND v_new = 'completado')
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
            NEW.completion_requested_at := now();  -- HU-47: inicio del plazo de 24 h
        WHEN 'completado' THEN
            IF NOT EXISTS (
                SELECT 1 FROM completion_confirmations
                WHERE service_request_id = NEW.service_request_id AND confirmed_by = NEW.client_id
            ) THEN
                RAISE EXCEPTION 'Para completar se necesita la confirmación del cliente, manual o automática (service_request_id = %)', NEW.service_request_id;
            END IF;
            IF NOT fn_request_is_paid(NEW.service_request_id) THEN
                RAISE EXCEPTION 'Para completar se necesita el pago registrado (service_request_id = %)', NEW.service_request_id;
            END IF;
        ELSE
            NULL;
    END CASE;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- HU-52: cancela lo que no avanzó a tiempo y devuelve qué canceló, para notificar.
--   SOLICITADO: 48 h desde la creación sin respuesta del prestador.
--   ACEPTADO:   24 h desde la aceptación sin confirmación del cliente.
-- La aceptación se toma de la trazabilidad (actor y momento del cambio a ACEPTADO).
CREATE FUNCTION fn_auto_cancel_stale_requests()
RETURNS TABLE (cancelled_request_id BIGINT, previous_state VARCHAR) AS $$
DECLARE
    v_request  RECORD;
    v_inserted INTEGER;
BEGIN
    FOR v_request IN
        SELECT sr.service_request_id AS id, rs.status_name AS state
        FROM service_requests sr
        JOIN request_statuses rs ON rs.request_status_id = sr.status_id
        WHERE (rs.status_name = 'solicitado' AND sr.created_at <= now() - INTERVAL '48 hours')
           -- min(): una contratación solo se acepta una vez.
           OR (rs.status_name = 'aceptado' AND COALESCE(
                   (SELECT min(ae.occurred_at) FROM audit_events ae
                    WHERE ae.entity_type = 'service_request'
                      AND ae.entity_id = sr.service_request_id
                      AND ae.new_state = 'aceptado'),
                   sr.updated_at) <= now() - INTERVAL '24 hours')
        FOR UPDATE OF sr SKIP LOCKED
    LOOP
        INSERT INTO cancellations (service_request_id, cancelled_by, reason, is_automatic)
        VALUES (v_request.id, NULL,
                CASE v_request.state
                    WHEN 'solicitado' THEN 'Plazo vencido: el prestador no respondió en 48 horas.'
                    ELSE 'Plazo vencido: el cliente no confirmó en 24 horas.'
                END,
                TRUE)
        ON CONFLICT (service_request_id) DO NOTHING;
        GET DIAGNOSTICS v_inserted = ROW_COUNT;

        IF v_inserted > 0 THEN
            cancelled_request_id := v_request.id;
            previous_state := v_request.state;
            RETURN NEXT;
        END IF;
    END LOOP;
END;
$$ LANGUAGE plpgsql;

-- Índice para el barrido de SOLICITADO por antigüedad.
CREATE INDEX idx_service_requests_created ON service_requests(created_at);


-- =====================================================================
-- 5. OTRAS REGLAS DE LA V7
-- =====================================================================

-- D-52: no se deshabilita una cuenta con contrataciones abiertas (SOLICITADO a FINALIZADO).
CREATE FUNCTION fn_check_user_disable()
RETURNS TRIGGER AS $$
BEGIN
    IF (SELECT status_name FROM account_statuses WHERE status_id = NEW.status_id) = 'disabled'
       AND (SELECT status_name FROM account_statuses WHERE status_id = OLD.status_id) <> 'disabled'
       AND EXISTS (
           SELECT 1 FROM service_requests sr
           JOIN request_statuses rs ON rs.request_status_id = sr.status_id
           LEFT JOIN provider_profiles pp ON pp.provider_profile_id = sr.provider_profile_id
           WHERE (sr.client_id = NEW.user_id OR pp.user_id = NEW.user_id)
             AND rs.status_name IN ('solicitado', 'aceptado', 'confirmado', 'en_curso', 'finalizado')
       ) THEN
        RAISE EXCEPTION 'No se puede deshabilitar una cuenta con contrataciones en curso (user_id = %)', NEW.user_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_user_disable
    BEFORE UPDATE OF status_id ON users
    FOR EACH ROW EXECUTE FUNCTION fn_check_user_disable();

-- D-53: el chat es de las partes y queda de solo lectura en los estados finales.
CREATE FUNCTION fn_check_chat_message()
RETURNS TRIGGER AS $$
DECLARE v RECORD;
BEGIN
    SELECT * INTO v FROM fn_request_parties(NEW.service_request_id);

    IF NEW.sender_id NOT IN (v.client_id, v.provider_user_id) THEN
        RAISE EXCEPTION 'Solo las partes de la contratación pueden escribir en su chat (service_request_id = %)', NEW.service_request_id;
    END IF;
    IF v.status_name IN ('rechazado', 'cancelado', 'completado') THEN
        RAISE EXCEPTION 'El chat de una contratación % es de solo lectura (service_request_id = %)', upper(v.status_name), NEW.service_request_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_chat_message
    BEFORE INSERT ON chat_messages
    FOR EACH ROW EXECUTE FUNCTION fn_check_chat_message();

-- D-55: oficios del prestador, de las publicaciones y de las necesidades son del
-- segundo nivel del catálogo y deben estar activos. Solo se valida al elegirlos o
-- cambiarlos, así desactivar una categoría no bloquea editar otros campos.
CREATE FUNCTION fn_check_trade_category()
RETURNS TRIGGER AS $$
BEGIN
    IF TG_OP = 'UPDATE' AND NEW.category_id IS NOT DISTINCT FROM OLD.category_id THEN
        RETURN NEW;
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM categories
        WHERE category_id = NEW.category_id AND parent_category_id IS NOT NULL AND is_active
    ) THEN
        RAISE EXCEPTION 'La categoría % no es un oficio activo del catálogo (segundo nivel)', NEW.category_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_trade_provider_categories
    BEFORE INSERT ON provider_categories
    FOR EACH ROW EXECUTE FUNCTION fn_check_trade_category();

CREATE TRIGGER trg_check_trade_service_listings
    BEFORE INSERT OR UPDATE OF category_id ON service_listings
    FOR EACH ROW EXECUTE FUNCTION fn_check_trade_category();

CREATE TRIGGER trg_check_trade_needs
    BEFORE INSERT OR UPDATE OF category_id ON needs
    FOR EACH ROW EXECUTE FUNCTION fn_check_trade_category();

-- D-54: hasta 5 fotos por evidencia y por verificación (las demás ya tenían límite).
CREATE TRIGGER trg_max_work_evidence_photos
    BEFORE INSERT ON work_evidence_photos
    FOR EACH ROW EXECUTE FUNCTION fn_check_max_children('work_evidence_id', '5', 'fotos');

CREATE TRIGGER trg_max_identity_verification_photos
    BEFORE INSERT ON identity_verification_photos
    FOR EACH ROW EXECUTE FUNCTION fn_check_max_children('identity_verification_id', '5', 'fotos');

-- HU-19: una evidencia retirada no vuelve a publicarse.
CREATE FUNCTION fn_check_evidence_status()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.status_id <> OLD.status_id
       AND (SELECT status_name FROM evidence_statuses WHERE evidence_status_id = OLD.status_id) = 'withdrawn' THEN
        RAISE EXCEPTION 'Una evidencia retirada no cambia de estado (work_evidence_id = %)', OLD.work_evidence_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_evidence_status
    BEFORE UPDATE OF status_id ON work_evidence
    FOR EACH ROW EXECUTE FUNCTION fn_check_evidence_status();

-- HU-29: solo se muestra interés en una necesidad abierta, y no en una propia.
CREATE FUNCTION fn_check_need_interest()
RETURNS TRIGGER AS $$
DECLARE
    v_status VARCHAR(30);
    v_client BIGINT;
BEGIN
    SELECT ns.status_name, n.client_id INTO v_status, v_client
    FROM needs n JOIN need_statuses ns ON ns.need_status_id = n.status_id
    WHERE n.need_id = NEW.need_id;

    IF v_status IS DISTINCT FROM 'open' THEN
        RAISE EXCEPTION 'Solo se muestra interés en una necesidad abierta (need_id = %, estado = %)', NEW.need_id, v_status;
    END IF;
    IF (SELECT user_id FROM provider_profiles WHERE provider_profile_id = NEW.provider_profile_id) = v_client THEN
        RAISE EXCEPTION 'Un usuario no puede mostrar interés en su propia necesidad (need_id = %)', NEW.need_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_need_interest
    BEFORE INSERT ON need_interests
    FOR EACH ROW EXECUTE FUNCTION fn_check_need_interest();

-- HU-55: una sola solicitud de verificación pendiente por prestador.
CREATE FUNCTION fn_check_identity_verification()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM identity_verifications iv
        JOIN verification_statuses vs ON vs.verification_status_id = iv.status_id
        WHERE iv.provider_profile_id = NEW.provider_profile_id AND vs.status_name = 'pending'
    ) THEN
        RAISE EXCEPTION 'Ya hay una solicitud de verificación pendiente (provider_profile_id = %)', NEW.provider_profile_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_check_identity_verification
    BEFORE INSERT ON identity_verifications
    FOR EACH ROW EXECUTE FUNCTION fn_check_identity_verification();
