import { useLocalSearchParams } from "expo-router";
import React from "react";

import { PhasePlaceholder } from "@/components/PhasePlaceholder";

export default function ChatScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return (
    <PhasePlaceholder
      title="Chat"
      subtitle={`Konvèsasyon #${id ?? "?"} — mesajri tan-reyèl natif natal ap vini nan Faz 3.`}
      phaseLabel="Faz 3"
      detail="Lis konvèsasyon yo deja natif natal nan tab Mesaj. Socket.IO UI ap suiv."
    />
  );
}
