import express from "express";
import cors from "cors";
import "dotenv/config";
import { db } from "./prisma/db.js";

const app = express();
app.use(cors());
app.use(express.json());

app.get("/api/health", async (_req, res) => {
  const vessels = await db.orm.Vessel.all();
  res.json({ ok: true, vessels });
});

app.listen(process.env.PORT, () => {
  console.log(`Server running on ${process.env.PORT}`);
});