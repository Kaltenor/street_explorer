import createIconSet from "@expo/vector-icons/createIconSet";
import glyphs from "../data/generated/appIconGlyphs.json";

// Metro redirects Ionicons here; family/metrics and preloading stay unchanged.
export default createIconSet(glyphs, "ionicons", require("../../assets/fonts/Ionicons-subset.ttf"));
