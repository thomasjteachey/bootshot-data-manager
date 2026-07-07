CREATE ALGORITHM=UNDEFINED
DEFINER=`brokilodeluxe`@`%` SQL SECURITY DEFINER
VIEW `person_name_multi_dob` AS select upper(trim(`person`.`first_name`)) AS `fn`,upper(trim(`person`.`last_name`)) AS `ln`,count(distinct `person`.`dob`) AS `dob_count`,group_concat(distinct date_format(`person`.`dob`,'%Y-%m-%d') order by `person`.`dob` ASC separator ', ') AS `dobs`,count(0) AS `person_rows` from `person` where (`person`.`dob` is not null) group by upper(trim(`person`.`first_name`)),upper(trim(`person`.`last_name`)) having (count(distinct `person`.`dob`) > 1);
