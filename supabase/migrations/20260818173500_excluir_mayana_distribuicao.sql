-- Regra operacional da Carteira Inteligente: Mayana não participa da distribuição/sugestões.
-- Mantém o perfil sincronizado do PIER inativo para este módulo, sem alterar o usuário no PIER.

CREATE OR REPLACE FUNCTION public.bpo_profile_excluir_mayana_distribuicao()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.pier_user_external_id = '173560'
     OR lower(coalesce(NEW.name, '')) LIKE '%mayana%' THEN
    NEW.active := false;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS t_bpo_profile_excluir_mayana_distribuicao ON public.bpo_profile;
CREATE TRIGGER t_bpo_profile_excluir_mayana_distribuicao
BEFORE INSERT OR UPDATE OF name, pier_user_external_id, active ON public.bpo_profile
FOR EACH ROW EXECUTE FUNCTION public.bpo_profile_excluir_mayana_distribuicao();

UPDATE public.bpo_profile
SET active = false
WHERE pier_user_external_id = '173560'
   OR lower(name) LIKE '%mayana%';
