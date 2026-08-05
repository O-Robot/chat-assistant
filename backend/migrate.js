import { closeDatabase, initializeDatabase } from "./db.js";

await initializeDatabase({ migrate: true });
await closeDatabase();
console.log("Database migrations are up to date.");
