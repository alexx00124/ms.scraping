import dotenv from "dotenv";
import { pathToFileURL } from "url";

dotenv.config({ path: new URL("../../../../.env", import.meta.url) });

// Importar PrismaClient desde la raíz del proyecto usando URL absoluta
const prismaClientPath = new URL("../../../../node_modules/@prisma/client/index.js", import.meta.url);

const { PrismaClient } = await import(prismaClientPath);

export const prisma = new PrismaClient();
