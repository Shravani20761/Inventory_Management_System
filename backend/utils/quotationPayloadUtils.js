export function buildRequirementsFromPayload(payload) {
  return {
    flatType: payload.flatType ?? payload.requirements?.flatType ?? "1BHK",
    houseType: payload.houseType ?? payload.requirements?.houseType ?? "",
    numberOfRooms: payload.numberOfRooms ?? payload.requirements?.numberOfRooms ?? "",
    backupHours: Number(payload.backupHours ?? payload.requirements?.backupHours ?? 4),
    budgetType: payload.budgetType ?? payload.requirements?.budgetType ?? "Recommended",
    preferredBrand: payload.preferredBrand ?? payload.requirements?.preferredBrand ?? "",
    inverterBrand: payload.inverterBrand ?? payload.requirements?.inverterBrand ?? "",
    batteryBrand: payload.batteryBrand ?? payload.requirements?.batteryBrand ?? "",
    totalLoad: payload.totalLoad ?? payload.requirements?.totalLoad,
    appliances: payload.appliances ?? payload.requirements?.appliances,
    roomNotes: payload.roomNotes ?? payload.requirements?.roomNotes ?? "",
    customerRequirements: payload.customerRequirements ?? payload.requirements?.customerRequirements ?? "",
    vehicleBrand: payload.vehicleBrand ?? payload.requirements?.vehicleBrand ?? "",
    vehicleModel: payload.vehicleModel ?? payload.requirements?.vehicleModel ?? "",
    fuelType: payload.fuelType ?? payload.requirements?.fuelType ?? "",
    bikeBrand: payload.bikeBrand ?? payload.requirements?.bikeBrand ?? "",
    bikeModel: payload.bikeModel ?? payload.requirements?.bikeModel ?? "",
  };
}
