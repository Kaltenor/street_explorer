const fs = require("fs");
const path = require("path");

const managerPath = path.join(
  __dirname,
  "..",
  "node_modules",
  "react-native-maps",
  "ios",
  "AirMaps",
  "AIRMapManager.m"
);

if (!fs.existsSync(managerPath)) {
  console.warn("[poi-filter-patch] AIRMapManager.m not found; skipping react-native-maps patch.");
  process.exit(0);
}

let source = fs.readFileSync(managerPath, "utf8");

const propertyName = "appleMapsPointsOfInterestFilter";
const helperSignature = "+ (MKPointOfInterestCategory)pointOfInterestCategoryForName:(NSString *)name API_AVAILABLE(ios(13.0))";
const implementationIndex = source.indexOf("@implementation AIRMapManager");
const helperIndex = source.lastIndexOf(helperSignature);

if (
  source.includes(propertyName) &&
  helperIndex > implementationIndex &&
  implementationIndex !== -1
) {
  console.log("[poi-filter-patch] react-native-maps POI filter patch already applied.");
  process.exit(0);
}

source = source.replace(
  /\n\+ \(MKPointOfInterestCategory\)pointOfInterestCategoryForName:\(NSString \*\)name API_AVAILABLE\(ios\(13\.0\)\)\n\{[\s\S]*?\n\}\n(?=\n@end)/g,
  ""
);

const declarationAnchor =
  "- (BOOL)gestureRecognizer:(UIGestureRecognizer *)gestureRecognizer shouldRecognizeSimultaneouslyWithGestureRecognizer:(UIGestureRecognizer *)otherGestureRecognizer;\n";
const declarationPatch = `${declarationAnchor}
+ (MKPointOfInterestCategory)pointOfInterestCategoryForName:(NSString *)name API_AVAILABLE(ios(13.0));
`;

if (!source.includes(`${helperSignature};`)) {
  if (!source.includes(declarationAnchor)) {
    throw new Error("[poi-filter-patch] Could not find AIRMapManager private interface anchor.");
  }

  source = source.replace(declarationAnchor, declarationPatch);
}

const propertyAnchor = "RCT_EXPORT_VIEW_PROPERTY(showsPointsOfInterest, BOOL)\n";
const propertyPatch = `${propertyAnchor}RCT_CUSTOM_VIEW_PROPERTY(appleMapsPointsOfInterestFilter, NSDictionary, AIRMap)
{
    if (@available(iOS 13.0, *)) {
        if (json == nil || json == (id)kCFNull) {
            view.pointOfInterestFilter = nil;
            return;
        }

        NSString *mode = [RCTConvert NSString:json[@"mode"]];
        NSArray *categoryNames = [RCTConvert NSArray:json[@"categories"]];
        NSMutableArray<MKPointOfInterestCategory> *categories = [NSMutableArray new];

        for (id categoryName in categoryNames) {
            if (![categoryName isKindOfClass:[NSString class]]) {
                continue;
            }

            MKPointOfInterestCategory category = [AIRMapManager pointOfInterestCategoryForName:categoryName];
            if (category != nil) {
                [categories addObject:category];
            }
        }

        if ([mode isEqualToString:@"exclude"]) {
            view.pointOfInterestFilter = [[MKPointOfInterestFilter alloc] initExcludingCategories:categories];
        } else {
            view.pointOfInterestFilter = [[MKPointOfInterestFilter alloc] initIncludingCategories:categories];
        }
    }
}
`;

if (!source.includes(propertyAnchor)) {
  throw new Error("[poi-filter-patch] Could not find showsPointsOfInterest export anchor.");
}

if (!source.includes(propertyName)) {
  source = source.replace(propertyAnchor, propertyPatch);
}

const methodAnchor = "\n@end\n";
const methodPatch = `
+ (MKPointOfInterestCategory)pointOfInterestCategoryForName:(NSString *)name API_AVAILABLE(ios(13.0))
{
    static NSDictionary<NSString *, MKPointOfInterestCategory> *categories;
    static dispatch_once_t onceToken;
    dispatch_once(&onceToken, ^{
        categories = @{
            @"airport": MKPointOfInterestCategoryAirport,
            @"amusementPark": MKPointOfInterestCategoryAmusementPark,
            @"aquarium": MKPointOfInterestCategoryAquarium,
            @"atm": MKPointOfInterestCategoryATM,
            @"bakery": MKPointOfInterestCategoryBakery,
            @"bank": MKPointOfInterestCategoryBank,
            @"beach": MKPointOfInterestCategoryBeach,
            @"brewery": MKPointOfInterestCategoryBrewery,
            @"cafe": MKPointOfInterestCategoryCafe,
            @"campground": MKPointOfInterestCategoryCampground,
            @"carRental": MKPointOfInterestCategoryCarRental,
            @"evCharger": MKPointOfInterestCategoryEVCharger,
            @"fireStation": MKPointOfInterestCategoryFireStation,
            @"fitnessCenter": MKPointOfInterestCategoryFitnessCenter,
            @"foodMarket": MKPointOfInterestCategoryFoodMarket,
            @"gasStation": MKPointOfInterestCategoryGasStation,
            @"hospital": MKPointOfInterestCategoryHospital,
            @"hotel": MKPointOfInterestCategoryHotel,
            @"laundry": MKPointOfInterestCategoryLaundry,
            @"library": MKPointOfInterestCategoryLibrary,
            @"marina": MKPointOfInterestCategoryMarina,
            @"movieTheater": MKPointOfInterestCategoryMovieTheater,
            @"museum": MKPointOfInterestCategoryMuseum,
            @"nationalPark": MKPointOfInterestCategoryNationalPark,
            @"nightlife": MKPointOfInterestCategoryNightlife,
            @"park": MKPointOfInterestCategoryPark,
            @"parking": MKPointOfInterestCategoryParking,
            @"pharmacy": MKPointOfInterestCategoryPharmacy,
            @"police": MKPointOfInterestCategoryPolice,
            @"postOffice": MKPointOfInterestCategoryPostOffice,
            @"publicTransport": MKPointOfInterestCategoryPublicTransport,
            @"restaurant": MKPointOfInterestCategoryRestaurant,
            @"restroom": MKPointOfInterestCategoryRestroom,
            @"school": MKPointOfInterestCategorySchool,
            @"stadium": MKPointOfInterestCategoryStadium,
            @"store": MKPointOfInterestCategoryStore,
            @"theater": MKPointOfInterestCategoryTheater,
            @"university": MKPointOfInterestCategoryUniversity,
            @"winery": MKPointOfInterestCategoryWinery,
            @"zoo": MKPointOfInterestCategoryZoo
        };
    });

    return categories[name];
}
`;

const finalEndIndex = source.lastIndexOf(methodAnchor);

if (finalEndIndex === -1) {
  throw new Error("[poi-filter-patch] Could not find final @end anchor.");
}

source = source.slice(0, finalEndIndex) + methodPatch + source.slice(finalEndIndex);

fs.writeFileSync(managerPath, source);
console.log("[poi-filter-patch] Added Apple Maps point-of-interest filtering to react-native-maps.");
