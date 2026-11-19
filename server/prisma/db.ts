import "dotenv/config";
import { existsSync } from "node:fs";
import sqlite from "@prisma/orm-sqlite/runtime";
import { contractFromJson } from "@prisma/orm-sqlite/static";
import contractJson from "./contract.json" with { type: "json" };
import type { Contract } from "./contract.js";
import {
  databasePathFromUrl,
  defaultDatabasePath,
  localDatabasePath,
} from "./databasePath.js";

const databaseUrl = process.env.DATABASE_URL;
const configuredPath = databaseUrl ? databasePathFromUrl(databaseUrl) : undefined;
const useLocalCopy = process.env.NODE_ENV !== "production" &&
  (!databaseUrl || configuredPath === defaultDatabasePath || configuredPath === localDatabasePath);

if (useLocalCopy && !existsSync(localDatabasePath)) {
  throw new Error(
    "The default local database is not initialized. Start the API with `npm --prefix client run dev`.",
  );
}

if (!useLocalCopy && !databaseUrl) {
  throw new Error("DATABASE_URL must be set when using a non-default database or production mode.");
}

const selectedPath = useLocalCopy
  ? localDatabasePath
  : databaseUrl!.replace(/^file:/, "");

export const db = sqlite({
  contract: contractFromJson<Contract>(contractJson),
  path: selectedPath,
});
