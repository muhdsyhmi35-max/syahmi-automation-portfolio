window.PORTFOLIO_DEFAULTS = {
  version: 2,
  layoutVersion: 5,
  logo: "SYAHMI",
  footerName: "Muhammad Syahmi Abdul Manan",
  positions: {},
  textSizes: {},
  textBoxes: {},
  typography: {
    displayFont: "Big Shoulders Display",
    bodyFont: "Sora",
    brandScale: 100,
    headingScale: 100,
    bodyScale: 100
  },
  hero: {
    brand: "Muhammad Syahmi",
    title: "Manufacturing & Automation",
    lead: "PLC programming, conveyor automation, and production systems — built on the line at Isuzu Hicom Malaysia.",
    ctaPrimary: "View projects",
    ctaSecondary: "Get in touch",
    meta: ["Pekan, Pahang", "4+ years automotive", "Available · 1-month notice"],
    photo: "",
    photoCrop: { w: 100, h: 100, x: 0, y: 0, fit: "contain" },
    lineY: 0,
    photoWidth: 420,
    photoHeight: 420,
    showPhotoBox: false
  },
  about: {
    label: "About",
    heading: "From design drawings to live production lines.",
    paragraphs: [
      "Manufacturing and automation professional with more than four years of automotive manufacturing experience at Isuzu Hicom Malaysia. I work across PLC programming, industrial automation, electrical wiring, machine troubleshooting, CAD design, production monitoring, and line improvement.",
      "Project work spans automated conveyor systems, real-time production dashboards, new model piloting, assembly line modification, facility upgrades, and engineering fabrication — from concept drawings through commissioning."
    ],
    stats: [
      { value: "4+", label: "Years in automotive manufacturing" },
      { value: "RM60k", label: "Facility project led end-to-end" },
      { value: "10+", label: "Engineering & automation projects" },
      { value: "3.64", label: "Diploma CGPA · Manufacturing Design" }
    ]
  },
  expertise: {
    label: "Expertise",
    heading: "Capabilities that keep production moving.",
    columns: [
      {
        title: "Industrial Automation",
        items: [
          "PLC programming & ladder logic",
          "Conveyor system automation",
          "Electrical wiring & control panels",
          "Sensor installation & machine interlocks",
          "Troubleshooting & commissioning"
        ]
      },
      {
        title: "Production Systems",
        items: [
          "Real-time production monitoring",
          "Plan vs Actual dashboards",
          "Cycle time & downtime tracking",
          "Line improvement & new model support",
          "Engineering documentation (AOS, KDPL, LPCI)"
        ]
      },
      {
        title: "CAD & Fabrication",
        items: [
          "SolidWorks · AutoCAD · Inventor",
          "2D / 3D / isometric / assembly drawings",
          "Layout planning & jig modification",
          "Bambu Lab rapid prototyping",
          "Fixture & structural design support"
        ]
      }
    ],
    toolsLabel: "Tools",
    tools: ["GX Works2", "GT Designer 3", "PCSCHEMATIC", "SolidWorks", "AutoCAD", "Inventor", "HTML / CSS / JS", "Bambu Lab"]
  },
  projects: {
    label: "Selected work",
    heading: "Projects from the plant floor.",
    items: [
      {
        id: "p1",
        featured: true,
        index: "01",
        tag: "Production systems",
        title: "Production Monitoring System",
        body: "Built a real-time production monitoring dashboard from scratch with HTML, CSS, and JavaScript — giving supervisors Plan vs Actual output, cycle time, machine status, and accumulated downtime in one interactive view. Replaced manual tracking and continues to be refined for data accuracy across live sources.",
        photos: [],
        photoWidth: 480,
        photoHeight: 300,
        caseStudy: {
          open: false,
          activePageId: "overview",
          pages: [
            {
              id: "overview",
              title: "Overview",
              blocks: [
                {
                  id: "p1b1",
                  type: "bullets",
                  title: "Problem statement",
                  items: [
                    "Supervisors relied on manual boards for Plan vs Actual output.",
                    "Cycle time and downtime were hard to see in one place.",
                    "Live line status was delayed and inconsistent across shifts."
                  ]
                },
                {
                  id: "p1b2",
                  type: "bullets",
                  title: "Objectives",
                  items: [
                    "Build a real-time production monitoring dashboard.",
                    "Show Plan vs Actual, cycle time, machine status, and downtime.",
                    "Replace manual tracking with an interactive plant-floor view."
                  ]
                },
                {
                  id: "p1b3",
                  type: "bullets",
                  title: "Scope",
                  items: [
                    "HTML / CSS / JavaScript dashboard for supervisors and line leads.",
                    "Focus on live display and tracking accuracy.",
                    "Ongoing refinement as data sources improve."
                  ]
                }
              ]
            },
            {
              id: "visuals",
              title: "Visuals",
              blocks: [
                {
                  id: "p1b4",
                  type: "image",
                  title: "Dashboard / flowchart",
                  photos: [],
                  activePhoto: 0,
                  caption: "Upload or paste screenshots"
                },
                {
                  id: "p1b5",
                  type: "image",
                  title: "Schedule / process",
                  photos: [],
                  activePhoto: 0,
                  caption: "Paste Gantt or process charts (Ctrl+V)"
                }
              ]
            },
            {
              id: "plan",
              title: "Plan",
              blocks: [
                {
                  id: "p1b6",
                  type: "gantt",
                  title: "Schedule",
                  weeks: 8,
                  tasks: [
                    { task: "Requirements", pic: "Syahmi", planStart: 1, planEnd: 2, actualStart: 1, actualEnd: 2 },
                    { task: "UI build", pic: "Syahmi", planStart: 2, planEnd: 5, actualStart: 2, actualEnd: 5 },
                    { task: "Live data wiring", pic: "Syahmi", planStart: 4, planEnd: 7, actualStart: 5, actualEnd: 7 },
                    { task: "Supervisor trial", pic: "Team", planStart: 7, planEnd: 8, actualStart: 7, actualEnd: 8 }
                  ]
                }
              ]
            }
          ]
        }
      },
      {
        id: "p2",
        featured: true,
        index: "02",
        tag: "PLC · Automation",
        title: "Paintshop Conveyor Sealant Line",
        body: "Completed Mitsubishi Electric PLC Q Series and GOT2000 training, then developed ladder logic for motor control, sensor detection, timing sequences, and machine interlocks. Supported hardware selection, electrical wiring, control panel assembly, sensor installation, testing, and commissioning through handover.",
        photos: [],
        photoWidth: 480,
        photoHeight: 300,
        caseStudy: {
          open: false,
          activePageId: "overview",
          pages: [
            {
              id: "overview",
              title: "Overview",
              blocks: [
                {
                  id: "p2b1",
                  type: "bullets",
                  title: "Problem statement",
                  items: [
                    "New sealant conveyor needed sequenced PLC control.",
                    "Motors, sensors, and interlocks had to work safely together.",
                    "Handover required tested logic and panel integration."
                  ]
                },
                {
                  id: "p2b2",
                  type: "bullets",
                  title: "Objectives",
                  items: [
                    "Develop Mitsubishi Q Series ladder logic for the line.",
                    "Support wiring, panel assembly, sensors, and commissioning.",
                    "Deliver stable sequence control through handover."
                  ]
                },
                {
                  id: "p2b3",
                  type: "image",
                  title: "Wiring / flowchart",
                  photos: [],
                  activePhoto: 0,
                  caption: "Paste schematics or flowcharts"
                }
              ]
            },
            {
              id: "plan",
              title: "Plan",
              blocks: [
                {
                  id: "p2b4",
                  type: "bom",
                  title: "Bill of materials",
                  rows: [
                    { part: "PLC Q Series CPU", qty: 1, unitCost: 0 },
                    { part: "GOT2000 HMI", qty: 1, unitCost: 0 },
                    { part: "Sensors / interlocks", qty: 1, unitCost: 0 }
                  ]
                },
                {
                  id: "p2b5",
                  type: "gantt",
                  title: "Schedule",
                  weeks: 10,
                  tasks: [
                    { task: "Training", pic: "Syahmi", planStart: 1, planEnd: 2, actualStart: 1, actualEnd: 2 },
                    { task: "Ladder logic", pic: "Syahmi", planStart: 2, planEnd: 6, actualStart: 2, actualEnd: 6 },
                    { task: "Panel & wiring", pic: "Team", planStart: 4, planEnd: 8, actualStart: 4, actualEnd: 8 },
                    { task: "Commissioning", pic: "Team", planStart: 8, planEnd: 10, actualStart: 8, actualEnd: 10 }
                  ]
                }
              ]
            }
          ]
        }
      },
      {
        id: "p3",
        featured: true,
        index: "03",
        tag: "Facility · Project lead",
        title: "Local Parts Receiving Area Structure",
        body: "Led planning for a RM60,000 structural awning installation — specifications, quantity estimation, SolidWorks 2D/3D layouts for vendors, scheduling coordination, and on-site measurement verification to match design intent and operational needs.",
        photos: [],
        photoWidth: 480,
        photoHeight: 300,
        caseStudy: {
          open: false,
          activePageId: "overview",
          pages: [
            {
              id: "overview",
              title: "Overview",
              blocks: [
                {
                  id: "p3b1",
                  type: "bullets",
                  title: "Problem statement",
                  items: [
                    "Local parts receiving needed weather-protected structure.",
                    "Vendor work required clear specs and quantity estimates.",
                    "Site measurements had to match design intent."
                  ]
                },
                {
                  id: "p3b2",
                  type: "bullets",
                  title: "Objectives",
                  items: [
                    "Lead RM60k awning project end-to-end.",
                    "Produce SolidWorks layouts for vendors.",
                    "Coordinate schedule and verify on-site installation."
                  ]
                },
                {
                  id: "p3b3",
                  type: "image",
                  title: "Layout / progress",
                  photos: [],
                  activePhoto: 0,
                  caption: "Upload or paste drawings / photos"
                }
              ]
            },
            {
              id: "plan",
              title: "Plan",
              blocks: [
                {
                  id: "p3b4",
                  type: "bom",
                  title: "Bill of materials",
                  rows: [
                    { part: "Structural steel / awning package", qty: 1, unitCost: 60000 }
                  ]
                },
                {
                  id: "p3b5",
                  type: "gantt",
                  title: "Schedule",
                  weeks: 8,
                  tasks: [
                    { task: "Spec & estimate", pic: "Syahmi", planStart: 1, planEnd: 2, actualStart: 1, actualEnd: 2 },
                    { task: "3D / 2D layouts", pic: "Syahmi", planStart: 2, planEnd: 4, actualStart: 2, actualEnd: 4 },
                    { task: "Vendor fabrication", pic: "Vendor", planStart: 4, planEnd: 7, actualStart: 4, actualEnd: 7 },
                    { task: "Install & verify", pic: "Team", planStart: 7, planEnd: 8, actualStart: 7, actualEnd: 8 }
                  ]
                }
              ]
            }
          ]
        }
      },
      {
        id: "p4",
        featured: true,
        index: "04",
        tag: "Line engineering",
        title: "Bodyshop Assembly Line & Jig Modification",
        body: "Managed drawing modifications from Isuzu Motors Japan (IML) for a new assembly line layout separating Basic Model and Crew Cab production. Supported jig positioning, gantry modification planning, site measurements, and drawing verification before implementation.",
        photos: [],
        photoWidth: 480,
        photoHeight: 300,
        caseStudy: {
          open: false,
          activePageId: "overview",
          pages: [
            {
              id: "overview",
              title: "Overview",
              blocks: [
                {
                  id: "p4b1",
                  type: "bullets",
                  title: "Problem statement",
                  items: [
                    "IML drawings required local modification for plant layout.",
                    "Basic Model and Crew Cab lines needed clear separation.",
                    "Jig and gantry changes needed verified measurements."
                  ]
                },
                {
                  id: "p4b2",
                  type: "bullets",
                  title: "Objectives",
                  items: [
                    "Manage drawing modifications from IML.",
                    "Support jig positioning and gantry planning.",
                    "Verify drawings before implementation."
                  ]
                },
                {
                  id: "p4b3",
                  type: "image",
                  title: "Layout / jig diagram",
                  photos: [],
                  activePhoto: 0,
                  caption: "Paste layouts or flowcharts"
                },
                {
                  id: "p4b4",
                  type: "gantt",
                  title: "Schedule",
                  weeks: 8,
                  tasks: [
                    { task: "Drawing review", pic: "Syahmi", planStart: 1, planEnd: 3, actualStart: 1, actualEnd: 3 },
                    { task: "Site measurement", pic: "Syahmi", planStart: 2, planEnd: 4, actualStart: 2, actualEnd: 5 },
                    { task: "Jig / gantry plan", pic: "Team", planStart: 4, planEnd: 7, actualStart: 5, actualEnd: 7 },
                    { task: "Verification", pic: "Team", planStart: 7, planEnd: 8, actualStart: 7, actualEnd: 8 }
                  ]
                }
              ]
            }
          ]
        }
      },
      {
        id: "p5",
        featured: false,
        index: "05",
        tag: "New model",
        title: "New Model Piloting",
        body: "Supported trial builds, tooling readiness checks, cross-department fitment resolution, and production documentation for new vehicle introduction.",
        photos: [],
        photoWidth: 480,
        photoHeight: 300
      },
      {
        id: "p6",
        featured: false,
        index: "06",
        tag: "Military · Electrical",
        title: "FTS Vehicle & Rotary Switch",
        body: "Managed FTS military vehicle documentation, rotary switch modification studies, wiring changes, and production / after-sales troubleshooting.",
        photos: [],
        photoWidth: 480,
        photoHeight: 300
      },
      {
        id: "p7",
        featured: false,
        index: "07",
        tag: "Fabrication · CAD",
        title: "Rear Cargo Fabrication",
        body: "Led concept-to-drawing planning for light-duty Isuzu rear cargo — base, support, reinforcement, and fixing parts with material selection and drawing schedules.",
        photos: [],
        photoWidth: 480,
        photoHeight: 300
      },
      {
        id: "p8",
        featured: false,
        index: "08",
        tag: "Concept design",
        title: "A.G.V. Concept Design",
        body: "Converted engineer sketches into detailed 3D and dimensioned drawings for early AGV concept ideas, including schedule planning with engineering.",
        photos: [],
        photoWidth: 480,
        photoHeight: 300
      },
      {
        id: "p9",
        featured: false,
        index: "09",
        tag: "Prototype",
        title: "Engine & Axle Cart",
        body: "Prototype cart design with production teams — site measurements of existing carts, modification confirmation, and 3D detail drawings for reference.",
        photos: [],
        photoWidth: 480,
        photoHeight: 300
      },
      {
        id: "p10",
        featured: false,
        index: "10",
        tag: "Electrical",
        title: "PTO Wiring Modification",
        body: "Studied and executed Power Take-Off wiring modification, installation method, and procedures to meet customer-requested PTO function.",
        photos: [],
        photoWidth: 480,
        photoHeight: 300
      }
    ]
  },
  experience: {
    label: "Experience",
    company: "Isuzu Hicom Malaysia",
    role: "Technician · Automation & Engineering Support",
    dates: "March 2022 — Present · Pekan",
    bullets: [
      "Develop PLC programs for automated conveyor systems — sequence control, sensors, motors, timers, and interlocks.",
      "Support PLC hardware selection, electrical wiring, control panel assembly, and end-to-end automation integration.",
      "Design and maintain real-time production monitoring dashboards for supervisors and line leads.",
      "Produce 2D/3D drawings, layouts, and fabrication drawings in AutoCAD and SolidWorks.",
      "Support new model preparation, trial builds, jig/equipment modification, and process verification.",
      "Coordinate with production, maintenance, vendors, and engineering on fabrication and facility projects.",
      "Use Bambu Lab 3D printing for rapid prototyping and fixture development.",
      "Handle engineering documentation including SOPs, AOS, KD Change Info, LPCI, and KDPL."
    ],
    achievementsTitle: "Key achievements",
    achievements: [
      "Built real-time production monitoring dashboard, replacing manual tracking",
      "Developed PLC control logic for new automated conveyor sealant line",
      "Led RM60,000 structural project for Local Parts Receiving Area",
      "Supported Isuzu Motors Japan (IML) assembly line separation project",
      "Contributed to FTS military vehicle wiring and rotary switch modification"
    ]
  },
  credentials: {
    trainingLabel: "Training",
    trainingHeading: "Certifications",
    training: [
      "Mitsubishi PLC Q Series · Basic & Intermediate",
      "Mitsubishi GOT 2000 Series · Basic & Intermediate",
      "Mitsubishi Inverter FR-A800 Series · Basic",
      "KISMEC Panel Control Electrical Wiring",
      "DEFTECH FTS 240 Drivers Training"
    ],
    educationLabel: "Education",
    educationHeading: "Background",
    education: [
      { title: "Bachelor of Manufacturing Management", detail: "Open University Malaysia · 2025 — Present" },
      { title: "Diploma in Manufacturing Engineering Design", detail: "KKTM Kuantan · CGPA 3.64 · 2019 — 2022" },
      { title: "Sijil Pelajaran Malaysia", detail: "SMK Ahmad Pekan · 5A 4B · 2014 — 2018" }
    ]
  },
  contact: {
    brand: "Muhammad Syahmi",
    heading: "Ready for the next line challenge.",
    lead: "Open to manufacturing, automation, and engineering roles. Available to start with a one-month notice period.",
    email: "muhdsyhmi35@gmail.com",
    phone: "+6011-3745 1629",
    linkedin: "https://linkedin.com/in/muhammad-syahmi-99b2bb248",
    linkedinLabel: "LinkedIn profile",
    address: "No 104 Lorong Intan 8/2, Taman Sepekan Makmur, 26600 Pekan, Pahang"
  }
};
