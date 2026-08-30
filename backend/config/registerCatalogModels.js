/**
 * Side-effect imports so Mongoose registers optional quotation catalog collections
 * and per-category inventory collections used by the shop and sync APIs.
 */
import "../models/inventory/CarBattery.js";
import "../models/inventory/BikeBattery.js";
import "../models/inventory/InverterSku.js";
import "../models/inventory/InvBatteryCombo.js";
import "../models/inventory/HomeInvBattery.js";
import "../models/inventory/InverterInventoryCatalog.js";
import "../models/inventory/HomeBackupBatteryInventory.js";
import "../models/inventory/TrolleyInventory.js";
import "../models/inventory/LithiumIonBattery.js";
import "../models/RecommendationRule.js";
import "../models/InverterProduct.js";
import "../models/InverterBattery.js";
import "../models/HomeInverterBattery.js";
import "../models/CarBatteryProduct.js";
import "../models/BikeBatteryProduct.js";
import "../models/ComboTemplate.js";
import "../models/Quotation.js";
import "../models/RecommendationSheet.js";
import "../models/Invoice.js";
import "../models/VehicleCompatibility.js";
import "../models/BatteryInventory.js";
import "../models/vehicleFitment/VehicleType.js";
import "../models/vehicleFitment/VehicleBrand.js";
import "../models/vehicleFitment/VehicleModel.js";
import "../models/vehicleFitment/VehicleVariant.js";
import "../models/vehicleFitment/BatteryFitmentGroup.js";
