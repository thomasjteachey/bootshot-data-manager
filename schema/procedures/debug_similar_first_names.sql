DELIMITER ;;
CREATE DEFINER=`brokilodeluxe`@`%` PROCEDURE `debug_similar_first_names`(
    IN p_min_ratio      DECIMAL(5,4),   -- e.g. 0.90
    IN p_same_lastname  TINYINT(1),     -- 1 = only compare within same last name
    IN p_same_dob       TINYINT(1),     -- 1 = also require same DOB
    IN p_lastname_like  VARCHAR(100),   -- optional filter, e.g. 'BRO%'
    IN p_limit_rows     INT             -- cap results, e.g. 500
)
BEGIN
  DECLARE v_limit INT DEFAULT 500;
  DECLARE v_lastname_like VARCHAR(100);

  SET v_limit = IFNULL(p_limit_rows, 500);
  SET v_lastname_like = NULLIF(TRIM(p_lastname_like), '');

  WITH base AS (
    SELECT
      patient_id,
      first_name,
      last_name,
      UPPER(TRIM(first_name)) AS fn_norm,
      UPPER(TRIM(last_name))  AS ln_norm,
      dob
    FROM person
    WHERE first_name IS NOT NULL AND TRIM(first_name) <> ''
  )
  SELECT
      a.patient_id AS person_id_a,
      b.patient_id AS person_id_b,
      a.first_name AS first_a,
      b.first_name AS first_b,
      a.last_name  AS last_a,
      b.last_name  AS last_b,
      DATE_FORMAT(a.dob,'%Y-%m-%d') AS dob_a,
      DATE_FORMAT(b.dob,'%Y-%m-%d') AS dob_b,
      bootshot_name_sim_ratio(a.fn_norm, b.fn_norm) AS sim_ratio,
      HEX(a.first_name) AS first_a_hex,
      HEX(b.first_name) AS first_b_hex
  FROM base a
  JOIN base b
    ON a.patient_id < b.patient_id
   AND (p_same_lastname = 0 OR a.ln_norm = b.ln_norm)
   AND (p_same_dob      = 0 OR (a.dob <=> b.dob))
   AND (v_lastname_like IS NULL
        OR a.ln_norm LIKE UPPER(v_lastname_like)
        OR b.ln_norm LIKE UPPER(v_lastname_like))
  HAVING sim_ratio >= p_min_ratio
  ORDER BY sim_ratio DESC, last_a, first_a
  LIMIT v_limit;
END ;;
DELIMITER ;
