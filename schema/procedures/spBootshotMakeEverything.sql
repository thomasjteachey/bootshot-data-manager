DELIMITER ;;
CREATE DEFINER=`brokilodeluxe`@`%` PROCEDURE `spBootshotMakeEverything`()
BEGIN
SET FOREIGN_KEY_CHECKS=0;
truncate table person;
truncate table household;
truncate table person_change_log;
SET FOREIGN_KEY_CHECKS=1;
call merge_person_from_exports_with_audit;
call merge_households_from_pantry;
call sweep_person_flavors_by_recency;
END ;;
DELIMITER ;
