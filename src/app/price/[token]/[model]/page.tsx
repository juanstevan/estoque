import { ModelPage, modelMetadata, type ModelProps } from "../../../c/[token]/[model]/model-page";

export const generateMetadata = (props: ModelProps) => modelMetadata(props, "price");

export default function Page(props: ModelProps) {
  return <ModelPage {...props} kind="price" />;
}
