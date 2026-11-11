import { BrandPage, brandMetadata, type PageProps } from "./brand-page";

export const generateMetadata = (props: PageProps) => brandMetadata(props, "link");

export default function LinkPage(props: PageProps) {
  return <BrandPage {...props} kind="link" />;
}
