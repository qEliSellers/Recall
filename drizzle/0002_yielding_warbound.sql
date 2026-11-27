ALTER TABLE `problems` ADD `position` integer DEFAULT 0 NOT NULL;--> statement-breakpoint
WITH old_order AS MATERIALIZED (
  SELECT id, ROW_NUMBER() OVER (PARTITION BY course_id ORDER BY created_at, id) - 1 AS position
  FROM problems
)
UPDATE problems SET position = old_order.position
FROM old_order WHERE problems.id = old_order.id;--> statement-breakpoint
CREATE INDEX `problems_course_position` ON `problems` (`course_id`,`position`);--> statement-breakpoint
CREATE INDEX `cards_course_position` ON `cards` (`course_id`,`position`);
