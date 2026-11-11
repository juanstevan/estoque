import { CatalogLayout, type LayoutProps } from "../../c/[token]/catalog-layout";

/** /price/<brand>: the brand's builder price table. */
export default function Layout(props: LayoutProps) {
  return <CatalogLayout {...props} kind="price" />;
}
