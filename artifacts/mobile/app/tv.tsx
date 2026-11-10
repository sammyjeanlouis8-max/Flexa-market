import NativePlaceholder from "@/components/NativePlaceholder";

/** Deep-link destination for Flexa TV pushes until the full native TV module lands. */
export default function FlexaTvScreen() {
  return (
    <NativePlaceholder
      title="Flexa TV"
      subtitle="Flexa TV is available on the Flexa Market website while the native TV experience is completed. Push notifications for TV already open this screen."
    />
  );
}
