import Ionicons from "@expo/vector-icons/Ionicons";
import type { ComponentType } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ActivityIndicator,
  Animated,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  TurboModuleRegistry,
  useWindowDimensions,
  View
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import type { WebViewProps } from "react-native-webview";

import { createAppearanceStyles } from "../constants/appearance";
import { APP_COLORS } from "../constants/theme";
import { AppLanguage } from "../i18n";
import {
  isAllowedWikipediaReadingUrl,
  resolveMedalWikipedia,
  WikipediaResolution
} from "../services/wikipedia";
import { CollectedMedal, LocalizedMedalText } from "../types/medal";
import { useReducedMotionPreference } from "./AtlasCabinet";

export type WikipediaReaderOrigin = { x: number; y: number };

type MedalWikipediaReaderProps = {
  cityName: LocalizedMedalText;
  language: AppLanguage;
  medal: CollectedMedal;
  onClosed: () => void;
  origin: WikipediaReaderOrigin;
};

const READ_ONLY_WIKIPEDIA_SCRIPT = `
  (function () {
    var style = document.createElement('style');
    style.textContent = [
      '.vector-header-container, .vector-page-toolbar, .mw-editsection,',
      '.mw-portlet-lang, #p-personal, #p-search, #siteSub, .mw-jump-link,',
      'form, footer, .printfooter, .noprint { display: none !important; }',
      'html { background: #f4ecd8 !important; }',
      'body { background: #f4ecd8 !important; color: #17232b !important;',
      '  max-width: 760px; margin: 0 auto !important; padding: 18px !important; }',
      'a { color: #7a5310 !important; }',
      'img { max-width: 100% !important; height: auto !important; }'
    ].join('');
    document.head.appendChild(style);
    document.querySelectorAll('a').forEach(function (link) {
      link.removeAttribute('target');
    });
  })();
  true;
`;

function getEmbeddedWebView(): ComponentType<WebViewProps> | null {
  if (!TurboModuleRegistry.get("RNCWebViewModule")) {
    return null;
  }

  try {
    return require("react-native-webview").WebView as ComponentType<WebViewProps>;
  } catch {
    return null;
  }
}

export function MedalWikipediaReader({
  cityName,
  language,
  medal,
  onClosed,
  origin
}: MedalWikipediaReaderProps) {
  const insets = useSafeAreaInsets();
  const window = useWindowDimensions();
  const reducedMotion = useReducedMotionPreference();
  const progress = useRef(new Animated.Value(reducedMotion ? 1 : 0)).current;
  const browserFallbackStarted = useRef(false);
  const [contentReady, setContentReady] = useState(reducedMotion);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resolution, setResolution] = useState<WikipediaResolution | null>(null);
  const text = getText(language);
  const EmbeddedWebView = useMemo(getEmbeddedWebView, []);
  const embeddedReaderAvailable = EmbeddedWebView !== null;

  const target = {
    height: Math.max(280, window.height - insets.top - insets.bottom - 16),
    width: window.width - 16,
    x: 8,
    y: insets.top + 8
  };
  const initialWidth = Math.min(220, target.width - 24);
  const initialHeight = 58;
  const initialX = Math.max(12, Math.min(origin.x - initialWidth / 2, window.width - initialWidth - 12));
  const initialY = Math.max(insets.top + 12, Math.min(origin.y - 24, window.height - initialHeight - insets.bottom - 12));

  useEffect(() => {
    let active = true;

    void resolveMedalWikipedia({ cityName, language, medal }).then((next) => {
      if (active) {
        setResolution(next);
      }
    });

    if (reducedMotion) {
      progress.setValue(1);
      setContentReady(true);
    } else {
      progress.setValue(0);
      Animated.timing(progress, {
        duration: 320,
        toValue: 1,
        useNativeDriver: false
      }).start(({ finished }) => {
        if (finished && active) {
          setContentReady(true);
        }
      });
    }

    return () => {
      active = false;
      progress.stopAnimation();
    };
  }, [cityName, language, medal, progress, reducedMotion]);

  const close = useCallback(() => {
    if (reducedMotion) {
      onClosed();
      return;
    }

    setContentReady(false);
    Animated.timing(progress, {
      duration: 220,
      toValue: 0,
      useNativeDriver: false
    }).start(({ finished }) => {
      if (finished) {
        onClosed();
      }
    });
  }, [onClosed, progress, reducedMotion]);

  const openBrowserFallback = useCallback(async () => {
    if (!resolution || browserFallbackStarted.current) {
      return;
    }

    browserFallbackStarted.current = true;
    try {
      await Linking.openURL(resolution.url);
      close();
    } catch {
      setFailed(true);
      setLoading(false);
    }
  }, [close, resolution]);

  useEffect(() => {
    if (resolution && !embeddedReaderAvailable) {
      void openBrowserFallback();
    }
  }, [embeddedReaderAvailable, openBrowserFallback, resolution]);

  return (
    <View
      accessibilityElementsHidden={false}
      accessibilityViewIsModal
      importantForAccessibility="yes"
      style={styles.root}
    >
      <Animated.View
        onStartShouldSetResponder={() => true}
        pointerEvents="auto"
        style={[styles.backdrop, { opacity: progress }]}
      />
      <Animated.View
        style={[
          styles.frame,
          {
            borderRadius: progress.interpolate({ inputRange: [0, 1], outputRange: [18, 12] }),
            height: progress.interpolate({ inputRange: [0, 1], outputRange: [initialHeight, target.height] }),
            left: progress.interpolate({ inputRange: [0, 1], outputRange: [initialX, target.x] }),
            top: progress.interpolate({ inputRange: [0, 1], outputRange: [initialY, target.y] }),
            width: progress.interpolate({ inputRange: [0, 1], outputRange: [initialWidth, target.width] })
          }
        ]}
      >
        <View style={styles.header}>
          <View style={styles.headerText}>
            <Text numberOfLines={1} style={styles.eyebrow}>WIKIPEDIA · {resolution?.language.toUpperCase() ?? language.toUpperCase()}</Text>
            <Text numberOfLines={1} style={styles.title}>{medal.name[language]}</Text>
          </View>
          <TouchableOpacity
            accessibilityLabel={text.close}
            accessibilityRole="button"
            hitSlop={8}
            onPress={close}
            style={styles.closeButton}
          >
            <Ionicons color={APP_COLORS.parchment} name="close" size={22} />
          </TouchableOpacity>
        </View>

        {contentReady ? (
          <View style={styles.content}>
            {!resolution || loading ? (
              <View pointerEvents="none" style={styles.loadingOverlay}>
                <ActivityIndicator color={APP_COLORS.gold} size="large" />
                <Text style={styles.loadingText}>{text.loading}</Text>
              </View>
            ) : null}
            {failed ? (
              <View style={styles.errorPanel}>
                <Ionicons color={APP_COLORS.gold} name="cloud-offline-outline" size={34} />
                <Text style={styles.errorTitle}>{text.failedTitle}</Text>
                <Text style={styles.errorText}>{text.failedBody}</Text>
              </View>
            ) : resolution && embeddedReaderAvailable ? (
              <EmbeddedWebView
                allowsBackForwardNavigationGestures={false}
                allowsLinkPreview={false}
                bounces
                incognito
                injectedJavaScript={READ_ONLY_WIKIPEDIA_SCRIPT}
                javaScriptCanOpenWindowsAutomatically={false}
                onError={() => void openBrowserFallback()}
                onLoadEnd={() => setLoading(false)}
                onLoadStart={() => setLoading(true)}
                onShouldStartLoadWithRequest={(request) =>
                  isAllowedWikipediaReadingUrl(request.url)
                }
                originWhitelist={["https://*.wikipedia.org"]}
                pullToRefreshEnabled
                setSupportMultipleWindows={false}
                sharedCookiesEnabled={false}
                source={{
                  headers: { "Accept-Language": resolution.language },
                  uri: resolution.url
                }}
                style={styles.webView}
                thirdPartyCookiesEnabled={false}
              />
            ) : null}
          </View>
        ) : null}
      </Animated.View>
    </View>
  );
}

function getText(language: AppLanguage) {
  return language === "fr"
    ? {
        close: "Fermer Wikipédia",
        failedBody: "La page ne peut pas être chargée ici ni dans le navigateur par défaut.",
        failedTitle: "Lecture indisponible",
        loading: "Ouverture de l'article…"
      }
    : {
        close: "Close Wikipedia",
        failedBody: "The page could not be loaded here or in the default browser.",
        failedTitle: "Reader unavailable",
        loading: "Opening the article…"
      };
}

const styles = createAppearanceStyles({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: "rgba(1, 5, 8, 0.86)"
  },
  closeButton: {
    alignItems: "center",
    backgroundColor: "rgba(231, 181, 65, 0.12)",
    borderColor: APP_COLORS.goldBorder,
    borderRadius: 18,
    borderWidth: 1,
    height: 36,
    justifyContent: "center",
    width: 36
  },
  content: { backgroundColor: "#f4ecd8", flex: 1, overflow: "hidden" },
  errorPanel: {
    alignItems: "center",
    flex: 1,
    gap: 10,
    justifyContent: "center",
    padding: 28
  },
  errorText: { color: "#53616a", fontSize: 13, lineHeight: 19, textAlign: "center" },
  errorTitle: { color: "#17232b", fontSize: 17, fontWeight: "800" },
  eyebrow: { color: APP_COLORS.gold, fontSize: 9, fontWeight: "900", letterSpacing: 1.2 },
  frame: {
    backgroundColor: APP_COLORS.card,
    borderColor: APP_COLORS.goldBorder,
    borderWidth: 1,
    elevation: 18,
    overflow: "hidden",
    position: "absolute",
    shadowColor: "#000",
    shadowOffset: { height: 8, width: 0 },
    shadowOpacity: 0.5,
    shadowRadius: 16
  },
  header: {
    alignItems: "center",
    backgroundColor: APP_COLORS.card,
    borderBottomColor: APP_COLORS.goldBorder,
    borderBottomWidth: 1,
    flexDirection: "row",
    gap: 12,
    minHeight: 58,
    paddingHorizontal: 12,
    paddingVertical: 9
  },
  headerText: { flex: 1, minWidth: 0 },
  loadingOverlay: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    backgroundColor: "#f4ecd8",
    gap: 12,
    justifyContent: "center",
    zIndex: 2
  },
  loadingText: { color: "#53616a", fontSize: 13, fontWeight: "700" },
  root: { ...StyleSheet.absoluteFillObject, zIndex: 20 },
  title: { color: APP_COLORS.parchment, fontSize: 15, fontWeight: "800", marginTop: 2 },
  webView: { backgroundColor: "#f4ecd8", flex: 1 }
});
