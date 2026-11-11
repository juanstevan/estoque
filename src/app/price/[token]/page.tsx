import { BrandPage, brandMetadata, type PageProps } from "../../c/[token]/brand-page";

export const generateMetadata = (props: PageProps) => brandMetadata(props, "price");

export default function Page(props: PageProps) {
  return <BrandPage {...props} kind="price" />;
}
