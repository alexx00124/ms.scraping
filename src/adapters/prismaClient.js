import dotenv from "dotenv";
import { PrismaClient } from "@prisma/client";

dotenv.config({ path: new URL("../../../.env", import.meta.url) });

export const prisma = new PrismaClient();
