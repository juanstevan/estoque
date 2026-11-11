import { BrandIndex, indexMetadata } from "../c/[token]/brand-index";

export const metadata = indexMetadata("price");

/** /price: every brand, each leading to /price/<brand>. */
export default function Page() {
  return <BrandIndex kind="price" />;
}
