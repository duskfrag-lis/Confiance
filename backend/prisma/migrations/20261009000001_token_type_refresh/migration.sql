-- Tipo de token para las sesiones (refresh token opaco, guardado como hash en auth_tokens).
INSERT INTO token_types (type_name) VALUES ('refresh_session')
ON CONFLICT (type_name) DO NOTHING;
