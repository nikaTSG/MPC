import "dotenv/config";
import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import sqlite from "@prisma/orm-sqlite/runtime";
import { contractFromJson } from "@prisma/orm-sqlite/static";
import contractJson from "./contract.json" with { type: "json" };
import type { Contract } from "./contract.js";

const configuredPath = process.env.DATABASE_URL!.replace(/^file:/, "");
const defaultPath = fileURLToPath(new URL("./dev.db", import.meta.url));
const localPath = fileURLToPath(new URL("./dev.db.local", import.meta.url));
const useLocalCopy = process.env.NODE_ENV !== "production" &&
  resolve(configuredPath) === defaultPath && existsSync(localPath);

export const db = sqlite({
  contract: contractFromJson<Contract>(contractJson),
  path: useLocalCopy ? localPath : configuredPath,
});
