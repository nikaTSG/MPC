import "dotenv/config";
import { pathToFileURL } from "node:url";
import { definePrismaConfig } from "prisma/config";
import { defineConfig as ormConfig } from "@prisma/orm-sqlite/config";
import { databasePathFromUrl, defaultDatabasePath, localDatabasePath } from "./prisma/databasePath.js";

const databaseUrl = process.env.DATABASE_URL;
const configuredPath = databaseUrl ? databasePathFromUrl(databaseUrl) : undefined;
const isDefaultDatabase =
  !databaseUrl || configuredPath === defaultDatabasePath || configuredPath === localDatabasePath;
const connection = process.env.NODE_ENV === "production"
  ? databaseUrl
  : isDefaultDatabase
    ? pathToFileURL(localDatabasePath).href
    : databaseUrl;

if (!connection) {
  throw new Error("DATABASE_URL must be set in production.");
}

export default definePrismaConfig({
  orm: ormConfig({
    contract: "./prisma/contract.prisma",
    db: {
      connection,
    },
  }),
});
