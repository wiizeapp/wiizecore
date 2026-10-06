ALTER TABLE public.finance_categories
ADD COLUMN parent_id uuid NULL REFERENCES public.finance_categories(id) ON DELETE RESTRICT;

CREATE INDEX finance_categories_parent_id_idx
ON public.finance_categories(parent_id)
WHERE parent_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.validate_finance_category_parent()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  parent_row public.finance_categories%ROWTYPE;
BEGIN
  IF NEW.parent_id IS NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.parent_id = NEW.id THEN
    RAISE EXCEPTION 'Uma categoria não pode ser subcategoria dela mesma.';
  END IF;

  SELECT * INTO parent_row
  FROM public.finance_categories
  WHERE id = NEW.parent_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Categoria principal não encontrada.';
  END IF;

  IF parent_row.parent_id IS NOT NULL THEN
    RAISE EXCEPTION 'A hierarquia permite apenas categoria e subcategoria.';
  END IF;

  IF parent_row.tenant_id IS DISTINCT FROM NEW.tenant_id THEN
    RAISE EXCEPTION 'Categoria e subcategoria devem pertencer à mesma empresa.';
  END IF;

  IF parent_row.direction IS DISTINCT FROM NEW.direction THEN
    RAISE EXCEPTION 'Categoria e subcategoria devem ter o mesmo tipo de movimentação.';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS validate_finance_category_parent_trigger ON public.finance_categories;
CREATE TRIGGER validate_finance_category_parent_trigger
BEFORE INSERT OR UPDATE OF parent_id, tenant_id, direction
ON public.finance_categories
FOR EACH ROW
EXECUTE FUNCTION public.validate_finance_category_parent();