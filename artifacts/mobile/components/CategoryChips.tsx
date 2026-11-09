import type { CategoryNode } from "@/lib/api";
import React from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";

type Props = {
  categories: CategoryNode[];
  selectedSlug?: string | null;
  onSelect: (slug: string | null) => void;
  onSeeAll?: () => void;
};

export function CategoryChips({ categories, selectedSlug, onSelect, onSeeAll }: Props) {
  return (
    <View style={styles.wrap}>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.row}>
        <Pressable
          style={[styles.chip, !selectedSlug && styles.chipActive]}
          onPress={() => onSelect(null)}
        >
          <Text style={[styles.chipText, !selectedSlug && styles.chipTextActive]}>All</Text>
        </Pressable>
        {categories.map((cat) => {
          const active = selectedSlug === cat.slug;
          return (
            <Pressable
              key={cat.id}
              style={[styles.chip, active && styles.chipActive]}
              onPress={() => onSelect(cat.slug)}
            >
              <Text style={[styles.chipText, active && styles.chipTextActive]} numberOfLines={1}>
                {cat.icon ? `${cat.icon} ` : ""}
                {cat.name}
              </Text>
            </Pressable>
          );
        })}
        {onSeeAll ? (
          <Pressable style={styles.chip} onPress={onSeeAll}>
            <Text style={styles.chipText}>See all</Text>
          </Pressable>
        ) : null}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: 8 },
  row: { paddingHorizontal: 12, gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "#1E293B",
    backgroundColor: "#0F172A",
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  chipActive: { backgroundColor: "#F97316", borderColor: "#F97316" },
  chipText: { color: "#CBD5E1", fontSize: 13, fontWeight: "600" },
  chipTextActive: { color: "#fff" },
});
