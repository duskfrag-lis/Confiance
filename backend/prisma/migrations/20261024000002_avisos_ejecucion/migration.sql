-- =====================================================================
-- Avisos de la ejecución del servicio (E9, HU-62.1)
-- =====================================================================
-- HU-46.2: el cliente sabe que el servicio empezó. HU-47: el prestador sabe que el cliente confirmó la
-- finalización (manual o automática), y las dos partes, que la contratación quedó completada.

INSERT INTO notification_types (type_name) VALUES
    ('service_started'),
    ('completion_confirmed'),
    ('request_completed');
