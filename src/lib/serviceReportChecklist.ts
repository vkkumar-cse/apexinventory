// Predefined checklist of service activities grouped by category (approx 70 items)

export interface ChecklistItem {
  id: string;
  name: string;
}

export interface ChecklistCategory {
  id: string;
  title: string;
  items: ChecklistItem[];
}

export const SERVICE_CHECKLIST: ChecklistCategory[] = [
  {
    id: "cleaning",
    title: "Cleaning",
    items: [
      { id: "clean_general", name: "General equipment cleaning completed" },
      { id: "clean_optics", name: "Optical parts cleaned" },
      { id: "clean_mechanical", name: "Mechanical parts cleaned" },
      { id: "clean_internal", name: "Internal dust removal and cleaning" },
      { id: "clean_external", name: "External body and surfaces wiped/cleaned" },
      { id: "clean_fans", name: "Fan blades and ventilation grills cleaned" },
      { id: "clean_filters", name: "Air filters cleaned or replaced" },
      { id: "clean_display", name: "Display and touch panels cleaned" }
    ]
  },
  {
    id: "lubrication",
    title: "Lubrication",
    items: [
      { id: "lub_joints", name: "Moving mechanical joints lubricated" },
      { id: "lub_bearings", name: "Bearings and rollers greased/lubricated" },
      { id: "lub_rails", name: "Linear guide rails wiped and lubricated" },
      { id: "lub_gears", name: "Drive chains and gears lubricated" },
      { id: "lub_screws", name: "Threaded lead screws cleaned and greased" },
      { id: "lub_spindle", name: "Spindle axis assembly lubricated" },
      { id: "lub_pneumatic", name: "Pneumatic cylinders lubricated" }
    ]
  },
  {
    id: "calibration",
    title: "Calibration",
    items: [
      { id: "cal_zero", name: "Zero point calibration completed" },
      { id: "cal_span", name: "Accuracy span verification checked" },
      { id: "cal_weights", name: "Standard reference weight measurements taken" },
      { id: "cal_cert", name: "Standard calibration certificate generated" },
      { id: "cal_laser", name: "Laser alignment calibration completed" },
      { id: "cal_sensors", name: "Sensors scale factors calibrated" },
      { id: "cal_env", name: "Environmental parameters offset adjusted" },
      { id: "cal_sticker", name: "Calibration sticker applied to the instrument" }
    ]
  },
  {
    id: "mechanical",
    title: "Mechanical",
    items: [
      { id: "mech_belts", name: "Transmission belts inspected and tension adjusted" },
      { id: "mech_align", name: "Mechanical axis alignment verified" },
      { id: "mech_fasteners", name: "Structural fasteners and bolts tightened" },
      { id: "mech_bearings", name: "Rotating bearings and shafts inspected" },
      { id: "mech_couplings", name: "Gearboxes and drive couplings inspected" },
      { id: "mech_seals", name: "Gaskets, seals, and O-rings replaced/inspected" },
      { id: "mech_backlash", name: "Mechanical play/backlash adjusted" },
      { id: "mech_vibration", name: "Vibration dampeners inspected" },
      { id: "mech_covers", name: "Guard rails and covers checked" }
    ]
  },
  {
    id: "electrical",
    title: "Electrical",
    items: [
      { id: "elec_cables", name: "Internal and external cables inspected for wear" },
      { id: "elec_wiring", name: "Electrical wiring connections tightened" },
      { id: "elec_power", name: "Power supplies voltage levels verified" },
      { id: "elec_fuses", name: "Safety fuses and circuit breakers tested" },
      { id: "elec_sensors", name: "Proximity and limit sensors inspected/replaced" },
      { id: "elec_earth", name: "Earthing/grounding connections tested" },
      { id: "elec_terminals", name: "Terminal block connections inspected" },
      { id: "elec_battery", name: "Backup battery condition checked and replaced" },
      { id: "elec_relays", name: "Relays and contactors functionality verified" }
    ]
  },
  {
    id: "software",
    title: "Software",
    items: [
      { id: "soft_app", name: "Main system application software updated" },
      { id: "soft_firm", name: "Controller firmware version updated" },
      { id: "soft_backup", name: "System configuration settings backed up" },
      { id: "soft_db", name: "Calibration coefficients database updated" },
      { id: "soft_logs", name: "Error log analysis and fault clearance" },
      { id: "soft_perms", name: "User database access permissions verified" },
      { id: "soft_net", name: "Network IP addresses and communication configured" },
      { id: "soft_diags", name: "Diagnostic self-tests executed successfully" }
    ]
  },
  {
    id: "testing",
    title: "Testing",
    items: [
      { id: "test_post", name: "Full power-on self-test (POST) verified" },
      { id: "test_func", name: "Basic functional movements and cycles tested" },
      { id: "test_acc", name: "Accuracy and repeatability testing completed" },
      { id: "test_load", name: "High-load test run performed" },
      { id: "test_trial", name: "Continuous trial run executed" },
      { id: "test_estop", name: "Emergency shutdown and restore tested" },
      { id: "test_drift", name: "Measurement drift analysis performed" },
      { id: "test_output", name: "Sample output verification completed" },
      { id: "test_logs", name: "Performance test report logs saved" }
    ]
  },
  {
    id: "safety",
    title: "Safety",
    items: [
      { id: "safe_interlocks", name: "Protective panels and interlocks verified" },
      { id: "safe_estop", name: "Emergency stop buttons functionality tested" },
      { id: "safe_leakage", name: "Electrical insulation leakage checked" },
      { id: "safe_decals", name: "Safety warning decals inspected" },
      { id: "safe_gfci", name: "Ground fault circuit interrupters (GFCI) tested" },
      { id: "safe_temp", name: "High-temperature protection cuts tested" },
      { id: "safe_limit", name: "Mechanical travel limit switches verified" }
    ]
  },
  {
    id: "handover",
    title: "Final Handover",
    items: [
      { id: "hand_restore", name: "Instrument exterior restored and cleaned" },
      { id: "hand_give", name: "Equipment formally handed over to the client" },
      { id: "hand_demo", name: "Practical demonstration performed for customer" },
      { id: "hand_train", name: "Basic operator maintenance training completed" },
      { id: "hand_doc", name: "Printed/digital user manual or report copy provided" },
      { id: "hand_tag", name: "Next service due label attached and verified" }
    ]
  }
];
