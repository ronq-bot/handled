import type { Product } from "@/lib/catalog";

/**
 * The partner's own photograph when we have one, and a ruled plate with the
 * emoji when we don't.
 *
 * Deliberately not `next/image`: these URLs come from partner APIs at runtime
 * and we can't enumerate their hosts in `next.config.ts` ahead of time. A
 * plain `<img>` with explicit dimensions and lazy loading avoids the layout
 * shift that matters here without pretending we control the origin.
 */
export function ProductImage({
  product,
  className = "",
  sizePx = 96,
  rounded = "rounded-[--radius-md]",
}: {
  product: Product;
  className?: string;
  /** Rendered size, used for width/height so nothing reflows on load. */
  sizePx?: number;
  rounded?: string;
}) {
  const shared = `${rounded} ${className}`;

  if (product.imageUrl) {
    return (
      <img
        src={product.imageUrl}
        alt={product.name}
        width={sizePx}
        height={sizePx}
        loading="lazy"
        decoding="async"
        className={`${shared} border border-line bg-bone-2 object-cover`}
        style={{ width: sizePx, height: sizePx }}
      />
    );
  }

  return (
    <span
      className={`${shared} grid shrink-0 place-items-center border border-line bg-bone-2`}
      style={{ width: sizePx, height: sizePx, fontSize: sizePx * 0.42 }}
      aria-hidden="true"
    >
      {product.emoji}
    </span>
  );
}
