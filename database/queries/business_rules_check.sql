-- =====================================================================
-- Confiance — PRUEBAS DE REGLAS DE NEGOCIO (migración 20261008000001)
-- Requiere las migraciones y database/seeds/dev_seed.sql. Todo corre en una
-- transacción que se deshace al final: no deja datos.
--   docker compose exec -T postgres psql -U confiance -d confiance -v ON_ERROR_STOP=1 < database/queries/business_rules_check.sql
-- Cada prueba imprime "OK ..."; ante el primer fallo se detiene con "FALLO: ...".
-- =====================================================================

BEGIN;

-- Ejecuta p_sql y exige que falle con un mensaje que contenga p_fragment.
CREATE FUNCTION pg_temp.expect_error(p_sql text, p_fragment text) RETURNS void AS $$
BEGIN
    EXECUTE p_sql;
    RAISE EXCEPTION 'FALLO: se esperaba el error "%" y la operación funcionó', p_fragment;
EXCEPTION WHEN OTHERS THEN
    IF SQLERRM LIKE 'FALLO:%' THEN RAISE; END IF;
    IF position(p_fragment IN SQLERRM) = 0 THEN
        RAISE EXCEPTION 'FALLO: se esperaba "%" y llegó "%"', p_fragment, SQLERRM;
    END IF;
    RAISE NOTICE 'OK  rechazado: %', p_fragment;
END $$ LANGUAGE plpgsql;

CREATE FUNCTION pg_temp.check(p_ok boolean, p_label text) RETURNS void AS $$
BEGIN
    IF NOT coalesce(p_ok, false) THEN RAISE EXCEPTION 'FALLO: %', p_label; END IF;
    RAISE NOTICE 'OK  %', p_label;
END $$ LANGUAGE plpgsql;

-- Carlos (provider_profile 1) atiende todos los días y bloques durante la prueba,
-- así las fechas relativas a now() siempre caen en su disponibilidad.
INSERT INTO provider_availability (provider_profile_id, day_of_week_id, time_block_id)
SELECT 1, d.day_of_week_id, tb.time_block_id FROM days_of_week d CROSS JOIN time_blocks tb
ON CONFLICT DO NOTHING;

-- Primera hora en punto, desde now() + p_min, dentro de un bloque y sin choque para Carlos.
CREATE FUNCTION pg_temp.free_slot(p_min interval) RETURNS timestamptz AS $$
DECLARE v_ts timestamptz := date_trunc('hour', now() + p_min) + interval '1 hour';
BEGIN
    WHILE fn_local_block(v_ts) IS NULL OR fn_provider_slot_taken(1, v_ts, NULL) LOOP
        v_ts := v_ts + interval '1 hour';
    END LOOP;
    RETURN v_ts;
END $$ LANGUAGE plpgsql;

CREATE FUNCTION pg_temp.status_id(p_status text) RETURNS smallint AS $$
    SELECT request_status_id FROM request_statuses WHERE status_name = p_status;
$$ LANGUAGE sql;

CREATE FUNCTION pg_temp.status_of(p_request bigint) RETURNS text AS $$
    SELECT rs.status_name FROM service_requests sr
    JOIN request_statuses rs ON rs.request_status_id = sr.status_id
    WHERE sr.service_request_id = p_request;
$$ LANGUAGE sql;

CREATE FUNCTION pg_temp.set_status_sql(p_request bigint, p_status text) RETURNS text AS $$
    SELECT format('UPDATE service_requests SET status_id = %s WHERE service_request_id = %s',
                  pg_temp.status_id(p_status), p_request);
$$ LANGUAGE sql;

-- Solicitud SOLICITADA de p_client a Carlos desde su publicación 1, en p_ts.
CREATE FUNCTION pg_temp.insert_request(p_ts timestamptz, p_client bigint DEFAULT 1) RETURNS bigint AS $$
    INSERT INTO service_requests (client_id, provider_profile_id, source_service_listing_id,
                                  proposed_datetime, neighborhood_id, status_id)
    VALUES (p_client, 1, 1, p_ts, 1, pg_temp.status_id('solicitado'))
    RETURNING service_request_id;
$$ LANGUAGE sql;

-- Crea una solicitud y la avanza por el ciclo hasta p_status.
CREATE FUNCTION pg_temp.new_request(p_status text, p_min interval, p_client bigint DEFAULT 1) RETURNS bigint AS $$
DECLARE
    v_id   bigint := pg_temp.insert_request(pg_temp.free_slot(p_min), p_client);
    v_step text;
BEGIN
    IF p_status = 'solicitado' THEN RETURN v_id; END IF;
    FOREACH v_step IN ARRAY ARRAY['aceptado', 'confirmado', 'en_curso', 'finalizado', 'completado'] LOOP
        IF v_step = 'completado' THEN
            INSERT INTO completion_confirmations (service_request_id, confirmed_by) VALUES (v_id, p_client);
        END IF;
        EXECUTE pg_temp.set_status_sql(v_id, v_step);
        EXIT WHEN v_step = p_status;
    END LOOP;
    RETURN v_id;
END $$ LANGUAGE plpgsql;

CREATE FUNCTION pg_temp.cancel_sql(p_request bigint, p_force_majeure boolean, p_by bigint DEFAULT 1) RETURNS text AS $$
    SELECT format(
        'INSERT INTO cancellations (service_request_id, cancelled_by, reason, is_force_majeure, force_majeure_status_id)
         VALUES (%s, %s, %L, %L, %s)',
        p_request, p_by, 'prueba', p_force_majeure,
        CASE WHEN p_force_majeure
             THEN '(SELECT force_majeure_status_id FROM force_majeure_statuses WHERE status_name = ''pending'')'
             ELSE 'NULL' END);
$$ LANGUAGE sql;

CREATE FUNCTION pg_temp.reschedule_sql(p_request bigint, p_ts timestamptz, p_by bigint DEFAULT 1) RETURNS text AS $$
    SELECT format(
        'INSERT INTO appointment_reschedule_requests (service_request_id, requested_by, new_datetime, status_id)
         VALUES (%s, %s, %L::timestamptz,
                 (SELECT reschedule_status_id FROM reschedule_statuses WHERE status_name = ''pending''))',
        p_request, p_by, p_ts);
$$ LANGUAGE sql;

CREATE FUNCTION pg_temp.respond(p_request bigint, p_status text) RETURNS void AS $$
    UPDATE appointment_reschedule_requests
    SET status_id = (SELECT reschedule_status_id FROM reschedule_statuses WHERE status_name = p_status)
    WHERE reschedule_request_id = (SELECT max(reschedule_request_id) FROM appointment_reschedule_requests
                                   WHERE service_request_id = p_request);
$$ LANGUAGE sql;

CREATE FUNCTION pg_temp.appointment_status(p_request bigint) RETURNS text AS $$
    SELECT s.status_name FROM appointments a
    JOIN appointment_statuses s ON s.appointment_status_id = a.status_id
    WHERE a.service_request_id = p_request;
$$ LANGUAGE sql;

-- Hora local de Bogotá, p_days días después de hoy (para fechas fuera de bloque).
CREATE FUNCTION pg_temp.local_at(p_days int, p_hour int) RETURNS timestamptz AS $$
    SELECT (date_trunc('day', now() AT TIME ZONE 'America/Bogota')
            + make_interval(days => p_days, hours => p_hour)) AT TIME ZONE 'America/Bogota';
$$ LANGUAGE sql;


-- ---------------------------------------------------------------------
-- CICLO DE LA CONTRATACIÓN (HU-31, HU-34, HU-36, HU-45, HU-64)
-- ---------------------------------------------------------------------
DO $$
DECLARE v bigint;
BEGIN
    RAISE NOTICE '--- Ciclo de la contratación';

    PERFORM pg_temp.expect_error(format(
        'INSERT INTO service_requests (client_id, provider_profile_id, source_service_listing_id, proposed_datetime, neighborhood_id, status_id)
         VALUES (1, 1, 1, %L::timestamptz, 1, %s)', pg_temp.free_slot('5 days'), pg_temp.status_id('confirmado')),
        'se crea en estado SOLICITADO');

    v := pg_temp.new_request('solicitado', '5 days');
    PERFORM pg_temp.expect_error(pg_temp.set_status_sql(v, 'completado'), 'Transición de estado no permitida');
    PERFORM pg_temp.expect_error(pg_temp.set_status_sql(v, 'cancelado'), 'registrar la cancelación');
    PERFORM pg_temp.expect_error(format(
        'INSERT INTO appointments (service_request_id, scheduled_datetime, status_id) VALUES (%s, now() + interval ''5 days'', 1)', v),
        'solo se crea cuando la contratación está CONFIRMADA');
    PERFORM pg_temp.expect_error(format('UPDATE service_requests SET client_id = 3 WHERE service_request_id = %s', v),
        'No se puede cambiar el cliente');

    v := pg_temp.new_request('confirmado', '5 days');
    PERFORM pg_temp.check(
        (SELECT a.scheduled_datetime = sr.proposed_datetime AND pg_temp.appointment_status(v) = 'upcoming'
         FROM service_requests sr JOIN appointments a USING (service_request_id) WHERE sr.service_request_id = v),
        'al CONFIRMAR se crea la cita con la fecha acordada');

    EXECUTE pg_temp.set_status_sql(v, 'en_curso');
    PERFORM pg_temp.check(pg_temp.appointment_status(v) = 'in_progress', 'EN_CURSO pone la cita en curso');

    EXECUTE pg_temp.set_status_sql(v, 'finalizado');
    PERFORM pg_temp.check(
        (SELECT completion_requested_at IS NOT NULL FROM service_requests WHERE service_request_id = v)
        AND pg_temp.appointment_status(v) = 'completed',
        'FINALIZADO registra el inicio del plazo de 24 h y completa la cita');

    PERFORM pg_temp.expect_error(pg_temp.set_status_sql(v, 'completado'), 'confirmación del cliente');

    PERFORM pg_temp.check(
        (SELECT count(*) = 5 FROM audit_events WHERE entity_type = 'service_request' AND entity_id = v),
        'trazabilidad: creación + 4 cambios de estado registrados');
    PERFORM pg_temp.expect_error(
        format('DELETE FROM audit_events WHERE entity_id = %s', v), 'no se pueden modificar ni eliminar');
END $$;


-- ---------------------------------------------------------------------
-- CANCELACIÓN (HU-48, HU-49)
-- ---------------------------------------------------------------------
DO $$
DECLARE v bigint;
BEGIN
    RAISE NOTICE '--- Cancelación';

    v := pg_temp.new_request('completado', '5 days');
    PERFORM pg_temp.expect_error(pg_temp.cancel_sql(v, false), 'Solo se puede cancelar una');
    PERFORM pg_temp.expect_error(pg_temp.cancel_sql(v, true), 'hasta el estado FINALIZADO');

    v := pg_temp.new_request('en_curso', '5 days');
    PERFORM pg_temp.expect_error(pg_temp.cancel_sql(v, false), 'Solo se puede cancelar una');
    EXECUTE pg_temp.cancel_sql(v, true);
    PERFORM pg_temp.check(pg_temp.status_of(v) = 'cancelado' AND pg_temp.appointment_status(v) = 'cancelled',
        'EN_CURSO se cancela por fuerza mayor y la cita queda cancelada');

    v := pg_temp.new_request('finalizado', '5 days');
    EXECUTE pg_temp.cancel_sql(v, true);
    PERFORM pg_temp.check(pg_temp.status_of(v) = 'cancelado', 'FINALIZADO se cancela por fuerza mayor');

    v := pg_temp.new_request('solicitado', '5 days');
    PERFORM pg_temp.expect_error(pg_temp.cancel_sql(v, false, 3), 'Solo el cliente o el prestador');
    EXECUTE pg_temp.cancel_sql(v, false);
    PERFORM pg_temp.check(pg_temp.status_of(v) = 'cancelado', 'SOLICITADO con 5 días de margen se cancela');

    v := pg_temp.new_request('aceptado', '10 hours');
    PERFORM pg_temp.expect_error(pg_temp.cancel_sql(v, false), 'hasta 24h antes');
    EXECUTE pg_temp.cancel_sql(v, true);
    PERFORM pg_temp.check(pg_temp.status_of(v) = 'cancelado', 'ACEPTADO a menos de 24 h se cancela por fuerza mayor');

    v := pg_temp.new_request('confirmado', '10 hours');
    PERFORM pg_temp.expect_error(pg_temp.cancel_sql(v, false), 'hasta 24h antes');
    EXECUTE pg_temp.cancel_sql(v, true);
    PERFORM pg_temp.check(pg_temp.status_of(v) = 'cancelado', 'CONFIRMADO a menos de 24 h se cancela por fuerza mayor');
END $$;


-- ---------------------------------------------------------------------
-- AGENDA (HU-35): disponibilidad y bloqueo desde ACEPTADO
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v1 bigint;
    v2 bigint;
    v_ts timestamptz;
BEGIN
    RAISE NOTICE '--- Agenda';

    PERFORM pg_temp.expect_error(format('SELECT pg_temp.insert_request(%L::timestamptz)', pg_temp.local_at(5, 3)),
        'fuera de los bloques horarios');

    v1 := pg_temp.new_request('aceptado', '5 days');
    v_ts := (SELECT proposed_datetime FROM service_requests WHERE service_request_id = v1);
    v2 := pg_temp.insert_request(v_ts);
    PERFORM pg_temp.check(true, 'SOLICITADO no bloquea: dos solicitudes en el mismo bloque');
    PERFORM pg_temp.expect_error(pg_temp.set_status_sql(v2, 'aceptado'), 'ya tiene una contratación aceptada');

    -- Sin disponibilidad el domingo en la noche.
    DELETE FROM provider_availability
    WHERE provider_profile_id = 1
      AND day_of_week_id = (SELECT day_of_week_id FROM days_of_week WHERE day_name = 'sunday')
      AND time_block_id = (SELECT time_block_id FROM time_blocks WHERE block_name = 'evening');
    PERFORM pg_temp.expect_error(format('SELECT pg_temp.insert_request(%L::timestamptz)',
        pg_temp.local_at(7 - extract(isodow FROM now() AT TIME ZONE 'America/Bogota')::int + 7, 19)),
        'fuera de la disponibilidad del prestador');
    INSERT INTO provider_availability (provider_profile_id, day_of_week_id, time_block_id)
    SELECT 1, d.day_of_week_id, tb.time_block_id FROM days_of_week d CROSS JOIN time_blocks tb
    ON CONFLICT DO NOTHING;
END $$;


-- ---------------------------------------------------------------------
-- REAGENDAMIENTO (HU-50)
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v bigint;
    v_proposed timestamptz;
BEGIN
    RAISE NOTICE '--- Reagendamiento';

    v := pg_temp.new_request('solicitado', '5 days');
    PERFORM pg_temp.expect_error(pg_temp.reschedule_sql(v, pg_temp.free_slot('6 days')), 'ACEPTADA o CONFIRMADA');

    -- ACEPTADO, sin cita todavía.
    v := pg_temp.new_request('aceptado', '5 days');
    SELECT proposed_datetime INTO v_proposed FROM service_requests WHERE service_request_id = v;

    PERFORM pg_temp.expect_error(pg_temp.reschedule_sql(v, pg_temp.free_slot('6 days'), 3), 'Solo el cliente o el prestador');
    PERFORM pg_temp.expect_error(pg_temp.reschedule_sql(v, pg_temp.local_at(6, 3)), 'fuera de los bloques horarios');

    EXECUTE pg_temp.reschedule_sql(v, pg_temp.free_slot('6 days'));
    PERFORM pg_temp.check(
        (SELECT appointment_id IS NULL AND previous_datetime = v_proposed
         FROM appointment_reschedule_requests WHERE service_request_id = v),
        'ACEPTADO sin cita: la solicitud toma la fecha propuesta como anterior');

    PERFORM pg_temp.expect_error(pg_temp.reschedule_sql(v, pg_temp.free_slot('7 days')), 'pendiente');

    PERFORM pg_temp.respond(v, 'accepted');
    PERFORM pg_temp.check(
        (SELECT reschedule_count = 1 AND proposed_datetime > v_proposed
         FROM service_requests WHERE service_request_id = v),
        'aceptar actualiza la fecha propuesta y suma 1 a reschedule_count');

    PERFORM pg_temp.expect_error(
        format('UPDATE appointment_reschedule_requests SET status_id = (SELECT reschedule_status_id FROM reschedule_statuses WHERE status_name = ''rejected'') WHERE service_request_id = %s', v),
        'ya fue respondida');

    EXECUTE pg_temp.reschedule_sql(v, pg_temp.free_slot('8 days'));
    PERFORM pg_temp.respond(v, 'rejected');
    PERFORM pg_temp.check(
        (SELECT reschedule_count = 1 FROM service_requests WHERE service_request_id = v),
        'una solicitud rechazada no suma a reschedule_count');

    PERFORM pg_temp.expect_error(pg_temp.reschedule_sql(v, pg_temp.free_slot('9 days')), 'Máximo de 2 solicitudes');

    -- CONFIRMADO, con cita.
    v := pg_temp.new_request('confirmado', '5 days');
    EXECUTE pg_temp.reschedule_sql(v, pg_temp.free_slot('6 days'));
    PERFORM pg_temp.respond(v, 'accepted');
    PERFORM pg_temp.check(
        (SELECT a.scheduled_datetime > now() + interval '6 days'
         FROM appointments a WHERE a.service_request_id = v),
        'CONFIRMADO: aceptar mueve la fecha de la cita');
END $$;


-- ---------------------------------------------------------------------
-- CALIFICACIONES (HU-47) Y PERFIL (RN-001: una cuenta con dos perfiles)
-- Laura (user 3) es prestadora (provider_profile 2) y aquí también es cliente.
-- ---------------------------------------------------------------------
DO $$
DECLARE v bigint;
BEGIN
    RAISE NOTICE '--- Calificaciones';

    v := pg_temp.new_request('confirmado', '5 days', 3);
    PERFORM pg_temp.expect_error(
        format('INSERT INTO ratings (service_request_id, rated_by, rated_user_id, score) VALUES (%s, 2, 3, 4)', v),
        'Solo se puede calificar una contratación COMPLETADA');

    v := pg_temp.new_request('completado', '5 days', 3);
    PERFORM pg_temp.expect_error(
        format('INSERT INTO ratings (service_request_id, rated_by, rated_user_id, score) VALUES (%s, 2, 1, 4)', v),
        'Solo se califica a la otra parte');

    INSERT INTO ratings (service_request_id, rated_by, rated_user_id, score)
    VALUES (v, 2, 3, 1);  -- Carlos califica a Laura como CLIENTE con 1

    PERFORM pg_temp.check(
        (SELECT rating_count = 0 FROM v_provider_public_profile WHERE provider_profile_id = 2),
        'la nota de Laura como cliente NO entra en su perfil de prestadora');
    PERFORM pg_temp.check(
        (SELECT avg_rating = 1 FROM v_client_rating_summary WHERE user_id = 3),
        'la nota de Laura como cliente aparece en v_client_rating_summary');
    PERFORM pg_temp.check(
        (SELECT avg_rating = 5 AND completed_services >= 2 AND 'monday morning' = ANY (availability)
         FROM v_provider_public_profile WHERE provider_profile_id = 1),
        'Carlos: promedio 5, servicios completados y disponibilidad en su perfil público');
    PERFORM pg_temp.check(
        (SELECT provider_avg_rating = 5 FROM v_service_listing_catalog WHERE service_listing_id = 1),
        'el catálogo muestra el promedio como prestador');
END $$;


-- ---------------------------------------------------------------------
-- REPORTE DE PROBLEMAS Y AUTOCOMPLETADO (HU-45, HU-46, RF-068)
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v_reported bigint;
    v_silent   bigint;
BEGIN
    RAISE NOTICE '--- Reporte de problemas y autocompletado';

    v_reported := pg_temp.new_request('confirmado', '5 days');
    PERFORM pg_temp.expect_error(
        format('INSERT INTO issue_reports (service_request_id, reported_by, description) VALUES (%s, 1, ''x'')', v_reported),
        'Solo se reporta un problema desde FINALIZADO');

    EXECUTE pg_temp.set_status_sql(v_reported, 'en_curso');
    EXECUTE pg_temp.set_status_sql(v_reported, 'finalizado');
    v_silent := pg_temp.new_request('finalizado', '5 days');

    UPDATE service_requests SET completion_requested_at = now() - interval '25 hours'
    WHERE service_request_id IN (v_reported, v_silent);

    INSERT INTO issue_reports (service_request_id, reported_by, description)
    VALUES (v_reported, 1, 'El trabajo quedó incompleto.');

    PERFORM fn_auto_complete_service_requests();

    PERFORM pg_temp.check(pg_temp.status_of(v_reported) = 'finalizado',
        'con reporte del cliente NO se autocompleta');
    PERFORM pg_temp.check(
        pg_temp.status_of(v_silent) = 'completado'
        AND (SELECT is_automatic FROM completion_confirmations WHERE service_request_id = v_silent AND confirmed_by = 1),
        'sin respuesta del cliente se autocompleta y queda marcado como automático');
END $$;


-- ---------------------------------------------------------------------
-- COHERENCIA DE LAS PARTES Y LÍMITES
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v_listing bigint;
    v_need    bigint;
BEGIN
    RAISE NOTICE '--- Coherencia y límites';

    PERFORM pg_temp.expect_error(format(
        'INSERT INTO service_requests (client_id, provider_profile_id, source_service_listing_id, proposed_datetime, neighborhood_id, status_id)
         VALUES (1, 2, 1, %L::timestamptz, 1, %s)', pg_temp.free_slot('5 days'), pg_temp.status_id('solicitado')),
        'no pertenece al prestador');

    INSERT INTO service_listings (provider_profile_id, category_id, title, description, min_price, max_price, status_id)
    VALUES (2, 4, 'Instalación de tomas', 'Tomas y breakers.', 30000, 30000,
            (SELECT listing_status_id FROM listing_statuses WHERE status_name = 'active'))
    RETURNING service_listing_id INTO v_listing;

    PERFORM pg_temp.expect_error(format(
        'INSERT INTO service_requests (client_id, provider_profile_id, source_service_listing_id, proposed_datetime, neighborhood_id, status_id)
         VALUES (3, 2, %s, now() + interval ''5 days'', 3, %s)', v_listing, pg_temp.status_id('solicitado')),
        'no puede contratarse a sí mismo');

    INSERT INTO needs (client_id, title, description, category_id, neighborhood_id, exact_address,
                       preferred_datetime, budget_min, budget_max, status_id)
    VALUES (1, 'Fuga en el baño', 'Gotea la llave.', 2, 1, 'Calle 1', now() + interval '5 days', 10000, 50000,
            (SELECT need_status_id FROM need_statuses WHERE status_name = 'open'))
    RETURNING need_id INTO v_need;

    PERFORM pg_temp.expect_error(format(
        'INSERT INTO service_requests (client_id, provider_profile_id, source_need_id, proposed_datetime, neighborhood_id, status_id)
         VALUES (1, 1, %s, now() + interval ''5 days'', 1, %s)', v_need, pg_temp.status_id('solicitado')),
        'no fue seleccionado en la necesidad');

    PERFORM pg_temp.expect_error(
        'INSERT INTO needs (client_id, title, description, category_id, neighborhood_id, exact_address, preferred_datetime, budget_min, budget_max, status_id)
         VALUES (2, ''x'', ''x'', 2, 1, ''x'', now(), 1, 2, 1)',
        'no tiene perfil de cliente');

    PERFORM pg_temp.expect_error(
        'INSERT INTO claims (service_request_id, filed_by, filed_against, reason_id, description, status_id) VALUES (2, 1, 3, 1, ''x'', 1)',
        'de una parte de la contratación contra la otra');

    INSERT INTO provider_categories (provider_profile_id, category_id) VALUES (1, 5);
    PERFORM pg_temp.expect_error(
        'INSERT INTO provider_categories (provider_profile_id, category_id) VALUES (1, 3)', 'Máximo de 3 oficios');

    PERFORM pg_temp.expect_error(
        'UPDATE service_listings SET status_id = (SELECT listing_status_id FROM listing_statuses WHERE status_name = ''withdrawn'') WHERE service_listing_id = 1',
        'con contrataciones activas');

    UPDATE service_listings SET status_id = (SELECT listing_status_id FROM listing_statuses WHERE status_name = 'withdrawn')
    WHERE service_listing_id = v_listing;
    PERFORM pg_temp.check(true, 'se retira una publicación sin contrataciones');
    PERFORM pg_temp.expect_error(format(
        'UPDATE service_listings SET status_id = (SELECT listing_status_id FROM listing_statuses WHERE status_name = ''active'') WHERE service_listing_id = %s',
        v_listing), 'retirada no cambia de estado');

    SET CONSTRAINTS trg_check_active_profile_exists IMMEDIATE;
    PERFORM pg_temp.expect_error(
        'UPDATE users SET active_profile_id = (SELECT active_profile_id FROM active_profiles WHERE profile_name = ''provider'') WHERE user_id = 1',
        'El perfil activo');
    UPDATE users SET active_profile_id = (SELECT active_profile_id FROM active_profiles WHERE profile_name = 'provider')
    WHERE user_id = 3;
    PERFORM pg_temp.check(true, 'Laura cambia a su perfil de prestadora (existe)');
    SET CONSTRAINTS trg_check_active_profile_exists DEFERRED;
END $$;


-- ---------------------------------------------------------------------
-- ESTRUCTURA Y CATÁLOGOS
-- ---------------------------------------------------------------------
DO $$
BEGIN
    RAISE NOTICE '--- Estructura';
    PERFORM pg_temp.check(to_regclass('public.user_sessions') IS NOT NULL, 'existe user_sessions');
    PERFORM pg_temp.check(
        (SELECT count(*) = 3 FROM information_schema.columns
         WHERE column_name = 'is_active' AND table_name IN ('communes', 'neighborhoods', 'categories')),
        'zonas y categorías tienen is_active');
    PERFORM pg_temp.check(
        (SELECT start_time = '06:00' AND end_time = '12:00' FROM time_blocks WHERE block_name = 'morning')
        AND (SELECT start_time = '18:00' AND end_time = '22:00' FROM time_blocks WHERE block_name = 'evening'),
        'bloques: mañana 6-12, tarde 12-18, noche 18-22');
    PERFORM pg_temp.check(
        (SELECT array_agg(status_name ORDER BY need_status_id) = ARRAY['open', 'provider_selected', 'closed']::varchar[] FROM need_statuses),
        'necesidad: solo open, provider_selected y closed');
    PERFORM pg_temp.check(
        (SELECT array_agg(method_name) = ARRAY['bank_transfer']::varchar[] FROM payment_methods),
        'pagos simulados: solo transferencia');
    PERFORM pg_temp.check(
        EXISTS (SELECT 1 FROM appointment_statuses WHERE status_name = 'cancelled'),
        'la cita puede quedar cancelada');
END $$;

ROLLBACK;
