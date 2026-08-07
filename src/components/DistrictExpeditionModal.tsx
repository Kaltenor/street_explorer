import Ionicons from "@expo/vector-icons/Ionicons";
import {
  ActivityIndicator,
  Modal,
  ScrollView,
  Text,
  TouchableOpacity,
  View
} from "react-native";

import { createAppearanceStyles } from "../constants/appearance";
import { APP_COLORS, ATLAS_DISPLAY_FONT, GPS_STATUS_COLORS } from "../constants/theme";
import type { AppLanguage } from "../i18n";
import type {
  DistrictExpedition,
  DistrictExpeditionDashboard,
  DistrictExpeditionKind
} from "../types/expedition";
import { AtlasModalHeader, AtlasScreen, AtlasSectionLabel } from "./AtlasCabinet";

type Props = {
  dashboard: DistrictExpeditionDashboard | null;
  districtAvailable: boolean;
  isBusy: boolean;
  isRecording: boolean;
  language: AppLanguage;
  onAbandon: (expedition: DistrictExpedition) => void;
  onAccept: (expedition: DistrictExpedition) => void;
  onClose: () => void;
  onSelectDistrict: () => void;
  visible: boolean;
};

export function DistrictExpeditionModal({
  dashboard,
  districtAvailable,
  isBusy,
  isRecording,
  language,
  onAbandon,
  onAccept,
  onClose,
  onSelectDistrict,
  visible
}: Props) {
  const isFrench = language === "fr";
  const active = dashboard?.active ?? null;

  return (
    <Modal
      animationType="none"
      onRequestClose={onClose}
      presentationStyle="overFullScreen"
      transparent
      visible={visible}
    >
      <AtlasScreen onSwipeBack={onClose} visible={visible}>
        <AtlasModalHeader
          emblem="compass-outline"
          eyebrow={isFrench ? "ORDRES DU JOUR" : "DAILY FIELD ORDERS"}
          onBack={onClose}
          subtitle={
            dashboard
              ? `${dashboard.choices[0]?.districtName ?? active?.districtName ?? ""} · ${dashboard.localDate}`
              : districtAvailable
                ? isFrench ? "Chargement du registre local" : "Loading local registry"
                : isFrench ? "Choisissez d’abord un quartier" : "Select a district first"
          }
          title={isFrench ? "Expéditions" : "Expeditions"}
        />

        <ScrollView contentContainerStyle={styles.content}>
          {districtAvailable && isBusy && !dashboard ? (
            <View style={styles.loadingPanel}>
              <ActivityIndicator color={APP_COLORS.gold} size="small" />
              <Text style={styles.helpText}>
                {isFrench ? "Préparation des missions du quartier…" : "Preparing district missions…"}
              </Text>
            </View>
          ) : null}

          {!districtAvailable ? (
            <View style={styles.loadingPanel}>
              <Ionicons color={APP_COLORS.gold} name="map-outline" size={28} />
              <Text style={styles.emptyTitle}>
                {isFrench ? "Aucun quartier sélectionné" : "No district selected"}
              </Text>
              <Text style={styles.helpText}>
                {isFrench
                  ? "Sélectionnez un quartier officiel dans Progression pour consulter ses trois expéditions du jour."
                  : "Select an official district in Completion to see its three daily expeditions."}
              </Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={onSelectDistrict}
                style={styles.acceptButton}
              >
                <Text style={styles.acceptButtonText}>
                  {isFrench ? "Choisir un quartier" : "Select a district"}
                </Text>
              </TouchableOpacity>
            </View>
          ) : null}

          {districtAvailable && active ? (
            <>
              <AtlasSectionLabel
                icon="navigate-circle-outline"
                title={isFrench ? "EXPÉDITION ACTIVE" : "ACTIVE EXPEDITION"}
              />
              <ExpeditionCard
                activeExpedition={active}
                expedition={active}
                isBusy={isBusy}
                isFrench={isFrench}
                isRecording={isRecording}
                onAbandon={onAbandon}
                onAccept={onAccept}
                showDistrict
              />
            </>
          ) : null}

          {districtAvailable ? <><AtlasSectionLabel
            icon="map-outline"
            title={isFrench ? "CHOIX DU JOUR" : "TODAY'S CHOICES"}
          />
          <Text style={styles.helpText}>
            {isFrench
              ? "Choisissez une mission. Une seule expédition peut être active à la fois."
              : "Choose one field mission. Only one expedition can be active at a time."}
          </Text>

          {dashboard?.choices
            .filter((expedition) => expedition.id !== active?.id)
            .map((expedition) => (
            <ExpeditionCard
              activeExpedition={active}
              expedition={expedition}
              isBusy={isBusy}
              isFrench={isFrench}
              isRecording={isRecording}
              key={expedition.id}
              onAbandon={onAbandon}
              onAccept={onAccept}
            />
          ))}

          <AtlasSectionLabel
            icon="ribbon-outline"
            title={isFrench ? "SCEAUX DU JOURNAL" : "JOURNAL SEALS"}
          />
          <View style={styles.sealPanel}>
            <View style={styles.sealCount}>
              <Ionicons color={APP_COLORS.gold} name="ribbon" size={24} />
              <Text style={styles.sealCountValue}>{dashboard?.seals.length ?? 0}</Text>
            </View>
            <View style={styles.sealCopy}>
              <Text style={styles.sealTitle}>
                {isFrench ? "Expéditions accomplies" : "Completed expeditions"}
              </Text>
              <Text style={styles.helpText}>
                {isFrench
                  ? "Chaque mission terminée ajoute un sceau permanent, sans monnaie ni classement."
                  : "Each completed mission adds one permanent seal, with no currency or ranking."}
              </Text>
            </View>
          </View>
          </> : null}
        </ScrollView>
      </AtlasScreen>
    </Modal>
  );
}

function ExpeditionCard({
  activeExpedition,
  expedition,
  isBusy,
  isFrench,
  isRecording,
  onAbandon,
  onAccept,
  showDistrict = false
}: {
  activeExpedition: DistrictExpedition | null;
  expedition: DistrictExpedition;
  isBusy: boolean;
  isFrench: boolean;
  isRecording: boolean;
  onAbandon: (expedition: DistrictExpedition) => void;
  onAccept: (expedition: DistrictExpedition) => void;
  showDistrict?: boolean;
}) {
  const isActive = activeExpedition?.id === expedition.id;
  const isCompleted = expedition.completedAt !== null;
  const anotherIsActive = activeExpedition !== null && !isActive;
  const progress = Math.min(expedition.progress, expedition.target);
  const ratio = Math.max(0, Math.min(100, (progress / expedition.target) * 100));
  const acceptDisabled = isBusy || isRecording || anotherIsActive || isCompleted || isActive;

  return (
    <View style={[styles.card, isActive ? styles.activeCard : null]}>
      <View style={styles.cardHeader}>
        <View style={styles.kindIcon}>
          <Ionicons
            color={isCompleted ? GPS_STATUS_COLORS.good : APP_COLORS.gold}
            name={getExpeditionIcon(expedition.kind)}
            size={19}
          />
        </View>
        <View style={styles.cardTitleBlock}>
          <Text style={styles.cardTitle}>
            {getExpeditionTitle(expedition, isFrench)}
          </Text>
          <Text style={styles.cardMeta}>
            {showDistrict ? `${expedition.districtName} · ` : ""}
            {getExpeditionDescription(expedition, isFrench)}
          </Text>
        </View>
        <Text style={styles.progressValue}>{progress}/{expedition.target}</Text>
      </View>

      <View
        accessibilityRole="progressbar"
        accessibilityValue={{ max: expedition.target, min: 0, now: progress }}
        style={styles.progressTrack}
      >
        <View style={[styles.progressFill, { width: `${ratio}%` }]} />
      </View>

      {isActive ? (
        <TouchableOpacity
          accessibilityRole="button"
          disabled={isBusy}
          onPress={() => onAbandon(expedition)}
          style={styles.abandonButton}
        >
          <Text style={styles.abandonButtonText}>
            {isFrench ? "Abandonner" : "Abandon"}
          </Text>
        </TouchableOpacity>
      ) : (
        <TouchableOpacity
          accessibilityRole="button"
          accessibilityState={{ disabled: acceptDisabled }}
          disabled={acceptDisabled}
          onPress={() => onAccept(expedition)}
          style={[styles.acceptButton, acceptDisabled ? styles.disabledButton : null]}
        >
          <Text style={styles.acceptButtonText}>
            {isCompleted
              ? isFrench ? "Sceau obtenu" : "Seal earned"
              : anotherIsActive
                ? isFrench ? "Une mission est active" : "Another mission is active"
                : isRecording
                  ? isFrench ? "Terminez la marche" : "Finish the walk first"
                  : expedition.abandonedAt
                    ? isFrench ? "Reprendre" : "Restart"
                    : isFrench ? "Accepter" : "Accept"}
          </Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

export function getExpeditionTitle(
  expedition: Pick<DistrictExpedition, "kind" | "target">,
  isFrench: boolean
) {
  switch (expedition.kind) {
    case "explore_cells":
      return isFrench ? "Tracer de nouvelles cases" : "Chart new cells";
    case "complete_street":
      return isFrench ? "Achever une rue" : "Complete a street";
    case "close_loop":
      return isFrench ? "Fermer une boucle" : "Close an exploration loop";
    case "collect_medal":
      return isFrench ? "Découvrir un repère" : "Discover a landmark";
  }
}

function getExpeditionDescription(expedition: DistrictExpedition, isFrench: boolean) {
  switch (expedition.kind) {
    case "explore_cells":
      return isFrench
        ? `${expedition.target} nouvelles cases dans ce quartier`
        : `${expedition.target} new cells inside this district`;
    case "complete_street":
      return isFrench ? "Atteignez 90 % d'une rue du quartier" : "Reach 90% on a district street";
    case "close_loop":
      return isFrench ? "Créez une nouvelle zone fermée valide" : "Create one new valid enclosed area";
    case "collect_medal":
      return isFrench ? "Obtenez une médaille située dans ce quartier" : "Earn a medal located in this district";
  }
}

function getExpeditionIcon(kind: DistrictExpeditionKind) {
  switch (kind) {
    case "explore_cells":
      return "grid-outline" as const;
    case "complete_street":
      return "trail-sign-outline" as const;
    case "close_loop":
      return "sync-circle-outline" as const;
    case "collect_medal":
      return "medal-outline" as const;
  }
}

const styles = createAppearanceStyles({
  abandonButton: {
    alignItems: "center",
    borderColor: GPS_STATUS_COLORS.denied,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    paddingVertical: 10
  },
  abandonButtonText: {
    color: GPS_STATUS_COLORS.denied,
    fontSize: 13,
    fontWeight: "800"
  },
  acceptButton: {
    alignItems: "center",
    backgroundColor: APP_COLORS.cardHighlight,
    borderColor: APP_COLORS.gold,
    borderRadius: 10,
    borderWidth: 1,
    marginTop: 12,
    paddingVertical: 10
  },
  acceptButtonText: {
    color: APP_COLORS.text,
    fontSize: 13,
    fontWeight: "800"
  },
  activeCard: {
    borderColor: APP_COLORS.gold
  },
  card: {
    backgroundColor: APP_COLORS.card,
    borderColor: APP_COLORS.border,
    borderRadius: 14,
    borderWidth: 1,
    marginBottom: 12,
    padding: 14
  },
  cardHeader: {
    alignItems: "center",
    flexDirection: "row"
  },
  cardMeta: {
    color: APP_COLORS.textMuted,
    fontSize: 12,
    lineHeight: 17,
    marginTop: 3
  },
  cardTitle: {
    color: APP_COLORS.text,
    fontFamily: ATLAS_DISPLAY_FONT,
    fontSize: 15,
    fontWeight: "800"
  },
  cardTitleBlock: {
    flex: 1,
    marginHorizontal: 10
  },
  content: {
    padding: 18,
    paddingBottom: 40
  },
  disabledButton: {
    opacity: 0.45
  },
  emptyTitle: {
    color: APP_COLORS.text,
    fontFamily: ATLAS_DISPLAY_FONT,
    fontSize: 15,
    fontWeight: "800",
    textAlign: "center"
  },
  helpText: {
    color: APP_COLORS.textMuted,
    fontSize: 13,
    lineHeight: 19,
    marginBottom: 12
  },
  kindIcon: {
    alignItems: "center",
    backgroundColor: APP_COLORS.cardRaised,
    borderRadius: 20,
    height: 38,
    justifyContent: "center",
    width: 38
  },
  loadingPanel: {
    alignItems: "center",
    flexDirection: "row",
    gap: 10,
    justifyContent: "center",
    padding: 24
  },
  progressFill: {
    backgroundColor: APP_COLORS.gold,
    borderRadius: 4,
    height: "100%"
  },
  progressTrack: {
    backgroundColor: APP_COLORS.cardRaised,
    borderRadius: 4,
    height: 7,
    marginTop: 12,
    overflow: "hidden"
  },
  progressValue: {
    color: APP_COLORS.gold,
    fontSize: 13,
    fontWeight: "900"
  },
  sealCopy: {
    flex: 1,
    marginLeft: 14
  },
  sealCount: {
    alignItems: "center",
    justifyContent: "center",
    width: 58
  },
  sealCountValue: {
    color: APP_COLORS.gold,
    fontFamily: ATLAS_DISPLAY_FONT,
    fontSize: 20,
    fontWeight: "900",
    marginTop: 3
  },
  sealPanel: {
    alignItems: "center",
    backgroundColor: APP_COLORS.card,
    borderColor: APP_COLORS.border,
    borderRadius: 14,
    borderWidth: 1,
    flexDirection: "row",
    padding: 16
  },
  sealTitle: {
    color: APP_COLORS.text,
    fontFamily: ATLAS_DISPLAY_FONT,
    fontSize: 14,
    fontWeight: "800",
    marginBottom: 4
  }
});
