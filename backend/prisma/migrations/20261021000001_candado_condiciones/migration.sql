-- =====================================================================
-- Candado de las condiciones de una contratación desde ACEPTADO
-- =====================================================================
-- Pendiente de la PR #10: la base dejaba cambiar el valor acordado y la dirección en cualquier estado
-- (probado: 100 000 → 5 000 en FINALIZADO, y el pago igual quedó en PAGADO por 100 000). Desde ACEPTADO las
-- dos partes ya aceptaron esas condiciones (HU-36, HU-37), y el pago se hace por el valor acordado (HU-43.2).
-- La fecha ya tenía su propia regla (solo cambia con un reagendamiento aceptado, fn_service_request_dates).
-- En SOLICITADO se pueden cambiar: el prestador todavía no aceptó.

CREATE FUNCTION fn_lock_agreed_terms()
RETURNS TRIGGER AS $$
BEGIN
    IF (NEW.agreed_price, NEW.exact_address, NEW.neighborhood_id)
       IS NOT DISTINCT FROM (OLD.agreed_price, OLD.exact_address, OLD.neighborhood_id) THEN
        RETURN NEW;
    END IF;

    IF (SELECT status_name FROM request_statuses WHERE request_status_id = OLD.status_id) <> 'solicitado' THEN
        RAISE EXCEPTION 'Desde ACEPTADO no se pueden cambiar el valor, el barrio ni la dirección de la contratación (service_request_id = %)',
            OLD.service_request_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lock_agreed_terms
    BEFORE UPDATE OF agreed_price, exact_address, neighborhood_id ON service_requests
    FOR EACH ROW EXECUTE FUNCTION fn_lock_agreed_terms();
