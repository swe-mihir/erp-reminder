import "./env";
import { readFileSync } from "node:fs";
import { db } from "../lib/db";

const sql = db();
await sql.unsafe(readFileSync(new URL("../db/schema.sql", import.meta.url), "utf8"));
console.log("Database schema is up to date.");
await sql.end();
