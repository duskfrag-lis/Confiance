-- =====================================================================
-- E5: la necesidad vuelve a ABIERTA si su solicitud termina sin servicio
-- =====================================================================
-- Decidido el 2026-10-19 (pendiente de la E3): si la solicitud creada al seleccionar a un interesado (HU-30)
-- se rechaza (HU-36) o se cancela (HU-48 a HU-52, también la automática), la necesidad vuelve a ABIERTA para
-- que el cliente pueda elegir a otro. Va en la base para cubrir los procesos automáticos.
--   - El prestador de esa solicitud queda descartado (no seleccionado): no se le puede volver a elegir.
--     Lo mismo vale para los de solicitudes anteriores de la misma necesidad (una necesidad puede reabrirse
--     más de una vez): todo prestador que ya tuvo una solicitud de ella sigue descartado.
--   - Los demás interesados, que pasaron a "no seleccionado" al elegir, vuelven a pendiente.
-- Solo si la necesidad sigue en "prestador seleccionado": una cerrada no se reabre.

CREATE FUNCTION fn_reopen_need_on_request_end()
RETURNS TRIGGER AS $$
DECLARE
    v_new VARCHAR(30);
BEGIN
    IF NEW.source_need_id IS NULL OR NEW.status_id = OLD.status_id THEN
        RETURN NULL;
    END IF;

    SELECT status_name INTO v_new FROM request_statuses WHERE request_status_id = NEW.status_id;

    IF v_new NOT IN ('rechazado', 'cancelado') THEN
        RETURN NULL;
    END IF;

    UPDATE needs
    SET status_id = (SELECT need_status_id FROM need_statuses WHERE status_name = 'open')
    WHERE need_id = NEW.source_need_id
      AND status_id = (SELECT need_status_id FROM need_statuses WHERE status_name = 'provider_selected');

    IF NOT FOUND THEN
        RETURN NULL;
    END IF;

    UPDATE need_interests ni
    SET status_id = CASE
            WHEN EXISTS (SELECT 1 FROM service_requests sr
                         WHERE sr.source_need_id = ni.need_id AND sr.provider_profile_id = ni.provider_profile_id)
                THEN (SELECT interest_status_id FROM interest_statuses WHERE status_name = 'not_selected')
            ELSE (SELECT interest_status_id FROM interest_statuses WHERE status_name = 'pending')
        END
    WHERE ni.need_id = NEW.source_need_id;

    RETURN NULL;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_reopen_need_on_request_end
    AFTER UPDATE OF status_id ON service_requests
    FOR EACH ROW EXECUTE FUNCTION fn_reopen_need_on_request_end();
