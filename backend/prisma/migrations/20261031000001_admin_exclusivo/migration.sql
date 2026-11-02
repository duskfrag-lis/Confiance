-- =====================================================================
-- Cuentas de administrador exclusivas
-- =====================================================================
-- Decidido el 2026-10-31: quien administra la plataforma (reclamos, fuerza mayor, verificaciones) no puede
-- ser parte de lo que decide. Una cuenta con users.is_admin no tiene perfil de cliente ni de prestador, y una
-- cuenta con alguno de esos perfiles no puede volverse administradora. La misma persona usa otra cuenta, con
-- otro correo, si quiere contratar u ofrecer servicios. Va en la base para que ninguna escritura la salte.

CREATE FUNCTION fn_check_admin_without_profiles()
RETURNS TRIGGER AS $$
BEGIN
    IF EXISTS (SELECT 1 FROM users WHERE user_id = NEW.user_id AND is_admin) THEN
        RAISE EXCEPTION 'Una cuenta de administrador no puede tener perfil de cliente ni de prestador (user_id = %)', NEW.user_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_client_profile_not_admin
BEFORE INSERT OR UPDATE OF user_id ON client_profiles
FOR EACH ROW EXECUTE FUNCTION fn_check_admin_without_profiles();

CREATE TRIGGER trg_provider_profile_not_admin
BEFORE INSERT OR UPDATE OF user_id ON provider_profiles
FOR EACH ROW EXECUTE FUNCTION fn_check_admin_without_profiles();

CREATE FUNCTION fn_check_admin_is_exclusive()
RETURNS TRIGGER AS $$
BEGIN
    IF NEW.is_admin AND (
        EXISTS (SELECT 1 FROM client_profiles WHERE user_id = NEW.user_id)
        OR EXISTS (SELECT 1 FROM provider_profiles WHERE user_id = NEW.user_id)
    ) THEN
        RAISE EXCEPTION 'Una cuenta con perfil de cliente o de prestador no puede ser administradora (user_id = %)', NEW.user_id;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_admin_is_exclusive
BEFORE UPDATE OF is_admin ON users
FOR EACH ROW WHEN (NEW.is_admin AND NOT OLD.is_admin)
EXECUTE FUNCTION fn_check_admin_is_exclusive();
