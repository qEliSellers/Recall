CREATE TABLE `assets` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`key` text NOT NULL,
	`content_type` text NOT NULL,
	`name` text NOT NULL,
	`bytes` integer NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE TABLE `cards` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`external_id` text,
	`content` text NOT NULL,
	`skills` text DEFAULT '[]' NOT NULL,
	`position` integer NOT NULL,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `cards_course_external` ON `cards` (`course_id`,`external_id`);--> statement-breakpoint
CREATE INDEX `cards_unit` ON `cards` (`unit_id`);--> statement-breakpoint
CREATE TABLE `courses` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`name` text NOT NULL,
	`subject` text NOT NULL,
	`is_math` integer DEFAULT 0 NOT NULL,
	`archived` integer DEFAULT 0 NOT NULL,
	`archive_mode` text DEFAULT 'relaxed' NOT NULL,
	`retention` real DEFAULT 0.9 NOT NULL,
	`relaxed_retention` real DEFAULT 0.8 NOT NULL,
	`max_interval` integer DEFAULT 36500 NOT NULL,
	`midterm_unit_id` text,
	`source_url` text,
	`sample` integer DEFAULT 0 NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE INDEX `courses_user` ON `courses` (`user_id`);--> statement-breakpoint
CREATE TABLE `import_batches` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`batch_key` text NOT NULL,
	`hash` text NOT NULL,
	`result` text NOT NULL,
	`created_at` text NOT NULL
);
--> statement-breakpoint
CREATE UNIQUE INDEX `import_once` ON `import_batches` (`user_id`,`batch_key`);--> statement-breakpoint
CREATE TABLE `problem_attempts` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`problem_id` text NOT NULL,
	`session_item_id` text NOT NULL,
	`correct` integer NOT NULL,
	`grade` text NOT NULL,
	`response_ms` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_item_id`) REFERENCES `session_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `problem_attempt_once` ON `problem_attempts` (`session_item_id`);--> statement-breakpoint
CREATE TABLE `problems` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`unit_id` text NOT NULL,
	`external_id` text,
	`content` text NOT NULL,
	`skills` text DEFAULT '[]' NOT NULL,
	`difficulty` integer DEFAULT 2 NOT NULL,
	`hint` text,
	`solution` text,
	`template` text,
	`revision` integer DEFAULT 1 NOT NULL,
	`created_at` text NOT NULL,
	`updated_at` text NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`unit_id`) REFERENCES `units`(`id`) ON UPDATE no action ON DELETE no action
);
--> statement-breakpoint
CREATE UNIQUE INDEX `problems_course_external` ON `problems` (`course_id`,`external_id`);--> statement-breakpoint
CREATE TABLE `reviews` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`card_id` text NOT NULL,
	`session_item_id` text NOT NULL,
	`rating` integer NOT NULL,
	`correct` integer NOT NULL,
	`before` text NOT NULL,
	`after` text NOT NULL,
	`log` text NOT NULL,
	`grade` text NOT NULL,
	`response_ms` integer NOT NULL,
	`created_at` text NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`session_item_id`) REFERENCES `session_items`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE UNIQUE INDEX `review_once` ON `reviews` (`session_item_id`);--> statement-breakpoint
CREATE INDEX `reviews_user_date` ON `reviews` (`user_id`,`created_at`);--> statement-breakpoint
CREATE TABLE `schedules` (
	`card_id` text PRIMARY KEY NOT NULL,
	`introduced_at` text NOT NULL,
	`suspended` integer DEFAULT 0 NOT NULL,
	`due` text NOT NULL,
	`fsrs` text NOT NULL,
	`version` integer DEFAULT 0 NOT NULL,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `session_items` (
	`id` text PRIMARY KEY NOT NULL,
	`session_id` text NOT NULL,
	`position` integer NOT NULL,
	`card_id` text,
	`problem_id` text,
	`unit_id` text NOT NULL,
	`skills` text NOT NULL,
	`snapshot` text NOT NULL,
	`prepared` text NOT NULL,
	`schedule_version` integer,
	`response` text,
	`grade` text,
	`response_ms` integer DEFAULT 0 NOT NULL,
	`answered_at` text,
	`rating` integer,
	`reviewed_at` text,
	FOREIGN KEY (`session_id`) REFERENCES `sessions`(`id`) ON UPDATE no action ON DELETE cascade,
	FOREIGN KEY (`card_id`) REFERENCES `cards`(`id`) ON UPDATE no action ON DELETE set null,
	FOREIGN KEY (`problem_id`) REFERENCES `problems`(`id`) ON UPDATE no action ON DELETE set null
);
--> statement-breakpoint
CREATE UNIQUE INDEX `session_item_position` ON `session_items` (`session_id`,`position`);--> statement-breakpoint
CREATE TABLE `sessions` (
	`id` text PRIMARY KEY NOT NULL,
	`user_id` text NOT NULL,
	`course_id` text NOT NULL,
	`mode` text NOT NULL,
	`options` text NOT NULL,
	`status` text DEFAULT 'active' NOT NULL,
	`created_at` text NOT NULL,
	`completed_at` text,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE INDEX `sessions_user` ON `sessions` (`user_id`);--> statement-breakpoint
CREATE TABLE `units` (
	`id` text PRIMARY KEY NOT NULL,
	`course_id` text NOT NULL,
	`name` text NOT NULL,
	`position` integer NOT NULL,
	FOREIGN KEY (`course_id`) REFERENCES `courses`(`id`) ON UPDATE no action ON DELETE cascade
);
--> statement-breakpoint
CREATE TABLE `user_settings` (
	`user_id` text PRIMARY KEY NOT NULL,
	`settings` text NOT NULL,
	`updated_at` text NOT NULL
);
