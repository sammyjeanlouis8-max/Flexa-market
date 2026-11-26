import { Feather } from "@expo/vector-icons";
import React from "react";
import { Pressable, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { applyMondayToOpenDays, weekdayLabel } from "@/lib/restaurantHours";
import { restaurantTheme as T } from "@/lib/restaurantTheme";
import type { DailyScheduleItem } from "@/lib/restaurantTypes";
import { WEEKDAYS } from "@/lib/restaurantTypes";

export function ScheduleEditor({
  schedule,
  onChange,
}: {
  schedule: DailyScheduleItem[];
  onChange: (next: DailyScheduleItem[]) => void;
}) {
  const updateDay = (day: DailyScheduleItem["day"], patch: Partial<DailyScheduleItem>) => {
    onChange(
      WEEKDAYS.map((d) => {
        const cur = schedule.find((s) => s.day === d) ?? {
          day: d,
          isOpen: false,
          openTime: null,
          closeTime: null,
        };
        if (d !== day) return cur;
        return { ...cur, ...patch, day };
      }),
    );
  };

  return (
    <View style={styles.wrap}>
      <Pressable
        style={styles.applyBtn}
        onPress={() => onChange(applyMondayToOpenDays(schedule))}
        testID="restaurant-apply-monday-hours"
      >
        <Feather name="copy" size={14} color={T.forest} />
        <Text style={styles.applyText}>Apply Monday hours to all open days</Text>
      </Pressable>

      {WEEKDAYS.map((day) => {
        const item = schedule.find((s) => s.day === day) ?? {
          day,
          isOpen: false,
          openTime: null,
          closeTime: null,
        };
        return (
          <View key={day} style={styles.row}>
            <View style={styles.dayCol}>
              <Text style={styles.dayLabel}>{weekdayLabel(day)}</Text>
              <View style={styles.switchRow}>
                <Text style={styles.openLabel}>{item.isOpen ? "Open" : "Closed"}</Text>
                <Switch
                  value={item.isOpen}
                  onValueChange={(v) =>
                    updateDay(day, {
                      isOpen: v,
                      openTime: v ? item.openTime || "08:00" : null,
                      closeTime: v ? item.closeTime || "22:00" : null,
                    })
                  }
                  trackColor={{ false: "#CBD5E1", true: T.accentSoft }}
                  thumbColor={item.isOpen ? T.forest : "#F8FAFC"}
                />
              </View>
            </View>
            {item.isOpen ? (
              <View style={styles.times}>
                <TextInput
                  style={styles.timeInput}
                  value={item.openTime ?? ""}
                  onChangeText={(t) => updateDay(day, { openTime: t })}
                  placeholder="08:00"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
                <Text style={styles.dash}>–</Text>
                <TextInput
                  style={styles.timeInput}
                  value={item.closeTime ?? ""}
                  onChangeText={(t) => updateDay(day, { closeTime: t })}
                  placeholder="22:00"
                  placeholderTextColor="#94A3B8"
                  keyboardType="numbers-and-punctuation"
                  maxLength={5}
                />
              </View>
            ) : (
              <Text style={styles.closedHint}>Closed</Text>
            )}
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8 },
  applyBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    alignSelf: "flex-start",
    backgroundColor: T.mint,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    marginBottom: 4,
  },
  applyText: { fontSize: 12, fontWeight: "700", color: T.forest },
  row: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: T.white,
    borderRadius: 12,
    padding: 12,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: T.line,
    gap: 10,
  },
  dayCol: { flex: 1, minWidth: 0 },
  dayLabel: { fontSize: 14, fontWeight: "700", color: T.ink },
  switchRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 4 },
  openLabel: { fontSize: 12, color: T.muted, fontWeight: "600" },
  times: { flexDirection: "row", alignItems: "center", gap: 6 },
  timeInput: {
    width: 64,
    borderWidth: 1,
    borderColor: T.line,
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 8,
    fontSize: 13,
    fontWeight: "700",
    color: T.ink,
    textAlign: "center",
    backgroundColor: T.mintSoft,
  },
  dash: { color: T.muted, fontWeight: "700" },
  closedHint: { fontSize: 12, color: T.closed, fontWeight: "600" },
});
