import { getDb } from "@/lib/db";
import { env } from "@/lib/env";

export const dynamic = "force-dynamic";

/**
 * For uptime monitors and deploy checks: proves the process is up AND the
 * database answers. Deliberately unauthenticated and deliberately vague —
 * it names the engine, never the connection string.
 */
export async function GET(): Promise<Response> {
  try {
    const db = await getDb();
    await db.get(`SELECT 1 AS ok`);
    return Response.json({
      ok: true,
      database: env.databaseUrl ? "postgres" : "sqlite",
      time: new Date().toISOString(),
    });
  } catch (error) {
    return Response.json(
      { ok: false, error: error instanceof Error ? error.message : "unknown" },
      { status: 503 },
    );
  }
}
