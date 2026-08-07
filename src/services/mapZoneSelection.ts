type MapZoneScopeChoiceInput = {
  currentCityId: string | null;
  hasHeldDistrict: boolean;
  heldCityId: string | null;
};

export function shouldOfferMapZoneScopeChoice({
  currentCityId,
  hasHeldDistrict,
  heldCityId
}: MapZoneScopeChoiceInput) {
  return Boolean(
    currentCityId &&
    heldCityId &&
    hasHeldDistrict &&
    currentCityId !== heldCityId
  );
}
