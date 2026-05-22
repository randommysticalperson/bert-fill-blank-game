ALTER TABLE `session_answers` MODIFY COLUMN `playerAnswer` varchar(512);--> statement-breakpoint
ALTER TABLE `game_sessions` ADD `gameMode` enum('classic','consecutive','parallel') DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE `sentences` ADD `masks` text DEFAULT ('[]') NOT NULL;--> statement-breakpoint
ALTER TABLE `sentences` ADD `gameMode` enum('classic','consecutive','parallel') DEFAULT 'classic' NOT NULL;--> statement-breakpoint
ALTER TABLE `session_answers` ADD `maskIndex` int DEFAULT 0 NOT NULL;