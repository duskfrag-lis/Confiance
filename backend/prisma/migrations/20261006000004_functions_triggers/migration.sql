-- =====================================================================
-- Migración 4/5: FUNCIONES Y TRIGGERS
-- Cambio respecto a Confiance.sql: fn_auto_complete_service_requests()
-- (solo estado 'finalizado', FOR UPDATE SKIP LOCKED, ON CONFLICT DO NOTHING).
-- El resto es idéntico al original.
-- =====================================================================

-- =====================================================================
-- FUNCIONES Y TRIGGERS
-- =====================================================================
 
-- Mantiene updated_at al día en cada UPDATE, para no depender de que el
-- backend se acuerde de hacerlo.
CREATE FUNCTION fn_touch_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
CREATE TRIGGER trg_users_touch_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
 
CREATE TRIGGER trg_provider_profiles_touch_updated_at
    BEFORE UPDATE ON provider_profiles
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
 
CREATE TRIGGER trg_client_profiles_touch_updated_at
    BEFORE UPDATE ON client_profiles
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
 
CREATE TRIGGER trg_provider_bank_accounts_touch_updated_at
    BEFORE UPDATE ON provider_bank_accounts
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
 
CREATE TRIGGER trg_service_listings_touch_updated_at
    BEFORE UPDATE ON service_listings
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
 
CREATE TRIGGER trg_needs_touch_updated_at
    BEFORE UPDATE ON needs
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
 
CREATE TRIGGER trg_service_requests_touch_updated_at
    BEFORE UPDATE ON service_requests
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
 
CREATE TRIGGER trg_claims_touch_updated_at
    BEFORE UPDATE ON claims
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
 
CREATE TRIGGER trg_identity_verifications_touch_updated_at
    BEFORE UPDATE ON identity_verifications
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();
 
 
-- HU-45: a correr periódicamente desde el backend (@nestjs/schedule).
-- Completa automáticamente las contrataciones cuyo plazo de 24h venció
-- sin que el cliente confirmara, y devuelve cuántas filas afectó.
CREATE FUNCTION fn_auto_complete_service_requests()
RETURNS INTEGER AS $$
DECLARE
    v_count INTEGER := 0;
    v_request RECORD;
    v_completado_id SMALLINT;
    v_inserted INTEGER;
BEGIN
    SELECT request_status_id INTO v_completado_id
    FROM request_statuses WHERE status_name = 'completado';

    -- (corregido) solo toma solicitudes en estado 'finalizado' y las bloquea con
    -- SKIP LOCKED: así dos ejecuciones simultáneas del cron no se pisan.
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
        FOR UPDATE OF sr SKIP LOCKED
    LOOP
        -- (corregido) ON CONFLICT: si la confirmación ya existe no se aborta todo el lote.
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


-- HU-50: bloquea un 3er reagendamiento y lleva el contador en
-- service_requests.reschedule_count.
CREATE FUNCTION fn_check_reschedule_limit()
RETURNS TRIGGER AS $$
DECLARE
    v_service_request_id BIGINT;
    v_current_count SMALLINT;
BEGIN
    SELECT a.service_request_id INTO v_service_request_id
    FROM appointments a
    WHERE a.appointment_id = NEW.appointment_id;
 
    SELECT reschedule_count INTO v_current_count
    FROM service_requests
    WHERE service_request_id = v_service_request_id;
 
    IF v_current_count >= 2 THEN
        RAISE EXCEPTION 'Máximo de 2 reagendamientos alcanzado (service_request_id = %)', v_service_request_id;
    END IF;
 
    UPDATE service_requests
    SET reschedule_count = reschedule_count + 1
    WHERE service_request_id = v_service_request_id;
 
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
 
CREATE TRIGGER trg_check_reschedule_limit
    BEFORE INSERT ON appointment_reschedule_requests
    FOR EACH ROW EXECUTE FUNCTION fn_check_reschedule_limit();
 
 
-- HU-48: ordinaria hasta 24h antes; nunca si ya está EN_CURSO.
CREATE OR REPLACE FUNCTION fn_prevent_late_cancellation()
RETURNS TRIGGER AS $$
DECLARE
    v_scheduled_datetime TIMESTAMPTZ;
    v_status_name VARCHAR(30);
BEGIN
    IF NEW.is_force_majeure THEN
        RETURN NEW;
    END IF;

    SELECT a.scheduled_datetime, rs.status_name
    INTO v_scheduled_datetime, v_status_name
    FROM service_requests sr
    JOIN request_statuses rs ON rs.request_status_id = sr.status_id
    LEFT JOIN appointments a ON a.service_request_id = sr.service_request_id
    WHERE sr.service_request_id = NEW.service_request_id;

    IF v_status_name = 'en_curso' THEN
        RAISE EXCEPTION 'No se puede cancelar una contratación EN_CURSO (service_request_id = %)', NEW.service_request_id;
    END IF;

    IF v_scheduled_datetime IS NOT NULL
       AND v_scheduled_datetime - now() < INTERVAL '24 hours' THEN
        RAISE EXCEPTION 'La cancelación ordinaria solo se permite hasta 24h antes de la cita (service_request_id = %)', NEW.service_request_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_prevent_late_cancellation
    BEFORE INSERT ON cancellations
    FOR EACH ROW EXECUTE FUNCTION fn_prevent_late_cancellation();

CREATE TRIGGER trg_payments_touch_updated_at
    BEFORE UPDATE ON payments
    FOR EACH ROW EXECUTE FUNCTION fn_touch_updated_at();