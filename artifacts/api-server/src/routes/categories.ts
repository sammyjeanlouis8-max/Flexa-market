import { Router } from "express";
import { db, categoriesTable } from "@workspace/db";
import { asc, isNull } from "drizzle-orm";

const router = Router();

router.get("/categories", async (_req, res): Promise<void> => {
  const all = await db.select().from(categoriesTable).orderBy(asc(categoriesTable.name));

  const parentMap = new Map<number, typeof all[0] & { children: typeof all }>();
  const parents: (typeof all[0] & { children: typeof all })[] = [];

  for (const cat of all) {
    if (cat.parentId === null) {
      const withChildren = { ...cat, children: [] as typeof all };
      parentMap.set(cat.id, withChildren);
      parents.push(withChildren);
    }
  }
  for (const cat of all) {
    if (cat.parentId !== null) {
      const parent = parentMap.get(cat.parentId);
      if (parent) parent.children.push(cat);
    }
  }

  res.json(parents);
});

export default router;
