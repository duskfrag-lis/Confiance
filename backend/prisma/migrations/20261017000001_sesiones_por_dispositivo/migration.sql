-- Sesiones por dispositivo (HU-03, RFC 9700). Las sesiones pasan de auth_tokens a user_sessions:
-- una fila por dispositivo, con su refresh token rotativo. El access token lleva el session_id, así
-- que cerrar una sesión la corta al instante y reemplaza a users.sessions_revoked_at.

ALTER TABLE user_sessions
    -- "Mantener la sesión": vence tras JWT_REFRESH_EXPIRES sin usarse; si no, al cerrar el navegador (máx. 12 h)
    ADD COLUMN remember BOOLEAN NOT NULL DEFAULT FALSE,
    -- Token anterior y momento de la rotación: otra pestaña que renueva a la vez no es un robo
    ADD COLUMN previous_token_hash VARCHAR(255),
    ADD COLUMN rotated_at TIMESTAMPTZ;

CREATE INDEX idx_user_sessions_previous_token ON user_sessions(previous_token_hash);

-- Las sesiones abiertas con el esquema anterior se invalidan: toca iniciar sesión una vez más
UPDATE auth_tokens
   SET used_at = now()
 WHERE used_at IS NULL
   AND token_type_id = (SELECT token_type_id FROM token_types WHERE type_name = 'refresh_session');

ALTER TABLE users DROP COLUMN sessions_revoked_at;
