-- =====================================================================
-- Migración 7: REGLAS DE FECHAS (revisión QA de la PR #5)
--
--   a) Una solicitud no se crea ni se acepta/confirma con fecha pasada.
--   b) La fecha de una contratación solo cambia libremente en SOLICITADO (futura y
--      dentro de la disponibilidad). Desde ACEPTADO solo cambia con un reagendamiento
--      aceptado; la fecha de la cita, igual.
--   c) Un reagendamiento no se crea ni se acepta hacia una fecha pasada, y su fecha
--      nueva no se edita después de creado.
--
-- Datos de prueba: el seed puede crear contrataciones históricas activando
--   SELECT set_config('app.allow_past_dates', 'on', true);
-- dentro de su transacción. La aplicación nunca debe activarlo.
-- =====================================================================


CREATE FUNCTION fn_check_future_datetime(p_ts TIMESTAMPTZ, p_what TEXT)
RETURNS VOID AS $$
BEGIN
    IF current_setting('app.allow_past_dates', true) = 'on' THEN
        RETURN;
    END IF;

    IF p_ts <= now() THEN
        RAISE EXCEPTION 'La fecha % debe ser futura (%)', p_what, p_ts;
    END IF;
END;
$$ LANGUAGE plpgsql;


-- =====================================================================
-- a) y b) FECHA DE LA CONTRATACIÓN
-- =====================================================================

CREATE FUNCTION fn_service_request_dates()
RETURNS TRIGGER AS $$
DECLARE
    v_old VARCHAR(30);
    v_new VARCHAR(30);
BEGIN
    SELECT status_name INTO v_new FROM request_statuses WHERE request_status_id = NEW.status_id;

    IF TG_OP = 'INSERT' THEN
        PERFORM fn_check_future_datetime(NEW.proposed_datetime, 'propuesta');
        RETURN NEW;
    END IF;

    SELECT status_name INTO v_old FROM request_statuses WHERE request_status_id = OLD.status_id;

    IF NEW.proposed_datetime IS DISTINCT FROM OLD.proposed_datetime THEN
        -- Profundidad > 1: el cambio viene de fn_apply_reschedule_response (reagendamiento aceptado).
        IF pg_trigger_depth() > 1 THEN
            NULL;
        ELSIF v_old = 'solicitado' THEN
            PERFORM fn_check_future_datetime(NEW.proposed_datetime, 'propuesta');
            IF NEW.source_service_listing_id IS NOT NULL THEN
                PERFORM fn_check_provider_availability(NEW.provider_profile_id, NEW.proposed_datetime);
            END IF;
        ELSE
            RAISE EXCEPTION 'Desde ACEPTADO la fecha solo cambia con un reagendamiento aceptado (service_request_id = %)',
                OLD.service_request_id;
        END IF;
    END IF;

    -- Aceptar o confirmar una contratación cuya fecha ya pasó no tiene sentido.
    IF NEW.status_id IS DISTINCT FROM OLD.status_id AND v_new IN ('aceptado', 'confirmado') THEN
        PERFORM fn_check_future_datetime(NEW.proposed_datetime, 'propuesta');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_service_request_dates
    BEFORE INSERT OR UPDATE ON service_requests
    FOR EACH ROW EXECUTE FUNCTION fn_service_request_dates();


-- La fecha de la cita solo la mueve un reagendamiento aceptado.
CREATE FUNCTION fn_appointment_dates()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.scheduled_datetime IS DISTINCT FROM OLD.scheduled_datetime AND pg_trigger_depth() = 1 THEN
        RAISE EXCEPTION 'La fecha de la cita solo cambia con un reagendamiento aceptado (appointment_id = %)',
            OLD.appointment_id;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_appointment_dates
    BEFORE UPDATE OF scheduled_datetime ON appointments
    FOR EACH ROW EXECUTE FUNCTION fn_appointment_dates();


-- =====================================================================
-- c) FECHA DEL REAGENDAMIENTO
-- =====================================================================

CREATE FUNCTION fn_reschedule_dates()
RETURNS TRIGGER AS $$
DECLARE
    v_new_status VARCHAR(20);
BEGIN
    IF TG_OP = 'INSERT' THEN
        PERFORM fn_check_future_datetime(NEW.new_datetime, 'del reagendamiento');
        RETURN NEW;
    END IF;

    IF (NEW.new_datetime, NEW.previous_datetime) IS DISTINCT FROM (OLD.new_datetime, OLD.previous_datetime) THEN
        RAISE EXCEPTION 'Las fechas de una solicitud de reagendamiento no se editan; crea una nueva (reschedule_request_id = %)',
            OLD.reschedule_request_id;
    END IF;

    -- Una solicitud pudo quedar pendiente hasta después de la fecha que pedía.
    SELECT status_name INTO v_new_status FROM reschedule_statuses WHERE reschedule_status_id = NEW.status_id;
    IF NEW.status_id IS DISTINCT FROM OLD.status_id AND v_new_status = 'accepted' THEN
        PERFORM fn_check_future_datetime(NEW.new_datetime, 'del reagendamiento');
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reschedule_dates
    BEFORE INSERT OR UPDATE ON appointment_reschedule_requests
    FOR EACH ROW EXECUTE FUNCTION fn_reschedule_dates();
