CREATE TABLE `game_sessions` (
	`id` int AUTO_INCREMENT NOT NULL,
	`userId` int,
	`difficulty` enum('Easy','Medium','Hard') NOT NULL,
	`totalQuestions` int NOT NULL DEFAULT 0,
	`correctAnswers` int NOT NULL DEFAULT 0,
	`totalScore` int NOT NULL DEFAULT 0,
	`maxScore` int NOT NULL DEFAULT 0,
	`completedAt` timestamp,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `game_sessions_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `sentences` (
	`id` int AUTO_INCREMENT NOT NULL,
	`text` text NOT NULL,
	`answer` varchar(128) NOT NULL,
	`difficulty` enum('Easy','Medium','Hard') NOT NULL,
	`domain` varchar(64) DEFAULT 'general',
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `sentences_id` PRIMARY KEY(`id`)
);
--> statement-breakpoint
CREATE TABLE `session_answers` (
	`id` int AUTO_INCREMENT NOT NULL,
	`sessionId` int NOT NULL,
	`sentenceId` int NOT NULL,
	`playerAnswer` varchar(256),
	`isCorrect` boolean NOT NULL DEFAULT false,
	`hintUsed` boolean NOT NULL DEFAULT false,
	`pointsEarned` int NOT NULL DEFAULT 0,
	`createdAt` timestamp NOT NULL DEFAULT (now()),
	CONSTRAINT `session_answers_id` PRIMARY KEY(`id`)
);
