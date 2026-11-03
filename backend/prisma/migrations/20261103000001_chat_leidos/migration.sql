-- HU-42 y HU-62: hasta dónde leyó cada parte el chat de una contratación.
-- Una fila por parte y contratación; se mueve hacia adelante al abrir la conversación.
-- De aquí salen los mensajes sin leer de la lista de chats y la marca "Visto" de la otra parte.
CREATE TABLE chat_reads (
    service_request_id  BIGINT NOT NULL REFERENCES service_requests(service_request_id),
    user_id             BIGINT NOT NULL REFERENCES users(user_id),
    last_read_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (service_request_id, user_id)
);
