-- Photos are always public; only other files choose who sees them.
UPDATE "ProductPhoto" SET "visibility" = 'public' WHERE "kind" <> 'file' AND "contentType" LIKE 'image/%';
