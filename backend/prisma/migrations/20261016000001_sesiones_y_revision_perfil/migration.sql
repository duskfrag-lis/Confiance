-- Cierre inmediato de sesiones (HU-03, HU-04 criterio 5, HU-06 criterio 4, HU-09 criterio 5).
-- Al revocar todas las sesiones de una cuenta se guarda la fecha; el backend rechaza cualquier
-- token de acceso emitido antes, sin esperar a que venza (dura JWT_ACCESS_EXPIRES).
ALTER TABLE users ADD COLUMN sessions_revoked_at TIMESTAMPTZ;

COMMENT ON COLUMN users.sessions_revoked_at IS
    'Última vez que se cerraron todas las sesiones; los tokens de acceso anteriores dejan de valer.';

-- HU-09 criterio 5 / D-47: al vincular Google o Microsoft a una cuenta que no tenía el correo
-- verificado, los datos personales los pudo escribir otra persona. El dueño debe revisarlos
-- antes de seguir usando la plataforma.
ALTER TABLE users ADD COLUMN profile_review_required BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN users.profile_review_required IS
    'El dueño debe confirmar nombres, cédula y celular (cuenta vinculada sin correo verificado, D-47).';
