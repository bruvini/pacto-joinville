-- =====================================================================
-- Acesso por aprovação (menor privilégio — ISO 27001 A.5.16 / A.5.18)
-- ---------------------------------------------------------------------
-- Novos usuários passam a NÃO receber papel automaticamente: ficam
-- "pendentes" (sem papel = sem acesso de escrita e sem entrar no app)
-- até que um admin aprove e atribua ACP/ACO/admin em Configurações.
-- O PRIMEIRO usuário do sistema continua virando admin automaticamente.
-- =====================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE user_count INTEGER;
BEGIN
  INSERT INTO public.profiles (id, nome, email)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'nome', split_part(NEW.email, '@', 1)), NEW.email);

  SELECT COUNT(*) INTO user_count FROM auth.users;
  IF user_count = 1 THEN
    -- bootstrap: primeiro usuário é o administrador
    INSERT INTO public.user_roles (user_id, role) VALUES (NEW.id, 'admin');
  END IF;
  -- demais usuários: nenhum papel -> aguardando aprovação do admin
  RETURN NEW;
END; $$;
