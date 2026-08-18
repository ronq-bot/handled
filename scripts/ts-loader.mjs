/**
 * Minimal resolver so plain `node` can import the app's TypeScript modules the
 * way Next does: extensionless relative specifiers, the `@/` alias, and the
 * `server-only` marker package (which is a no-op outside a bundler).
 * Node ≥22.18 strips the types itself; this only fixes resolution.
 */
import { pathToFileURL } from "node:url";
import path from "node:path";

const SRC = pathToFileURL(path.join(process.cwd(), "src") + path.sep).href;
const STUB = "data:text/javascript,export{}";

// Next's request-scoped APIs don't resolve outside its bundler. The scripts
// only import modules that *call* these inside a request, never at load time,
// so a stub that throws on use keeps the import working and misuse loud.
const NEXT_STUBS = {
  "next/headers":
    "data:text/javascript," +
    encodeURIComponent(
      "const outside=n=>()=>{throw new Error(n+'() outside a request')};" +
        "export const cookies=outside('cookies');export const headers=outside('headers');",
    ),
  "next/navigation":
    "data:text/javascript," +
    encodeURIComponent(
      "const outside=n=>()=>{throw new Error(n+'() outside a request')};" +
        "export const redirect=outside('redirect');export const notFound=outside('notFound');",
    ),
  "next/cache":
    "data:text/javascript," +
    encodeURIComponent("export const revalidatePath=()=>{};export const revalidateTag=()=>{};"),
};

export async function resolve(specifier, context, next) {
  if (specifier === "server-only" || specifier === "client-only") {
    return { url: STUB, format: "module", shortCircuit: true };
  }

  if (NEXT_STUBS[specifier]) {
    return { url: NEXT_STUBS[specifier], format: "module", shortCircuit: true };
  }

  if (specifier.startsWith("@/")) {
    return next(new URL(specifier.slice(2), SRC).href, context);
  }

  if (specifier.startsWith(".") && !path.extname(specifier)) {
    try {
      return await next(`${specifier}.ts`, context);
    } catch {
      return next(specifier, context);
    }
  }

  return next(specifier, context);
}
