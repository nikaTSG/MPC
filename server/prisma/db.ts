import "dotenv/config";
import sqlite from "@prisma/orm-sqlite/runtime";
import { contractFromJson } from "@prisma/orm-sqlite/static";
import contractJson from "./contract.json" with { type: "json" };
import type { Contract } from "./contract.js";

export const db = sqlite({
  contract: contractFromJson<Contract>(contractJson),
  path: process.env.DATABASE_URL!.replace(/^file:/, ""),
});