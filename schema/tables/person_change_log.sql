CREATE TABLE `person_change_log` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `person_id` bigint unsigned NOT NULL,
  `source` enum('clinic','pharmacy','pantry') NOT NULL,
  `source_row_id` bigint unsigned DEFAULT NULL,
  `field_name` varchar(64) NOT NULL,
  `old_value` text,
  `new_value` text,
  `changed_at` timestamp NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_person_source` (`person_id`,`source`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
