import { CatalogLayout, type LayoutProps } from "./catalog-layout";

/** The frame of a builder link (/c/<token>). */
export default function LinkLayout(props: LayoutProps) {
  return <CatalogLayout {...props} kind="link" />;
}
