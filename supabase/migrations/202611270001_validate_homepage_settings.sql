-- STAGED ONLY: validate homepage layout before saving. Do not apply to the
-- production project until reviewed and tested against an isolated database.
-- This preserves the existing function signature and privileges.
CREATE OR REPLACE FUNCTION public.newsroom_setting_save(p_key text, p_value jsonb, p_expected_revision bigint)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $function$
DECLARE
  member jsonb;
  existing public.newsroom_settings%ROWTYPE;
  block jsonb;
  block_id bigint;
  seen_ids bigint[] := ARRAY[]::bigint[];
BEGIN
  member := public.newsroom_me();
  IF member->>'role' NOT IN ('owner','editor') THEN
    RAISE EXCEPTION 'Only editors can change settings' USING ERRCODE='42501';
  END IF;
  IF p_key NOT IN ('ads_enabled','comments','contact','crawl','elections_update','email_notifications','homepage','live_updates','notice','site_link') OR p_value IS NULL OR octet_length(p_value::text)>65536 THEN
    RAISE EXCEPTION 'Invalid setting' USING ERRCODE='22023';
  END IF;
  IF p_key='ads_enabled' AND jsonb_typeof(p_value) <> 'boolean' THEN
    RAISE EXCEPTION 'Ads switch must be a boolean' USING ERRCODE='22023';
  END IF;
  IF p_key<>'ads_enabled' AND jsonb_typeof(p_value) <> 'object' THEN
    RAISE EXCEPTION 'Setting must be an object' USING ERRCODE='22023';
  END IF;
  IF p_key='homepage' THEN
    IF jsonb_typeof(p_value->'blocks') IS DISTINCT FROM 'array' THEN
      RAISE EXCEPTION 'Homepage blocks must be an array' USING ERRCODE='22023';
    END IF;
    IF jsonb_array_length(p_value->'blocks') > 100 OR EXISTS (SELECT 1 FROM jsonb_object_keys(p_value) k WHERE k <> 'blocks') THEN
      RAISE EXCEPTION 'Invalid homepage layout' USING ERRCODE='22023';
    END IF;
    FOR block IN SELECT value FROM jsonb_array_elements(p_value->'blocks') LOOP
      IF jsonb_typeof(block) IS DISTINCT FROM 'object'
         OR jsonb_typeof(block->'id') IS DISTINCT FROM 'number'
         OR (block->>'id') !~ '^[1-9][0-9]{0,14}$'
         OR jsonb_typeof(block->'enabled') IS DISTINCT FROM 'boolean'
         OR EXISTS (SELECT 1 FROM jsonb_object_keys(block) k WHERE k NOT IN ('id','enabled')) THEN
        RAISE EXCEPTION 'Invalid homepage block' USING ERRCODE='22023';
      END IF;
      block_id := (block->>'id')::bigint;
      IF block_id = ANY(seen_ids) OR NOT EXISTS (SELECT 1 FROM public.newsroom_sections WHERE id=block_id) THEN
        RAISE EXCEPTION 'Duplicate or unknown homepage section' USING ERRCODE='22023';
      END IF;
      seen_ids := array_append(seen_ids, block_id);
    END LOOP;
  END IF;
  SELECT * INTO existing FROM public.newsroom_settings WHERE key=p_key FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Setting not found' USING ERRCODE='P0002'; END IF;
  IF p_expected_revision IS NULL OR p_expected_revision<>existing.revision THEN
    RAISE EXCEPTION 'Setting changed elsewhere; reload before saving' USING ERRCODE='40001';
  END IF;
  UPDATE public.newsroom_settings SET value=p_value,revision=revision+1,modified_at=now() WHERE key=p_key RETURNING * INTO existing;
  RETURN jsonb_build_object('key',existing.key,'value',existing.value,'revision',existing.revision);
END;
$function$;
