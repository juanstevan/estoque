-- A library file is stored before it is linked to a product or a group.
ALTER TABLE "ProductPhoto" DROP CONSTRAINT IF EXISTS "ProductPhoto_one_owner";
