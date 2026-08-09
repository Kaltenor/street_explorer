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
import { EXPLORER_POINTS_PER_EXPEDITION } from "../services/explorerScore";
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
  const active = dashboard?.active ?? [];
  const activeIds = new Set(active.map((expedition) => expedition.id));

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
              ? `${dashboard.choices[0]?.districtName ?? active[0]?.districtName ?? ""} · ${dashboard.localDate}`
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
                  ? "Sélectionnez un quartier officiel dans Progression pour consulter ses cinq expéditions du jour."
                  : "Select an official district in Completion to see its five daily expeditions."}
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

          {districtAvailable && active.length > 0 ? (
            <>
              <AtlasSectionLabel
                icon="navigate-circle-outline"
                title={isFrench ? "EXPÉDITIONS ACTIVES" : "ACTIVE EXPEDITIONS"}
              />
              {active.map((expedition) => (
                <ExpeditionCard
                  expedition={expedition}
                  isActive
                  isBusy={isBusy}
                  isFrench={isFrench}
                  isRecording={isRecording}
                  key={expedition.id}
                  onAbandon={onAbandon}
                  onAccept={onAccept}
                  showDistrict
                />
              ))}
            </>
          ) : null}

          {districtAvailable ? <><AtlasSectionLabel
            icon="map-outline"
            title={isFrench ? "CHOIX DU JOUR" : "TODAY'S CHOICES"}
          />
          <Text style={styles.helpText}>
            {isFrench
              ? "Choisissez une ou plusieurs missions. Vos sélections restent actives après la fermeture de l’application."
              : "Choose one or more field missions. Your selections remain active after the app closes."}
          </Text>

          {dashboard?.choices
            .filter((expedition) => !activeIds.has(expedition.id))
            .map((expedition) => (
            <ExpeditionCard
              expedition={expedition}
              isActive={false}
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
                  ? `Chaque mission terminée ajoute un sceau permanent et ${EXPLORER_POINTS_PER_EXPEDITION} points d'explorateur, sans classement.`
                  : `Each completed mission adds one permanent seal and ${EXPLORER_POINTS_PER_EXPEDITION} Explorer Points, with no ranking.`}
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
  expedition,
  isActive,
  isBusy,
  isFrench,
  isRecording,
  onAbandon,
  onAccept,
  showDistrict = false
}: {
  expedition: DistrictExpedition;
  isActive: boolean;
  isBusy: boolean;
  isFrench: boolean;
  isRecording: boolean;
  onAbandon: (expedition: DistrictExpedition) => void;
  onAccept: (expedition: DistrictExpedition) => void;
  showDistrict?: boolean;
}) {
  const isCompleted = expedition.completedAt !== null;
  const progress = Math.min(expedition.progress, expedition.target);
  const ratio = Math.max(0, Math.min(100, (progress / expedition.target) * 100));
  const acceptDisabled = isBusy || isRecording || isCompleted || isActive;

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
    case "frontier_push":
      return isFrench ? "Repousser la frontière" : "Push the frontier";
    case "seal_breach":
      return isFrench ? "Combler la brèche" : "Seal the breach";
    case "dense_survey":
      return isFrench ? "Relevé dense" : "Dense survey";
    case "sector_sweep":
      return isFrench ? "Mosaïque du quartier" : "District mosaic";
    case "northward_scout":
      return isFrench ? "Éclaireur du nord" : "Northward scout";
    case "southward_scout":
      return isFrench ? "Éclaireur du sud" : "Southward scout";
    case "eastward_scout":
      return isFrench ? "Éclaireur de l'est" : "Eastward scout";
    case "westward_scout":
      return isFrench ? "Éclaireur de l'ouest" : "Westward scout";
    case "boundary_scout":
      return isFrench ? "Patrouille frontalière" : "Border scout";
    case "district_heart":
      return isFrench ? "Cœur du quartier" : "District heart";
    case "outer_reach":
      return isFrench ? "Confins du quartier" : "Outer reach";
    case "complete_street":
      return isFrench ? "Achever une rue" : "Complete a street";
    case "complete_street_pair":
      return isFrench ? "Deux rues à achever" : "Finish two streets";
    case "street_and_cells":
      return isFrench ? "Rue et territoire" : "Street and territory";
    case "close_loop":
      return isFrench ? "Fermer une boucle" : "Close an exploration loop";
    case "double_loop":
      return isFrench ? "Double enceinte" : "Double enclosure";
    case "loop_and_cells":
      return isFrench ? "Boucle et horizon" : "Loop and horizon";
    case "loop_and_frontier":
      return isFrench ? "Boucle frontalière" : "Frontier loop";
    case "street_and_loop":
      return isFrench ? "Rue en circuit" : "Street circuit";
    case "collect_medal":
      return isFrench ? "Découvrir un repère" : "Discover a landmark";
    case "collect_medal_pair":
      return isFrench ? "Deux repères" : "Two landmarks";
    case "medal_and_cells":
      return isFrench ? "Repère et territoire" : "Landmark and territory";
    case "field_triad":
      return isFrench ? "Triade de terrain" : "Field triad";
    case "grand_tour":
      return isFrench ? "Grand tour du cartographe" : "Cartographer's grand tour";
  }
}

function getExpeditionDescription(expedition: DistrictExpedition, isFrench: boolean) {
  switch (expedition.kind) {
    case "explore_cells":
      return isFrench
        ? `${expedition.target} nouvelles cases dans ce quartier`
        : `${expedition.target} new cells inside this district`;
    case "frontier_push":
      return isFrench ? `${expedition.target} nouvelles cases adjacentes au territoire connu` : `${expedition.target} new cells beside known territory`;
    case "seal_breach":
      return isFrench ? `${expedition.target} cases entourées par au moins trois cases connues` : `${expedition.target} cells with at least three known neighbors`;
    case "dense_survey":
      return isFrench ? `${expedition.target} nouvelles cases reliées à deux nouvelles voisines` : `${expedition.target} new cells linked to two new neighbors`;
    case "sector_sweep":
      return isFrench ? `Explorez ${expedition.target} des neuf secteurs du quartier` : `Explore ${expedition.target} of the district's nine sectors`;
    case "northward_scout":
      return isFrench ? `${expedition.target} nouvelles cases au nord du centre` : `${expedition.target} new cells north of the district center`;
    case "southward_scout":
      return isFrench ? `${expedition.target} nouvelles cases au sud du centre` : `${expedition.target} new cells south of the district center`;
    case "eastward_scout":
      return isFrench ? `${expedition.target} nouvelles cases à l'est du centre` : `${expedition.target} new cells east of the district center`;
    case "westward_scout":
      return isFrench ? `${expedition.target} nouvelles cases à l'ouest du centre` : `${expedition.target} new cells west of the district center`;
    case "boundary_scout":
      return isFrench ? `${expedition.target} nouvelles cases à moins de 45 m de la limite` : `${expedition.target} new cells within 45 m of the boundary`;
    case "district_heart":
      return isFrench ? `${expedition.target} nouvelles cases dans la zone centrale` : `${expedition.target} new cells in the central district area`;
    case "outer_reach":
      return isFrench ? `${expedition.target} nouvelles cases dans la ceinture extérieure` : `${expedition.target} new cells in the district's outer belt`;
    case "complete_street":
      return isFrench ? "Atteignez 90 % d'une rue du quartier" : "Reach 90% on a district street";
    case "complete_street_pair":
      return isFrench ? "Atteignez 90 % sur deux rues du quartier" : "Reach 90% on two district streets";
    case "street_and_cells":
      return isFrench ? "12 nouvelles cases et une rue achevée" : "Chart 12 cells and complete one street";
    case "close_loop":
      return isFrench ? "Créez une nouvelle zone fermée valide" : "Create one new valid enclosed area";
    case "double_loop":
      return isFrench ? "Fermez une boucle lors de deux marches finalisées" : "Close a loop on two finalized walks";
    case "loop_and_cells":
      return isFrench ? "12 nouvelles cases et une boucle valide" : "Chart 12 cells and close one valid loop";
    case "loop_and_frontier":
      return isFrench ? "8 cases frontalières et une boucle valide" : "Chart 8 frontier cells and close one valid loop";
    case "street_and_loop":
      return isFrench ? "Achevez une rue et fermez une boucle" : "Complete one street and close one loop";
    case "collect_medal":
      return isFrench ? "Obtenez une médaille située dans ce quartier" : "Earn a medal located in this district";
    case "collect_medal_pair":
      return isFrench ? "Obtenez deux médailles situées dans ce quartier" : "Earn two medals located in this district";
    case "medal_and_cells":
      return isFrench ? "12 nouvelles cases et une médaille" : "Chart 12 cells and earn one medal";
    case "field_triad":
      return isFrench ? "15 cases, une rue et une boucle" : "Chart 15 cells, complete a street, and close a loop";
    case "grand_tour":
      return isFrench ? "20 cases, une rue, une boucle et une médaille" : "Chart 20 cells, finish a street, close a loop, and earn a medal";
  }
}

function getExpeditionIcon(kind: DistrictExpeditionKind) {
  switch (kind) {
    case "explore_cells":
    case "dense_survey":
      return "grid-outline" as const;
    case "frontier_push":
    case "outer_reach":
      return "expand-outline" as const;
    case "seal_breach":
      return "scan-circle-outline" as const;
    case "sector_sweep":
    case "district_heart":
      return "map-outline" as const;
    case "northward_scout":
      return "arrow-up-outline" as const;
    case "southward_scout":
      return "arrow-down-outline" as const;
    case "eastward_scout":
      return "arrow-forward-outline" as const;
    case "westward_scout":
      return "arrow-back-outline" as const;
    case "boundary_scout":
      return "navigate-outline" as const;
    case "complete_street":
    case "complete_street_pair":
    case "street_and_cells":
      return "trail-sign-outline" as const;
    case "close_loop":
    case "double_loop":
    case "loop_and_cells":
    case "loop_and_frontier":
    case "street_and_loop":
      return "sync-circle-outline" as const;
    case "collect_medal":
    case "collect_medal_pair":
    case "medal_and_cells":
      return "medal-outline" as const;
    case "field_triad":
      return "layers-outline" as const;
    case "grand_tour":
      return "trophy-outline" as const;
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
