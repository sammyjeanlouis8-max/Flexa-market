import { Redirect } from "expo-router";

/** Legacy route — Beauty Studio is now /beauty/c/beauty-studio */
export default function BeautyStudioRedirect() {
  return <Redirect href={"/beauty/c/beauty-studio" as any} />;
}
