import { ModelPage, modelMetadata, type ModelProps } from "./model-page";

export const generateMetadata = (props: ModelProps) => modelMetadata(props, "link");

export default function LinkModelPage(props: ModelProps) {
  return <ModelPage {...props} kind="link" />;
}
