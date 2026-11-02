-- =====================================================================
-- Confiance — PRUEBAS DE REGLAS DE NEGOCIO (migraciones 20261008000001, 20261013000001 y 20261015000001)
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
                                  proposed_datetime, neighborhood_id, exact_address, agreed_price, status_id)
    VALUES (p_client, 1, 1, p_ts, 1, 'Calle de prueba', 100000, pg_temp.status_id('solicitado'))
    RETURNING service_request_id;
$$ LANGUAGE sql;

-- Registra un pago PAGADO de la contratación p_request (FINALIZADA): el cliente marca la
-- transferencia y el prestador la confirma.
CREATE FUNCTION pg_temp.pay(p_request bigint) RETURNS void AS $$
    INSERT INTO payments (service_request_id, payment_method_id, status_id, amount)
    SELECT p_request,
           (SELECT payment_method_id FROM payment_methods WHERE method_name = 'bank_transfer'),
           (SELECT payment_status_id FROM payment_statuses WHERE status_name = 'pending_confirmation'),
           agreed_price
    FROM service_requests WHERE service_request_id = p_request;
    UPDATE payments SET status_id = (SELECT payment_status_id FROM payment_statuses WHERE status_name = 'paid')
    WHERE service_request_id = p_request
      AND status_id = (SELECT payment_status_id FROM payment_statuses WHERE status_name = 'pending_confirmation');
$$ LANGUAGE sql;

-- Crea una solicitud y la avanza por el ciclo hasta p_status.
CREATE FUNCTION pg_temp.new_request(p_status text, p_min interval, p_client bigint DEFAULT 1) RETURNS bigint AS $$
DECLARE
    v_id   bigint := pg_temp.insert_request(pg_temp.free_slot(p_min), p_client);
    v_step text;
BEGIN
    IF p_status = 'solicitado' THEN RETURN v_id; END IF;
    FOREACH v_step IN ARRAY ARRAY['aceptado', 'confirmado', 'en_curso', 'finalizado', 'completado'] LOOP
        -- COMPLETADO llega solo al tener pago y confirmación del cliente (HU-47).
        IF v_step = 'completado' THEN
            PERFORM pg_temp.pay(v_id);
            INSERT INTO completion_confirmations (service_request_id, confirmed_by) VALUES (v_id, p_client);
            EXIT;
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
-- CICLO DE LA CONTRATACIÓN (HU-34, HU-38, HU-40, HU-47, HU-61)
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
-- CANCELACIÓN (HU-50, HU-51)
-- ---------------------------------------------------------------------
DO $$
DECLARE v bigint;
BEGIN
    RAISE NOTICE '--- Cancelación';

    v := pg_temp.new_request('completado', '5 days');
    PERFORM pg_temp.expect_error(pg_temp.cancel_sql(v, false), 'Solo se puede cancelar una');
    PERFORM pg_temp.expect_error(pg_temp.cancel_sql(v, true), 'hasta el estado EN_CURSO');

    v := pg_temp.new_request('en_curso', '5 days');
    PERFORM pg_temp.expect_error(pg_temp.cancel_sql(v, false), 'Solo se puede cancelar una');
    EXECUTE pg_temp.cancel_sql(v, true);
    PERFORM pg_temp.check(pg_temp.status_of(v) = 'cancelado' AND pg_temp.appointment_status(v) = 'cancelled',
        'EN_CURSO se cancela por fuerza mayor y la cita queda cancelada');

    -- D-48: el servicio ya se prestó y falta el pago.
    v := pg_temp.new_request('finalizado', '5 days');
    PERFORM pg_temp.expect_error(pg_temp.cancel_sql(v, true), 'hasta el estado EN_CURSO');

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
-- AGENDA (HU-39): disponibilidad y bloqueo desde ACEPTADO
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
-- REAGENDAMIENTO (HU-53)
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
-- CALIFICACIONES (HU-49) Y PERFIL (RN-001: una cuenta con dos perfiles)
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
-- REPORTE DE PROBLEMAS Y AUTOCOMPLETADO (HU-47, HU-48, RF-068)
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
        pg_temp.status_of(v_silent) = 'finalizado'
        AND (SELECT is_automatic FROM completion_confirmations WHERE service_request_id = v_silent AND confirmed_by = 1),
        'sin respuesta del cliente se registra la confirmación automática, pero sin pago sigue FINALIZADO');

    PERFORM pg_temp.pay(v_silent);
    PERFORM pg_temp.check(pg_temp.status_of(v_silent) = 'completado',
        'al registrarse el pago, la contratación con confirmación automática pasa a COMPLETADO');
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

    INSERT INTO provider_categories (provider_profile_id, category_id) VALUES (1, 7);
    PERFORM pg_temp.expect_error(
        'INSERT INTO provider_categories (provider_profile_id, category_id) VALUES (1, 4)', 'Máximo de 3 oficios');

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
-- FECHAS (revisión QA de la PR #5)
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v      bigint;
    v2     bigint;
    v_slot timestamptz;
    v_past timestamptz := pg_temp.local_at(-3, 9);  -- hace 3 días, 9 a. m. (dentro de un bloque)
BEGIN
    RAISE NOTICE '--- Fechas';

    -- a) Crear o aceptar con fecha pasada
    PERFORM pg_temp.expect_error(format('SELECT pg_temp.insert_request(%L::timestamptz)', v_past), 'debe ser futura');

    PERFORM set_config('app.allow_past_dates', 'on', true);
    v := pg_temp.insert_request(v_past);
    PERFORM set_config('app.allow_past_dates', 'off', true);
    PERFORM pg_temp.expect_error(pg_temp.set_status_sql(v, 'aceptado'), 'debe ser futura');

    -- b) En SOLICITADO la fecha cambia solo a una futura dentro de la disponibilidad
    v := pg_temp.new_request('solicitado', '5 days');
    PERFORM pg_temp.expect_error(
        format('UPDATE service_requests SET proposed_datetime = %L WHERE service_request_id = %s', pg_temp.local_at(6, 3), v),
        'fuera de los bloques');
    PERFORM pg_temp.expect_error(
        format('UPDATE service_requests SET proposed_datetime = %L WHERE service_request_id = %s', v_past, v),
        'debe ser futura');
    v_slot := pg_temp.free_slot('6 days');
    EXECUTE format('UPDATE service_requests SET proposed_datetime = %L WHERE service_request_id = %s', v_slot, v);
    PERFORM pg_temp.check(
        (SELECT proposed_datetime = v_slot FROM service_requests WHERE service_request_id = v),
        'en SOLICITADO la fecha cambia a otra futura y disponible');

    -- b) Desde ACEPTADO, no se mueve la fecha directamente (ni a 03:00 ni a un bloque ocupado)
    v := pg_temp.new_request('aceptado', '5 days');
    v2 := pg_temp.new_request('aceptado', '5 days');
    PERFORM pg_temp.expect_error(
        format('UPDATE service_requests SET proposed_datetime = %L WHERE service_request_id = %s', pg_temp.local_at(6, 3), v),
        'solo cambia con un reagendamiento');
    PERFORM pg_temp.expect_error(
        format('UPDATE service_requests SET proposed_datetime = (SELECT proposed_datetime FROM service_requests WHERE service_request_id = %s) WHERE service_request_id = %s', v2, v),
        'solo cambia con un reagendamiento');

    v := pg_temp.new_request('confirmado', '5 days');
    PERFORM pg_temp.expect_error(
        format('UPDATE appointments SET scheduled_datetime = scheduled_datetime + interval ''1 day'' WHERE service_request_id = %s', v),
        'La fecha de la cita solo cambia');

    -- c) Reagendar a una fecha pasada
    v := pg_temp.new_request('aceptado', '5 days');
    PERFORM pg_temp.expect_error(pg_temp.reschedule_sql(v, v_past), 'debe ser futura');

    -- c) Una solicitud que venció mientras estaba pendiente no se puede aceptar
    PERFORM set_config('app.allow_past_dates', 'on', true);
    EXECUTE pg_temp.reschedule_sql(v, v_past);
    PERFORM set_config('app.allow_past_dates', 'off', true);
    PERFORM pg_temp.expect_error(format('SELECT pg_temp.respond(%s, ''accepted'')', v), 'debe ser futura');
    PERFORM pg_temp.expect_error(
        format('UPDATE appointment_reschedule_requests SET new_datetime = new_datetime + interval ''10 days'' WHERE service_request_id = %s', v),
        'no se editan');

    -- El reagendamiento normal sigue moviendo la fecha
    PERFORM pg_temp.respond(v, 'rejected');
    v_slot := pg_temp.free_slot('7 days');
    EXECUTE pg_temp.reschedule_sql(v, v_slot);
    PERFORM pg_temp.respond(v, 'accepted');
    PERFORM pg_temp.check(
        (SELECT proposed_datetime = v_slot FROM service_requests WHERE service_request_id = v),
        'un reagendamiento aceptado sí cambia la fecha');
END $$;


-- ---------------------------------------------------------------------
-- PAGOS Y COMPLETADO (HU-43, HU-44, HU-45, HU-47)
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v      bigint;
    v_pse  bigint;
    v_tr   smallint := (SELECT payment_method_id FROM payment_methods WHERE method_name = 'bank_transfer');
    v_psem smallint := (SELECT payment_method_id FROM payment_methods WHERE method_name = 'pse');
    v_pend smallint := (SELECT payment_status_id FROM payment_statuses WHERE status_name = 'pending');
    v_conf smallint := (SELECT payment_status_id FROM payment_statuses WHERE status_name = 'pending_confirmation');
    v_paid smallint := (SELECT payment_status_id FROM payment_statuses WHERE status_name = 'paid');
    v_rej  smallint := (SELECT payment_status_id FROM payment_statuses WHERE status_name = 'rejected');
BEGIN
    RAISE NOTICE '--- Pagos y completado';

    v := pg_temp.new_request('en_curso', '5 days');
    PERFORM pg_temp.expect_error(format(
        'INSERT INTO payments (service_request_id, payment_method_id, status_id, amount) VALUES (%s, %s, %s, 100000)',
        v, v_tr, v_conf), 'Solo se paga una contratación FINALIZADA');

    EXECUTE pg_temp.set_status_sql(v, 'finalizado');
    PERFORM pg_temp.check(
        (SELECT payment_status = 'pending' FROM v_service_request_payment WHERE service_request_id = v),
        'en FINALIZADO el pago empieza PENDIENTE');

    PERFORM pg_temp.expect_error(format(
        'INSERT INTO payments (service_request_id, payment_method_id, status_id, amount) VALUES (%s, %s, %s, 99999)',
        v, v_tr, v_conf), 'debe ser el valor acordado');
    PERFORM pg_temp.expect_error(format(
        'INSERT INTO payments (service_request_id, payment_method_id, status_id, amount) VALUES (%s, %s, %s, 100000)',
        v, v_psem, v_paid), 'se crea en estado pending');

    -- PSE rechazado: queda en el historial y se puede reintentar (HU-43, HU-45).
    INSERT INTO payments (service_request_id, payment_method_id, status_id, amount, gateway_reference)
    VALUES (v, v_psem, v_pend, 100000, 'test-' || v || '-1') RETURNING payment_id INTO v_pse;
    PERFORM pg_temp.expect_error(format(
        'INSERT INTO payments (service_request_id, payment_method_id, status_id, amount) VALUES (%s, %s, %s, 100000)',
        v, v_tr, v_conf), 'Ya hay un pago en curso');
    UPDATE payments SET status_id = v_rej, failure_reason = 'DECLINED' WHERE payment_id = v_pse;
    PERFORM pg_temp.expect_error(format('UPDATE payments SET status_id = %s WHERE payment_id = %s', v_paid, v_pse),
        'Cambio de estado de pago no permitido');

    -- Transferencia marcada: PENDIENTE DE CONFIRMACIÓN. El prestador no la recibió: vuelve a PENDIENTE.
    INSERT INTO payments (service_request_id, payment_method_id, status_id, amount) VALUES (v, v_tr, v_conf, 100000);
    PERFORM pg_temp.check(
        (SELECT payment_status = 'pending_confirmation' FROM v_service_request_payment WHERE service_request_id = v),
        'transferencia marcada: PENDIENTE DE CONFIRMACIÓN');
    UPDATE payments SET status_id = v_rej, failure_reason = 'No recibida'
    WHERE service_request_id = v AND status_id = v_conf;
    PERFORM pg_temp.check(
        (SELECT payment_status = 'pending' FROM v_service_request_payment WHERE service_request_id = v),
        'transferencia no recibida: vuelve a PENDIENTE');

    -- Pago primero, confirmación después.
    PERFORM pg_temp.pay(v);
    PERFORM pg_temp.check(pg_temp.status_of(v) = 'finalizado', 'pagado sin confirmación del cliente sigue FINALIZADO');
    PERFORM pg_temp.expect_error(pg_temp.set_status_sql(v, 'completado'), 'confirmación del cliente');
    PERFORM pg_temp.expect_error(format(
        'INSERT INTO payments (service_request_id, payment_method_id, status_id, amount) VALUES (%s, %s, %s, 100000)',
        v, v_psem, v_pend), 'ya está pagada');
    INSERT INTO completion_confirmations (service_request_id, confirmed_by) VALUES (v, 1);
    PERFORM pg_temp.check(pg_temp.status_of(v) = 'completado', 'pago + confirmación del cliente: COMPLETADO');
    PERFORM pg_temp.check(
        (SELECT count(*) = 3 FROM payments WHERE service_request_id = v)
        AND (SELECT payment_status = 'paid' AND paid_at IS NOT NULL FROM v_service_request_payment WHERE service_request_id = v),
        'historial: dos intentos rechazados y un pago PAGADO con fecha');
    PERFORM pg_temp.check(
        (SELECT count(*) >= 2 FROM audit_events WHERE entity_type = 'payment' AND event_type = 'payment_status_changed'),
        'los cambios de estado del pago quedan en la trazabilidad');

    -- Confirmación primero, pago después.
    v := pg_temp.new_request('finalizado', '5 days');
    INSERT INTO completion_confirmations (service_request_id, confirmed_by) VALUES (v, 1);
    PERFORM pg_temp.check(pg_temp.status_of(v) = 'finalizado', 'confirmado sin pago sigue FINALIZADO');
    PERFORM pg_temp.expect_error(pg_temp.set_status_sql(v, 'completado'), 'pago registrado');
    PERFORM pg_temp.pay(v);
    PERFORM pg_temp.check(pg_temp.status_of(v) = 'completado', 'confirmación + pago: COMPLETADO');

    -- HU-18: sin información bancaria del prestador solo se paga por PSE.
    v := pg_temp.new_request('finalizado', '5 days');
    DELETE FROM provider_bank_accounts WHERE provider_profile_id = 1;
    PERFORM pg_temp.expect_error(format(
        'INSERT INTO payments (service_request_id, payment_method_id, status_id, amount) VALUES (%s, %s, %s, 100000)',
        v, v_tr, v_conf), 'solo se puede pagar por PSE');
    INSERT INTO payments (service_request_id, payment_method_id, status_id, amount, gateway_reference)
    VALUES (v, v_psem, v_pend, 100000, 'test-' || v || '-1');
    PERFORM pg_temp.check(true, 'sin información bancaria se puede iniciar un PSE');
    INSERT INTO provider_bank_accounts (provider_profile_id, bank_name, account_type_id, account_number)
    VALUES (1, 'Bancolombia', (SELECT account_type_id FROM bank_account_types WHERE type_name = 'savings'), '000-111222-33');
END $$;


-- ---------------------------------------------------------------------
-- CANCELACIÓN AUTOMÁTICA POR PLAZO VENCIDO (HU-52)
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v_old_req  bigint;
    v_new_req  bigint;
    v_old_acc  bigint;
    v_new_acc  bigint;
    v_ids      bigint[];
BEGIN
    RAISE NOTICE '--- Cancelación automática';

    -- Fechas lejanas: la regla de las 24 h no aplica a la cancelación automática.
    v_old_req := pg_temp.new_request('solicitado', '10 hours');
    v_new_req := pg_temp.new_request('solicitado', '5 days');
    UPDATE service_requests SET created_at = now() - interval '49 hours' WHERE service_request_id = v_old_req;

    v_old_acc := pg_temp.new_request('aceptado', '6 days');
    v_new_acc := pg_temp.new_request('aceptado', '7 days');
    -- La aceptación ocurrió hace 25 h (los eventos no se editan; se agrega uno anterior).
    INSERT INTO audit_events (event_type, entity_type, entity_id, previous_state, new_state, occurred_at)
    VALUES ('request_status_changed', 'service_request', v_old_acc, 'solicitado', 'aceptado', now() - interval '25 hours');

    SELECT array_agg(cancelled_request_id) INTO v_ids FROM fn_auto_cancel_stale_requests();

    PERFORM pg_temp.check(v_old_req = ANY (v_ids) AND v_old_acc = ANY (v_ids)
        AND NOT (v_new_req = ANY (v_ids)) AND NOT (v_new_acc = ANY (v_ids)),
        'cancela SOLICITADO de 48 h y ACEPTADO de 24 h, y no las recientes');
    PERFORM pg_temp.check(
        pg_temp.status_of(v_old_req) = 'cancelado' AND pg_temp.status_of(v_old_acc) = 'cancelado',
        'las vencidas quedan CANCELADAS');
    PERFORM pg_temp.check(
        (SELECT bool_and(is_automatic AND cancelled_by IS NULL) FROM cancellations
         WHERE service_request_id IN (v_old_req, v_old_acc)),
        'registradas como cancelación del sistema');
    PERFORM pg_temp.check(
        NOT fn_provider_slot_taken(1, (SELECT proposed_datetime FROM service_requests WHERE service_request_id = v_old_acc), NULL),
        'se libera el horario del prestador');
    PERFORM pg_temp.check((SELECT count(*) = 0 FROM fn_auto_cancel_stale_requests()),
        'una segunda ejecución no cancela nada más');

    PERFORM pg_temp.expect_error(format(
        'INSERT INTO cancellations (service_request_id, cancelled_by, reason, is_automatic) VALUES (%s, NULL, ''x'', TRUE)',
        pg_temp.new_request('confirmado', '5 days')), 'solo aplica en SOLICITADO o ACEPTADO');
    PERFORM pg_temp.expect_error(format(
        'INSERT INTO cancellations (service_request_id, cancelled_by, reason) VALUES (%s, NULL, ''x'')', v_new_req),
        'chk_cancellation_actor');
END $$;


-- ---------------------------------------------------------------------
-- DECISIONES D-49 A D-55 Y REGLAS DE LA V7
-- ---------------------------------------------------------------------
DO $$
DECLARE
    v       bigint;
    v_ev    bigint;
    v_need  bigint;
BEGIN
    RAISE NOTICE '--- Reglas V7';

    -- D-49: valor obligatorio y mayor que cero.
    PERFORM pg_temp.expect_error(format(
        'INSERT INTO service_requests (client_id, provider_profile_id, source_service_listing_id, proposed_datetime, neighborhood_id, exact_address, agreed_price, status_id)
         VALUES (1, 1, 1, %L::timestamptz, 1, ''x'', 0, %s)', pg_temp.free_slot('5 days'), pg_temp.status_id('solicitado')),
        'chk_service_requests_agreed_price_positive');
    PERFORM pg_temp.expect_error(format(
        'INSERT INTO service_requests (client_id, provider_profile_id, source_service_listing_id, proposed_datetime, neighborhood_id, agreed_price, status_id)
         VALUES (1, 1, 1, %L::timestamptz, 1, 1000, %s)', pg_temp.free_slot('5 days'), pg_temp.status_id('solicitado')),
        'exact_address');

    -- D-52: no se deshabilita con contrataciones abiertas.
    v := pg_temp.new_request('confirmado', '5 days');
    PERFORM pg_temp.expect_error(
        'UPDATE users SET status_id = (SELECT status_id FROM account_statuses WHERE status_name = ''disabled'') WHERE user_id = 1',
        'contrataciones en curso');
    PERFORM pg_temp.expect_error(
        'UPDATE users SET status_id = (SELECT status_id FROM account_statuses WHERE status_name = ''disabled'') WHERE user_id = 2',
        'contrataciones en curso');

    -- D-53: chat de las partes, solo lectura en estados finales.
    PERFORM pg_temp.expect_error(format(
        'INSERT INTO chat_messages (service_request_id, sender_id, message_text) VALUES (%s, 3, ''hola'')', v),
        'Solo las partes');
    INSERT INTO chat_messages (service_request_id, sender_id, message_text) VALUES (v, 1, 'Hola');
    PERFORM pg_temp.check(true, 'una parte escribe en el chat de una contratación CONFIRMADA');
    v := pg_temp.new_request('completado', '5 days');
    PERFORM pg_temp.expect_error(format(
        'INSERT INTO chat_messages (service_request_id, sender_id, message_text) VALUES (%s, 1, ''hola'')', v),
        'solo lectura');

    -- D-55: solo oficios activos de segundo nivel.
    PERFORM pg_temp.expect_error(
        'INSERT INTO service_listings (provider_profile_id, category_id, title, description, min_price, max_price, status_id)
         VALUES (1, 1, ''x'', ''x'', 1, 1, (SELECT listing_status_id FROM listing_statuses WHERE status_name = ''active''))',
        'no es un oficio activo');
    UPDATE categories SET is_active = FALSE WHERE category_id = 6;
    PERFORM pg_temp.expect_error(
        'UPDATE service_listings SET category_id = 6 WHERE service_listing_id = 1', 'no es un oficio activo');
    UPDATE service_listings SET title = title || ' ' WHERE service_listing_id = 1;
    PERFORM pg_temp.check(true, 'editar otros campos no revalida el oficio');
    UPDATE categories SET is_active = TRUE WHERE category_id = 6;

    -- D-54 y HU-19: hasta 5 fotos por evidencia; retirada es definitiva.
    INSERT INTO work_evidence (provider_profile_id, description, status_id)
    VALUES (1, 'Prueba', (SELECT evidence_status_id FROM evidence_statuses WHERE status_name = 'published'))
    RETURNING work_evidence_id INTO v_ev;
    INSERT INTO work_evidence_photos (work_evidence_id, photo_url) SELECT v_ev, 'e/' || g FROM generate_series(1, 5) g;
    PERFORM pg_temp.expect_error(format(
        'INSERT INTO work_evidence_photos (work_evidence_id, photo_url) VALUES (%s, ''e/6'')', v_ev), 'Máximo de 5 fotos');
    UPDATE work_evidence SET status_id = (SELECT evidence_status_id FROM evidence_statuses WHERE status_name = 'withdrawn')
    WHERE work_evidence_id = v_ev;
    PERFORM pg_temp.expect_error(format(
        'UPDATE work_evidence SET status_id = (SELECT evidence_status_id FROM evidence_statuses WHERE status_name = ''published'') WHERE work_evidence_id = %s',
        v_ev), 'retirada no cambia de estado');

    -- HU-29: interés solo en necesidades abiertas y no en una propia.
    PERFORM pg_temp.expect_error(
        'INSERT INTO need_interests (need_id, provider_profile_id, status_id) VALUES (1, 1, (SELECT interest_status_id FROM interest_statuses WHERE status_name = ''pending''))',
        'necesidad abierta');
    INSERT INTO needs (client_id, title, description, category_id, neighborhood_id, exact_address,
                       preferred_datetime, budget_min, budget_max, status_id)
    VALUES (3, 'Fuga', 'Gotea.', 2, 3, 'Calle 2', now() + interval '5 days', 10000, 50000,
            (SELECT need_status_id FROM need_statuses WHERE status_name = 'open'))
    RETURNING need_id INTO v_need;
    PERFORM pg_temp.expect_error(format(
        'INSERT INTO need_interests (need_id, provider_profile_id, status_id) VALUES (%s, 2, (SELECT interest_status_id FROM interest_statuses WHERE status_name = ''pending''))',
        v_need), 'su propia necesidad');

    -- HU-55: una verificación pendiente a la vez.
    INSERT INTO identity_verifications (provider_profile_id, document_type_id, document_number, status_id)
    VALUES (2, 1, '1000000003', (SELECT verification_status_id FROM verification_statuses WHERE status_name = 'pending'));
    PERFORM pg_temp.expect_error(
        'INSERT INTO identity_verifications (provider_profile_id, document_type_id, document_number, status_id)
         VALUES (2, 1, ''1000000003'', (SELECT verification_status_id FROM verification_statuses WHERE status_name = ''pending''))',
        'verificación pendiente');
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
        (SELECT array_agg(method_name ORDER BY method_name) = ARRAY['bank_transfer', 'pse']::varchar[] FROM payment_methods),
        'pagos: PSE y transferencia');
    PERFORM pg_temp.check(
        (SELECT array_agg(status_name ORDER BY status_name) = ARRAY['paid', 'pending', 'pending_confirmation', 'rejected']::varchar[]
         FROM payment_statuses),
        'estados del pago sin reembolso');
    PERFORM pg_temp.check(
        EXISTS (SELECT 1 FROM appointment_statuses WHERE status_name = 'cancelled'),
        'la cita puede quedar cancelada');
END $$;

ROLLBACK;
