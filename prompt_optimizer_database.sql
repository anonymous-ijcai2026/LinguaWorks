-- Create a database
CREATE DATABASE IF NOT EXISTS `prompt_optimizer` DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

USE `prompt_optimizer`;

-- ========================================
-- Definition of core business table structure
-- ========================================
--
-- Table structure: custom_analysis_methods
-- Function: Store user-defined analysis methods
-- Description: Allows users to create and manage their own analysis methods, and supports personalized analysis processes
--
DROP TABLE IF EXISTS `custom_analysis_methods`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `custom_analysis_methods` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT '1',
  `method_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `label` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `description` text COLLATE utf8mb4_unicode_ci,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_method` (`user_id`,`method_key`),
  KEY `idx_custom_methods_user` (`user_id`),
  CONSTRAINT `custom_analysis_methods_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=3 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure: messages
-- Function: Store all message records in the session
-- Description: Record the interaction messages between users and the system, and support message management for multi-step optimization processes
--

DROP TABLE IF EXISTS `messages`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `type` enum('user','assistant') COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `thinking` text COLLATE utf8mb4_unicode_ci,
  `original_content` text COLLATE utf8mb4_unicode_ci,
  `is_editable` tinyint(1) DEFAULT '1',
  `step` enum('structure','analysis','generation','optimization','testing') COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `timestamp` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `metadata` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_session_timestamp` (`session_id`,`timestamp`),
  KEY `idx_messages_session_step` (`session_id`,`step`),
  KEY `idx_messages_updated_at` (`updated_at`),
  KEY `idx_messages_editable` (`is_editable`),
  KEY `idx_messages_thinking` (`thinking`(100)),
  CONSTRAINT `messages_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=645 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure: prompt_versions
-- Function: Store different versions of prompts
-- Description: Manage the version history of prompts, support version comparison and rollback functions
--

DROP TABLE IF EXISTS `prompt_versions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `prompt_versions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `version_number` int NOT NULL,
  `version_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `prompt_content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `test_result` text COLLATE utf8mb4_unicode_ci,
  `version_type` enum('original','optimized','user_modified') COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `metadata` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_session_version` (`session_id`,`version_number`),
  KEY `idx_session_versions` (`session_id`,`version_number`),
  KEY `idx_versions_session_type` (`session_id`,`version_type`),
  KEY `idx_versions_created` (`created_at` DESC),
  CONSTRAINT `prompt_versions_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=8 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure: selected_analysis_methods
-- Function: Store the analysis methods selected by the user
-- Description: Records the analysis methods enabled by each user and supports personalized analysis configuration
--

DROP TABLE IF EXISTS `selected_analysis_methods`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `selected_analysis_methods` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT '1',
  `method_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `agent_type` enum('system','custom') COLLATE utf8mb4_unicode_ci DEFAULT 'system',
  `is_selected` tinyint(1) DEFAULT '1',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_method_selection` (`user_id`,`method_key`),
  KEY `idx_selected_methods_user` (`user_id`,`is_selected`),
  CONSTRAINT `selected_analysis_methods_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=432 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `session_with_message_count`
--

DROP TABLE IF EXISTS `session_with_message_count`;
/*!50001 DROP VIEW IF EXISTS `session_with_message_count`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `session_with_message_count` AS SELECT 
 1 AS `id`,
 1 AS `user_id`,
 1 AS `name`,
 1 AS `current_step`,
 1 AS `created_at`,
 1 AS `updated_at`,
 1 AS `message_count`,
 1 AS `last_message_time`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure: sessions
-- Function: Store optimized session information
-- Description: Manage Prompt optimization sessions, track the progress and status of optimization
--

DROP TABLE IF EXISTS `sessions`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `sessions` (
  `id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `user_id` int DEFAULT '1',
  `name` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `current_step` enum('structure','analysis','generation','optimization','testing') COLLATE utf8mb4_unicode_ci DEFAULT 'structure',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `has_error` tinyint(1) DEFAULT '0',
  `error_message` text COLLATE utf8mb4_unicode_ci,
  `error_step` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `retry_data` text COLLATE utf8mb4_unicode_ci,
  PRIMARY KEY (`id`),
  KEY `idx_sessions_user_created` (`user_id`,`created_at` DESC),
  CONSTRAINT `sessions_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Temporary view structure for view `user_analysis_methods`
--

DROP TABLE IF EXISTS `user_analysis_methods`;
/*!50001 DROP VIEW IF EXISTS `user_analysis_methods`*/;
SET @saved_cs_client     = @@character_set_client;
/*!50503 SET character_set_client = utf8mb4 */;
/*!50001 CREATE VIEW `user_analysis_methods` AS SELECT 
 1 AS `user_id`,
 1 AS `method_type`,
 1 AS `method_key`,
 1 AS `label`,
 1 AS `description`,
 1 AS `is_custom`,
 1 AS `is_selected`*/;
SET character_set_client = @saved_cs_client;

--
-- Table structure: user_settings
-- Function: Store user configuration information
-- Note: Save the user's personal Settings, such as AI model configuration, interface preferences, etc
--

DROP TABLE IF EXISTS `user_settings`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `user_settings` (
  `id` int NOT NULL AUTO_INCREMENT,
  `user_id` int DEFAULT '1',
  `setting_key` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL,
  `setting_value` json NOT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_user_setting` (`user_id`,`setting_key`),
  KEY `idx_settings_user_key` (`user_id`,`setting_key`),
  CONSTRAINT `user_settings_ibfk_1` FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB AUTO_INCREMENT=312 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;

--
-- Table structure: users
-- Function: Store basic user information
-- Description: The core table for user management, supporting multi-user data isolation
--

DROP TABLE IF EXISTS `users`;
/*!40101 SET @saved_cs_client     = @@character_set_client */;
/*!50503 SET character_set_client = utf8mb4 */;
CREATE TABLE `users` (
  `id` int NOT NULL AUTO_INCREMENT,
  `username` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `email` varchar(100) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `username` (`username`),
  UNIQUE KEY `email` (`email`)
) ENGINE=InnoDB AUTO_INCREMENT=2 DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
/*!40101 SET character_set_client = @saved_cs_client */;


-- ========================================
-- Stored procedure definition
-- ========================================
-- Function: Provide an encapsulated interface for database operations to enhance performance and security
-- ========================================
--
-- Stored procedure: GetUserAnalysisMethods
-- Function: Obtain the list of users' analysis methods
-- Parameter: p_user_id - user ID
-- Return: All analysis methods available to the user (including system default and custom)
--
/*!50003 DROP PROCEDURE IF EXISTS `GetUserAnalysisMethods` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = gbk */ ;
/*!50003 SET character_set_results = gbk */ ;
/*!50003 SET collation_connection  = gbk_chinese_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` PROCEDURE `GetUserAnalysisMethods`(IN p_user_id INT)
BEGIN
    SELECT * FROM user_analysis_methods WHERE user_id = p_user_id ORDER BY is_custom, method_key;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;
--
-- Stored procedure: SaveUserSelectedMethods
-- Function: Save the analysis methods selected by the user
-- Parameters: p_user_id - user ID, p_methods - list of selected methods (JSON format)
-- Description: Batch update the user's analysis method selection status
--
/*!50003 DROP PROCEDURE IF EXISTS `SaveUserSelectedMethods` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = gbk */ ;
/*!50003 SET character_set_results = gbk */ ;
/*!50003 SET collation_connection  = gbk_chinese_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` PROCEDURE `SaveUserSelectedMethods`(IN p_user_id INT, IN p_methods JSON)
BEGIN
    DECLARE done INT DEFAULT FALSE;
    DECLARE method_key VARCHAR(100);
    DECLARE method_cursor CURSOR FOR 
        SELECT JSON_UNQUOTE(JSON_EXTRACT(p_methods, CONCAT('$[', idx, ']')))
        FROM (
            SELECT 0 as idx UNION SELECT 1 UNION SELECT 2 UNION SELECT 3 UNION SELECT 4 UNION 
            SELECT 5 UNION SELECT 6 UNION SELECT 7 UNION SELECT 8 UNION SELECT 9 UNION
            SELECT 10 UNION SELECT 11 UNION SELECT 12 UNION SELECT 13 UNION SELECT 14 UNION
            SELECT 15 UNION SELECT 16 UNION SELECT 17 UNION SELECT 18 UNION SELECT 19
        ) numbers
        WHERE idx < JSON_LENGTH(p_methods);
    DECLARE CONTINUE HANDLER FOR NOT FOUND SET done = TRUE;

    
    UPDATE selected_analysis_methods SET is_selected = FALSE WHERE user_id = p_user_id;
    
    
    OPEN method_cursor;
    read_loop: LOOP
        FETCH method_cursor INTO method_key;
        IF done THEN
            LEAVE read_loop;
        END IF;
        
        INSERT INTO selected_analysis_methods (user_id, method_key, is_selected)
        VALUES (p_user_id, method_key, TRUE)
        ON DUPLICATE KEY UPDATE is_selected = TRUE;
    END LOOP;
    CLOSE method_cursor;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

-- ========================================
-- view definition
-- ========================================
-- Function: Provide a simplified interface for complex queries and optimize data access performance
-- ========================================

--
-- View: session_with_message_count
-- Function: Session information and message statistics
-- Note: The aggregation displays the basic information of each session and the statistics of the number of messages
--

/*!50001 DROP VIEW IF EXISTS `session_with_message_count`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = gbk */;
/*!50001 SET character_set_results     = gbk */;
/*!50001 SET collation_connection      = gbk_chinese_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `session_with_message_count` AS select `s`.`id` AS `id`,`s`.`user_id` AS `user_id`,`s`.`name` AS `name`,`s`.`current_step` AS `current_step`,`s`.`created_at` AS `created_at`,`s`.`updated_at` AS `updated_at`,count(`m`.`id`) AS `message_count`,max(`m`.`timestamp`) AS `last_message_time` from (`sessions` `s` left join `messages` `m` on((`s`.`id` = `m`.`session_id`))) group by `s`.`id` */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;

--
-- View: user_analysis_methods
-- Function: Complete view of user analysis methods
-- Description: Integrate the system's default methods and user-defined methods, and display the selection status
--

/*!50001 DROP VIEW IF EXISTS `user_analysis_methods`*/;
/*!50001 SET @saved_cs_client          = @@character_set_client */;
/*!50001 SET @saved_cs_results         = @@character_set_results */;
/*!50001 SET @saved_col_connection     = @@collation_connection */;
/*!50001 SET character_set_client      = gbk */;
/*!50001 SET character_set_results     = gbk */;
/*!50001 SET collation_connection      = gbk_chinese_ci */;
/*!50001 CREATE ALGORITHM=UNDEFINED */
/*!50013 DEFINER=`root`@`localhost` SQL SECURITY DEFINER */
/*!50001 VIEW `user_analysis_methods` AS select `u`.`id` AS `user_id`,'default' AS `method_type`,'anchoring_target' AS `method_key`,'Intent anchoring analysis' AS `label`,'Extract information based on pragmatic intention analysis, parse pragmatic intentions and define core goals' AS `description`,false AS `is_custom`,coalesce(`sam`.`is_selected`,false) AS `is_selected` from (`users` `u` left join `selected_analysis_methods` `sam` on(((`u`.`id` = `sam`.`user_id`) and (`sam`.`method_key` = 'anchoring_target')))) union all select `u`.`id` AS `user_id`,'default' AS `method_type`,'activate_role' AS `method_key`,'Role Activation Analysis' AS `label`,'Assign appropriate roles, thinking patterns and domain knowledge to the large model' AS `description`,false AS `is_custom`,coalesce(`sam`.`is_selected`,false) AS `is_selected` from (`users` `u` left join `selected_analysis_methods` `sam` on(((`u`.`id` = `sam`.`user_id`) and (`sam`.`method_key` = 'activate_role')))) union all select `u`.`id` AS `user_id`,'default' AS `method_type`,'disassembly_task' AS `method_key`,'Task decomposition and analysis' AS `label`,'Decompose the task requirements prompted by users according to the hierarchical structure' AS `description`,false AS `is_custom`,coalesce(`sam`.`is_selected`,false) AS `is_selected` from (`users` `u` left join `selected_analysis_methods` `sam` on(((`u`.`id` = `sam`.`user_id`) and (`sam`.`method_key` = 'disassembly_task')))) union all select `u`.`id` AS `user_id`,'default' AS `method_type`,'expand_thinking' AS `method_key`,'Thinking expansion analysis' AS `label`,'Expand the thinking dimension of the prompt and improve the depth and breadth of thinking' AS `description`,false AS `is_custom`,coalesce(`sam`.`is_selected`,false) AS `is_selected` from (`users` `u` left join `selected_analysis_methods` `sam` on(((`u`.`id` = `sam`.`user_id`) and (`sam`.`method_key` = 'expand_thinking')))) union all select `u`.`id` AS `user_id`,'default' AS `method_type`,'focus_subject' AS `method_key`,'Subject focus analysis' AS `label`,'Identify and highlight the core subject of the prompt to ensure clear focus' AS `description`,false AS `is_custom`,coalesce(`sam`.`is_selected`,false) AS `is_selected` from (`users` `u` left join `selected_analysis_methods` `sam` on(((`u`.`id` = `sam`.`user_id`) and (`sam`.`method_key` = 'focus_subject')))) union all select `u`.`id` AS `user_id`,'default' AS `method_type`,'input_extract' AS `method_key`,'Input information extraction' AS `label`,'Extract key information and data points from user input' AS `description`,false AS `is_custom`,coalesce(`sam`.`is_selected`,false) AS `is_selected` from (`users` `u` left join `selected_analysis_methods` `sam` on(((`u`.`id` = `sam`.`user_id`) and (`sam`.`method_key` = 'input_extract')))) union all select `u`.`id` AS `user_id`,'default' AS `method_type`,'examples_extract' AS `method_key`,'Example extraction and analysis' AS `label`,'Identify and analyze examples within the prompt for better understanding' AS `description`,false AS `is_custom`,coalesce(`sam`.`is_selected`,false) AS `is_selected` from (`users` `u` left join `selected_analysis_methods` `sam` on(((`u`.`id` = `sam`.`user_id`) and (`sam`.`method_key` = 'examples_extract')))) union all select `cam`.`user_id` AS `user_id`,'custom' AS `method_type`,`cam`.`method_key` AS `method_key`,`cam`.`label` AS `label`,`cam`.`description` AS `description`,true AS `is_custom`,coalesce(`sam`.`is_selected`,false) AS `is_selected` from (`custom_analysis_methods` `cam` left join `selected_analysis_methods` `sam` on(((`cam`.`user_id` = `sam`.`user_id`) and (`cam`.`method_key` = `sam`.`method_key`)))) */;
/*!50001 SET character_set_client      = @saved_cs_client */;
/*!50001 SET character_set_results     = @saved_cs_results */;
/*!50001 SET collation_connection      = @saved_col_connection */;
/*!40103 SET TIME_ZONE=@OLD_TIME_ZONE */;

/*!40101 SET SQL_MODE=@OLD_SQL_MODE */;
/*!40014 SET FOREIGN_KEY_CHECKS=@OLD_FOREIGN_KEY_CHECKS */;
/*!40014 SET UNIQUE_CHECKS=@OLD_UNIQUE_CHECKS */;
/*!40101 SET CHARACTER_SET_CLIENT=@OLD_CHARACTER_SET_CLIENT */;
/*!40101 SET CHARACTER_SET_RESULTS=@OLD_CHARACTER_SET_RESULTS */;
/*!40101 SET COLLATION_CONNECTION=@OLD_COLLATION_CONNECTION */;
/*!40111 SET SQL_NOTES=@OLD_SQL_NOTES */;

-- Dump completed on 2025-08-25 22:13:14

-- ========================================
-- Chat test menu structure
-- ========================================
-- Function: Supports Prompt version chat testing and effect evaluation
-- Description: It provides complete test session management and statistical analysis functions
-- ========================================

-- Drop chat test tables in correct order (child tables first)
DROP TABLE IF EXISTS `chat_test_statistics`;
DROP TABLE IF EXISTS `chat_test_messages`;
DROP TABLE IF EXISTS `chat_test_sessions`;

--
-- Table structure: chat_test_sessions
-- Function: Chat test session management
-- Note: Each Prompt version can create multiple test sessions to evaluate performance in different scenarios
--
CREATE TABLE `chat_test_sessions` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `version_id` int NOT NULL,
  `test_session_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT 'Chat Test Session',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `is_active` tinyint(1) DEFAULT '1',
  PRIMARY KEY (`id`),
  KEY `idx_chat_sessions_session_version` (`session_id`, `version_id`),
  KEY `idx_chat_sessions_created` (`created_at` DESC),
  CONSTRAINT `chat_test_sessions_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chat_test_sessions_ibfk_2` FOREIGN KEY (`version_id`) REFERENCES `prompt_versions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure: chat_test_messages
-- Function: Chat test message recording
-- Description: Stores message records in each test session and supports complete conversation history tracking
--
CREATE TABLE `chat_test_messages` (
  `id` int NOT NULL AUTO_INCREMENT,
  `chat_session_id` int NOT NULL,
  `message_type` enum('user','assistant') COLLATE utf8mb4_unicode_ci NOT NULL,
  `content` text COLLATE utf8mb4_unicode_ci NOT NULL,
  `message_order` int NOT NULL DEFAULT '0',
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `response_time_ms` int DEFAULT NULL,
  `token_count` int DEFAULT NULL,
  `metadata` json DEFAULT NULL,
  PRIMARY KEY (`id`),
  KEY `idx_chat_messages_session_order` (`chat_session_id`, `message_order`),
  KEY `idx_chat_messages_created` (`created_at` DESC),
  CONSTRAINT `chat_test_messages_ibfk_1` FOREIGN KEY (`chat_session_id`) REFERENCES `chat_test_sessions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- Table structure: chat_test_statistics
-- Function: Chat test statistics
-- Description: Store test statistics for each Prompt version for performance analysis and comparison
--
CREATE TABLE `chat_test_statistics` (
  `id` int NOT NULL AUTO_INCREMENT,
  `session_id` varchar(36) COLLATE utf8mb4_unicode_ci NOT NULL,
  `version_id` int NOT NULL,
  `total_conversations` int DEFAULT '0',
  `total_user_messages` int DEFAULT '0',
  `total_assistant_messages` int DEFAULT '0',
  `avg_response_time_ms` decimal(10,2) DEFAULT NULL,
  `total_tokens` int DEFAULT '0',
  `last_test_at` timestamp NULL DEFAULT NULL,
  `created_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` timestamp NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `unique_session_version_stats` (`session_id`, `version_id`),
  KEY `idx_stats_session_version` (`session_id`, `version_id`),
  CONSTRAINT `chat_test_statistics_ibfk_1` FOREIGN KEY (`session_id`) REFERENCES `sessions` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chat_test_statistics_ibfk_2` FOREIGN KEY (`version_id`) REFERENCES `prompt_versions` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

--
-- View: chat_test_session_details
-- Function: Chat test session details view
-- Description: Integrate test sessions, version information, and statistics to provide a complete test overview
--
CREATE OR REPLACE VIEW `chat_test_session_details` AS
SELECT 
    cts.id as chat_session_id,
    cts.session_id,
    cts.version_id,
    cts.test_session_name,
    cts.created_at as chat_session_created,
    cts.is_active,
    pv.version_name,
    pv.prompt_content,
    pv.version_type,
    COALESCE(stats.total_conversations, 0) as total_conversations,
    COALESCE(stats.total_user_messages, 0) as total_user_messages,
    COALESCE(stats.total_assistant_messages, 0) as total_assistant_messages,
    stats.avg_response_time_ms,
    stats.last_test_at,
    (
        SELECT COUNT(*) 
        FROM chat_test_messages ctm 
        WHERE ctm.chat_session_id = cts.id
    ) as total_messages
FROM chat_test_sessions cts
LEFT JOIN prompt_versions pv ON cts.version_id = pv.id
LEFT JOIN chat_test_statistics stats ON cts.session_id = stats.session_id AND cts.version_id = stats.version_id;

--
-- Stored procedure: GetChatTestHistory
-- Function: Obtain the chat test history
-- Parameters: p_session_id - session ID, p_version_id - version ID, p_limit - returns the limit on the number of records
-- Return: The test message history of the specified version
--
/*!50003 DROP PROCEDURE IF EXISTS `GetChatTestHistory` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` PROCEDURE `GetChatTestHistory`(
    IN p_session_id VARCHAR(36),
    IN p_version_id INT,
    IN p_limit INT
)
BEGIN
    SELECT 
        ctm.id,
        ctm.message_type,
        ctm.content,
        ctm.message_order,
        ctm.created_at,
        ctm.response_time_ms,
        ctm.token_count
    FROM chat_test_messages ctm
    INNER JOIN chat_test_sessions cts ON ctm.chat_session_id = cts.id
    WHERE cts.session_id = p_session_id 
        AND cts.version_id = p_version_id
        AND cts.is_active = 1
    ORDER BY ctm.message_order ASC, ctm.created_at ASC
    LIMIT p_limit;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;

--
-- Stored procedure: SaveChatTestMessage
-- Function: Save chat test messages
-- Parameters: Include test data such as session information, message content, and response time
-- Description: Automatically create a test session (if not present) and update the statistics
--
/*!50003 DROP PROCEDURE IF EXISTS `SaveChatTestMessage` */;
/*!50003 SET @saved_cs_client      = @@character_set_client */ ;
/*!50003 SET @saved_cs_results     = @@character_set_results */ ;
/*!50003 SET @saved_col_connection = @@collation_connection */ ;
/*!50003 SET character_set_client  = utf8mb4 */ ;
/*!50003 SET character_set_results = utf8mb4 */ ;
/*!50003 SET collation_connection  = utf8mb4_unicode_ci */ ;
/*!50003 SET @saved_sql_mode       = @@sql_mode */ ;
/*!50003 SET sql_mode              = 'ONLY_FULL_GROUP_BY,STRICT_TRANS_TABLES,NO_ZERO_IN_DATE,NO_ZERO_DATE,ERROR_FOR_DIVISION_BY_ZERO,NO_ENGINE_SUBSTITUTION' */ ;
DELIMITER ;;
CREATE DEFINER=`root`@`localhost` PROCEDURE `SaveChatTestMessage`(
    IN p_session_id VARCHAR(36),
    IN p_version_id INT,
    IN p_message_type ENUM('user','assistant'),
    IN p_content TEXT,
    IN p_response_time_ms INT,
    IN p_token_count INT,
    IN p_metadata JSON
)
BEGIN
    DECLARE v_chat_session_id INT;
    DECLARE v_message_order INT DEFAULT 0;
    
    -- Get or create chat test session
    SELECT id INTO v_chat_session_id
    FROM chat_test_sessions
    WHERE session_id = p_session_id AND version_id = p_version_id AND is_active = 1
    LIMIT 1;
    
    IF v_chat_session_id IS NULL THEN
        INSERT INTO chat_test_sessions (session_id, version_id, test_session_name)
        VALUES (p_session_id, p_version_id, CONCAT('Chat Test - Version ', p_version_id));
        SET v_chat_session_id = LAST_INSERT_ID();
    END IF;
    
    -- Get next message order
    SELECT COALESCE(MAX(message_order), 0) + 1 INTO v_message_order
    FROM chat_test_messages
    WHERE chat_session_id = v_chat_session_id;
    
    -- Insert message
    INSERT INTO chat_test_messages (
        chat_session_id, message_type, content, message_order, 
        response_time_ms, token_count, metadata
    ) VALUES (
        v_chat_session_id, p_message_type, p_content, v_message_order,
        p_response_time_ms, p_token_count, p_metadata
    );
    
    -- Update statistics
    INSERT INTO chat_test_statistics (
        session_id, version_id, total_conversations, total_user_messages, 
        total_assistant_messages, last_test_at
    ) VALUES (
        p_session_id, p_version_id, 1, 
        CASE WHEN p_message_type = 'user' THEN 1 ELSE 0 END,
        CASE WHEN p_message_type = 'assistant' THEN 1 ELSE 0 END,
        NOW()
    )
    ON DUPLICATE KEY UPDATE
        total_user_messages = total_user_messages + CASE WHEN p_message_type = 'user' THEN 1 ELSE 0 END,
        total_assistant_messages = total_assistant_messages + CASE WHEN p_message_type = 'assistant' THEN 1 ELSE 0 END,
        last_test_at = NOW();
        
    SELECT LAST_INSERT_ID() as message_id;
END ;;
DELIMITER ;
/*!50003 SET sql_mode              = @saved_sql_mode */ ;
/*!50003 SET character_set_client  = @saved_cs_client */ ;
/*!50003 SET character_set_results = @saved_cs_results */ ;
/*!50003 SET collation_connection  = @saved_col_connection */ ;