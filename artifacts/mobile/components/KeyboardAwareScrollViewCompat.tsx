import { ScrollView, ScrollViewProps } from "react-native";

export function KeyboardAwareScrollViewCompat({
  children,
  ...props
}: ScrollViewProps) {
  return (
    <ScrollView keyboardShouldPersistTaps="handled" {...props}>
      {children}
    </ScrollView>
  );
}
