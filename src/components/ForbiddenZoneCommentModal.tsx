import { useEffect, useState } from "react";
import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View
} from "react-native";

import { APP_COLORS } from "../constants/theme";
import type { AppLanguage } from "../i18n";
import { FORBIDDEN_ZONE_COMMENT_MAX_LENGTH } from "../services/forbiddenZones";

export function ForbiddenZoneCommentModal({
  areaLabel,
  initialComment,
  isCreation,
  language,
  onCancel,
  onSave,
  visible
}: {
  areaLabel: string;
  initialComment: string | null;
  isCreation: boolean;
  language: AppLanguage;
  onCancel: () => void;
  onSave: (comment: string) => Promise<void>;
  visible: boolean;
}) {
  const [draft, setDraft] = useState(initialComment ?? "");
  const [isSaving, setIsSaving] = useState(false);
  const isFrench = language === "fr";

  useEffect(() => {
    if (visible) {
      setDraft(initialComment ?? "");
      setIsSaving(false);
    }
  }, [initialComment, visible]);

  const save = async () => {
    if (isSaving) {
      return;
    }

    setIsSaving(true);

    try {
      await onSave(draft);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Modal
      animationType="fade"
      onRequestClose={isSaving ? undefined : onCancel}
      transparent
      visible={visible}
    >
      <KeyboardAvoidingView
        behavior={Platform.OS === "ios" ? "padding" : undefined}
        style={styles.backdrop}
      >
        <View style={styles.card}>
          <View style={styles.headingRow}>
            <View style={styles.iconSeal}>
              <Ionicons name="map-outline" color={APP_COLORS.gold} size={20} />
            </View>
            <View style={styles.headingCopy}>
              <Text style={styles.eyebrow}>
                {isFrench ? "ZONE INTERDITE" : "FORBIDDEN ZONE"}
              </Text>
              <Text style={styles.title}>
                {isCreation
                  ? isFrench ? "Zone interdite ajoutée" : "Forbidden Zone added"
                  : isFrench ? "Modifier le commentaire" : "Edit comment"}
              </Text>
            </View>
          </View>

          <Text style={styles.body}>
            {isCreation
              ? isFrench
                ? "Cette zone ne comptera ni dans la progression ni dans les Points d’exploration. Ajoutez un commentaire facultatif."
                : "This area will count toward neither completion nor Explorer Points. Add an optional comment."
              : isFrench
                ? "Ce commentaire apparaîtra directement sur la carte lorsque vous toucherez la zone."
                : "This comment appears directly on the map when you tap the zone."}
          </Text>
          <Text style={styles.area}>{areaLabel}</Text>

          <TextInput
            autoFocus
            editable={!isSaving}
            maxLength={FORBIDDEN_ZONE_COMMENT_MAX_LENGTH}
            multiline={false}
            onChangeText={setDraft}
            placeholder={isFrench ? "Ex. Site ferroviaire inaccessible" : "E.g. Inaccessible railway facility"}
            placeholderTextColor={APP_COLORS.textMuted}
            returnKeyType="done"
            style={styles.input}
            value={draft}
          />
          <Text style={styles.counter}>
            {draft.length}/{FORBIDDEN_ZONE_COMMENT_MAX_LENGTH}
          </Text>

          <View style={styles.actions}>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={isSaving}
              onPress={onCancel}
              style={styles.secondaryAction}
            >
              <Text style={styles.secondaryText}>
                {isCreation
                  ? isFrench ? "Plus tard" : "Not now"
                  : isFrench ? "Annuler" : "Cancel"}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              accessibilityRole="button"
              disabled={isSaving}
              onPress={() => void save()}
              style={styles.primaryAction}
            >
              {isSaving ? (
                <ActivityIndicator color={APP_COLORS.inkOnGold} size="small" />
              ) : (
                <Ionicons name="checkmark" color={APP_COLORS.inkOnGold} size={18} />
              )}
              <Text style={styles.primaryText}>
                {isFrench ? "Enregistrer" : "Save"}
              </Text>
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  actions: {
    flexDirection: "row",
    gap: 10,
    justifyContent: "flex-end",
    marginTop: 18
  },
  area: {
    color: APP_COLORS.gold,
    fontSize: 13,
    fontWeight: "800",
    marginBottom: 14
  },
  backdrop: {
    alignItems: "center",
    backgroundColor: "rgba(3, 12, 24, 0.72)",
    flex: 1,
    justifyContent: "center",
    padding: 24
  },
  body: {
    color: APP_COLORS.textSecondary,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 8
  },
  card: {
    backgroundColor: APP_COLORS.card,
    borderColor: "rgba(184, 126, 220, 0.72)",
    borderRadius: 20,
    borderWidth: 1,
    maxWidth: 460,
    padding: 20,
    width: "100%"
  },
  counter: {
    color: APP_COLORS.textMuted,
    fontSize: 11,
    marginTop: 5,
    textAlign: "right"
  },
  eyebrow: {
    color: APP_COLORS.gold,
    fontSize: 10,
    fontWeight: "900",
    letterSpacing: 1.3
  },
  headingCopy: {
    flex: 1
  },
  headingRow: {
    alignItems: "center",
    flexDirection: "row",
    gap: 12,
    marginBottom: 14
  },
  iconSeal: {
    alignItems: "center",
    backgroundColor: "rgba(126, 58, 176, 0.28)",
    borderColor: "rgba(184, 126, 220, 0.72)",
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  input: {
    backgroundColor: "rgba(4, 18, 34, 0.78)",
    borderColor: "rgba(184, 126, 220, 0.58)",
    borderRadius: 12,
    borderWidth: 1,
    color: APP_COLORS.text,
    fontSize: 15,
    paddingHorizontal: 13,
    paddingVertical: 12
  },
  primaryAction: {
    alignItems: "center",
    backgroundColor: APP_COLORS.gold,
    borderRadius: 11,
    flexDirection: "row",
    gap: 7,
    justifyContent: "center",
    minWidth: 116,
    paddingHorizontal: 16,
    paddingVertical: 11
  },
  primaryText: {
    color: APP_COLORS.inkOnGold,
    fontSize: 13,
    fontWeight: "900"
  },
  secondaryAction: {
    alignItems: "center",
    borderColor: APP_COLORS.border,
    borderRadius: 11,
    borderWidth: 1,
    justifyContent: "center",
    paddingHorizontal: 16,
    paddingVertical: 11
  },
  secondaryText: {
    color: APP_COLORS.textSecondary,
    fontSize: 13,
    fontWeight: "800"
  },
  title: {
    color: APP_COLORS.text,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 2
  }
});
