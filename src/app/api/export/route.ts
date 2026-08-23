import { currentUser } from "@/lib/auth";
import { exportAccount } from "@/lib/queries";

export const dynamic = "force-dynamic";

/** The whole account as one JSON file — the honest counterpart to deletion. */
export async function GET(): Promise<Response> {
  const user = await currentUser();
  if (!user) return new Response("Sign in first.", { status: 401 });

  const data = await exportAccount(user.id);
  return new Response(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="handled-export.json"',
      "Cache-Control": "no-store",
    },
  });
}
