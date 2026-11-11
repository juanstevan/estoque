import { BrandIndex, indexMetadata } from "../c/[token]/brand-index";

export const metadata = indexMetadata("catalog");

/** /catalog: every brand, each leading to /catalog/<brand>. */
export default function Page() {
  return <BrandIndex kind="catalog" />;
}
