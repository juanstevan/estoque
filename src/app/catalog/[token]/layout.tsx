import { CatalogLayout, type LayoutProps } from "../../c/[token]/catalog-layout";

/** /catalog/<brand>: the brand's catalog for end customers (public items, retail prices). */
export default function Layout(props: LayoutProps) {
  return <CatalogLayout {...props} kind="catalog" />;
}
