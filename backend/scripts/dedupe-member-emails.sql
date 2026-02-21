WITH ranked AS (
  SELECT id, email, ROW_NUMBER() OVER (PARTITION BY LOWER(TRIM(email)) ORDER BY id ASC) AS rn
  FROM "Member"
  WHERE email IS NOT NULL AND TRIM(email) <> ''
)
UPDATE "Member" m
SET email = NULL
FROM ranked r
WHERE m.id = r.id
  AND r.rn > 1;
