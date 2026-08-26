BEGIN;

UPDATE application_state
SET value = (
  SELECT COALESCE(jsonb_agg(
    CASE WHEN elem ? 'filial'
      THEN (elem - 'filial') || jsonb_build_object('local', elem->'filial')
      ELSE elem
    END
  ), '[]'::jsonb)
  FROM jsonb_array_elements(value) AS elem
)
WHERE collection_name IN ('vehicles', 'blocks')
  AND value IS NOT NULL
  AND jsonb_typeof(value) = 'array';

COMMIT;
