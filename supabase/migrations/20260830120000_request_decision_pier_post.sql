-- Guarda o ID da postagem no PIER quando a decisão (aprovação/devolução/revisão)
-- é publicada como comentário privado na solicitação.
ALTER TABLE public.request_decision ADD COLUMN IF NOT EXISTS pier_post_id text;
