ALTER TABLE "users" ADD COLUMN "name_key" text;
--> statement-breakpoint
UPDATE "users" SET "name_key" = lower(trim(regexp_replace(translate(regexp_replace("name", '[ًٌٍؘَؙُؚِّْٰٕٖٜٟؐؑؒؓؔؕؖؗٓٔٗ٘ٙٚٛٝٞۖۗۘۙۚۛۜ۝۞ۣ۟۠ۡۢۤۥۦۧۨ۩۪ۭ۫۬ـ]', '', 'g'), 'أإآةى', 'اااهي'), '\s+', ' ', 'g')));
--> statement-breakpoint
WITH ranked AS (
	SELECT
		u.id,
		u.name_key,
		row_number() OVER (
			PARTITION BY u.name_key
			ORDER BY (SELECT count(*) FROM memories m WHERE m.user_id = u.id) DESC, u.created_at ASC
		) AS rnk
	FROM "users" u
),
moved AS (
	UPDATE "memories" m
	SET user_id = survivor.id
	FROM ranked loser
	JOIN ranked survivor ON survivor.name_key = loser.name_key AND survivor.rnk = 1
	WHERE m.user_id = loser.id AND loser.rnk > 1
	RETURNING m.id
),
removed AS (
	DELETE FROM "users" u
	USING ranked r
	WHERE u.id = r.id AND r.rnk > 1
	RETURNING u.id
)
SELECT 1;
--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "name_key" SET NOT NULL;
--> statement-breakpoint
CREATE UNIQUE INDEX "users_name_key_idx" ON "users" USING btree ("name_key");
