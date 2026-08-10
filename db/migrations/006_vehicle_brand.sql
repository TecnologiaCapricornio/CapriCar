ALTER TABLE vehicles ADD COLUMN IF NOT EXISTS brand VARCHAR(120);

UPDATE vehicles
   SET brand = SPLIT_PART(BTRIM(model), ' ', 1),
       model = CASE
         WHEN POSITION(' ' IN BTRIM(model)) > 0
           THEN SUBSTRING(BTRIM(model) FROM POSITION(' ' IN BTRIM(model)) + 1)
         ELSE model
       END
 WHERE brand IS NULL OR BTRIM(brand) = '';

ALTER TABLE vehicles ALTER COLUMN brand SET NOT NULL;
