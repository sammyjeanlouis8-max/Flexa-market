import { NativePlaceholder } from "@/components/NativePlaceholder";
import React from "react";

export default function RegisterScreen() {
  return (
    <NativePlaceholder
      title="Create account (native wave next)"
      detail="Registration will call the existing /api/auth endpoints with a native form. Existing accounts already work via Sign in."
    />
  );
}
